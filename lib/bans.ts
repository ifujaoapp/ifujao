import { ssGet, ssSet } from "./secureStoreSafe";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import { getFreshGodToken } from "./moderation";

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

export type BanRow = {
  id: string;
  device_id: string | null;
  phone: string | null;
  banned_by: string;
  banned_at: string;
  reason: string | null;
  unbanned_at: string | null;
  unbanned_by: string | null;
};

// Helper: faz POST na Edge Function ban-user com retry automatico quando
// o token expira (401). Em caso de 401, re-autentica com as credenciais
// guardadas (moderation.ts) e tenta de novo uma unica vez.
async function callBanFunction(
  body: Record<string, unknown>,
): Promise<Response> {
  const fresh1 = await getFreshGodToken();
  const res1 = await fetch(`${URL}/functions/v1/ban-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${fresh1 ?? ""}`,
      apikey: ANON,
    },
    body: JSON.stringify(body),
  });
  if (res1.status !== 401) return res1;
  // 401: token expirado ou invalido. Forca refresh e tenta uma unica vez.
  const fresh2 = await getFreshGodToken(true);
  if (!fresh2 || fresh2 === fresh1) return res1;
  return await fetch(`${URL}/functions/v1/ban-user`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${fresh2}`,
      apikey: ANON,
    },
    body: JSON.stringify(body),
  });
}

// Verifica se o device/phone esta banido consultando a tabela
// `banned_users` diretamente (PostgREST, RLS permite SELECT publico).
// Usado pelo proprio app para auto-checagem (o dispositivo checa a si
// mesmo). Retorna a primeira linha ativa ou null.
export const checkBan = async (
  deviceId?: string | null,
  phone?: string | null,
): Promise<BanRow | null> => {
  if (!isSupabaseConfigured || !URL || !ANON) return null;
  if (!deviceId && !phone) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const conds: string[] = [];
  if (deviceId) conds.push(`device_id.eq.${encodeURIComponent(deviceId)}`);
  if (phone) conds.push(`phone.eq.${encodeURIComponent(phone)}`);
  try {
    const { data, error } = await sb
      .from("banned_users")
      .select("id,device_id,phone,banned_by,banned_at,reason,unbanned_at,unbanned_by")
      .or(conds.join(","))
      .is("unbanned_at", null)
      .order("banned_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      console.warn("[bans] checkBan erro:", error.message);
      return null;
    }
    return (data as BanRow | null) ?? null;
  } catch (e) {
    console.warn("[bans] checkBan exception:", e);
    return null;
  }
};

// Verifica o status de ban via Edge Function ban-user (action=status).
// Requer godToken (modo deus). A funcao roda no backend com service_role
// e retorna {banned, row} a partir da tabela banned_users. Usado pelo
// ModerationDetailModal para mostrar o botao correto (banir vs liberar).
export const checkBanStatus = async (
  deviceId?: string | null,
  phone?: string | null,
): Promise<{ banned: boolean; row: BanRow | null }> => {
  if (!isSupabaseConfigured || !URL || !ANON) {
    return { banned: false, row: null };
  }
  if (!deviceId && !phone) {
    return { banned: false, row: null };
  }
  try {
    const res = await callBanFunction({
      action: "status",
      deviceId: deviceId ?? undefined,
      phone: phone ?? undefined,
    });
    const data = (await res.json().catch(() => ({}))) as {
      banned?: boolean;
      row?: BanRow | null;
    };
    if (!res.ok) return { banned: false, row: null };
    return { banned: !!data.banned, row: data.row ?? null };
  } catch (e) {
    console.warn("[bans] checkBanStatus exception:", e);
    return { banned: false, row: null };
  }
};

// Lista banimentos ativos (para o modal de moderacao mostrar historico).
export const listActiveBans = async (): Promise<BanRow[]> => {
  if (!isSupabaseConfigured || !URL || !ANON) return [];
  const sb = getSupabase();
  if (!sb) return [];
  try {
    const { data, error } = await sb
      .from("banned_users")
      .select("id,device_id,phone,banned_by,banned_at,reason,unbanned_at,unbanned_by")
      .is("unbanned_at", null)
      .order("banned_at", { ascending: false })
      .limit(50);
    if (error) {
      console.warn("[bans] listActiveBans erro:", error.message);
      return [];
    }
    return (data as BanRow[]) ?? [];
  } catch (e) {
    console.warn("[bans] listActiveBans exception:", e);
    return [];
  }
};

// Banir (chama Edge Function com JWT de moderador).
export const banUser = async (params: {
  deviceId?: string;
  phone?: string;
  reason?: string;
}): Promise<{ ok: boolean; error?: string }> => {
  if (!params.deviceId && !params.phone) {
    return { ok: false, error: "Informe deviceId ou phone" };
  }
  try {
    const res = await callBanFunction({
      action: "ban",
      deviceId: params.deviceId,
      phone: params.phone,
      reason: params.reason,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
};

// Liberar ban (chama Edge Function).
export const unbanUser = async (params: {
  deviceId?: string;
  phone?: string;
}): Promise<{ ok: boolean; error?: string }> => {
  if (!params.deviceId && !params.phone) {
    return { ok: false, error: "Informe deviceId ou phone" };
  }
  try {
    const res = await callBanFunction({
      action: "unban",
      deviceId: params.deviceId,
      phone: params.phone,
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) {
      return { ok: false, error: data.error ?? `HTTP ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
};

