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

    // Busca SÓ POR IMAGEM (vetor do pet = só a foto). O `match_pets` ranqueia
    // por similaridade coseno. Não usamos o campo `species` do payload (pode
    // estar inconsistente e não reflete a foto).
    // Limiar RELATIVO à melhor imagem: mantém só as fotos próximas do topo.
    //  - Consulta genérica ("gato"): o cluster de gatos é apertado em torno do
    //    melhor, então todos os gatos entram; fotos de outras espécies (muito
    //    abaixo) saem.
    //  - Consulta específica ("gato preto"): o gato preto é o topo e os gatos
    //    não-pretos caem bem abaixo -> só a melhor imagem de gato preto fica.
    const best = all.reduce(
      (m, r) => Math.max(m, (r?.similarity ?? 0) as number),
      0
    );
    const REL_MARGIN = 0.06;
    const threshold = Math.max(best - REL_MARGIN, 0.2);
    const results = all.filter(
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
