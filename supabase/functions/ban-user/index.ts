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

// Base64url -> bytes (Deno nativo, sem import externo).
function base64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Verifica um JWT HS256 manualmente (sem djwt) e retorna o payload, ou null.
// Implementação enxuta baseada em Web Crypto API (Deno nativo).
async function verifyJwtHs256(
  token: string,
  secret: string,
): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      base64urlToBytes(s),
      new TextEncoder().encode(`${h}.${p}`),
    );
    if (!valid) return null;
    const payloadJson = new TextDecoder().decode(base64urlToBytes(p));
    const payload = JSON.parse(payloadJson) as Record<string, unknown>;
    if (typeof payload.exp === "number" && Date.now() / 1000 > payload.exp) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

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
  const payload = await verifyJwtHs256(token, jwtSecretRaw);
  if (!payload) return json({ error: "Token inválido" }, 401);
  if (!payload.is_moderator) return json({ error: "Sem permissão" }, 403);
  const moderator = String(payload.moderator ?? "");

  const { action, deviceId, phone, reason } = await req.json().catch(() => ({}));
  if (action !== "ban" && action !== "unban" && action !== "status") {
    return json({ error: "action deve ser 'ban', 'unban' ou 'status'" }, 400);
  }
  if (action !== "status" && !deviceId && !phone) {
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

  // status: checa no backend (tabela banned_users via service_role) se ha
  // ban ativo para o device/phone. Retorna a linha ativa ou null.
  if (action === "status") {
    if (!deviceId && !phone) {
      return json({ banned: false, row: null });
    }
    const { data: existing } = await sb
      .from("banned_users")
      .select("id,device_id,phone,banned_by,banned_at,reason,unbanned_at,unbanned_by")
      .or(filter)
      .is("unbanned_at", null)
      .order("banned_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return json({ banned: !!existing, row: existing ?? null });
  }

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
