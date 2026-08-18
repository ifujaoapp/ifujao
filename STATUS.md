# status.md — iFujão / StudyFlow

> Status das melhorias de segurança de PII (telefone de contato) e do fluxo de
> revelação via Edge Function. Atualizado em 2026-08-18.

## Objetivo

O app de pets perdidos expunha o **telefone do dono** no `payload` público da
tabela `pets` (`pets public read` com `using (true)`). Qualquer pessoa com a
`EXPO_PUBLIC_SUPABASE_ANON_KEY` (embutida no app, pública) conseguia fazer
`select payload from pets` e raspar todos os telefones (risco LGPD).

Decisão (confirmada com o usuário): manter **auth anônimo** e proteger o
contato em uma tabela separada, revelado sob demanda por uma **Edge Function**
autenticada e com **rate-limit** (finder clica → revela o número; impede
scraping em massa).

## Arquitetura

```
pets (payload PÚBLICO, sem contact)
  │ 1 pet tem 0..1 contato
  ▼
pet_contacts (pet_id PK, contact)   ← RLS: só owner/reporter autenticados leem
  │ lida pela Edge Function via service_role (bypassa RLS)
  ▼
Edge Function reveal-contact         ← auth obrigatório + limite 10/min
  │ grava log
  ▼
contact_reveals (user_id, pet_id, created_at)  ← usado para o rate-limit
```

- **Dono/reporter**: já tem `contact` local → abre WhatsApp direto (sem rede).
- **Finder**: `handleContact` chama `resolveContact` → como não tem contato
  local, usa `revealContact` (Edge Function) que devolve o número.

## Arquivos alterados / criados

| Arquivo | O que mudou |
|---|---|
| `supabase/schema.sql` | `pet_contacts` + `contact_reveals`; RLS restrita; **`GRANT ... TO service_role`** em ambas; índices parciais/GIN; policies de UPDATE com imutabilidade de `owner_device_id`/`reporter_device_id`. |
| `supabase/migrate_contacts.sql` | Migra `contact`/`ownerPhone` do `payload` público para `pet_contacts` (idempotente). |
| `supabase/functions/reveal-contact/index.ts` | Edge Function (Deno, **sem imports externos** — só `Deno.serve` + `fetch`). Valida JWT, rate-limit 10/min, lê `pet_contacts` com `service_role`, registra em `contact_reveals`. |
| `lib/sync.ts` | Push: strip `contact`/`ownerPhone` do `payload` e upsert em `pet_contacts`. Pull/fetch: re-anexa `contact` para pets own/reporter. |
| `lib/contacts.ts` | `resolveContact(pet, revealFn)` (puro/testável) + `revealContact(petId)` (chama a Edge Function). |
| `app/(tabs)/index.tsx` | `handleContact` usa `resolveContact(pet, revealContact)`. |
| `lib/contacts.test.ts` + `jest.config.js` | Teste unitário (`npm test`). |
| `package.json` | script `test`. |

## Bug raiz corrigido (importante)

A função deployava mas retornava **404** ao buscar o contato. O debug mostrou:

```
permission denied for table pet_contacts
hint: GRANT SELECT ON public.pet_contacts TO service_role;
```

A função usa `service_role` para ler `pet_contacts`, mas o `schema.sql` só
concedia GRANT a `anon`/`authenticated` — **nunca a `service_role`**. A query
falhava silenciosamente e virava "not found".

**Correção:** adicionado em `schema.sql`:
```sql
grant select, insert, update, delete on table public.pet_contacts to service_role;
grant select, insert, update, delete on table public.contact_reveals to service_role;
```
Após o GRANT, a função retorna `200` com o contato (`{"contact":"(15) 99113-4446"}`).

## Deploy (ordem)

1. SQL Editor (Supabase): `schema.sql` → `migrate_contacts.sql`.
2. CLI (lê o arquivo do disco, sem copiar):
   ```bash
   supabase login
   supabase link --project-ref SEU_REF
   supabase functions deploy reveal-contact
   ```
3. App: `npx expo run:android`.

## Testes

```bash
npm test          # jest: resolveContact (4 casos)
```
Verificação manual no SQL Editor:
```sql
select count(*) from pet_contacts;                       -- deve ser > 0 p/ pets com contato
select id, payload->>'contact' as c from pets;           -- deve ser NULL (PII saiu do payload)
```

