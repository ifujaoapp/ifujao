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
    // Garante que o device_id esteja na metadata do usuário anônimo, pois as
    // policies de RLS (owner/reporter em pets, storage, pet_contacts) dependem
    // de `current_device_id()`. O campo `device_id` da metadata é RESERVADO
    // pelo Gotrue para usuários anônimos (ele sobrescreve com um UUID próprio,
    // de forma intermitente), então usamos a chave `app_device_id` (nossa).
    // `signInAnonymously` grava `app_device_id` na criação; o `updateUser` de
    // metadata em anon não persiste de forma confiável, por isso usamos
    // `getUser()` (servidor, fonte da verdade) e, se o valor real não bater,
    // forçamos um NOVO sign-in anônimo com o app_device_id.
    if (!deviceId) {
      const { data: ex } = await sb.auth.getSession();
      if (!ex.session) {
        const { error } = await sb.auth.signInAnonymously();
        if (error) {
          console.warn('[supabase] anon sign-in falhou:', error.message);
          return null;
        }
      }
      return sb;
    }
    const { data: userData } = await sb.auth.getUser();
    const current = userData.user?.user_metadata?.app_device_id;
    if (!userData.user || current !== deviceId) {
      await sb.auth.signOut().catch(() => {});
      const { error } = await sb.auth.signInAnonymously({
        options: { data: { app_device_id: deviceId } },
      });
      if (error) {
        console.warn('[supabase] anon sign-in falhou:', error.message);
        return null;
      }
    }
    return sb;
  } catch (e) {
    console.warn('[supabase] ensureSession erro:', e);
    return null;
  }
};
