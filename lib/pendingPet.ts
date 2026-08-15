type PendingPet = { id: string; ts: number } | null;

let pending: PendingPet = null;

export function setPendingPet(id: string) {
  pending = { id, ts: Date.now() };
}

export function consumePendingPet(): PendingPet {
  const p = pending;
  pending = null;
  return p;
}
