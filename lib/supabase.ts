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
    // de `current_device_id()`. O `signInAnonymously` grava o `device_id` na
    // criação (confirmado em teste), MAS o `updateUser` de metadata em usuário
    // anônimo NÃO persiste de forma confiável (retorna "sucesso" sem gravar),
    // deixando `current_device_id()` NULL e quebrando o upsert dos pets.
    // Por isso, quando não há sessão OU o device_id não bate, force um NOVO
    // sign-in anônimo com o device_id — caminho comprovadamente funcional.
    const { data: existing } = await sb.auth.getSession();
    const current = existing.session?.user?.user_metadata?.device_id;
    if (!existing.session || current !== deviceId) {
      if (existing.session) await sb.auth.signOut().catch(() => {});
      const { error } = deviceId
        ? await sb.auth.signInAnonymously({ options: { data: { device_id: deviceId } } })
        : await sb.auth.signInAnonymously();
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
