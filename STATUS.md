# STATUS — Sincronização de pins entre dispositivos (StudyFlow)

## Princípio fundamental (decisão do produto)
Todos os campos que alimentam o resync delta — `updated_at` (pull de alterações) e
`deleted_at` (pull de exclusões/soft-delete) — DEVEM usar **horário de servidor**,
nunca do cliente. O cursor incremental (`lastUpdatedSync` / `lastDeletedSync`) avança
com esses valores. Se o app enviar o relógio do aparelho, dispositivos com hora
errada fazem o cursor pular para o futuro e deletes/pets novos de outros dispositivos
nunca são puxados ("pin fantasma").

## O que foi feito (sessão 2026-08-27)

### Backend (Supabase)
- Trigger `pets_set_updated_at` (já existia): `updated_at = now()` do servidor em todo UPDATE.
- Trigger `pets_set_deleted_at` (NOVO, migration `supabase/migrations/20260827214600_set_deleted_at_server_time.sql`,
  aplicada via `supabase db push`): `deleted_at = now()` do servidor quando o pet passa de
  ativo (nulo) para apagado.

### App (`lib/sync.ts`)
- Cursores de `updated_at` e `deleted_at` **independentes** (`getLastSync` / `getLastDeletedSync`).
  Um delete não escapa por causa de um update alheio.
- App parou de enviar `updated_at: now` no push (INSERT usa `default now()` do banco; UPDATE é
  coberto pelo trigger). `deleted_at` continua sendo enviado, mas o trigger do banco sobrescreve
  com horário de servidor.
- Limpeza de **match fantasma**: se o `matchedPetId` de um pet aponta para pet apagado no backend
  (no full pull, ausente do catálogo ativo e não é pet local), zera `matchedPetId`/`matchStatus`/
  `matchRequestedBy` — evita o banner "Em acordo" contar um match sem pin.

### Modo deus (`lib/moderation.ts`)
- `moderatorSoftDelete` faz soft-delete (`deleted_at`) e também zera o vínculo de match no próprio
  pet e em todas as contrapartes que apontavam para ele (filtro no índice GIN do `payload`),
  com bump de `updated_at` para propagar a todos via sync incremental.

### Filtro meus/todos (`app/(tabs)/index.tsx`)
- "meus": só pets do próprio device (perdidos + achados que **você** criou). Achado de OUTRO
  dispositivo soma. ✅ (conforme regra do produto)
- "todos": todos os pets.

## Comportamento esperado (testado manualmente)
No dispositivo B, ao clicar no botão meus/todos (dispara `triggerSync` incremental):
- Achado criado no dispositivo A → **aparece**.
- Achado apagado no dispositivo A → **some** (em "todos"; em "meus" já estaria oculto por ser de outro device).
- Delete de moderador (modo deus) → remove o pin para todos e zera o "Em acordo" fantasma.

## Pendências / observações
- O `payload` dos pets é jsonb; campos de match vivem DENTRO do `payload` (não são colunas),
  por isso o `moderatorSoftDelete` faz fetch-modify-PATCH do jsonb inteiro.
- `lastDeletedSync` (SecureStore `ifujao_last_sync_del`) é nulo em dispositivos antigos → primeiro
  sync incremental puxa todos os deletes históricos de uma vez (comportamento esperado).
- Recomenda-se manter o sync incremental (não full) para o botão meus/todos; o full só roda no boot.
