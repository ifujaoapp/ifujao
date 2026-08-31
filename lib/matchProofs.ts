import { ensureSession, getSupabase, isSupabaseConfigured } from './supabase';
import { File } from 'expo-file-system';
import type { PetRecord } from './storage';

export interface MatchProof {
  pet_id: string;
  found_pet_id: string;
  claimer_device_id: string;
  found_owner_device_id: string;
  // Novos campos de prova estruturada (Tier 1).
  proof_image?: string | null;
  microchip?: string | null;
  proof?: string | null;
  disputed?: boolean;
}

const PROOF_BUCKET = 'match-proofs';

const safeExtOf = (uri: string): string => {
  const ext = uri.includes('.') ? uri.split('.').pop()!.split('?')[0] : 'jpg';
  return /^[a-z0-9]+$/i.test(ext) ? ext : 'jpg';
};

// Faz upload da imagem de prova de posse para o bucket RESTRITO 'match-proofs'.
// Retorna o caminho do objeto (ex.: "<device_id>/<arquivo>.jpg") para ser
// gravado em pet_match_proofs.proof_image. A leitura só é possível via URL
// assinada pelas partes (ver policy "match-proofs parties read").
export const uploadMatchProofImage = async (
  localUri: string,
  deviceId: string,
): Promise<string | null> => {
  const sb = await ensureSession(deviceId);
  if (!sb || !deviceId || !localUri.startsWith('file://')) return null;
  try {
    const ext = safeExtOf(localUri);
    const fileName = `${deviceId}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}.${ext}`;
    const arrayBuffer = await new File(localUri).arrayBuffer();
    const { error } = await sb.storage
      .from(PROOF_BUCKET)
      .upload(fileName, arrayBuffer, {
        contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}`,
        upsert: false,
        cacheControl: '3600',
      });
    if (error) {
      console.warn('[matchProofs] upload de imagem falhou:', error.message);
      return null;
    }
    return fileName;
  } catch (e) {
    console.warn('[matchProofs] erro de upload de imagem:', e);
    return null;
  }
};

// Gera URL assinada (curta) para exibir a imagem de prova às partes da match.
export const getProofImageSignedUrl = async (
  path: string,
): Promise<string | null> => {
  const sb = getSupabase();
  if (!sb || !isSupabaseConfigured || !path) return null;
  try {
    const { data, error } = await sb.storage
      .from(PROOF_BUCKET)
      .createSignedUrl(path, 3600);
    if (error || !data?.signedUrl) {
      console.warn('[matchProofs] URL assinada falhou:', error?.message);
      return null;
    }
    return data.signedUrl;
  } catch (e) {
    console.warn('[matchProofs] erro de URL assinada:', e);
    return null;
  }
};

// Grava/atualiza a prova de posse de uma reclamação de match. Só o reclamante
// (dono do pet perdido) pode escrever — a RLS garante isso.
export const upsertMatchProof = async (
  pet: PetRecord,
  found: PetRecord,
  payload: { microchip?: string; proofImage?: string | null; notes?: string },
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
        proof_image: payload.proofImage ?? null,
        microchip: payload.microchip?.trim() || null,
        proof: payload.notes?.trim() || null,
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