## Notas / pendências

- Auth permanece **anônima** (device_id em `user_metadata`). A authz em `pets`
  ainda usa `current_device_id()` (mutável) — endurecida por imutabilidade de
  owner/reporter, mas o spoof de `device_id` continua teoricamente possível se
  alguém souber o UUID alheio. Trade-off aceito para manter UX sem login.
- O `payload` público de `pets` continua sem PII; o telefone só sai via função
  autenticada + rate-limited.
- Build Android: `run:android` faz bundle nativo limpo; se o Metro der erro de
  `require.context`/op-sqlite após trocar de modo de build, limpar cache:
  `Remove-Item -Recurse -Force .expo, node_modules\.cache` e rebuildar.

## Atualizações (2026-08-18) — UX do contato, deep link e segurança de denúncia

Trabalho desta sessão (validado com `npm test` + `tsc --noEmit`; lint só com
avisos/erros pré-existentes fora do escopo).

### 1. Link do pet na mensagem do WhatsApp
- `openWhatsApp(contactNumber, petId?)` agora inclui no texto do WhatsApp o link
  `https://ifujaoapp.github.io/ifujao-links/pet/?id=<id>` para quem receber
  poder abrir o app. Ajustado em `app/(tabs)/index.tsx` e `app/pet/[id].tsx`.

### 2. Deep link abre o modal do card (não a tela isolada)
- `app/pet/[id].tsx` (tela isolada "esquisita") agora redireciona para a aba
  principal e dispara o evento de deep link; o modal do card do pet é aberto
  com o pet correto (foto, descrição e menu circular de ações).
- Novo `lib/deeplink.ts`: ponte idempotente (id pendente p/ cold start + evento
  p/ warm start). `index.tsx` consome via `openPetFromDeepLink` (busca local ou
  `fetchPetRemote`).

### 3. Correção de segurança — sincronização de denúncia (RLS)
- **Bug encontrado:** a policy `pets update own` tinha `using (owner OR reporter)`,
  o que **impedia o finder de denunciar** (na linha existente ele ainda não era
  repórter → `using` falso → UPDATE bloqueado). A denúncia do finder não
  sincronizava, ficando só local.
- **Correção:** duas policies em `supabase/schema.sql`:
  - `pets update own`: dono/reporter editam conteúdo; **só o dono apaga**
    (soft-delete via `deleted_at`); `owner_device_id` e `reporter_device_id`
    permanecem imutáveis.
  - `pets report update`: finder (não dono/reporter) só pode DENUNCIAR —
    `reported=true`, `reporter_device_id=si`, `deleted_at` obrigatoriamente nulo
    e apenas na 1ª denúncia. **Conteúdo protegido**: exige que espécie, local,
    descrição, fotos, coordenadas e data não mudem (compara o `payload` sem as
    chaves de sync/denúncia). Fecha a ressalva de "pichar" o alerta via API.
- **Reaplicar no Supabase** (SQL Editor): dropar e recriar as duas policies
  `pets update own` e `pets report update`.

### 4. Correção de UX — animação do menu circular tocava 2x
- Em `app/(tabs)/index.tsx`, o efeito de animação (`menuProgress`) dependia do
  objeto `selectedPet` inteiro. O `onMarkerPress` seta o pet duas vezes
  (local e depois remoto, mesmo id), reativando a animação. Agora a dependência
  é `[selectedPet?.id, menuProgress]`, disparando só quando o id muda.

### 5. Reabrir card de pet denunciado preserva o estado
- `onMarkerPress` preserva `reported`/`reportedBy`/`reportReason`/
  `reporterDeviceId` locais quando o remoto do servidor ainda está defasado,
  evitando que a bandeira DENÚNCIA e o botão "Apagar denúncia" sumam ao reabrir.

### Pendências conhecidas
- A policy `pets report update` compara conteúdo de forma rígida; num caso raro
  (dono editou o pet entre o finder buscar e denunciar) a denúncia pode ser
  barrada — afrouxar a lista de chaves ignoradas em `schema.sql` se ocorrer.
- `app/pet/[id].tsx` vira redirecionador; a tela de detalhe isolada foi
  substituída pelo modal do card (comportamento desejado).
