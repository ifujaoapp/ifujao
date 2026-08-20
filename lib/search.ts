import { ensureSession } from './supabase';
import type { PetRecord } from './storage';

export interface SearchResult {
  id: string;
  payload: PetRecord;
  similarity: number;
}

// Busca semântica por linguagem natural via Edge Function (Gemini embeddings +
// pgvector). Retorna [] em caso de erro/limite — a UI então mantém o mapa normal.
export const searchPets = async (query: string): Promise<SearchResult[]> => {
  const sb = await ensureSession();
  if (!sb) return [];
  try {
    const { data, error } = await sb.functions.invoke('search-pets', {
      body: { query },
    });
    if (error) {
      console.warn('[search] falhou:', error.message, '| body:', data);
      return [];
    }
    return ((data as { results?: SearchResult[] })?.results ?? []) as SearchResult[];
  } catch (e) {
    console.warn('[search] erro:', e);
    return [];
  }
};
