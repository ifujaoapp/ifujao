import { ensureSession, getSupabase, isSupabaseConfigured } from './supabase';
import type { PetRecord } from './storage';

export interface MatchProof {
  pet_id: string;
  found_pet_id: string;
  claimer_device_id: string;
  found_owner_device_id: string;
  proof: string | null;
  disputed: boolean;
}

// Grava/atualiza a prova de posse de uma reclamação de match. Só o reclamante
// (dono do pet perdido) pode escrever — a RLS garante isso.
export const upsertMatchProof = async (
  pet: PetRecord,
  found: PetRecord,
  proof: string,
  myDeviceId: string,
): Promise<void> => {
  const sb = await ensureSession();
  if (!sb || !isSupabaseConfigured) return;
  try {
    await sb.from('pet_match_proofs').upsert(
      {
        pet_id: pet.id,
        found_pet_id: found.id,
        claimer_device_id: myDeviceId,
        found_owner_device_id: found.ownerDeviceId ?? '',
        proof: proof || null,
        disputed: false,
      },
      { onConflict: 'pet_id' },
    );
  } catch (e) {
    console.warn('[matchProofs] upsert falhou:', e);
  }
};

// Lê a prova de posse de uma reclamação (legível por reclamante ou dono do achado).
export const getMatchProof = async (
  petId: string,
): Promise<MatchProof | null> => {
  const sb = getSupabase();
  if (!sb || !isSupabaseConfigured) return null;
  try {
    const { data, error } = await sb
      .from('pet_match_proofs')
      .select('*')
      .eq('pet_id', petId)
      .maybeSingle();
    if (error) {
      console.warn('[matchProofs] leitura falhou:', error.message);
      return null;
    }
    return (data as MatchProof | null) ?? null;
  } catch (e) {
    console.warn('[matchProofs] leitura erro:', e);
    return null;
  }
};

// Marca/desmarca disputa de uma reclamação (reclamante ou dono do achado).
export const setMatchProofDisputed = async (
  petId: string,
  disputed: boolean,
): Promise<void> => {
  const sb = await ensureSession();
  if (!sb || !isSupabaseConfigured) return;
  try {
    await sb
      .from('pet_match_proofs')
      .update({ disputed })
      .eq('pet_id', petId);
  } catch (e) {
    console.warn('[matchProofs] dispute falhou:', e);
  }
};
