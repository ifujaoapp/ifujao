// Edge Function: get-contact (moderação).
// Retorna o phone/contact de um pet a partir de pet_contacts. Requer
// JWT de moderador (godToken) com claim is_moderator: true.
//
// Restrito a moderadores porque phone/contact sao PII sensiveis. O
// payload publico de `pets` NAO contem esses campos por privacidade
// (lib/sync.ts faz delete antes de subir). Esta funcao e o UNICO
// caminho para o moderador visualizar o telefone do dono do pet.

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

function base64urlToBytes(s: string): Uint8Array {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  const b64 = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

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
  if (req.method !== "POST") {
    return new Response("Método não permitido", {
      status: 405,
      headers: corsHeaders,
    });
  }
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

  const { petId } = await req.json().catch(() => ({}));
  if (!petId || typeof petId !== "string") {
    return json({ error: "petId é obrigatório" }, 400);
  }

  const sb = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Lê PII diretamente de pet_contacts (RLS restrita a dono/reporter;
  // service_role bypassa). Apenas para moderadores autenticados.
  const { data, error } = await sb
    .from("pet_contacts")
    .select("contact")
    .eq("pet_id", petId)
    .maybeSingle();
  if (error) return json({ error: error.message }, 500);

  return json({
    ok: true,
    contact: data?.contact ?? null,
  });
});
