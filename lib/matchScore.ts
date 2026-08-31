import type { PetRecord } from './storage';

export type CompatLevel = 'alta' | 'media' | 'baixa';

export interface MatchCompat {
  score: number; // 0..100
  level: CompatLevel;
  speciesOk: boolean;
  breedOk: boolean;
  distanceKm: number | null;
  dateOk: boolean;
  notes: string[]; // flags legíveis para o finder
}

const EARTH_R_KM = 6371;

const haversineKm = (
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
): number | null => {
  const lat1 = a.latitude;
  const lng1 = a.longitude;
  const lat2 = b.latitude;
  const lng2 = b.longitude;
  if (
    typeof lat1 !== 'number' ||
    typeof lng1 !== 'number' ||
    typeof lat2 !== 'number' ||
    typeof lng2 !== 'number' ||
    (lat1 === 0 && lng1 === 0) ||
    (lat2 === 0 && lng2 === 0)
  ) {
    return null;
  }
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(EARTH_R_KM * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s)) * 10) / 10;
};

// Checa se a data do desaparecimento é anterior/igual à do achado.
const isDatePlausible = (
  lostDate?: string,
  foundDate?: string,
): { ok: boolean; missing: boolean } => {
  if (!lostDate || !foundDate) return { ok: true, missing: true };
  const l = new Date(lostDate).getTime();
  const f = new Date(foundDate).getTime();
  if (isNaN(l) || isNaN(f)) return { ok: true, missing: true };
  return { ok: l <= f, missing: false };
};

// Calcula a compatibilidade automática entre o pet PERDIDO (reclamante) e o
// pet ACHADO, para apoiar o finder a decidir confirmar/disputar. Cruza espécie,
// raça, proximidade geo e plausibilidade temporal.
export const computeMatchCompat = (
  lost: PetRecord,
  found: PetRecord,
): MatchCompat => {
  const notes: string[] = [];
  let score = 0;

  const speciesOk =
    !!lost.species &&
    !!found.species &&
    lost.species.trim().toLowerCase() === found.species.trim().toLowerCase();
  if (speciesOk) {
    score += 40;
    notes.push('Espécie confere');
  } else {
    notes.push('Espécie diferente');
  }

  const breedOk =
    speciesOk &&
    !!lost.breed &&
    !!found.breed &&
    lost.breed.trim().toLowerCase() === found.breed.trim().toLowerCase();
  if (breedOk) {
    score += 30;
    notes.push('Raça confere');
  } else if (speciesOk) {
    notes.push('Raça não informada ou divergente');
  }

  const distanceKm = haversineKm(
    { latitude: lost.latitude, longitude: lost.longitude },
    { latitude: found.latitude, longitude: found.longitude },
  );
  if (distanceKm != null) {
    if (distanceKm <= 3) {
      score += 30;
      notes.push(`Local próximo (${distanceKm.toFixed(1)} km)`);
    } else if (distanceKm <= 10) {
      score += 20;
      notes.push(`Local relativamente próximo (${distanceKm.toFixed(1)} km)`);
    } else if (distanceKm <= 30) {
      score += 10;
      notes.push(`Local distante (${distanceKm.toFixed(1)} km)`);
    } else {
      notes.push(`Local muito distante (${distanceKm.toFixed(1)} km)`);
    }
  } else {
    notes.push('Distância indefinida (sem coordenadas)');
  }

  const d = isDatePlausible(lost.lostDate, found.foundDate);
  if (d.missing) {
    notes.push('Data não informada');
  } else if (d.ok) {
    score += 10;
    notes.push('Data plausível (perdido antes do achado)');
  } else {
    notes.push('Data incompatível (achado antes do desaparecimento)');
  }

  score = Math.max(0, Math.min(100, score));
  const level: CompatLevel = score >= 80 ? 'alta' : score >= 50 ? 'media' : 'baixa';
  return { score, level, speciesOk, breedOk, distanceKm, dateOk: d.ok, notes };
};
