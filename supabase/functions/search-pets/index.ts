const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60000;
// Modelo de embedding do Gemini (768 dimensões, igual ao embed-pets).
const EMBED_MODEL = "gemini-embedding-001";

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
    const userId = (await userRes.json())?.id;
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

    // Rate-limit simples por usuário.
    const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const rl = await rest(
      `ai_searches?user_id=eq.${userId}&created_at=gte.${encodeURIComponent(since)}&select=id`
    );
    const rlRows = await rl.json();
    if ((rlRows?.length ?? 0) >= RATE_LIMIT) {
      return json({ error: "rate limit exceeded" }, 429);
    }

    // 1) Embedding da consulta via Gemini.
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/${EMBED_MODEL}:embedContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: { parts: [{ text: query }] } }),
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
        match_count: 20,
      }),
    });
    const rows = await rpcRes.json();
    if (!rpcRes.ok) {
      console.error("[search-pets] rpc falhou:", rows);
      return json({ error: "search failed" }, 500);
    }

    // 3) Registra o uso (para rate-limit). Tabela opcional; ignora erro.
    await rest("ai_searches", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, query }),
    }).catch(() => {});

    return json({ results: rows ?? [] }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
