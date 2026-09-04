// Validador de especie x foto via Edge Function (Gemini multimodal embedding).
// A chave Gemini fica no Supabase (Deno.env.get), NAO no client. O client
// chama a Edge Function via sb.functions.invoke, igual lib/search.ts faz com
// search-pets.
//
// A foto deve estar no Storage (URL publica https://). A Edge Function
// faz fetch(url) e gera o base64 internamente (mesmo padrao do embed-pets,
// evita problemas de encoding no client).
//
// Retorna { mismatch, score } baseado no dot product entre o embedding da
// FOTO e o embedding do TEXTO da especie. NAO bloqueia o post.

import { ensureSession } from './supabase';

export type SpeciesMatchResult = {
  mismatch: boolean;
  score: number;
};

export type CheckArgs = {
  imageUrl: string;
  mimeType: string;
  chosenSpecies: string;
};

export const checkSpeciesMatch = async (args: CheckArgs): Promise<SpeciesMatchResult> => {
  const sb = await ensureSession();
  if (!sb) return { mismatch: false, score: 0 };
  try {
    const timeoutMs = 60000;
    const result = await Promise.race([
      sb.functions.invoke('validate-species', {
        body: {
          imageUrl: args.imageUrl,
          mimeType: args.mimeType,
          chosenSpecies: args.chosenSpecies,
        },
      }),
      new Promise<{ error: { message: string }; data: null }>((resolve) =>
        setTimeout(() => resolve({ error: { message: 'timeout' }, data: null }), timeoutMs)
      ),
    ]);
    const { data, error } = result;
    if (error || !data) {
      const status = typeof error === 'object' && error && 'status' in error ? (error as any).status : 'unknown';
      console.warn('[speciesMatch] falhou:', error?.message, 'status:', status, 'raw=', JSON.stringify(data));
      return { mismatch: false, score: 0 };
    }
    const matchResult = data as { mismatch?: boolean; score?: number; quotaExceeded?: boolean };
    if (matchResult.quotaExceeded) {
      console.warn('[speciesMatch] quota do Gemini excedida, pulando validacao.');
      return { mismatch: false, score: 0 };
    }
    console.log('[speciesMatch] RAW response=', JSON.stringify(matchResult), 'species=', args.chosenSpecies);
    console.log('[speciesMatch] species=', args.chosenSpecies, 'score=', matchResult.score, 'mismatch=', matchResult.mismatch);
    return {
      mismatch: !!matchResult.mismatch,
      score: typeof matchResult.score === 'number' ? matchResult.score : 0,
    };
  } catch (e) {
    console.warn('[speciesMatch] erro:', e);
    return { mismatch: false, score: 0 };
  }
};
