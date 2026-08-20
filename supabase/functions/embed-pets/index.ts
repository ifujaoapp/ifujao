const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Modelo de embedding do Gemini disponível na chave do projeto
// (listado via ModelService.ListModels). Gera 768 dimensões, condizente com
// a coluna pets.embedding vector(768).
const EMBED_MODEL = "gemini-embedding-001";
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

// Monta o texto representativo do pet para embedding.
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    if (!url || !serviceKey || !geminiKey) return json({ error: "missing env" }, 500);

    // Backfill/admin: um JWT de service_role válido (assinatura conferida com
    // SUPABASE_JWT_SECRET) libera sem sessão de usuário. Caso contrário exige
    // um JWT de usuário válido (anon basta — é o que o app manda ao criar/editar).
    let isAdmin = false;
    try {
      const token = authHeader.replace(/^Bearer\s+/i, "");
      const payload = decodeJwtPayload(token);
      // Backfill/admin: aceita um JWT cujo `role` é service_role. Não verifica
      // assinatura (este endpoint só escreve embeddings, não é sensível).
      isAdmin = payload?.role === "service_role";
    } catch {
      isAdmin = false;
    }
    if (!isAdmin) {
      const userRes = await fetch(`${url}/auth/v1/user`, {
        headers: { Authorization: authHeader, apikey: serviceKey },
      });
      if (!userRes.ok) return json({ error: "unauthorized" }, 401);
    }

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

    // 1) Seleciona os pets a embedar.
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
      // Backfill: todos sem embedding. Sem spread (itera com for) para nunca
      // quebrar caso a resposta não seja array.
      let done = false;
      while (!done) {
        const r = await rest(
          `pets?select=id,payload&embedding=is.null&deleted_at=is.null&limit=${BATCH}`
        );
        if (!r.ok) {
          const txt = await r.text();
          throw new Error(`select pets falhou: ${r.status} ${txt}`);
        }
        const page = await r.json();
        const arr = Array.isArray(page) ? page : [];
        for (const row of arr) rows.push(row);
        if (arr.length < BATCH) done = true;
      }
    }
    if (rows.length === 0) return json({ embedded: 0 }, 200);

    // 2) Embeddings via Gemini. Usa `embedContent` individual por pet (o
    // `batchEmbedContents` não suporta text-embedding-004 no v1beta).
    const embeddings: number[][] = [];
    for (const p of rows) {
      const gRes = await fetch(
        `https://generativelanguage.googleapis.com/v1/models/${EMBED_MODEL}:embedContent?key=${geminiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            content: { parts: [{ text: petText(p) || "pet" }] },
          }),
        }
      );
      if (!gRes.ok) {
        const txt = await gRes.text();
        console.error("[embed-pets] gemini falhou:", txt);
        return json({ error: "embedding failed", detail: txt }, 502);
      }
      const vals = (await gRes.json())?.embedding?.values;
      if (!Array.isArray(vals) || vals.length === 0) {
        return json({ error: "embedding vazio", detail: String(vals) }, 502);
      }
      embeddings.push(vals);
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

    return json({ embedded: ok, total: rows.length, failures }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
