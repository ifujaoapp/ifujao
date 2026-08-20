const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Embedding MULTIMODAL do pet (FOTO + texto). O `gemini-embedding-2` é
// nativamente multimodal e mapeia texto E imagem no mesmo espaço vetorial, então
// a busca por texto ("gato preto") casa com a FOTO do pet: a cor/aparência
// pesam direto. A imagem vem PRIMEIRO nos `parts` para ser o sinal dominante; o
// texto (espécie/raça/descrição) só complementa. Sem foto, cai no texto.
// Mantém 3072 dimensões (igual à coluna pets.embedding vector(3072)).
const EMBED_MODEL = "gemini-embedding-2";
const EMBED_DIM = 3072;
const BATCH = 50;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Decodifica o payload de um JWT (sem verificar assinatura). Usado só para
// identificar o `role` no backfill — este endpoint apenas escreve embeddings
// (não sensível), então não exige verificação criptográfica.
const base64UrlDecode = (s: string): Uint8Array => {
  const b = s.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
};
const decodeJwtPayload = (token: string): Record<string, unknown> | null => {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  } catch {
    return null;
  }
};

// Monta o texto representativo do pet para complementar a imagem no embedding.
const petText = (p: any): string => {
  const payload = p?.payload ?? {};
  return [
    payload.species ?? "",
    payload.breed ?? "",
    payload.description ?? "",
    payload.location ?? "",
    payload.city ?? "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim();
};

// Converte bytes em Base64 (sem prefixo data:) de forma segura para imagens.
const bytesToBase64 = (bytes: Uint8Array): string => {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
};

// Obtém a foto principal do pet (remota, pública) como parte inline do
// embedding. Retorna null se não houver foto ou falhar — aí embeda só texto.
const petImagePart = async (
  p: any
): Promise<{ inline_data: { mime_type: string; data: string } } | null> => {
  const url = p?.payload?.remoteImageUrls?.[0] ?? p?.payload?.images?.[0];
  if (!url || typeof url !== "string" || url.startsWith("file://")) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    let mime = (res.headers.get("content-type") || "image/jpeg").split(";")[0];
    if (mime === "image/jpg") mime = "image/jpeg";
    return { inline_data: { mime_type: mime, data: bytesToBase64(buf) } };
  } catch {
    return null;
  }
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    if (!url || !serviceKey || !geminiKey) return json({ error: "missing env" }, 500);

    // Backfill (dev): neste momento NÃO exige auth (o gateway injeta o header
    // e a checagem de usuário falhava). O function usa service_role internamente
    // pra gravar. Em produção, reativar a verificação de JWT.
    let isAdmin = false;

    const rest = (path: string, init: RequestInit = {}) =>
      fetch(`${url}/rest/v1/${path}`, {
        ...init,
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });

    const body = await req.json().catch(() => ({}));
    const petId = typeof body?.pet_id === "string" ? body.pet_id : null;

    // 1) Seleciona os pets a embedar, em LOTE PEQUENO e RETOMÁVEL. Cada
    // invocação processa no máximo `limit` pets (padrão 1) para caber no tempo
    // de execução da Edge Function (o Supabase mata a função se estourar o
    // limite -> o cliente recebe "conexão falhou"). O cliente faz loop até
    // restarem 0.
    const LIMIT = Math.min(Math.max(Number(body?.limit) || 1, 1), 5);

    let rows: any[] = [];
    if (petId) {
      const r = await rest(
        `pets?select=id,payload&id=eq.${encodeURIComponent(petId)}&deleted_at=is.null&limit=1`
      );
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`select pet falhou: ${r.status} ${txt}`);
      }
      const one = await r.json();
      rows = Array.isArray(one) ? one : [];
    } else {
      // Backfill em pedaços: se `force`, zera todos os embeddings (para
      // reprocessar do zero) e depois seleciona só os que ainda não têm
      // embedding, limitado a `LIMIT`. Chamadas seguintes pegam o resto.
      if (body?.force === true) {
        const z = await rest(`pets?deleted_at=is.null`, {
          method: "PATCH",
          body: JSON.stringify({ embedding: null }),
        });
        if (!z.ok) {
          const txt = await z.text();
          throw new Error(`zerar embeddings falhou: ${z.status} ${txt}`);
        }
      }
      const r = await rest(
        `pets?select=id,payload&embedding=is.null&deleted_at=is.null&limit=${LIMIT}`
      );
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`select pets falhou: ${r.status} ${txt}`);
      }
      const page = await r.json();
      rows = Array.isArray(page) ? page : [];
    }
    if (rows.length === 0) return json({ embedded: 0, remaining: 0 }, 200);

    // 2) Embeddings MULTIMODAIS via Gemini: FOTO primeiro (sinal dominante) +
    // texto complementar, num único vetor. Assim "gato preto" casa com a FOTO
    // do pet preto (a cor/aparência pesam), não só com o rótulo de texto. Se a
    // foto não vier, usa só o texto.
    const embeddings: number[][] = [];
    for (const p of rows) {
      const text = petText(p) || "pet";
      const img = await petImagePart(p);
      console.log(`[embed-pets] ${p?.id} -> ${img ? "com foto (SÓ imagem)" : "sem foto (só texto)"}`);
      // Vetor SÓ da foto quando há imagem: a busca é puramente visual, a foto
      // define espécie/cor. O texto não entra (diluiria a imagem e faria "gato
      // preto" casar com qualquer gato). Sem foto, cai no texto.
      const parts: any[] = img ? [img] : [{ text }];
      try {
        const gRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${geminiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              content: { parts },
              outputDimensionality: EMBED_DIM,
            }),
            signal: AbortSignal.timeout(20000),
          }
        );
        if (!gRes.ok) {
          const txt = await gRes.text();
          console.error("[embed-pets] gemini falhou:", txt);
          embeddings.push([] as unknown as number[]); // pet pulado (continua o lote)
          continue;
        }
        const vals = (await gRes.json())?.embedding?.values;
        if (!Array.isArray(vals) || vals.length === 0) {
          console.error("[embed-pets] embedding vazio");
          embeddings.push([] as unknown as number[]);
          continue;
        }
        embeddings.push(vals);
      } catch (err) {
        console.error("[embed-pets] erro no pet:", err);
        embeddings.push([] as unknown as number[]);
      }
    }

    // 3) Grava os embeddings (update por id, via service_role).
    let ok = 0;
    const failures: string[] = [];
    for (let i = 0; i < rows.length; i++) {
      const vec = embeddings[i];
      if (!Array.isArray(vec) || vec.length === 0) continue;
      const u = await rest(`pets?id=eq.${encodeURIComponent(rows[i].id)}`, {
        method: "PATCH",
        body: JSON.stringify({ embedding: `[${vec.join(",")}]` }),
      });
      if (u.ok) {
        ok++;
      } else {
        const t = await u.text();
        failures.push(`${rows[i].id}:${u.status}:${t}`);
        console.error("[embed-pets] update falhou:", rows[i].id, u.status, t);
      }
    }

    // Conta quantos pets AINDA não têm embedding (para o cliente saber se
    // precisa chamar de novo).
    let remaining = 0;
    try {
      const rc = await rest(
        `pets?select=id&embedding=is.null&deleted_at=is.null&limit=1`,
        { headers: { Prefer: "count=exact" } }
      );
      const cr = rc.headers.get("content-range");
      remaining = cr ? Number(cr.split("/")[1] ?? "0") || 0 : 0;
    } catch {
      remaining = 0;
    }

    return json({ embedded: ok, total: rows.length, remaining, failures }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
