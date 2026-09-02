import type { PetRecord } from "./storage";

export const DAILY_PET_LIMIT = 5;
export const SUBMIT_COOLDOWN_MS = 60_000;

export type LimitReason = "limit" | "cooldown";

export interface LimitCheck {
  ok: boolean;
  reason?: LimitReason;
  message?: string;
  retryAfterMs?: number;
}

// Limite anti-spam: máximo DAILY_PET_LIMIT pets por dispositivo a cada 24h
// rolantes, com cooldown de SUBMIT_COOLDOWN_MS entre submits. O bypass é
// responsabilidade do caller (godMode).
export const canCreatePet = (
  pets: PetRecord[],
  deviceId: string,
  now: number = Date.now(),
): LimitCheck => {
  if (!deviceId) return { ok: true };

  const windowStart = now - 24 * 60 * 60 * 1000;

  const myRecent = pets.filter((p) => {
    if (p.ownerDeviceId !== deviceId) return false;
    // createdAt ausente (legado) não conta para a janela.
    if (!p.createdAt) return false;
    return new Date(p.createdAt).getTime() >= windowStart;
  });

  if (myRecent.length >= DAILY_PET_LIMIT) {
    return {
      ok: false,
      reason: "limit",
      message: "Você atingiu o limite diário de 5 pets. Tente novamente amanhã.",
    };
  }

  const lastSubmit = myRecent.reduce((max, p) => {
    const t = new Date(p.createdAt ?? 0).getTime();
    return t > max ? t : max;
  }, 0);
  if (lastSubmit > 0 && now - lastSubmit < SUBMIT_COOLDOWN_MS) {
    const remaining = SUBMIT_COOLDOWN_MS - (now - lastSubmit);
    const waitSec = Math.ceil(remaining / 1000);
    return {
      ok: false,
      reason: "cooldown",
      message: `Aguarde ${waitSec}s antes de cadastrar outro pet.`,
      retryAfterMs: remaining,
    };
  }

  return { ok: true };
};
