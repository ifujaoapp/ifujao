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
  detectedSpecies?: string;
};

export type CheckArgs = {
  imageUrl?: string;
  imageBase64?: string;
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
          ...(args.imageUrl ? { imageUrl: args.imageUrl } : {}),
          ...(args.imageBase64 ? { imageBase64: args.imageBase64 } : {}),
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
      console.warn('[speciesMatch] falhou:', error?.message, 'raw=', JSON.stringify(data));
      return { mismatch: false, score: 0 };
    }
    const matchResult = data as { mismatch?: boolean; score?: number; detectedSpecies?: string };
    console.log('[speciesMatch] RAW response=', JSON.stringify(matchResult), 'species=', args.chosenSpecies);
    console.log('[speciesMatch] species=', args.chosenSpecies, 'score=', matchResult.score, 'mismatch=', matchResult.mismatch);
    return {
      mismatch: !!matchResult.mismatch,
      score: typeof matchResult.score === 'number' ? matchResult.score : 0,
      detectedSpecies: matchResult.detectedSpecies,
    };
  } catch (e) {
    console.warn('[speciesMatch] erro:', e);
    return { mismatch: false, score: 0 };
  }
};
