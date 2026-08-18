import { ensureSession } from './supabase';
import type { PetRecord } from './storage';

export type RevealFn = (petId: string) => Promise<string | null>;

// Decide de onde vem o contato: se o pet já traz `contact` local (dono/reporter),
// usa-o; caso contrário, pede a revelação ao backend (finder via Edge Function).
// Função pura e injetável — facilita teste unitário.
export const resolveContact = async (
  pet: { id: string; contact?: string | null },
  reveal: RevealFn
): Promise<string | null> => {
  if (pet.contact) return pet.contact;
  return reveal(pet.id);
};

// Revela o contato (PII) de um pet para um finder via Edge Function.
// A função exige usuário autenticado e aplica rate-limit, impedindo
// scraping em massa do pet_contacts (que só é legível diretamente por
// dono/reporter). Retorna null em caso de erro/limite.
export const revealContact = async (petId: string): Promise<string | null> => {
  const sb = await ensureSession();
  if (!sb) return null;
  try {
    const { data, error } = await sb.functions.invoke('reveal-contact', {
      body: { pet_id: petId },
    });
    if (error) {
      const status = (error as { context?: { status?: number } }).context?.status;
      console.warn(
        '[contacts] reveal falhou:',
        error.message,
        '| status:',
        status,
        '| body:',
        data
      );
      return null;
    }
    return ((data as { contact?: string } | null)?.contact ?? null) as string | null;
  } catch (e) {
    console.warn('[contacts] reveal erro:', e);
    return null;
  }
};
