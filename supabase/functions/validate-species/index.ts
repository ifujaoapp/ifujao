// Edge Function: validate-species (moderação).
// Usa gemini-3.6-flash para CLASSIFICAÇÃO DIRETA da imagem: pede ao modelo
// que identifique a espécie do animal na foto, comparando com a lista válida.
// Sem embeddings, sem threshold instável.
//
// Retorna { mismatch, detectedSpecies, score }.
// mismatch=true quando a espécie detectada NÃO bate com a escolhida pelo usuário.

const GEMINI_MODEL = "gemini-3.6-flash";

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

const SPECIES_LIST = [
  "Cachorro",
  "Gato",
  "Calopsita",
  "Passaro",
  "Coelho",
  "Hamster",
  "Peixe",
  "Tartaruga",
  "Cobra",
  "Lagarto",
  "Cavalo",
  "Cabra",
  "Ovelha",
  "Porco",
  "Galinha",
  "Pato",
  "Coala",
  "Panda",
  "Urso",
  "Leao",
  "Tigre",
  "Elefante",
  "Macaco",
  "Sapo",
];

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

    // 1) Gera base64 da imagem: de URL (fetch) ou direto do payload.
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

    // 2) Prompt de classificação direta: pede APENAS o nome da espécie.
    const prompt = `Identifique o animal principal nesta imagem. Escolha APENAS UMA espécie da lista abaixo (exatamente como escrita). Se não for nenhum destes, responda DESCONHECIDO.

Lista: ${SPECIES_LIST.join(", ")}

Responda apenas o nome da espécie, sem texto adicional.`;

    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64,
                  },
                },
                { text: prompt },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 200,
            responseMimeType: "text/plain",
          },
        }),
      }
    );

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.error("[validate-species] gemini classify falhou:", res.status, txt);
      return json({ error: "gemini classify failed" }, 502);
    }

    const j = await res.json();
    console.log("[validate-species] gemini RAW response:", JSON.stringify(j).slice(0, 2000));

    // Tenta extrair o texto de vários lugares possíveis na resposta do Gemini.
    const rawText =
      (j?.candidates?.[0]?.content?.parts?.[0]?.text ?? "").trim() ||
      (j?.candidates?.[0]?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join(" ") ?? "").trim() ||
      (Array.isArray(j?.candidates) ? j.candidates.map((c: any) => c?.content?.parts?.map((p: any) => p?.text).filter(Boolean).join(" ")).filter(Boolean).join(" ") : "").trim() ||
      (j?.response?.text ?? "").trim();

    console.log("[validate-species] gemini rawText:", JSON.stringify(rawText));

    if (!rawText) {
      console.warn("[validate-species] gemini retornou texto vazio, tratando como mismatch");
      return json({ mismatch: true, score: 0, detectedSpecies: "" }, 200);
    }

    const normalizedDetected = rawText
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");
    const normalizedChosen = chosenSpecies
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s+/g, " ");

    const mismatch = normalizedDetected !== normalizedChosen;
    const confidence = mismatch ? 0 : 1;

    console.log(
      `[validate-species] chosen=${chosenSpecies} detected=${rawText} mismatch=${mismatch}`
    );
    return json({ mismatch, score: confidence, detectedSpecies: rawText }, 200);
  } catch (e) {
    console.error("[validate-species] erro:", e);
    return json({ error: String(e) }, 500);
  }
});
