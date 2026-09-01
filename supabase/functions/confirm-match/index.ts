const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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
    const found_pet_id = body?.found_pet_id;
    const claimant_pet_id = body?.claimant_pet_id;
    if (!found_pet_id || !claimant_pet_id) {
      return json({ error: "found_pet_id and claimant_pet_id required" }, 400);
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

    const now = new Date().toISOString();

    // Helper para atualizar o payload JSON de um pet
    const confirmPet = async (petId: string) => {
      // 1. Busca o payload atual
      const getRes = await rest(`pets?id=eq.${petId}&select=payload`);
      if (!getRes.ok) return { error: `fetch ${petId} failed` };
      const rows = await getRes.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        return { error: `pet ${petId} not found` };
      }
      const currentPayload = rows[0]?.payload ?? {};

      // 2. Atualiza o matchStatus no payload
      const updatedPayload = {
        ...currentPayload,
        matchStatus: "confirmed",
      };

      // 3. Faz PATCH com o payload atualizado
      const patchRes = await rest(`pets?id=eq.${petId}`, {
        method: "PATCH",
        body: JSON.stringify({ payload: updatedPayload, updated_at: now }),
      });
      if (!patchRes.ok) {
        const err = await patchRes.text();
        return { error: `patch ${petId} failed: ${err}` };
      }
      return { ok: true };
    };

    const foundResult = await confirmPet(found_pet_id);
    if (foundResult.error) return json(foundResult, 500);

    const claimantResult = await confirmPet(claimant_pet_id);
    if (claimantResult.error) return json(claimantResult, 500);

    return json({ ok: true });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
