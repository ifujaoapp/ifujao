# STATUS — StudyFlow

## Sessão atual (2026-08-27/28)

### Refatoração dos modais de pet
- `PetDetailModal.tsx` foi separado em:
  - `PetDetailBase.tsx` — chrome compartilhado (sheet, imagens, nome, local, descrição, ações comuns, modal de descrição, shareCard).
  - `PetFoundModal.tsx` — lógica de achado (claimants, reivindicação com prova, WhatsApp pós-confirmação).
  - `PetLostModal.tsx` — lógica de perdido (banner "ME AJUDE A VOLTAR PARA CASA!", ações de contato/denúncia/compartilhar).
  - `petModalActions.ts` — helpers compartilhados para ações (contato, denunciar, apagar, desfazer denúncia, marcar/desmarcar encontrado).
- O call site em `app/(tabs)/index.tsx` agora escolhe o modal conforme `postType`.

### Reivindicação de achado (match/claims)
- Fluxo: "É o seu pet?" → escolhe pet perdido (se houver vários) → envia prova (texto) via `upsertMatchProof` → cria `matchedPetId`/`matchStatus:'pending'`/`matchRequestedBy:'owner'`.
- Finder vê claimants com prova e pode Confirmar/Disputar. Confirmar marca `confirmed` em ambos os posts e **invalida os demais** claimants automaticamente.
- WhatsApp do finder só aparece após `matchStatus === "confirmed"` (opção 2). Antes disso, contato direto fica oculto.
- Se o viewer não tiver pet perdido, aparece banner amarelo: "Registre um pet perdido para reivindicar este pet encontrado".

### Imagens no card
- `ImageCarousel` removido do card.
- Miniaturas horizontais centralizadas em um card compacto (`56x56`), com fundo/borda adaptáveis ao tema.

### HelpFindBanner
- Texto alterado para "ME AJUDE A VOLTAR PARA CASA!" com cor vermelha e fonte ajustada para caber no modal.

### Limpeza / qualidade
- Lint limpo (0 erros, 0 warnings).
- Type-check limpo.
- `.gitignore` ganhou `bugreport-*.zip` (arquivo de diagnóstico Android/Expo não deve ser commitado).
- `PetDetailModal.tsx` antigo removido.

### Backend/sincronização (mantido)
- Cursor incremental usa `updated_at` e `deleted_at` do servidor.
- Limpeza de match fantasma quando contraparte é apagada.
- Modo deus zera vínculo de match no pet e contrapartes.
