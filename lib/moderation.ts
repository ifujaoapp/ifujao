import * as SecureStore from "expo-secure-store";
import { getSupabase, isSupabaseConfigured } from "./supabase";

const GOD_TOKEN_KEY = "ifujao_god_token";
const MOD_URL = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const MOD_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

export const getGodToken = (): Promise<string | null> =>
  SecureStore.getItemAsync(GOD_TOKEN_KEY);

const clearGodToken = (): Promise<void> =>
  SecureStore.deleteItemAsync(GOD_TOKEN_KEY);

export const loginModerator = async (
  username: string,
  password: string,
): Promise<boolean> => {
  const sb = getSupabase();
  if (!sb || !isSupabaseConfigured) return false;
  const { data, error } = await sb.functions.invoke("god-login", {
    body: { username, password },
  });
  if (error || !data?.token) return false;
  await SecureStore.setItemAsync(GOD_TOKEN_KEY, data.token as string);
  return true;
};

export const logoutModerator = async (): Promise<void> => {
  await clearGodToken();
};

// Soft-delete de qualquer pet (moderação). PATCH direto na PostgREST usando o
// JWT de moderador no header Authorization — não depende da sessão do client
// (evita problemas de refresh token e garante que a claim is_moderator chega).
export const moderatorSoftDelete = async (petId: string): Promise<boolean> => {
  const token = await getGodToken();
  if (!token || !MOD_URL || !MOD_ANON) return false;
  try {
    const res = await fetch(
      `${MOD_URL}/rest/v1/pets?id=eq.${encodeURIComponent(petId)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
          apikey: MOD_ANON,
          Prefer: "return=minimal",
        },
        body: JSON.stringify({ deleted_at: new Date().toISOString() }),
      },
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn("[moderation] delete falhou:", res.status, txt);
      return false;
    }
    return true;
  } catch (e) {
    console.warn("[moderation] delete erro:", e);
    return false;
  }
};
