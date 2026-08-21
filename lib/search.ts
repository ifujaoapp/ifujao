import { ensureSession } from './supabase';
import type { PetRecord } from './storage';

export interface SearchResult {
  id: string;
  payload: PetRecord;
  similarity: number;
}

export interface SearchResponse {
  results: SearchResult[];
  rateLimited: boolean;
}

// Busca semântica por linguagem natural via Edge Function (Gemini embeddings +
// pgvector). Retorna `rateLimited=true` quando o limite diário (20/dispositivo)
// é atingido, para a UI exibir aviso específico. Em erro geral devolve
// `results: []` e a UI mantém o mapa normal.
export const searchPets = async (query: string): Promise<SearchResponse> => {
  const sb = await ensureSession();
  if (!sb) return { results: [], rateLimited: false };
  try {
    const { data, error } = await sb.functions.invoke('search-pets', {
      body: { query },
    });
    if (error) {
      console.warn('[search] falhou:', error.message, '| body:', data);
      return { results: [], rateLimited: error.status === 429 };
    }
    const results = ((data as { results?: SearchResult[] })?.results ??
      []) as SearchResult[];
    return { results, rateLimited: false };
  } catch (e) {
    console.warn('[search] erro:', e);
    return { results: [], rateLimited: false };
  }
};
