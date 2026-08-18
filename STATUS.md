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

## Atualizações (2026-08-18, tarde) — robustez do mapa/GPS no emulador

Trabalho desta sessão (validado com `tsc --noEmit` e commit `11afd5b`).

### Diagnóstico de "sem pins" no emulador
- Os dados ESTÃO no Supabase: query REST com a anon key retorna os pets e o
  `signInAnonymously` funciona (Anonymous Sign-ins ativo no projeto).
- O bundle de DEBUG precisa embutir `EXPO_PUBLIC_SUPABASE_*` (else
  `isSupabaseConfigured=false` e o sync é ignorado silenciosamente, log
  `[index] SYNC IGNORADO: Supabase não configurado`). Rebuild limpo de cache
  (`Remove-Item -Recurse -Force .expo, node_modules\.cache` + `npx expo run:android`)
  resolveu — os pins passaram a aparecer.

### Bugs corrigidos no mapa (`app/(tabs)/index.tsx`)
1. **Mapa em branco quando o GPS não responde.** O `MapLeaflet` só montava
   DEPOIS de um fix de GPS (`initialCenterRef.current` setado em `getOnce`).
   Se o provedor de localização do emulador não devolvesse nada (ou travasse),
   o mapa sumia. Agora `initialCenterRef` é inicializado com o centro da
   cidade (Sorocaba) no corpo do componente → o mapa abre SEMPRE, centrado na
   cidade, independente do GPS.
2. **GPS trava o app.** `getCurrentPositionAsync` não tem timeout nativo; no
   emulador podia travar a启动. Cada tentativa agora usa `Promise.race` com
   timeout de 5s; `fetchGps` tenta 6 vezes.
3. **Foco na posição padrão do emulador (Mountain View).** Quando o GPS do
   emulador devolve a coord padrão (fora do Brasil), o app centralizava nela.
   Agora `applyCenter` e o efeito de pan do `MapLeaflet` só recentralizam se a
   posição cair DENTRO de uma área atendida (`getCityForLocation` + raio da
   cidade). Fora da área, mantém o centro atual (cidade).

### Como testar no emulador (GPS do AVD é instável)
- `adb -s emulator-5554 emu geo fix <lon> <lat>` (longitude ANTES de latitude)
  envia o fix direto ao emulador e é mais confiável que o botão "enviar" da UI
  de Extended Controls → Location.
- Ou rodar no celular físico (`npx expo start` + QR): GPS real funciona.
- O `expo run:android` NÃO aceita `-c`; para limpar cache use
  `Remove-Item -Recurse -Force .expo, node_modules\.cache` antes do build.

### Pendências conhecidas
- A centralização no ponto exato do usuário depende de o emulador/device
  entregar um fix de GPS válido; com a posição padrão do AVD, o mapa fica na
  cidade (comportamento aceito para teste).

## Atualizações (2026-08-18, fim) — finder denunciando quebrava o sync (RLS)

Sintoma: ao denunciar um pet de outra pessoa, o sync logava
`[sync] upsert falhou: new row violates row-level security policy for table "pets"`.

### Causa raiz (dois pontos)
1. **App usava `upsert` para tudo.** Para um pet denunciado por um finder
   (outro `device_id`), o `upsert` bate na policy `pets insert own` (exige
   `owner_device_id = current_device_id()`) → rejeitado.
2. **Policy `pets update own` muito rigorosa.** O `with check` impedia
   `reporter_device_id` ir de `null` → `current_device_id()` (1ª denúncia),
   então nem um `update` direto passava (o `with check` das policies de UPDATE
   é combinado com AND).

### Correções
- `supabase/schema.sql`: `pets update own` agora permite
  `reporter_device_id = public.current_device_id()` no `with check` (o finder
  só pode se declarar repórter como si mesmo; a policy `pets report update`
  ainda exige conteúdo inalterado, então não abre brecha para "pichar" o alerta).
- `lib/sync.ts`: no push, se `ownerDeviceId != deviceId` e
  `reporterDeviceId == deviceId` (finder denunciando), usa `.update()` apenas
  com `{ reported, reporter_device_id, updated_at }` — não mexe no `payload`
  (respeita a policy de denúncia) e NÃO toca `pet_contacts` (o contato é do
  dono; antes o `else` apagaria o contato do dono).
- `lib/sync.ts` (merge): pet local com mudança pendente (`dirty`) agora
  PREVALECE sobre o remoto. Antes o pull sobrescrevia o `reported=true` local
  com o `reported=false` do servidor (update em voo/falhando), fazendo o pin
  "voltar ao normal" logo após denunciar. Agora o pin fica vermelho na hora e
  persiste até o servidor confirmar.

### Bug de UX: WebView recarregava e recentralizava o mapa
- `MapLeaflet` tinha `pets` e `userLocation` nas dependências do `html`, então
  CADA mudança de pets (ex.: ao denunciar) ou de GPS (poll de 5s) RECARREGAVA o
  WebView inteiro, que re-centrava o mapa na cidade. Ao denunciar, o mapa pulava
  pra cidade e o pin saía de vista — parecia que "nada acontecia".
- Corrigido: `pets` e `userLocation` saíram do `html`; marcadores e o círculo
  do usuário são injetados via `injectJavaScript` no lugar, sem reload. O mapa
  mantém o enquadramento do usuário e o pin denunciado fica vermelho no mesmo
  lugar.

### Reaplicar no Supabase (SQL Editor) — só a policy, sem risco de perder dados
```sql
drop policy if exists "pets update own" on public.pets;
create policy "pets update own"
  on public.pets for update to authenticated
  using (
    owner_device_id = public.current_device_id()
    or reporter_device_id = public.current_device_id()
  )
  with check (
    owner_device_id = (select p.owner_device_id from public.pets p where p.id = pets.id)
    and (
      reporter_device_id is null
      or reporter_device_id = (select p.reporter_device_id from public.pets p where p.id = pets.id)
      or reporter_device_id = public.current_device_id()
    )
  );
```
(NÃO rerode o `schema.sql` inteiro em produção se já houver dados — ele recria
tabelas. Use só o trecho acima, ou rode o `schema.sql` num projeto novo.)
