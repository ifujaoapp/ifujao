// Edge Function: validate-species (moderação).
// Recebe { imageUrl?, imageBase64?, mimeType, chosenSpecies } e compara o
// embedding multimodal da FOTO com o embedding do TEXTO da especie escolhida.
// Retorna { mismatch: boolean, score: number }.
//
// Usa o mesmo modelo multimodal (gemini-embedding-2) que embed-pets e
// search-pets ja usam. A chave GEMINI_API_KEY fica nos secrets do projeto
// (Deno.env.get), nunca no client.
//
// NAO bloqueia nada: o caller decide o que fazer com o resultado.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const EMBED_MODEL = "gemini-embedding-2";
const EMBED_DIM = 3072;
// Threshold de similaridade (dot product de vetores normalizados).
// Abaixo disso = mismatch provavel. Calibrado em 0.45: cachorro vs "Cachorro"
// tipicamente ~0.65-0.75, gato vs "Gato" ~0.65-0.75, cachorro vs "Gato" ~0.40.
// 0.45 fica entre os dois, dando margem para variacoes de raca/idade/angulo.
const MISMATCH_THRESHOLD = 0.45;

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

// Busca uma URL publica e devolve os bytes como Uint8Array. Usado quando o
// client manda imageUrl (foto ja no Storage) em vez de imageBase64.
const fetchImageBytes = async (url: string): Promise<Uint8Array> => {
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) throw new Error(`fetch image falhou: ${res.status}`);
  const buf = await res.arrayBuffer();
  return new Uint8Array(buf);
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
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

    // Valida o JWT do usuario (qualquer user autenticado pode chamar).
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
    if (!imageUrl && !imageBase64) {
      return json({ error: "imageUrl or imageBase64 required" }, 400);
    }

    // Monta a parte da imagem: inline_data (base64) ou file_data (URL).
    const imgPart: any = imageUrl
      ? { file_data: { file_uri: imageUrl, mime_type: mimeType } }
      : { inline_data: { mime_type: mimeType, data: imageBase64! } };

    // 1) Embedding da FOTO.
    const photoEmb = await embed(geminiKey, [imgPart]);
    // 2) Embedding do TEXTO da especie.
    const textEmb = await embed(geminiKey, [{ text: chosenSpecies }]);
    // 3) Compara.
    const score = dot(photoEmb, textEmb);
    console.log(`[validate-species] species=${chosenSpecies} score=${score} mismatch=${score < MISMATCH_THRESHOLD}`);
    return json(
      { mismatch: score < MISMATCH_THRESHOLD, score },
      200
    );
  } catch (e) {
    console.error("[validate-species] erro:", e);
    return json({ error: String(e) }, 500);
  }
});
