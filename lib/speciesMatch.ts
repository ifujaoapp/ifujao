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
  // URL publica (https://) da foto no Storage. Obrigatorio.
  imageUrl: string;
  mimeType: string;
  chosenSpecies: string;
};

export const checkSpeciesMatch = async (args: CheckArgs): Promise<SpeciesMatchResult> => {
  const sb = await ensureSession();
  if (!sb) return { mismatch: false, score: 0 };
  try {
    const { data, error } = await sb.functions.invoke('validate-species', {
      body: {
        imageUrl: args.imageUrl,
        mimeType: args.mimeType,
        chosenSpecies: args.chosenSpecies,
      },
    });
    if (error || !data) {
      console.warn('[speciesMatch] falhou:', error?.message, 'raw=', JSON.stringify(data));
      return { mismatch: false, score: 0 };
    }
    const result = data as { mismatch?: boolean; score?: number };
    console.log('[speciesMatch] RAW response=', JSON.stringify(result), 'species=', args.chosenSpecies);
    console.log('[speciesMatch] species=', args.chosenSpecies, 'score=', result.score, 'mismatch=', result.mismatch);
    return {
      mismatch: !!result.mismatch,
      score: typeof result.score === 'number' ? result.score : 0,
    };
  } catch (e) {
    console.warn('[speciesMatch] erro:', e);
    return { mismatch: false, score: 0 };
  }
};
