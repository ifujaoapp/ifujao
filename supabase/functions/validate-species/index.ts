// Edge Function: validate-species (moderação).
// Recebe { imageUrl, mimeType, chosenSpecies } e compara o embedding
// multimodal da FOTO (ja no Storage, URL publica) com o embedding do
// TEXTO da especie escolhida. Retorna { mismatch, score }.
//
// Reusa o mesmo modelo multimodal (gemini-embedding-2) e o mesmo padrao
// do embed-pets: a foto eh buscada via fetch(url) no server, gerando
// base64 robusto. A chave GEMINI_API_KEY fica nos secrets do projeto
// (Deno.env.get).
//
// NAO bloqueia nada: o caller decide o que fazer com o resultado.

const EMBED_MODEL = "gemini-embedding-2";
const EMBED_DIM = 3072;
// Threshold de similaridade (dot product de vetores normalizados).
// gemini-embedding-2 multimodal: cachorro vs "Cachorro" ~0.40, gato vs
// "Gato" ~0.30, cruzamentos ~0.20-0.25. 0.30 fica acima dos cruzamentos.
const MISMATCH_THRESHOLD = 0.30;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// Gera embedding (vetor de 3072 dims) para um input multimodal.
const embed = async (apiKey: string, parts: any[]): Promise<number[]> => {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: { parts },
        outputDimensionality: EMBED_DIM,
      }),
    }
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`gemini embed falhou: ${res.status} ${txt}`);
  }
  const j = await res.json();
  const vals = j?.embedding?.values;
  if (!Array.isArray(vals) || vals.length === 0) {
    throw new Error("gemini embed retornou vazio");
  }
  return vals as number[];
};

// Dot product. Vetores do Gemini ja vem normalizados -> dot = cos similarity.
const dot = (a: number[], b: number[]): number => {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "unauthorized" }, 401);

    const url = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const geminiKey = Deno.env.get("GEMINI_API_KEY") ?? "";
    if (!url || !serviceKey || !geminiKey) {
      return json({ error: "missing env" }, 500);
    }

    // Valida o JWT do usuario.
    const userRes = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: serviceKey },
    });
    if (!userRes.ok) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const chosenSpecies = typeof body?.chosenSpecies === "string"
      ? body.chosenSpecies.trim()
      : "";
    const mimeType = typeof body?.mimeType === "string"
      ? body.mimeType
      : "image/jpeg";
    const imageUrl = typeof body?.imageUrl === "string" && body.imageUrl.startsWith("http")
      ? body.imageUrl
      : null;

    if (!chosenSpecies) return json({ error: "chosenSpecies required" }, 400);
    if (!imageUrl) return json({ error: "imageUrl required" }, 400);

    // 1) Busca a foto do Storage (igual embed-pets) e gera base64 robusto.
    const fetchRes = await fetch(imageUrl, { signal: AbortSignal.timeout(10000) });
    if (!fetchRes.ok) {
      console.error("[validate-species] fetch image falhou:", fetchRes.status);
      return json({ error: "fetch image failed" }, 502);
    }
    const buf = new Uint8Array(await fetchRes.arrayBuffer());
    let bin = "";
    const chunk = 0x8000;
    for (let i = 0; i < buf.length; i += chunk) {
      bin += String.fromCharCode(...buf.subarray(i, i + chunk));
    }
    const base64 = btoa(bin);

    // 2) Embedding da FOTO (inline base64) e do TEXTO da especie.
    const photoEmb = await embed(geminiKey, [
      { inline_data: { mime_type: mimeType, data: base64 } },
    ]);
    const textEmb = await embed(geminiKey, [{ text: chosenSpecies }]);

    // 3) Compara.
    const score = dot(photoEmb, textEmb);
    const mismatch = score < MISMATCH_THRESHOLD;
    console.log(`[validate-species] species=${chosenSpecies} score=${score} mismatch=${mismatch}`);
    return json({ mismatch, score }, 200);
  } catch (e) {
    console.error("[validate-species] erro:", e);
    return json({ error: String(e) }, 500);
  }
});
