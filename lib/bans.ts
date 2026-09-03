import * as SecureStore from "expo-secure-store";
import { getSupabase, isSupabaseConfigured } from "./supabase";
import { getGodToken } from "./moderation";

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

// Verifica se o device/phone esta banido (consulta server-side, RLS permite
// SELECT publico). Retorna a primeira linha ativa ou null.
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
  const token = await getGodToken();
  if (!token) return { ok: false, error: "Sessão de moderador ausente" };
  try {
    const res = await fetch(`${URL}/functions/v1/ban-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: ANON,
      },
      body: JSON.stringify({
        action: "ban",
        deviceId: params.deviceId,
        phone: params.phone,
        reason: params.reason,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? `HTTP ${res.status}` };
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
  const token = await getGodToken();
  if (!token) return { ok: false, error: "Sessão de moderador ausente" };
  try {
    const res = await fetch(`${URL}/functions/v1/ban-user`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        apikey: ANON,
      },
      body: JSON.stringify({
        action: "unban",
        deviceId: params.deviceId,
        phone: params.phone,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (!res.ok) return { ok: false, error: data.error ?? `HTTP ${res.status}` };
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
    const raw = await SecureStore.getItemAsync(BAN_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as BanCacheEntry;
    if (parsed.deviceId !== deviceId || parsed.phone !== phone) return null;
    return parsed;
  } catch {
    return null;
  }
};

export const writeBanCache = async (
  deviceId: string,
  phone: string,
  ban: BanRow | null,
): Promise<void> => {
  try {
    const entry: BanCacheEntry = { ts: Date.now(), ban, deviceId, phone };
    await SecureStore.setItemAsync(BAN_CACHE_KEY, JSON.stringify(entry));
  } catch {}
};
