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
      // Passa o device_id JÁ no sign-in anônimo: grava raw_user_meta_data na
      // criação do usuário. updateUser pós-signin em anon costuma ser bloqueado,
      // deixando current_device_id() NULL e quebrando as RLS de pets e storage.
      const { error } = await sb.auth.signInAnonymously(
        deviceId ? { options: { data: { device_id: deviceId } } } : undefined,
      );
      if (error) {
        console.warn('[supabase] anon sign-in falhou:', error.message);
        return null;
      }
    }
    if (deviceId) {
      const { data: userData } = await sb.auth.getUser();
      if (userData.user && userData.user.user_metadata?.device_id !== deviceId) {
        // Tenta updateUser; se falhar (anon sem permissão), força re-sign-in
        // anônimo com o device_id já nos dados — garante current_device_id().
        const updated = await sb.auth
          .updateUser({ data: { device_id: deviceId } })
          .then(() => true)
          .catch(() => false);
        if (!updated) {
          await sb.auth.signOut().catch(() => {});
          const { error } = await sb.auth.signInAnonymously({
            options: { data: { device_id: deviceId } },
          });
          if (error) {
            console.warn('[supabase] re-signin anon falhou:', error.message);
            return null;
          }
        }
      }
    }
    return sb;
  } catch (e) {
    console.warn('[supabase] ensureSession erro:', e);
    return null;
  }
};
