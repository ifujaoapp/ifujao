import { ensureSession } from './supabase';

// Dispara a geração do embedding de um pet na Edge Function `embed-pets`
// (chamado pelo push após criar/atualizar um pet). Fire-and-forget: não deve
// bloquear nem falhar o push — se o embedding falhar, a busca só ignora o pet.
export const embedPet = async (petId: string): Promise<void> => {
  const sb = await ensureSession();
  if (!sb) return;
  try {
    await sb.functions.invoke('embed-pets', { body: { pet_id: petId } });
  } catch (e) {
    console.warn('[embed] erro (ignorado):', e);
  }
};
