// Edge Function: god-login (Modo Deus / moderação)
// Recebe { username, password }, valida contra a tabela `moderators` (bcrypt)
// e devolve um JWT assinado (HS256) com a claim `is_moderator: true`.
// A chave usada é a JWT secret do projeto (defina como secret: MODERATOR_JWT_SECRET
// ou reaproveite SUPABASE_JWT_SECRET). O app usa esse token como sessão do
// Supabase, e a RLS de `pets` libera edição/soft-delete quando a claim existe.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import bcrypt from "https://esm.sh/bcryptjs@2.4.3";
import { create, getNumericDate } from "https://deno.land/x/djwt@v2.8/mod.ts";

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response("Método não permitido", {
      status: 405,
      headers: corsHeaders,
    });
  }
  if (!jwtSecretRaw) {
    return new Response(JSON.stringify({ error: "Configuração ausente" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { username, password } = await req.json().catch(() => ({}));
  if (!username || !password) {
    return new Response(JSON.stringify({ error: "Credenciais ausentes" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await sb
    .from("moderators")
    .select("password_hash")
    .eq("username", username)
    .maybeSingle();

  // Resposta genérica para não revelar se o usuário existe.
  if (error || !data) {
    return new Response(
      JSON.stringify({ error: "Credenciais inválidas" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  let ok = false;
  try {
    ok = await bcrypt.compare(password, data.password_hash);
  } catch {
    ok = false;
  }
  if (!ok) {
    return new Response(
      JSON.stringify({ error: "Credenciais inválidas" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(jwtSecretRaw),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

  const token = await create(
    { alg: "HS256", typ: "JWT" },
    {
      role: "authenticated",
      is_moderator: true,
      moderator: username,
      iss: `${supabaseUrl}/auth/v1`,
      aud: "authenticated",
      sub: "00000000-0000-0000-0000-0000000000ad",
      exp: getNumericDate(60 * 60),
    },
    key,
  );

  return new Response(JSON.stringify({ token }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
