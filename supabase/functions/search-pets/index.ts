const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const DAILY_LIMIT = 20;
const MATCH_COUNT = 20;
// Modelo de embedding MULTIMODAL do Gemini (texto+imagem), igual ao embed-pets.
const EMBED_MODEL = "gemini-embedding-2";
const EMBED_DIM = 3072;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

// ---- Busca HÍBRIDA (imagem + rótulo de espécie) --------------------------
// A similaridade do Postgres é puramente VISUAL (embedding da FOTO do pet vs
// texto da consulta). Sozinha, ela não sabe se o animal existe: "cachorro"
// casava com a foto de um GATO (sim ~0.33) e o app mentia "achou um cachorro".
// Aqui conferimos também a Espécie cadastrada: se a consulta nomeia uma
// espécie, só devolvemos pets DAQUELA espécie; se não houver nenhum, devolvemos
// vazio ("não tem"). Consultas que só descrevem aparência (sem espécie) continuam
// usando só a imagem.

// Remove acentos e baixa a caixa (ex.: "Cão" -> "cao", "Cachorro" -> "cachorro").
const stripDiacritics = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

// Distância de Levenshtein (tolera digitação: "cahorro" ~ "cachorro" = 1).
const levenshtein = (a: string, b: string): number => {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1).fill(0);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    const t = prev;
    prev = curr;
    curr = t;
  }
  return prev[n];
};

// Sinônimos (PT + EN + variantes) de cada espécie. A chave é o rótulo oficial
// usado no app (deve espelhar SPECIES_BREEDS de app/(tabs)/index.tsx).
const SPECIES_SYNONYMS: Record<string, string[]> = {
  "Cachorro": ["cachorro", "cao", "dog", "cachorrinho", "cachorra", "cadela", "doguinho", "caozinho", "filhote de cachorro"],
  "Gato": ["gato", "gata", "cat", "gatinho", "gatito", "felino"],
  "Calopsita": ["calopsita", "cockatiel"],
  "Papagaio": ["papagaio", "parrot"],
  "Arara": ["arara", "macaw"],
  "Cacatua": ["cacatua", "cockatoo"],
  "Periquito-australiano": ["periquito", "budgerigar", "budgie"],
  "Agapornis": ["agapornis", "lovebird"],
  "Ferret": ["ferret", "furao", "furona", "furão"],
  "Hámster": ["hamster", "hamster"],
  "Coelho": ["coelho", "coelha", "rabbit", "bunny"],
  "Porquinho-da-índia": ["porquinho", "guinea pig", "cobaia"],
  "Gerbil": ["gerbil"],
  "Rato Twister": ["rato", "ratinho"],
  "Jabuti e Cágado": ["jabuti", "cagado", "tartaruga", "turtle"],
  "Gecko": ["gecko"],
  "Iguana": ["iguana"],
  "Cobra": ["cobra", "snake", "serpente", "piton", "jiboia", "python"],
};

// Índice sinônimo (normalizado) -> espécie canônica.
const SYN_TO_CANON: Record<string, string> = {};
for (const [canon, syns] of Object.entries(SPECIES_SYNONYMS)) {
  SYN_TO_CANON[stripDiacritics(canon)] = canon;
  for (const s of syns) SYN_TO_CANON[stripDiacritics(s)] = canon;
}

// Espécie canônica de um pet a partir do rótulo cadastrado (ou null).
const petCanon = (payload: any): string | null => {
  const sp = payload?.species;
  if (!sp) return null;
  const key = stripDiacritics(String(sp));
  if (SYN_TO_CANON[key]) return SYN_TO_CANON[key];
  for (const [syn, canon] of Object.entries(SYN_TO_CANON)) {
    if (syn.length >= 4 && levenshtein(key, syn) <= 2) return canon;
  }
  return null;
};