// Cache local (AsyncStorage-like) para a checagem rapida no startup.
// Persistimos o deviceId/phone para evitar chamadas de rede quando offline,
// mas a fonte de verdade e sempre o server.
const BAN_CACHE_KEY = "ifujao_ban_cache_v1";
type BanCacheEntry = { ts: number; ban: BanRow | null; deviceId: string; phone: string };

export const readBanCache = async (
  deviceId: string,
  phone: string,
): Promise<BanCacheEntry | null> => {
  try {
    const raw = await ssGet(BAN_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BanCacheEntry;
    if (parsed.deviceId !== deviceId || parsed.phone !== phone) return null;
    return parsed;
  } catch {
    return null;
  }
};

// Busca o contato (telefone) de um pet via Edge Function get-contact.
// Usado pelo modal de moderacao (godMode) para exibir o telefone do
// dono. O contato NAO esta no payload publico de `pets` (privacidade),
// vive em pet_contacts (RLS restrita a dono/reporter). Em caso de 401
// (token expirado), re-autentica uma vez.
export const getContactByPetId = async (
  petId: string,
): Promise<{ contact: string | null }> => {
  if (!isSupabaseConfigured || !URL || !ANON || !petId) {
    return { contact: null };
  }
  const call = async () => {
    const t = await getFreshGodToken();
    if (!t) return null;
    const res = await fetch(`${URL}/functions/v1/get-contact`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${t}`,
        apikey: ANON,
      },
      body: JSON.stringify({ petId }),
    });
    if (res.status === 401) return "unauthorized" as const;
    if (!res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as {
      contact?: string | null;
    };
    return { contact: data.contact ?? null };
  };
  try {
    const r1 = await call();
    if (r1 && r1 !== "unauthorized") return r1;
    if (r1 === "unauthorized") {
      const r2 = await call();
      if (r2 && r2 !== "unauthorized") return r2;
    }
    return { contact: null };
  } catch (e) {
    console.warn("[bans] getContactByPetId exception:", e);
    return { contact: null };
  }
};

export const writeBanCache = async (
  deviceId: string,
  phone: string,
  ban: BanRow | null,
): Promise<void> => {
  try {
    const entry: BanCacheEntry = { ts: Date.now(), ban, deviceId, phone };
    await ssSet(BAN_CACHE_KEY, JSON.stringify(entry));
  } catch {}
};
