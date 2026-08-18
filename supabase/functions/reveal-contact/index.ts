const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 60000;

const json = (body, status) =>
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
    if (!url || !serviceKey) return json({ error: "missing env" }, 500);

    const userRes = await fetch(`${url}/auth/v1/user`, {
      headers: { Authorization: authHeader, apikey: serviceKey },
    });
    if (!userRes.ok) return json({ error: "unauthorized" }, 401);
    const userId = (await userRes.json())?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const pet_id = body?.pet_id;
    if (!pet_id || typeof pet_id !== "string") {
      return json({ error: "pet_id required" }, 400);
    }

    const rest = (path, init = {}) =>
      fetch(`${url}/rest/v1/${path}`, {
        ...init,
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          ...(init.headers ?? {}),
        },
      });

    const since = new Date(Date.now() - RATE_WINDOW_MS).toISOString();
    const rl = await rest(
      `contact_reveals?user_id=eq.${userId}&created_at=gte.${encodeURIComponent(since)}&select=id`
    );
    const rlRows = await rl.json();
    if ((rlRows?.length ?? 0) >= RATE_LIMIT) {
      return json({ error: "rate limit exceeded" }, 429);
    }

    const c = await rest(
      `pet_contacts?pet_id=eq.${encodeURIComponent(pet_id)}&select=contact&limit=1`
    );
    const cRows = (await c.json()) as Array<{ contact: string }>;
    const contact = cRows?.[0]?.contact;
    if (!contact) return json({ error: "not found" }, 404);

    await rest(`contact_reveals`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId, pet_id }),
    });

    return json({ contact }, 200);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