// Espécies implícitas na consulta (ex.: "cahorro" -> "Cachorro", "gato" -> "Gato").
const detectImpliedSpecies = (query: string): Set<string> => {
  const q = stripDiacritics(query);
  const tokens = q.split(/[^a-z0-9]+/).filter(Boolean);
  const implied = new Set<string>();
  for (const tok of tokens) {
    for (const [syn, canon] of Object.entries(SYN_TO_CANON)) {
      if (tok === syn) {
        implied.add(canon);
        continue;
      }
      if (syn.length >= 4 && tok.includes(syn)) implied.add(canon);
    }
    if (tok.length >= 4) {
      for (const [syn, canon] of Object.entries(SYN_TO_CANON)) {
        if (syn.length >= 4 && levenshtein(tok, syn) <= 2) implied.add(canon);
      }
    }
  }
  return implied;
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

    // Valida o JWT (usuário anônimo basta — a busca é pública para finders).
    const userRes = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: serviceKey },
    });
    if (!userRes.ok) return json({ error: "unauthorized" }, 401);
    const userJson = await userRes.json();
    const userId = userJson?.id;
    const deviceId = userJson?.user_metadata?.device_id;
    if (!userId) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (!query) return json({ error: "query required" }, 400);

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

    // Rate-limit DIÁRIO (20/dia) por device_id, janela em UTC (início do dia UTC).
    const startOfUtcDay = new Date();
    startOfUtcDay.setUTCHours(0, 0, 0, 0);
    const since = startOfUtcDay.toISOString();
    const rlKey = deviceId
      ? `device_id=eq.${encodeURIComponent(deviceId)}`
      : `user_id=eq.${encodeURIComponent(userId)}`;
    const rl = await rest(
      `ai_searches?${rlKey}&created_at=gte.${encodeURIComponent(since)}&select=id`
    );
    const rlRows = await rl.json();
    if ((rlRows?.length ?? 0) >= DAILY_LIMIT) {
      return json({ error: "daily limit exceeded" }, 429);
    }

    // 1) Embedding da consulta via Gemini (multimodal, 3072 dims).
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text: query }] },
          outputDimensionality: EMBED_DIM,
        }),
      }
    );
    if (!geminiRes.ok) {
      const txt = await geminiRes.text();
      console.error("[search-pets] gemini falhou:", txt);
      return json({ error: "embedding failed" }, 502);
    }
    const emb = (await geminiRes.json())?.embedding?.values;
    if (!Array.isArray(emb) || emb.length === 0) {
      return json({ error: "empty embedding" }, 502);
    }

    // 2) Busca por similaridade (RPC match_pets, via service_role).
    const rpcRes = await rest("rpc/match_pets", {
      method: "POST",
      body: JSON.stringify({
        query_embedding: `[${emb.join(",")}]`,
        match_count: MATCH_COUNT,
      }),
    });
    const rows = await rpcRes.json();
    if (!rpcRes.ok) {
      console.error("[search-pets] rpc falhou:", rows);
      return json({ error: "search failed" }, 500);
    }

    const all = Array.isArray(rows) ? rows : [];
    if (all.length === 0) return json({ results: [] }, 200);

    // Busca HÍBRIDA: imagem (similaridade do Postgres) + rótulo de espécie.
    const implied = detectImpliedSpecies(query);

    // Se a consulta nomeia uma espécie, restringe aos pets DAQUELA espécie
    // (rótulo cadastrado). Se não houver nenhum, devolve vazio ("não tem") —
    // mesmo que a foto de outra espécie fosse "parecida" com o texto. Isso
    // impede "cahorro"/"cachorro" de devolver um gato só porque a imagem é
    // vagamente similar.
    let pool = all;
    if (implied.size > 0) {
      const qNorm = stripDiacritics(query);
      const qTokens = qNorm.split(/[^a-z0-9]+/).filter(Boolean);
      pool = all.filter((r) => {
        const canon = petCanon(r?.payload);
        if (canon && implied.has(canon)) return true;
        // Também aceita se a raça cadastrada casa com a consulta (ex.: "shih tzu").
        const breed = stripDiacritics(String(r?.payload?.breed ?? ""));
        if (breed) {
          for (const tok of qTokens) {
            if (tok.length < 4) continue;
            if (breed.includes(tok) || levenshtein(tok, breed) <= 2) return true;
          }
        }
        return false;
      });
      if (pool.length === 0) return json({ results: [] }, 200);
    }

    // Limiar RELATIVO à melhor imagem: mantém só as fotos próximas do topo.
    //  - Consulta genérica ("gato"): o cluster de gatos é apertado em torno do
    //    melhor, então todos os gatos entram; fotos de outras espécies (muito
    //    abaixo) saem.
    //  - Consulta específica ("gato preto"): o gato preto é o topo e os gatos
    //    não-pretos caem bem abaixo -> só a melhor imagem de gato preto fica.
    const best = pool.reduce(
      (m, r) => Math.max(m, (r?.similarity ?? 0) as number),
      0
    );
    // Piso absoluto (só quando a consulta NÃO nomeia espécie): se a melhor
    // similaridade estiver abaixo, a consulta não tem correspondência visual
    // real (palavra que não existe / ruído) e deve retornar vazio. Calibrado
    // por medição real: ruído ~0.26–0.27; acertos 0.33+. Acima do ruído.
    const MIN_BEST_SIMILARITY = 0.32;
    if (implied.size === 0 && best < MIN_BEST_SIMILARITY) {
      return json({ results: [] }, 200);
    }
    const REL_MARGIN = 0.06;
    const threshold = best - REL_MARGIN;
    const results = pool.filter(
      (r) => (r?.similarity ?? 0) >= threshold
    );

    // 3) Registra o uso (para rate-limit diário). Tabela opcional; ignora erro.
    await rest("ai_searches", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, device_id: deviceId ?? null, query }),
    }).catch(() => {});

    return json({ results }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
