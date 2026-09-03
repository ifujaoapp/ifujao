// Edge Function: ban-user (moderação).
// Recebe { action: 'ban' | 'unban', deviceId?, phone?, reason? } e escreve na
// tabela `banned_users` usando service_role (bypassa RLS).
// O chamador precisa enviar o JWT de moderador (godToken) no header
// Authorization: Bearer <token> — a função valida que tem a claim
// `is_moderator: true` antes de prosseguir.
//
// Regras:
//  - Ban: insere nova linha com deviceId/phone, banned_by (do JWT), reason.
//    Se ja existir banimento ativo (unbanned_at is null) com o mesmo
//    device_id ou phone, retorna 409.
//  - Unban: marca unbanned_at = now() e unbanned_by = <moderador> na linha
//    ativa. Se nao houver, retorna 404.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify } from "https://deno.land/x/djwt@v2.8/mod.ts";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const jwtSecretRaw =
  Deno.env.get("MODERATOR_JWT_SECRET") || Deno.env.get("SUPABASE_JWT_SECRET") || "";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Método não permitido", { status: 405, headers: corsHeaders });
  if (!supabaseUrl || !serviceRole || !jwtSecretRaw) {
    return json({ error: "Configuração ausente" }, 500);
  }

  // Valida JWT do moderador.
  const auth = req.headers.get("authorization") ?? "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  if (!token) return json({ error: "Token ausente" }, 401);
  let moderator = "";
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(jwtSecretRaw),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const payload = await jwtVerify(token, key);
    if (!(payload as any).is_moderator) return json({ error: "Sem permissão" }, 403);
    moderator = String((payload as any).moderator ?? "");
  } catch {
    return json({ error: "Token inválido" }, 401);
  }

  const { action, deviceId, phone, reason } = await req.json().catch(() => ({}));
  if (action !== "ban" && action !== "unban") {
    return json({ error: "action deve ser 'ban' ou 'unban'" }, 400);
  }
  if (!deviceId && !phone) {
    return json({ error: "Informe deviceId ou phone" }, 400);
  }

  const sb = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Monta o filtro "device_id = X OR phone = Y" (apenas campos enviados).
  const conds: string[] = [];
  if (deviceId) conds.push(`device_id.eq.${deviceId}`);
  if (phone) conds.push(`phone.eq.${phone}`);
  const filter = conds.join(",");

  if (action === "ban") {
    // Verifica se ja existe banimento ativo para esse device/phone.
    const { data: existing } = await sb
      .from("banned_users")
      .select("id,device_id,phone")
      .or(filter)
      .is("unbanned_at", null)
      .maybeSingle();
    if (existing) {
      return json({ error: "Usuário já está banido", id: existing.id }, 409);
    }
    const row: Record<string, unknown> = {
      banned_by: moderator,
      reason: reason ?? null,
    };
    if (deviceId) row.device_id = deviceId;
    if (phone) row.phone = phone;
    const { data, error } = await sb
      .from("banned_users")
      .insert(row)
      .select("id,banned_at")
      .single();
    if (error) return json({ error: error.message }, 500);
    return json({ ok: true, id: data.id, bannedAt: data.banned_at });
  }

  // unban
  const { data, error } = await sb
    .from("banned_users")
    .update({ unbanned_at: new Date().toISOString(), unbanned_by: moderator })
    .or(filter)
    .is("unbanned_at", null)
    .select("id")
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);
  if (!data) return json({ error: "Banimento ativo não encontrado" }, 404);
  return json({ ok: true, id: data.id });
});
