import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(url && anonKey);

let client: SupabaseClient | null = null;

export const getSupabase = (): SupabaseClient | null => {
  if (!isSupabaseConfigured) return null;
  if (!client) {
    client = createClient(url as string, anonKey as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    });
  }
  return client;
};

// Garante sessão anônima (usuário invisível) e grava o device id na metadata
// do usuário para ser usado nas policies de RLS (owner/reporter).
export const ensureSession = async (deviceId?: string): Promise<SupabaseClient | null> => {
  const sb = getSupabase();
  if (!sb) return null;
  try {
    const { data: existing } = await sb.auth.getSession();
    if (!existing.session) {
      const { error } = await sb.auth.signInAnonymously();
      if (error) {
        console.warn('[supabase] anon sign-in falhou:', error.message);
        return null;
      }
    }
    if (deviceId) {
      const { data: userData } = await sb.auth.getUser();
      if (userData.user && userData.user.user_metadata?.device_id !== deviceId) {
        await sb.auth.updateUser({ data: { device_id: deviceId } }).catch(() => {});
      }
    }
    return sb;
  } catch (e) {
    console.warn('[supabase] ensureSession erro:', e);
    return null;
  }
};
