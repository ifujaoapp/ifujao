// Validador de especie x foto via Gemini (multimodal embedding).
// Reutiliza o mesmo modelo multimodal (gemini-embedding-2) que embed-pets e
// search-pets ja usam: gera embedding da FOTO do post e embedding do TEXTO
// da especie escolhida, e compara os dois via dot product. Se a similaridade
// for baixa, a foto provavelmente nao e da especie.
//
// NAO bloqueia o post — apenas retorna {mismatch: true} para o caller decidir
// o que fazer (alertar o usuario, marcar speciesMismatch no payload, etc).
//
// Custo: zero (a chave Gemini e free tier). Latencia: ~500ms-1s.

const EMBED_MODEL = "gemini-embedding-2";
const EMBED_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent`;
const EMBED_DIM = 3072;

// Threshold de similaridade. Abaixo disso = mismatch provavel.
// Conservador para evitar falso positivo (gato vs cachorro da score ~0.5-0.6).
const MISMATCH_THRESHOLD = 0.55;

export type SpeciesMatchResult = {
  mismatch: boolean;
  score: number;
  detected?: string;
};

const getApiKey = (): string => {
  const k = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
  if (!k) throw new Error("EXPO_PUBLIC_GEMINI_API_KEY nao configurada");
  return k;
};

// Gera embedding (vetor de 3072 dims) para um input multimodal (imagem ou texto).
const embed = async (apiKey: string, parts: any[]): Promise<number[]> => {
  const res = await fetch(`${EMBED_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      content: { parts },
      outputDimensionality: EMBED_DIM,
    }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    throw new Error(`gemini embed falhou: ${res.status} ${txt}`);
  }
  const json = await res.json();
  const vals = json?.embedding?.values;
  if (!Array.isArray(vals) || vals.length === 0) {
    throw new Error("gemini embed retornou vazio");
  }
  return vals as number[];
};

// Dot product de dois vetores normalizados (Gemini retorna vetores normalizados,
// entao dot product === similaridade coseno).
const dot = (a: number[], b: number[]): number => {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
};

export type CheckArgs = {
  // Imagem em base64 (sem prefixo data:).
  imageBase64: string;
  mimeType: string;
  // Especie que o usuario escolheu no form (ex: "Gato", "Cachorro").
  chosenSpecies: string;
  // URL publica da foto (opcional, preferida se o upload ja foi feito).
  imageUrl?: string;
};

export const checkSpeciesMatch = async (args: CheckArgs): Promise<SpeciesMatchResult> => {
  const apiKey = getApiKey();
  // 1) Embedding da FOTO. Se imageUrl for publica, o Gemini busca direto;
  // senao, manda inline em base64.
  const imgPart = args.imageUrl
    ? { file_data: { file_uri: args.imageUrl, mime_type: args.mimeType } }
    : { inline_data: { mime_type: args.mimeType, data: args.imageBase64 } };
  const photoEmb = await embed(apiKey, [imgPart]);
  // 2) Embedding do TEXTO da especie.
  const textEmb = await embed(apiKey, [{ text: args.chosenSpecies }]);
  // 3) Compara. Vetores do Gemini ja vem normalizados -> dot = cos similarity.
  const score = dot(photoEmb, textEmb);
  return {
    mismatch: score < MISMATCH_THRESHOLD,
    score,
  };
};
