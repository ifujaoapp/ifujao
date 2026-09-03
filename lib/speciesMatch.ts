// Validador de especie x foto via Edge Function (Gemini multimodal embedding).
// A chave Gemini fica no Supabase (Deno.env.get), NAO no client. O client
// chama a Edge Function via sb.functions.invoke, igual lib/search.ts faz com
// search-pets.
//
// Retorna { mismatch, score } comparando o embedding da FOTO do post com o
// embedding do TEXTO da especie escolhida. NAO bloqueia o post — apenas
// sinaliza para o caller decidir o que fazer.

import { ensureSession } from './supabase';

export type SpeciesMatchResult = {
  mismatch: boolean;
  score: number;
};

export type CheckArgs = {
  // URI local (file://) OU URL publica (https://). A Edge Function busca
  // a imagem (ou aceita inline base64).
  imageUrl?: string;
  // Base64 da imagem SEM prefixo data:. Obrigatorio se imageUrl nao for
  // passada (a Edge Function faz o upload / envia inline).
  imageBase64?: string;
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
        imageBase64: args.imageBase64,
        mimeType: args.mimeType,
        chosenSpecies: args.chosenSpecies,
      },
    });
    if (error || !data) {
      console.warn('[speciesMatch] falhou:', error?.message);
      return { mismatch: false, score: 0 };
    }
    const result = data as SpeciesMatchResult;
    // TEMP: log para diagnosticar threshold.
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
