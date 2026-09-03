// Edge Function: validate-species (moderação).
// Recebe { imageUrl?, imageBase64?, mimeType, chosenSpecies } e usa o Gemini
// de GERACAO (gemini-2.5-flash, multimodal) para classificar a especie
// visivel na foto. Retorna { mismatch, detected, confidence }.
//
// Por que gemini-2.5-flash e NAO gemini-embedding-2: o embedding multimodal
// da foto e o embedding do texto "Cachorro" ficam em regioes diferentes do
// espaco vetorial, dando dot product baixo (~0.38) mesmo quando a foto E
// cachorro. O modelo de geracao entende diretamente o conteudo da imagem e
// responde com a especie detectada.
//
// A chave GEMINI_API_KEY fica nos secrets do projeto (Deno.env.get).
// NAO bloqueia nada: o caller decide o que fazer com o resultado.

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

// Sinônimos de cada espécie. A chave deve espelhar SPECIES_BREEDS do app
// (Cachorro, Gato, etc). Usado para normalizar o que o Gemini retorna.
const SPECIES_SYNONYMS: Record<string, string[]> = {
  "Cachorro": ["cachorro", "cao", "cão", "dog", "cachorrinho", "cachorra", "cadela", "doguinho", "caozinho", "filhote de cachorro", "puppy"],
  "Gato": ["gato", "gata", "cat", "gatinho", "gatito", "felino", "kitten"],
  "Calopsita": ["calopsita", "cockatiel"],
  "Papagaio": ["papagaio", "parrot"],
  "Arara": ["arara", "macaw"],
  "Cacatua": ["cacatua", "cockatoo"],
  "Periquito-australiano": ["periquito", "budgerigar", "budgie"],
  "Agapornis": ["agapornis", "lovebird"],
  "Ferret": ["ferret", "furao", "furão", "furona"],
  "Hámster": ["hamster", "hámster"],
  "Coelho": ["coelho", "coelha", "rabbit", "bunny"],
  "Porquinho-da-índia": ["porquinho", "guinea pig", "cobaia"],
  "Gerbil": ["gerbil"],
  "Rato Twister": ["rato", "ratinho", "rat"],
  "Jabuti e Cágado": ["jabuti", "cagado", "cágado", "tartaruga", "turtle"],
  "Gecko": ["gecko", "lagartixa"],
  "Iguana": ["iguana"],
  "Cobra": ["cobra", "snake", "serpente", "piton", "jiboia", "python"],
};

const stripDiacritics = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

// Normaliza a string de especie (do Gemini ou do client) para a chave canonica
// usada no app. Retorna null se nao reconhecer.
const normalizeSpecies = (s: string): string | null => {
  const k = stripDiacritics(s);
  for (const [canon, syns] of Object.entries(SPECIES_SYNONYMS)) {
    if (stripDiacritics(canon) === k) return canon;
    for (const syn of syns) {
      if (stripDiacritics(syn) === k) return canon;
    }
  }
  return null;
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
    const chosenSpeciesRaw = typeof body?.chosenSpecies === "string"
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

    if (!chosenSpeciesRaw) return json({ error: "chosenSpecies required" }, 400);
    if (!imageUrl && !imageBase64) {
      return json({ error: "imageUrl or imageBase64 required" }, 400);
    }

    const chosenCanon = normalizeSpecies(chosenSpeciesRaw);
    if (!chosenCanon) {
      // Especie do client nao reconhecida: passa direto, sem validar.
      return json({ mismatch: false, detected: null, confidence: 0 }, 200);
    }

    // Monta a parte da imagem: inline_data (base64) ou file_data (URL).
    const imgPart: any = imageUrl
      ? { file_data: { file_uri: imageUrl, mime_type: mimeType } }
      : { inline_data: { mime_type: mimeType, data: imageBase64! } };

    // Prompt pedindo ao Gemini para classificar a especie visivel.
    const prompt = `Analise esta imagem e identifique qual animal esta visivel.
Responda APENAS com um JSON no formato: {"species": "nome do animal", "confidence": 0.0-1.0}.

Use nomes em portugues. Exemplos: "cachorro", "gato", "calopsita", "papagaio", "coelho".
Se nao for nenhum animal domestico reconhecivel, responda {"species": "outro", "confidence": 0.0}.`;

    // Chama gemini-2.5-flash com responseSchema JSON.
    const gRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{
            parts: [
              imgPart,
              { text: prompt },
            ],
          }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: {
              type: "OBJECT",
              properties: {
                species: { type: "STRING" },
                confidence: { type: "NUMBER" },
              },
              required: ["species", "confidence"],
            },
          },
        }),
        signal: AbortSignal.timeout(15000),
      }
    );
    if (!gRes.ok) {
      const txt = await gRes.text().catch(() => "");
      console.error("[validate-species] gemini falhou:", gRes.status, txt);
      return json({ mismatch: false, detected: null, confidence: 0 }, 200);
    }
    const j = await gRes.json();
    const text = j?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      console.error("[validate-species] resposta vazia");
      return json({ mismatch: false, detected: null, confidence: 0 }, 200);
    }
    let parsed: { species?: string; confidence?: number };
    try { parsed = JSON.parse(text); } catch {
      console.error("[validate-species] parse falhou:", text);
      return json({ mismatch: false, detected: null, confidence: 0 }, 200);
    }
    const detectedRaw = (parsed.species || "").toString();
    const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
    const detectedCanon = normalizeSpecies(detectedRaw);

    // Mismatch se:
    //  - Gemini identificou uma especie diferente da escolhida
    //  - E confianca >= 0.6 (abaixo disso, ignora — pode ser incerto)
    const mismatch = !!detectedCanon
      && detectedCanon !== chosenCanon
      && confidence >= 0.6;

    console.log(
      `[validate-species] chosen=${chosenCanon} detected=${detectedCanon || detectedRaw || "?"} ` +
      `confidence=${confidence} mismatch=${mismatch}`
    );
    return json(
      { mismatch, detected: detectedCanon, confidence },
      200
    );
  } catch (e) {
    console.error("[validate-species] erro:", e);
    return json({ error: String(e) }, 500);
  }
});
