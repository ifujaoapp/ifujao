// Edge Function: validate-species (moderação).
// Usa gemini-embedding-2 multimodal para comparar a foto com o texto da espécie.
// Retorna { mismatch, score } baseado em dot product dos embeddings.
// Threshold: 0.35 (ajustado após testes).

const EMBED_MODEL = "gemini-embedding-2";
const EMBED_DIM = 3072;
const MISMATCH_THRESHOLD = 0.35;

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
    const imageBase64 = typeof body?.imageBase64 === "string" && body.imageBase64.length > 0
      ? body.imageBase64
      : null;

    if (!chosenSpecies) return json({ error: "chosenSpecies required" }, 400);
    if (!imageUrl && !imageBase64) return json({ error: "imageUrl or imageBase64 required" }, 400);

    let base64: string;
    if (imageBase64) {
      base64 = imageBase64;
    } else {
      const fetchRes = await fetch(imageUrl!, { signal: AbortSignal.timeout(10000) });
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
      base64 = btoa(bin);
    }

    try {
      const [photoEmb, textEmb] = await Promise.all([
        embed(geminiKey, [{ inline_data: { mime_type: mimeType, data: base64 } }]),
        embed(geminiKey, [{ text: chosenSpecies }]),
      ]);

      const score = dot(photoEmb, textEmb);
      const mismatch = score < MISMATCH_THRESHOLD;

      console.log(
        `[validate-species] species=${chosenSpecies} score=${score.toFixed(4)} mismatch=${mismatch}`
      );
      return json({ mismatch, score }, 200);
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      if (msg.includes("429") || msg.includes("quota") || msg.includes("RESOURCE_EXHAUSTED")) {
        console.warn("[validate-species] quota excedida, retornando match=false silencioso");
        return json({ mismatch: false, score: 0, quotaExceeded: true }, 200);
      }
      console.error("[validate-species] erro:", e);
      return json({ error: msg }, 500);
    }
  } catch (e) {
    console.error("[validate-species] erro:", e);
    return json({ error: String(e) }, 500);
  }
});
