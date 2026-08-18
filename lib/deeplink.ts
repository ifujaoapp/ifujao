// Liga o deep link do WhatsApp (https://ifujaoapp.github.io/ifujao-links/pet/?id=ID)
// ao modal do card do pet na aba principal, em vez de abrir a tela isolada.
// Mantém o id pendente para cold start e emite evento para warm start.

type Handler = (petId: string) => void;

let pendingPetId: string | null = null;
const handlers = new Set<Handler>();

export const setPendingPetId = (id: string | null): void => {
  pendingPetId = id;
};

export const consumePendingPetId = (): string | null => {
  const id = pendingPetId;
  pendingPetId = null;
  return id;
};

export const onDeepLinkPet = (handler: Handler): (() => void) => {
  handlers.add(handler);
  return () => {
    handlers.delete(handler);
  };
};

export const emitDeepLinkPet = (id: string): void => {
  pendingPetId = id;
  handlers.forEach((h) => h(id));
};
