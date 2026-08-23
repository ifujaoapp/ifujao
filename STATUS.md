# status.md — iFujão / StudyFlow

> **Preferência de idioma:** o usuário se comunica **sempre em português** —
> responder e escrever tudo (mensagens e comentários de status) em português.

## Persona e Princípios (carregar sempre)

Você é um Desenvolvedor Senior React Native com vasta experiência na criação de aplicativos móveis de alto desempenho para iOS e Android. Sua missão é atuar como especialista técnico, arquiteto de software e mentor de código.

**Sua Persona e Princípios:**
* **Excelência Técnica:** Escreva código em TypeScript estritamente tipado, limpo, bem documentado e alinhado aos princípios SOLID e Clean Architecture.
* **Dominio da Stack:** Domine o ecossistema React Native (CLI e Expo), React Navigation, gerenciamento de estado (Zustand, Redux Toolkit, TanStack Query), estilos (NativeWind/Tailwind, Styled-Components, StyleSheet) e testes (Jest, React Native Testing Library).
* **Foco em Performance:** Sempre otimize a renderização (useMemo, useCallback, React.memo), renderização de listas (FlashList/FlatList), uso de memória e inicialização do app.
* **Integração Nativa:** Compreenda o funcionamento da nova arquitetura (Fabric, TurboModules, JSI) e a ponte nativa entre JavaScript/TypeScript, Swift/Objective-C e Kotlin/Java.

**Regras de Resposta:**
1. **Soluções Práticas:** Apresente códigos funcionais, modernos e prontos para produção.
2. **Análise Crítica:** Apontar proativamente potenciais gargalos de performance, problemas de segurança, riscos de compatibilidade entre plataformas (iOS/Android) ou falhas na experiência do usuário (UX).
3. **Didática e Clareza:** Explique o motivo técnico por trás de cada decisão de arquitetura ou escolha de biblioteca proposta.
4. **Resolução de Bugs:** Ao debugar, isole a causa raiz, apresente a correção e forneça dicas para evitar o problema no futuro.

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
    and reporter_device_id = (select p.reporter_device_id from public.pets p where p.id = pets.id)
    and (
      owner_device_id <> public.current_device_id()
      or not (
        (select p.reported from public.pets p where p.id = pets.id) = true
        and reported = false
      )
    )
  );
```
(NÃO rerode o `schema.sql` inteiro em produção se já houver dados — ele recria
tabelas. Use só o trecho acima, ou rode o `schema.sql` num projeto novo.)

## Atualizações (2026-08-18, noite) — denúncia: propagação, dono não apaga e filtro do mapa

Trabalho desta sessão (validado com `tsc --noEmit` e `npm test`).

### 1. Bug raiz: bandeira de denúncia não aparecia nem propagava
- **Causa:** o ramo de denúncia do finder em `lib/sync.ts` só atualizava as
  **colunas de topo** (`reported`, `reporter_device_id`), mas o app lê a
  bandeira de `row.payload` em `toLocalPet`. Como o `payload.reported`
  continuava `false`, a bandeira não aparecia no mapa do finder nem no de
  outros usuários (o UPDATE "funcionava" sem erro no Postgres).
- **Correção `lib/sync.ts`:**
  - `toLocalPet` agora lê `reported`, `reporterDeviceId` e `ownerDeviceId`
    das **colunas de topo** (fonte autoritativa), não só do `payload`.
  - O ramo do finder (pet de outro dono) agora também atualiza o `payload`,
    lendo o payload atual e sobrescrevendo **só** as chaves de denúncia
    (`reported`, `reporterDeviceId`, `reportReason`, `reportedBy`) — chaves
    que a policy `pets report update` já ignora no comparativo, então o
    `with check` continua passando.

### 2. Regra de autorização da denúncia
- **Regra:** só o **finder (quem denunciou)** pode apagar a denúncia. O dono
  do alerta **nunca** pode (nem no app, nem pela API).
- **App (`app/(tabs)/index.tsx`):**
  - Botão "Apagar denúncia" aparece **só** para `isReporter` (não mais para
    o dono).
  - O ramo de denúncia no sync agora trata os dois sentidos: `reported=true`
    (denunciar) e `reported=false` (apagar). Antes, clicar em "apagar"
    re-denunciava, porque o ramo forçava `reported: true`.
  - Botão "Denunciar" some sempre que `reported === true` (não faz sentido
    denunciar de novo um pet já denunciado, seja por quem for).
- **Policy `pets update own` (`supabase/schema.sql`):** `reporter_device_id`
  tornou-se **imutável**; o dono **não pode** inverter `reported`
  `true -> false` (esconder denúncia alheia). O finder (reporter) segue
  livre para denunciar e apagar a própria denúncia. A policy `pets report
  update` (finder denuncia, conteúdo inalterado) permanece igual.

### 3. Filtro de alertas no mapa (barra lateral)
- Novo botão na `sideToolbar` (`app/(tabs)/index.tsx`) que alterna
  `showOnlyMine`: `false` = **todos os alertas** (inclui de outros); `true`
  = **somente meus alertas** (criados por mim, via `isOwner`).
- A filtragem afeta só a visualização (`visiblePets` passado ao
  `MapLeaflet`); o estado completo (`pets`) ainda abre o card pelo marcador.
- Ao alternar o filtro, dispara `triggerSyncRef.current()` para fazer resync
  incremental e puxar os pins que mudaram de estado.
- Visual: mesmo estilo dos outros botões da barra; só troca o ícone
  (`people` ↔ `person`).

### Arquivos alterados
| Arquivo | O que mudou |
|---|---|
| `lib/sync.ts` | `toLocalPet` lê colunas de topo; ramo do finder denuncia E apaga (atualiza payload + colunas). |
| `app/(tabs)/index.tsx` | "Apagar denúncia" só p/ reporter; "Denunciar" some se já denunciado; botão de filtro com resync. |
| `supabase/schema.sql` | `pets update own`: `reporter_device_id` imutável; dono não apaga denúncia alheia. |

### Pendências conhecidas
- `deletePet` (dono apaga o próprio alerta via soft-delete) ainda remove o
  alerta inteiro, o que também some com a denúncia — aceito, pois é o dono
  removendo o próprio alerta. Se a equipe quiser, pode-se travar o dono de
  apagar um alerta já denunciado.
- Reaplicar a policy `pets update own` no Supabase (SQL Editor) com o trecho
  atualizado acima (não rode o `schema.sql` inteiro em produção).

## Atualizações (2026-08-19) — sessão de ajustes de UX, GPS/mapa e correção de sync

Validado com `tsc --noEmit` (limpo) e rebuild no emulador após conserto do AVD.

### 1. Link de compartilhar do pet (`sharePetCard`)
- Antes mandava "Baixe o iFujão" + Play Store. Agora envia
  `https://ifujaoapp.github.io/ifujao-links/pet/?id=<id>` (link universal que
  abre o app se instalado ou cai na loja).

### 2. Campo Cidade no report
- `lib/storage.ts`: `PetRecord.city?: string`.
- `app/(tabs)/index.tsx` `handleAddPet`: `city: getCityForLocation(petLocation)?.name`.
- Card e compartilhar exibem `local — cidade`.
- Tela de reportar: label automático e somente leitura `Cidade: <nome>`
  (derivado do pino/GPS). Sync: sobe/desce automático (payload é o `PetRecord`).

### 3. GPS / Mapa
- `fetchGps`: retry 6×5s → **3×3s** (centraliza mais cedo).
- Botão **"Centralizar no meu GPS"** na `sideToolbar` → `centerOnUserGps`.
- Removido o **bloqueio de cidade** (`applyCenter` e efeito de pan do `MapLeaflet`):
  o mapa centraliza em qualquer lugar do mundo. Mantida só a trava da
  coordenada-padrão-do-emulador (Mountain View) — depois removida a pedido.
- **GPS instantâneo**: `getOnce` e `centerOnUserGps` usam `getLastKnownPositionAsync`
  primeiro (cache, na hora) e depois refinam com fix fresco.
- `poll` (5s) agora usa `fetchGps` (com timeout); antes usava
  `getCurrentPositionAsync` sem timeout e travava/never resolvia.
- Zoom forçado no recentrar: **15 → 13**.
- `recenterNonce`: o botão força o recentramento ignorando o limiar de ruído (80m).
- `invalidateSize` no `MapLeaflet` (init + `onLoad`) para o container não ficar 0×0.

### 4. `sideToolbar` (barra de botões da direita)
- Verticalmente centralizada (`top: 50%` + `transform: translateY(-50%)`).
- Removido o botão de compartilhar da barra (perdeu o sentido; o compartilhar
  do card do pet permanece).

### 5. Tela preta no emulador — era o AVD, não o código
- Tela preta em **qualquer app** do emulador = renderer de gráficos (GLES).
  Corrigido no AVD: Emulated Performance → Graphics → **Software - GLES 2.0
  (SwiftShader)** + Cold boot. O código estava íntegro (baseline também dava
  preto por causa do AVD).

### 6. BUG RAIZ: exclusão não propagava para o finder (RLS)
- **Sintoma:** dono apagava 2 pins, mas no app do finder eles continuavam
  aparecendo. Log mostrava os 2 ids vivos no finder.
- **Causa:** o soft-delete faz `update({ deleted_at })` que cai na policy
  `pets update own`. O `with check` comparava
  `reporter_device_id = (subquery)`; pets normais têm `reporter_device_id = NULL`
  → `NULL = NULL` é `NULL` (não TRUE) → `with check` falha → o `update` é
  **rejeitado silenciosamente**. `deleted_at` nunca era gravado → finder
  continuava puxando o pet. O mesmo bug quebrava qualquer edição do dono.
- **Correção (SQL Editor do Supabase — só as policies, sem recriar tabelas):**
  trocar os `=` das colunas que podem ser `NULL` por `is not distinct from`
  em `pets update own` (e endurecer `pets report update` também).
  ```sql
  drop policy if exists "pets update own" on public.pets;
  create policy "pets update own"
    on public.pets for update to authenticated
    using ( owner_device_id = public.current_device_id() or reporter_device_id = public.current_device_id() )
    with check (
      owner_device_id is not distinct from (select p.owner_device_id from public.pets p where p.id = pets.id)
      and reporter_device_id is not distinct from (select p.reporter_device_id from public.pets p where p.id = pets.id)
      and ( owner_device_id <> public.current_device_id()
            or not ( (select p.reported from public.pets p where p.id = pets.id) = true and reported = false ) )
    );
  -- (pets report update: idem, is not distinct from no owner_device_id)
  ```
- Após aplicar: dono apaga → `deleted_at` gravado → finder remove no próximo sync.

### 7. Reset completo dos dados
- Backend: `delete from public.contact_reveals; delete from public.pet_contacts; delete from public.pets;` (SQL Editor).
- Local: limpar dados do app no emulador / `adb uninstall com.ifujao.app` + rebuild limpo.

### 8. STATUS.md
- Adicionada preferência de idioma (português sempre) e a seção "Persona e
  Princípios (carregar sempre)" no topo do arquivo.

### Arquivos alterados nesta sessão
| Arquivo | O que mudou |
|---|---|
| `app/(tabs)/index.tsx` | sharePetCard (link), campo/cidade, label cidade, GPS instantâneo, botão centralizar, `applyCenter` sem bloqueio, `recenterNonce`, `invalidateSize`, `sideToolbar` centralizada + sem botão share, zoom 13. |
| `lib/storage.ts` | `PetRecord.city?: string`. |
| `STATUS.md` | preferência de idioma + persona + este histórico. |
| `supabase/schema.sql` | (referência) policies `pets update own` / `pets report update` com `is not distinct from` — reaplicar via SQL Editor. |

## Regras de conduta do assistente (carregar sempre — feedback do usuário)

> O usuário pediu para salvar isto no STATUS.md para não esquecer entre sessões.

1. **Não tomar decisões equivocadas / não inferir causa raiz sem prova.**
   Confirmar com o código ou logs antes de propor a correção. Não culpar a
   "fonte de dado" sem evidência.
2. **Não inventar dependências externas** (APIs, serviços de terceiros,
   Edge Functions, chaves) sem o usuário pedir. Usar o que já existe no app.
   - Erro cometido: para o nome da cidade do pino, criei primeiro Nominatim e
     depois Google Geocoding API via Edge Function. O correto era o geocoder
     NATIVO do aparelho (`expo-location` `reverseGeocodeAsync`), que sempre
     devolveu o município em `g.city`.
3. **Perguntar em vez de chutar** quando o caminho for ambíguo ou tiver
    custo/implicação (ex.: provedor de geocoding, chaves de API).
4. **Sinal de diagnóstico:** se o endereço (mesmo geocoder) vem certo, a fonte
   funciona — o bug está na extração/fallback, não na API.
5. **Ao corrigir um bug, auditar o componente/arquivo inteiro, não só o ponto
   citado.** Funções irmãs no mesmo arquivo costumam ter o MESMO defeito
   (ex.: `handleSave` e `handleShare` no `ImageViewerModal` usavam URL remota
   onde o RN/expo exige arquivo local — consertei o share e deixei o save
   quebrado). Antes de entregar, varrer as funções relacionadas e consertar
    todas as do mesmo padrão de uma vez.
6. **Keystore de release do Android JÁ EXISTE.** Ao orientar build de APK local
   (`gradlew assembleRelease`), **NÃO perguntar** se o usuário tem keystore —
   ele já gerou. Mandar o comando direto (`expo prebuild --platform android` +
   `gradlew assembleRelease`). Só sugerir `assembleDebug` para teste rápido sem
    assinar.
 7. **Build de release local empacota código VELHO se não limpar o bundle.**
    O `gradle` marca `createBundleReleaseJsAndAssets` como `UP-TO-DATE` e
    **reaproveita o bundle JS antigo** quando só mudou código JS/TS (não
    percebe a alteração de fonte). Sintoma: APK instala mas não reflete as
    últimas mudanças. **Sempre** antes de `assembleRelease`, limpe:
    `.\gradlew.bat --stop` + `Remove-Item -Recurse -Force android/app/build` +
    `Remove-Item -Recurse -Force node_modules/.cache, .expo` e só então
    `.\gradlew.bat assembleRelease --no-daemon`. Confirmar no log a linha
    `Writing bundle output to: .../index.android.bundle` (bundle regerado).
    - **NÃO usar `gradlew clean`** no Windows: trava nos caches nativos `.cxx`
      (arquivos travados por processo) e falha. Prefira apagar `android/app/build`
      manualmente.
    - O aviso de CMake "object file path > 250" (`react-native-gesture-handler`
      codegen) é **só warning** e não quebra o build — vem do limite interno
      `CMAKE_OBJECT_PATH_MAX=250` do CMake (não do MAX_PATH do Windows), então
      habilitar `LongPathsEnabled` no registro **não** o elimina. Para silenciar
      de vez, mover o projeto para caminho curto (ex.: `C:\dev\StudyFlow`); o
      `Move-Item` falha se o Explorer/VS Code estiver com a pasta aberta.

### Lição concreta — cidade do pino (não repetir)
- `reverseGeocodeAsync` devolve o município em `g.city` (locality). **NUNCA**
  usar `g.region` como fallback de cidade: `region` é o **ESTADO** e fixa a
  cidade no nome do estado (ex.: "São Paulo") para qualquer pino do estado.
- Extração correta: `g.city || g.subregion || g.district` (sem `g.region`).
- Arquivos: `lib/geocode.ts` (`reverseGeocodeCity`), usado em
  `app/(tabs)/index.tsx` em `atualizarEndereco` / `openReport`. Sem rede, sem
  chave — padrão de produção em RN.
- Histórico: removido `radiusMeters`/`L.circle` dos mapas e o bloqueio de
  cidade (qualquer usuário em qualquer lugar pode reportar). `CITIES` mantido
  só para centro padrão do mapa e rótulo de cidade mais próxima.

## Atualizações (2026-08-19, tarde) — card do pet: barra de ações flutuante

Sintoma: em telas menores os botões de ação do card do pet estouravam o modal
(ficavam de fora da borda) porque o `circularMenu` radial (raio 85 + botões 60)
ficava dentro de `demoCard`, que não era scrollável.

Solução (opção 2 escolhida pelo usuário): **barra de ações flutuante inferior**.
- `app/(tabs)/index.tsx`: removido o `circularMenu` (radial) de dentro de
  `demoCard`; as ações (Contato, Denunciar/Apagar denúncia, Compartilhar,
  Apagar) agora ficam numa `demoActionBar` **irmã de `demoCard`**, posicionada
  `absolute` na base da tela (`bottom: insets.bottom + 16`), fora do card.
- A barra tem `onTouchStart` com `stopPropagation` para não fechar o modal ao
  tocar nela. `demoOverlay` ganhou `paddingBottom: 120` para o card não ficar
  sob a barra.
- Estilos novos: `demoActionBar`, `demoActionRow`, `demoActionBtn`,
  `demoActionBtnDisabled`, `demoActionLabel`.
- `CircularActionButton` e os estilos `circularMenu`/`circularCenter` ficaram
  como código morto (não usados); `menuProgress` só resta no useEffect.
- Validação: `tsc --noEmit` limpo.

## Atualizações (2026-08-19) — modal "Reportar Pet": Espécie/Raça separados + autocomplete

Pedido: separar "Espécie / Raça" (1 campo) em **2 campos obrigatórios** e
adicionar **autocomplete local** (lista fixa, sem API externa/deps).

- `lib/storage.ts`: `PetRecord.breed?: string` adicionado.
- `app/(tabs)/index.tsx`:
  - Novo estado `breed` + `breedRef`.
  - `AUTO_OPTIONS`: listas fixas `species` e `breed` (offline).
  - Novo componente `AutoInput` (dropdown filtrado local, `onPressIn` para
    evitar corrida de blur; recebe `styles` como prop, igual ao
    `CircularActionButton`, pois `styles` é local do `HomeScreen`).
  - Modal: dois `AutoInput` — "Espécie *" e "Raça *" — antes de Localização;
    `onSubmitEditing`/`onSelect` focam o próximo campo.
  - `handleAddPet`: validação exige `species` **e** `breed`; `newPet` inclui
    `breed`; reset inclui `setBreed("")`.
  - Card (`demoName`) e título do viewer mostram `Espécie (Raça)`.
  - Estilos: `autoWrap`, `autoDropdown`, `autoList`, `autoItem`,
    `autoItemText` (usam `c.card`, `c.cardStroke`, `c.text`).
- Validação: `tsc --noEmit` limpo. Testar em device/emulador o dropdown e o
  foco sequencial (Espécie → Raça → Localização).


## Atualizações (2026-08-19, fim) — "Apagar denúncia" só para quem criou

Bug raiz: o botão "Apagar denúncia" aparecia para o **dono** do pet denunciado.
Causa: `submitReport` definia `reportedBy = myPhone || normalizePhone(pet.contact)`.
Quando quem denuncia não tem telefone, `reportedBy` caía no **contato do dono**;
o dono, ao ver o próprio pet, batia no `isReporter` por telefone e ganhava o botão.

Regra (confirmada): "Apagar denúncia" só aparece para **quem criou a denúncia**,
identificado pelo **device que reportou** (`reporterDeviceId`), não por telefone.

- `app/(tabs)/index.tsx`:
  - Botão "Apagar denúncia": condição agora
    `selectedPet.reported && selectedPet.reporterDeviceId === myDeviceId`
    (removeu o `isReporter` por telefone, que colidia com o dono).
  - `submitReport`: `reportedBy` usa só o telefone de quem denuncia
    (`myPhone ? normalizePhone(myPhone) : ""`), nunca o contato do pet.
  - Removada a função `isReporter` (virava código morto/enganoso).
- Validação: `tsc --noEmit` limpo.

## Atualizações (2026-08-19, tarde) — autocomplete Espécie/Raça via react-native-element-dropdown

Pedido: substituir o `AutoInput` (TextInput + dropdown local) dos campos
**Espécie** e **Raça** do modal "Reportar Pet" pela lib
`react-native-element-dropdown` (v2.12.4), usando a propriedade `search`
(autocomplete com busca).

- `package.json`: nova dependência `react-native-element-dropdown@^2.12.4`
  (peers só `react`/`react-native`; sem conflito com `react-native-reanimated@4`).
- `app/(tabs)/index.tsx`:
  - Import de `Dropdown` e `type IDropdownRef` da lib.
  - `AutoInput` removido; novo componente `SearchableSelect` faz wrapper do
    `Dropdown` com `search`, `searchPlaceholder="Buscar..."`, `data` mapeado de
    `{label, value}` a partir de `AUTO_OPTIONS`. `onChange` devolve o texto
    selecionado; `onSelect` encadeia o foco (abre o próximo dropdown / foca o
    campo Localização).
  - Refs `speciesRef`/`breedRef` (TextInput) viraram `speciesDropdownRef`/
    `breedDropdownRef` (`IDropdownRef`); após selecionar espécie abre o dropdown
    de raça; após raça, foca `locationRef`.
  - Estilos: adicionados `dropdown`, `dropdownContainer`, `dropdownPlaceholder`,
    `dropdownSelectedText`, `dropdownInputSearch`, `dropdownItemText` (temáticos);
    removidos os estilos órfãos `autoWrap`/`autoDropdown`/`autoList`/`autoItem`/
    `autoItemText`.
- Validação: `tsc --noEmit` limpo.
- **Nota de UX:** o `Dropdown` é um seletor da lista fixa (não aceita texto
  livre digitado que não esteja na lista) — comportamento esperado de um
  autocomplete com `search`. Rebuild nativo (`npx expo run:android`) necessário
  após a nova dependência.

## Atualizações (2026-08-19, fim) — Espécie editável + Raça amarrada à espécie

Feedback: a seleção de espécie "não ficou boa" — o campo precisava ser
**editável** (usuário informa o que quiser) e a **raça precisa ficar amarrada
à espécie** (cão não pode ter raça de gato).

- `app/(tabs)/index.tsx`:
  - `AUTO_OPTIONS` (listas soltas) substituído por `SPECIES_BREEDS`
    (`Record<string, string[]>`) com o mapeamento espécie → raças fornecido
    pelo usuário (Cão, Gato, Calopsita, Papagaio, Periquito, Agapornis,
    Furão, Hámster, Coelho, Porquinho-da-índia, Rato Twister, Jabuti/Cágado,
    Gecko, Cobra/Serpente). `SPECIES_OPTIONS = Object.keys(SPECIES_BREEDS)`.
  - `SearchableSelect` reformulado para **aceitar texto livre**:
    - `renderInputSearch` captura o texto digitado (não rely on `onChangeText`,
      pois a lib zera o search com `onChangeText('')` ao fechar — `index.js:241`).
    - O valor digitado é **injetado em `data`** (`list.unshift`) para continuar
      sendo exibido fechado (a lib só mostra labels de itens em `data` —
      `index.js:204-212`).
    - `onBlur` consolida o texto digitado se nenhum item foi selecionado.
    - `searchQuery` insensível a acentos (`normalizeDiacritics`).
  - Modal "Reportar Pet":
    - Espécie: `options={SPECIES_OPTIONS}`, editável; ao mudar, se a nova
      espécie é conhecida e a raça atual não pertence a ela, `setBreed("")`
      (impede cruzar raça de gato em cão).
    - Raça: `options={SPECIES_BREEDS[species] ?? NO_BREEDS}` — só aparecem as
      raças da espécie escolhida; espécie livre (não mapeada) → raça livre.
  - Estilo `dropdownInputSearch` ganha borda/padding para o campo de busca.
- Validação: `tsc --noEmit` limpo; `eslint` sem novos erros (resto é
  pré-existente: aspas em JSX na linha 1826).
- Rebuild nativo (`npx expo run:android`) necessário para testar.

## Atualizações (2026-08-19) — expansão das listas Espécie→Raça

Atualização de `SPECIES_BREEDS` (`app/(tabs)/index.tsx`) com as listas
enviadas pelo usuário: muito mais raças por espécie e novos grupos
(**Arara**, **Cacatua**, **Gerbil**, **Iguana**). Grupos renomeados para os
rótulos limpos: `Calopsita`, `Papagaio`, `Ferret`, `Jabuti e Cágado`, `Cobra`
(sem o sufixo explicativo entre parênteses). `SPECIES_OPTIONS` e a lógica de
raça amarrada à espécie continuam derivando automaticamente de `SPECIES_BREEDS`.
`tsc --noEmit` limpo.

## Atualizações (2026-08-19) — teclado cobrindo Espécie/Raça (Dropdown)

Bug: ao abrir o dropdown de Espécie/Raça, o teclado ficava por cima do campo
de busca e o scroll não funcionava direito.

Causa raiz: o `Dropdown` da `react-native-element-dropdown` renderiza a lista
(num `Modal` próprio, fora da nossa árvore de `KeyboardAvoidingView`). O ramo
de `keyboardAvoiding` da lib (`index.js:436`) só dispara quando
`dropdownPosition === 'auto'`. O `SearchableSelect` usava
`dropdownPosition="bottom"`, que forçava a lista para baixo do campo e
desligava o desvio de teclado → o teclado cobria o input de busca.

 Correção (`app/(tabs)/index.tsx`): `dropdownPosition="bottom"` →
 `"auto"`. Com `"auto"` a lib posiciona a lista acima/abaixo conforme o espaço e
 aplica `keyboardAvoiding` (default `true`), subindo a lista acima do teclado
 quando o campo está na parte baixa da tela. `tsc --noEmit` limpo.

## Atualizações (2026-08-19) — teclado ainda cobria Raça (Dropdown)

O `"auto"` não resolveu para Espécie/Raça: a lógica de auto-posicionamento da
lib (`index.js:421-426`) só abre a lista ACIMA quando
`bottom < keyboardHeight + height` — ou seja, só quando o campo está bem
embaixo. Para campos no meio/baixo do formulário (Espécie/Raça vêm após as
fotos), `bottom` é grande e a condição é falsa → a lista fica **abaixo** e o
teclado a cobre. Além disso a lista do Dropdown **sempre** vai num `Modal`
próprio da lib (`index.js:472`), independente de `mode`, então ela não
participa do `KeyboardAvoidingView` do modal do formulário.

 Correção: `dropdownPosition="auto"` → `"top"`. A lista abre acima do campo, com
 o input de busca no topo (longe do teclado). Como Espécie/Raça têm espaço
 acima (cabeçalho + seção de fotos), não há corte no topo. `tsc --noEmit` limpo.

## Atualizações (2026-08-19) — overlap do dropdown (zIndex/ScrollView)

Reclamação: `"top"` cobria o campo em edição. Aplicada a correção padrão de
overlap de dropdowns (conforme guia do usuário):

- `dropdownPosition` voltou para `"bottom"` → a lista abre **abaixo** do campo e
  não cobre o campo em edição.
- Cada `SearchableSelect` agora é envolvido por um container pai
  `dropdownWrap` com `position: relative`, `zIndex: 2000`, `elevation: 2000`
  (evita que campos irmãos sobreponham a lista flutuante).
- `ScrollView` do modal: adicionado `nestedScrollEnabled={true}` e
  `modalScrollView` ganhou `overflow: "visible"` (evita corte do conteúdo
  absoluto/flutuante pelo container pai).
- A lista do Dropdown já usa `Modal` internamente (sem corte de ScrollView).

`tsc --noEmit` limpo; `eslint` sem novos erros (resto pré-existente: aspas em
JSX na linha 1863). Rebuild nativo (`npx expo run:android`) para validar.

## Atualizações (2026-08-19, fim) — correção definitiva do sync de denúncia

Histórico desta sessão (várias tentativas até acertar a causa raiz):

**Causa 1 — duas policies de UPDATE combinadas com AND.** Havia `pets update
own` + `pets report update`. O Postgres combina o `WITH CHECK` de policies
permissivas de UPDATE com **AND**, então um caso passava e o outro falhava
(consertar a denúncia quebrava o "apagar"; consertar o "apagar" quebrava a
denúncia). Confirmado em teste real de Postgres (PGlite).

**Causa 2 (a que realmente travava em produção) — o app reescrevia o `payload`
inteiro na denúncia.** Em `lib/sync.ts`, o ramo de denúncia fazia
`UPDATE ... payload = newPayload` (payload completo). A policy comparava
`payload - chaves = oldpayload - chaves` para garantir "conteúdo inalterado".
Isso era FRÁGIL: o payload local do finder divergia do do servidor (ex.:
`images` como URI local vs URL remota), então a comparação falhava com
`new row violates row-level security policy` e a denúncia não propagava. Se a
comparação fosse relaxada, o servidor teria o `payload` CORROMPIDO (imagens
viravam URI local).

**Correções definitivas (todas validadas em Postgres real / `tsc --noEmit`):**

1. **`lib/sync.ts`** — o ramo de denúncia agora atualiza SÓ as **colunas de
   topo** (`reported`, `reporter_device_id`, `updated_at`), **não** o `payload`.
   As colunas de topo já são a fonte autoritativa (`toLocalPet` lê delas), então
   o conteúdo do servidor fica intacto e não há mais comparação de payload.
2. **`supabase/schema.sql`** — UMA SÓ policy `pets update` (sem comparação de
   `payload`). Casos (OR explícito):
   - **A — dono** edita conteúdo/soft-delete; `reporter` imutável; dono não
     esconde denúncia alheia (`reported true→false` bloqueado).
   - **B — finder denuncia 1ª vez**: `reporter null→current`, `reported=true`.
   - **C — o próprio repórter** confirma (`true`) ou apaga (`false`) a denúncia;
     `reporter` inalterado. Só o repórter pode; dono segue travado.
   - Em todos: `owner_device_id` IMUTÁVEL.
3. **`app/(tabs)/index.tsx`** — o **dono NÃO denuncia o próprio post**: botão
   "Denunciar" some para o dono, e `reportPet`/`submitReport` travam se for o
   dono (evita o erro de RLS do dono denunciando a si mesmo).

**Testado (PGlite, 13 cenários):** dono edita ✅, dono soft-delete (normal e
denunciado) ✅, finder denuncia (payload idêntico E divergente) ✅, repórter
apaga ✅, repórter re-denuncia ✅, finder alheio editando conteúdo bloqueado ✅,
roubo de posse bloqueado ✅, dono escondendo denúncia alheia bloqueado ✅, finder
não-reporter denunciando pet já denunciado bloqueado ✅, repórter apagando só com
colunas de topo ✅, dono denunciando próprio post bloqueado (app) ✅.

### Reaplicar no Supabase (SQL Editor) — rode UMA vez e não rode mais nenhum outro snippet de policy
```sql
drop policy if exists "pets update own" on public.pets;
drop policy if exists "pets report update" on public.pets;
drop policy if exists "pets update" on public.pets;
create policy "pets update"
  on public.pets for update to authenticated
  using (true)
  with check (
    owner_device_id = (select p.owner_device_id from public.pets p where p.id = pets.id)
    and (
      ( owner_device_id = public.current_device_id()
        and reporter_device_id is not distinct from (select p.reporter_device_id from public.pets p where p.id = pets.id)
        and ( owner_device_id <> public.current_device_id()
              or not ( (select p.reported from public.pets p where p.id = pets.id) = true
                       and reported = false ) )
      )
      or ( (select p.reporter_device_id from public.pets p where p.id = pets.id) is null
           and owner_device_id <> public.current_device_id()
           and reporter_device_id = public.current_device_id()
           and reported = true
           and deleted_at is null )
      or ( (select p.reporter_device_id from public.pets p where p.id = pets.id) = public.current_device_id()
           and owner_device_id <> public.current_device_id()
           and reporter_device_id = public.current_device_id()
           and deleted_at is null )
    )
  );
```
(NÃO rode o `schema.sql` inteiro em produção se já houver dados — ele recria
tabelas. O `supabase/schema.sql` já está atualizado com esta policy única.)

### Importante
As mudanças em `lib/sync.ts` e `app/(tabs)/index.tsx` **exigem rebuild do app**
(`npx expo run:android`), não só o SQL. Sem o rebuild, o app ainda manda o
`payload` na denúncia e/ou deixa o dono denunciar o próprio post.

### Lição (não repetir)
- Nunca "consertar" RLS mexendo em UMA policy de um par cujos `WITH CHECK` são
  combinados com AND — unificar em UMA policy com OR explícito.
- Não comparar `payload` jsonb em RLS para "garantir conteúdo inalterado": é
  frágil (URI vs URL, campos extras) e quebra o cliente legítimo. Em vez disso,
  o app deve atualizar só as colunas de topo relevantes.
  - Validar com teste de Postgres real (ex.: PGlite) ANTES de passar SQL.
  - O dono não deve denunciar o próprio alerta (regra de negócio + evita erro de RLS).

## Atualizações (2026-08-20) — campo Recompensa no report e rótulos do modal

Pedido: adicionar um campo **Recompensa** (opcional) no modal "Reportar Pet
Perdido"; se preenchido, mostrar no card do pet como **R$**. Também adicionar
**rótulos** acima de todos os campos do modal.

### Implementação
- `lib/storage.ts`: `PetRecord.reward?: number` (viaja dentro do `payload`
  jsonb já sincronizado — **sem mudança em `schema.sql`/RLS**).
- `app/(tabs)/index.tsx`:
  - Novo estado `reward` (`number-pad`, só dígitos).
  - Modal "Reportar Pet Perdido": campo de recompensa com **prefixo `R$`
    fixo dentro do campo** (estilo de moeda) e formatação de milhar ao digitar
    (`Number(reward).toLocaleString("pt-BR")`). `placeholder="0,00"`.
  - `handleAddPet`: grava `reward` (número, só se preenchido) e reseta o estado.
  - Card do pet: linha **"Recompensa: R$ 1.234,56"** via
    `Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })`
    (só quando `typeof reward === "number"` e finito).
  - Estilos: `rewardField` (container com prefixo), `rewardPrefix` (`R$`),
    `rewardInput`; reuso de `demoRow` + novo `demoReward` no card.
  - **Rótulos** (`fieldLabel`) acima de todos os campos: "Espécie *", "Raça *",
    "Última Localização Vista *", "Descrição Adicional (opcional)",
    "Contato (WhatsApp) *" e "Recompensa (opcional)". Placeholders dos
    dropdowns/textos ajustados para não duplicar o rótulo.

### Validação
- `tsc --noEmit` limpo.
- Requer **rebuild nativo** (`npx expo run:android`) para testar a UI.

### Notas
- O campo aceita só dígitos (reais inteiros); centavos não entram pelo
  `number-pad`. Se no futuro quiserem centavos, trocar para `decimal-pad` e
  reformatar no `onChangeText`.

## Atualizações (2026-08-20, tarde) — fallback de galeria no emulador

Sintoma: no emulador (AVD "Google APIs" sem Google Play) o botão "Galeria"
fecha na hora; no aparelho físico abre normal. Causa: o `ImagePicker
.launchImageLibraryAsync` dispara o seletor de imagens do sistema; sem um app
de galeria/Photos para atender o intent, o picker fecha sem destinatário.

### Implementação
- `npx expo install expo-document-picker` (compatível com SDK 54).
- `app/(tabs)/index.tsx` (`abrirGaleria`):
  - Mantém o `requestMediaLibraryPermissionsAsync` + `launchImageLibraryAsync`.
  - Em `try/catch`: se o picker de imagens **lançar** (galeria indisponível),
    cai no `DocumentPicker.getDocumentAsync({ type: "image/*", multiple: true,
    copyToCacheDirectory: true })`, que usa o seletor de arquivos genérico e
    funciona em qualquer AVD.
  - O fallback **só** dispara em erro (não em cancelamento do usuário). Os
    assets de ambos os caminhos são unificados (uri + fileSize) e seguem o
    mesmo pipeline de redimensionar/filtrar/`setImages`.
- Validação: `tsc --noEmit` limpo. Requer **rebuild nativo** após a nova
  dependência nativa (`npx expo run:android`).

### Alternativa de ambiente (sem código)
- Usar um AVD de imagem **"Google Play"** (em AVD Manager) em vez de "Google
  APIs": já traz o app Photos e o photo picker funciona.

### Notas / risco
- Se o `launchImageLibraryAsync` resolver silenciosamente com `canceled:true`
  (em vez de lançar) num AVD sem galeria, o fallback não dispara. Caso isso
  ocorra, adicionar uma opção "Arquivos" direta no action sheet de foto.

## Atualizações (2026-08-20, fim) — galeria padrão no dispositivo, arquivos no emulador

Ajuste de comportamento pedido: o usuário **não** queria o document picker como
fallback silencioso no aparelho — queria a **galeria padrão do SO** (Android/iOS)
no dispositivo físico e o **seletor de arquivos** só no emulador.

### Implementação
- `npx expo install expo-device` (compatível com SDK 54).
- `app/(tabs)/index.tsx` (`abrirGaleria`): ramifica por `isDevice` (de
  `expo-device`):
  - **Dispositivo físico (`isDevice === true`):** pede permissão e abre a
    galeria padrão via `ImagePicker.launchImageLibraryAsync` (mesmo UX de
    sempre no celular).
  - **Emulador (`isDevice === false`):** abre direto
    `DocumentPicker.getDocumentAsync({ type: "image/*", multiple: true,
    copyToCacheDirectory: true })` (seletor de arquivos), pois o AVD sem
    Google Play não tem app de galeria para atender o intent.
- Os dois caminhos unificam `uri` + `fileSize` e seguem o mesmo pipeline de
  redimensionar/filtrar/`setImages`. A checagem de `MAX_IMAGES` foi movida
  para antes do branch (evita pedir permissão quando já no limite).
- Validação: `tsc --noEmit` limpo. Requer **rebuild nativo** (duas deps
  nativas novas: `expo-document-picker`, `expo-device`).

## Atualizações (2026-08-20) — remoção do warning de deprecação do ImagePicker

`expo-image-picker@17` deprecou `ImagePicker.MediaTypeOptions.Images`. O
`MediaType` é só um tipo (`'images' | 'videos' | 'livePhotos'`), não um enum
valor, então não dá para usar `ImagePicker.MediaType.Images`. Trocado em
`app/(tabs)/index.tsx` (`abrirGaleria`) para `mediaTypes: ["images"]` (forma
não-depreciada, aceita `MediaType | MediaType[]`). `tsc --noEmit` limpo.

## Atualizações (2026-08-20) — cidade na mensagem de compartilhar do card

A mensagem de compartilhar (`sharePetCard`, `app/(tabs)/index.tsx`) só levava
`pet.location`. Agora inclui a **cidade** quando houver, no mesmo formato do
card: `local — cidade` (ex.: "Rua X — Sorocaba"). `tsc --noEmit` limpo.

## Atualizações (2026-08-20) — erro de bundle `better-sqlite3` (op-sqlite no Node)

Sintoma: ao rodar o dev server, o Metro falhava com
`Unable to resolve module better-sqlite3` vindo de
`node_modules/@op-engineering/op-sqlite/node/dist/database.js`, na pilha
`expo-router/node/render.js` → `lib/storage.ts` → `@op-engineering/op-sqlite`.

### Causa raiz
`app.json` tinha `"web": { "output": "static" }`. Isso ativa o **Static Rendering
(SSG)** do `expo-router`, que gera um bundle de **renderização no Node**
(`expo-router/node/render.js`) importando o app inteiro. Nesse contexto Node, o
`op-sqlite` resolve para a variante `node/` que faz `import Database from
"better-sqlite3"` — módulo nativo do Node ausente no projeto → Metro quebra.

Importante: o **bundle nativo do app funcionava** (log `SYNC concluído -> pets
no estado: 3` aparecia); só o bundle de render estático (web/Node) falhava.

### Correção
- Removido o bloco `"web"` inteiro de `app.json`. O app é **nativo-only**
  (`platforms: ["ios","android"]` e depende de `op-sqlite`/câmera/location, que
  não rodam na web), então o static rendering não é viável nem necessário. Sem
  `output: "static"`, o `expo-router` não gera o bundle Node de render.
- `metro.config.js` já prioriza `conditionNames: ['react-native', ...]`,
  correto para o build nativo.

### Validação
- Após a mudança, **reiniciar** o dev server (e, se persistir cache,
  `Remove-Item -Recurse -Force .expo, node_modules\.cache`). O erro de
  `better-sqlite3` some; só o bundle nativo é gerado.
- Alternativa (se um dia quiserem web de verdade): manter `web` mas stubar
  `better-sqlite3` no Metro (`resolveRequest`) ou trocar o storage local por
  implementação web — fora de escopo hoje.

## Atualizações (2026-08-20, fim) — botão Contato (finder→tutor), mensagem WhatsApp e cidade real no mapa

Trabalho desta sessão (validado com `tsc --noEmit`; **rebuild nativo
(`npx expo run:android`) necessário** para testar a UI).

### 1. Botão Contato some para o dono / rótulo "Contatar tutor"
- **Bug de UX:** o botão "Contato" era adicionado incondicionalmente na
  `demoActionBar`, então o **dono** do anúncio via "Contatar dono" e, ao clicar,
  revelava/abria o próprio WhatsApp — não faz sentido.
- **Correção (`app/(tabs)/index.tsx`):** o item `contact` agora entra no array
  de ações **só quando não é o dono** (`isOwner(selectedPet, myDeviceId,
  myPhone)`), exatamente como o botão "Denunciar" já fazia.
- Rótulo mudou de "Contato" para **"Contatar tutor"**.

### 2. Mensagem do WhatsApp (finder → tutor)
- **Problema:** a mensagem anterior mandava o **link do card do pet para o
  tutor**, que já conhece o próprio pet — inútil. O texto "Posso ajudar a
  encontrá-lo?" também pressupunha errado que quem envia é o dono.
- **Correção:** `openWhatsApp` agora recebe o `pet` (não o `id`) e **não envia
  mais o link**. Mensagem para quem avistou/encontrou:
  `Olá! Vi o alerta do seu pet (Espécie - Raça) no iFujão e acho que tenho
  informações sobre ele. Podemos conversar?`
- Espécie/Raça formatada com **hífen** (`Cão - Shih Tzu`), sem parênteses
  aninhados. Caller `handleContact` passa `pet` em vez de `pet.id`.

### 3. Card do pet: espécie/raça com hífen
- `demoName` (nome no card do modal) agora exibe `Espécie - Raça` (antes
  `Espécie (Raça)`), padronizando com a mensagem do WhatsApp.

### 4. Cidade real no mapa (geocoding reverso)
- **Antes:** o rótulo de cidade no canto inferior esquerdo (`cityBox`) usava
  `getCityForLocation` (busca na lista fixa `CITIES`, só Sorocaba/Votorantim) —
  só alternava entre essas duas e **nunca** mostrava a cidade real do GPS.
- **Agora:** usa `reverseGeocodeCity` (geocoder nativo do aparelho, offline, sem
  chave de API — `lib/geocode.ts`) da posição real do GPS:
  - Estado `gpsCity` (fallback "Sorocaba"); `useEffect` dispara no
    `userLocation` com **limiar de 500m** (evita martelar o geocoder a cada
    poll de 5s do GPS).
  - Mantém o último valor válido em caso de falha/offline (não zera para "").
- `selectedCity` (busca na lista fixa) **permanece** nos demais usos (centro
  padrão do mapa e modal de reportar), que ainda dependem de coordenadas
  conhecidas.

### Arquivos alterados
| Arquivo | O que mudou |
|---|---|
| `app/(tabs)/index.tsx` | botão Contato só p/ não-dono + label "Contatar tutor"; `openWhatsApp(pet)` sem link; `demoName` com hífen; `gpsCity` por reverse geocode no `cityBox`. |

- Validação: `tsc --noEmit` limpo. Requer **rebuild nativo** (`npx expo run:android`).

## Atualizações (2026-08-20, noite) — busca semântica por IA (Gemini + pgvector)

Botão "Buscar com IA" no topo do mapa: o usuário descreve em linguagem natural
(ex.: "cachorro castanho, orelhas caídas") e o app ranqueia os pets por
similaridade (não correspondência exata de texto). Implementado com embeddings
do Gemini + pgvector no Supabase.

### Arquitetura
- `supabase/migrate_embeddings.sql` (idempotente, produção): extensão `vector`,
  coluna `pets.embedding`, função `match_pets(query_embedding, match_count)`
  (similaridade coseno via `<=>`, só pets ativos), tabela `ai_searches`
  (rate-limit). `schema.sql` atualizado para refletir (projetos novos).
- `supabase/functions/search-pets/index.ts`: autentica (anon), rate-limit
  20/min, gera embedding da consulta via Gemini e chama `match_pets` (service_role).
- `supabase/functions/embed-pets/index.ts`: gera/backfill dos embeddings dos
  pets (chamado pelo push do app ao criar/editar e via backfill manual).
- `lib/search.ts` (`searchPets(query)`) e `lib/embed.ts` (`embedPet(id)`,
  fire-and-forget no push de `lib/sync.ts`).
- `app/(tabs)/index.tsx`: barra de busca no topo + filtro do mapa pelos
  resultados + botão limpar.

### Deploy (ordem)
1. SQL Editor: `migrate_embeddings.sql` (uma vez).
2. `supabase secrets set GEMINI_API_KEY=<chave>` (projeto, não vai no código).
3. `supabase functions deploy search-pets` e
   `supabase functions deploy embed-pets --no-verify-jwt`.
4. Backfill (1x): `curl -X POST <url>/functions/v1/embed-pets` com header
   `Authorization: Bearer <service_role_key>` e body `{}` (preenche pets
   existentes). Pets novos já ganham embedding no push.
5. App: `npx expo run:android`.

### Lições / armadilhas vencidas (não repetir)
- **Modelo Gemini:** a chave deste projeto NÃO tem `text-embedding-004`. Os
  modelos de embedding disponíveis são **`gemini-embedding-001`** e
  **`gemini-embedding-2`** (via `ModelService.ListModels`). Usar `gemini-embedding-001`.
- **Dimensão:** `gemini-embedding-001` gera **3072 dimensões** (não 768). A
  coluna/função são `vector(3072)`.
- **HNSW do pgvector limita a 2000 dimensões** — NÃO cria índice ANN para 3072.
  A busca usa `<=>` (scan exato), instantânea na escala do app. (Se um dia usar
  modelo ≤2000 dims, aí sim cria o `pets_embedding_idx` HNSW.)
- **GRANT service_role em `pets`:** as Edge Functions usam `service_role` para
  ler/escrever `pets` e chamar `match_pets`; sem `grant select, insert, update,
  delete on public.pets to service_role` a query falha com "permission denied".
  (Mesma classe de bug do `reveal-contact` — ver seção de PII.)
- **`embed-pets` (backfill) admin:** aceita JWT `role: service_role` decodificado
  (sem verificar assinatura — endpoint só escreve embeddings). Deploy com
  `--no-verify-jwt` para o gateway não barrar o token de service_role.
- **Gemini `embedContent` (individual) funciona; `batchEmbedContents` NÃO é
  suportado para `gemini-embedding-001` no v1/v1beta** (erro "not supported for
  embedContent"). Usar `embedContent` por pet.
- **SQL Editor é transação única:** ao falhar, faz ROLLBACK de tudo. Um índice
  HNSW antigo (em 768) travou o `ALTER` para 3072 — é preciso `drop index if
  exists` ANTES do `alter column type`.
- A chave Gemini foi colada no chat nesta sessão; **revogá-la/regenerar** e
  atualizar o secret.

### Arquivos alterados
| Arquivo | O que mudou |
|---|---|
| `supabase/migrate_embeddings.sql` | criação de embedding(3072), `match_pets`, `ai_searches`, grants. |
| `supabase/schema.sql` | coluna `embedding vector(3072)`, `match_pets(3072)`, grants (sem índice HNSW). |
| `supabase/functions/search-pets/index.ts` | busca semântica (Gemini `embedContent`, `gemini-embedding-001`, rota `v1`). |
| `supabase/functions/embed-pets/index.ts` | gera/backfill embeddings (admin via service_role). |
| `lib/search.ts` / `lib/embed.ts` | cliente de busca e de embedding. |
| `lib/sync.ts` | chama `embedPet` no push de pet criado/atualizado. |
| `app/(tabs)/index.tsx` | barra "Buscar com IA" + filtro do mapa + estilos. |

- Validação: `tsc --noEmit` limpo. Backfill executado com sucesso (3/3 pets).
  Requer **rebuild nativo** (`npx expo run:android`) para testar a UI.

## Atualizações (2026-08-20, fim) — busca híbrida (texto + vetor) — REVERTIDA

Bug: "gato preto" retornava resultados, mas "gato" não retornava nada.

### Causa raiz
O embedding de cada pet é gerado **só a partir da FOTO**
(`embed-pets/index.ts:172` → `parts: img ? [img] : [{ text }]`). A busca
`search-pets` ranqueia por similaridade **visual** (piso `MATCH_THRESHOLD = 0.4`).
- "gato preto": o texto "preto" afunila o casamento visual com a foto do gato
  preto → passa do limite.
- "gato": palavra única, embedding genérico comparado com fotos → cai abaixo de
  `0.4` → nenhum resultado.

### Tentativa híbrida (DESCARTADA)
Primeiro fiz match por **texto** no `payload` (espécie/raça/descrição) para
garantir "gato" → todos os gatos. Problemas: (1) o campo `species` do payload
**pode estar inconsistente** e não reflete a foto; (2) "gato preto" acabava
tragando todos os gatos (a espécie casava amplo). Decisão do usuário: **esquecer
o campo espécie e checar SÓ a imagem** (se bater com o texto da pesquisa).

### Correção final (`supabase/functions/search-pets/index.ts`)
Busca **SÓ POR IMAGEM**, sem depender do `payload`:
- Removido o helper `fetchTextMatches` e todo o match por texto/`species`.
- **Limiar RELATIVO** à melhor imagem (`best - REL_MARGIN`, piso 0.2), não um
  piso fixo. O `match_pets` devolve os top-20 por similaridade coseno e aí
  filtramos por perto do topo:
  - Consulta genérica ("gato"): cluster de gatos apertado em torno do melhor →
    **todos os gatos** entram; outras espécies (muito abaixo) saem.
  - Consulta específica ("gato preto"): o gato preto é o topo, os não-pretos
    caem bem abaixo → **só a melhor imagem de gato preto** fica (NÃO todos os
    gatos). Quem decide é a imagem, não o rótulo de texto.

### Deploy
`supabase functions deploy search-pets` (só a função mudou; sem SQL/RLS novo).
Não precisa de rebuild do app (a UI consome só o `id`).

### Lição (não repetir)
  - Quando o embedding do pet é **só-foto**, a busca deve ser **só visual**;
    não inventar match por campo de texto (`species`) que pode estar errado e
    divergir da foto. O piso de similaridade que corta palavras genéricas foi a
    causa de "gato" não voltar nada — remover o corte (top-N por similaridade)
    resolve sem misturar critérios.

## Atualizações (2026-08-21) — rate-limit diário da busca por IA por device_id + UX

Motivo: a busca por IA chama o Gemini a cada consulta (custo de tokens). O
limite anterior era **20/MINUTO por `user_id`** em `search-pets/index.ts` —
suficiente para estourar os tokens se a busca ficasse livre. Decisão (confirmada
com o usuário): limite de **20 buscas/dia por dispositivo**, janela em **UTC**,
identidade por **`device_id`**.

### Implementação
- `supabase/functions/search-pets/index.ts`:
  - Constantes `RATE_LIMIT`/`RATE_WINDOW_MS` (20/min) → `DAILY_LIMIT = 20`.
  - Extrai `device_id` do `user_metadata` do JWT (`/auth/v1/user` já buscado,
    `search-pets/index.ts:37`).
  - Rate-limit conta `ai_searches` por `device_id` desde o **início do dia UTC**
    (`setUTCHours(0,0,0,0)`); cai para `user_id` se `device_id` faltar (não
    deixa ilimitado). Responde `429` quando estoura.
  - Grava `device_id` na tabela `ai_searches` (`search-pets/index.ts:131`).
- `supabase/schema.sql`: `ai_searches` ganha `device_id text` + `alter table ...
  add column if not exists` idempotente (não recria a tabela em produção) + índice
  `(device_id, created_at)`.
- `lib/search.ts`: `searchPets` retorna `{ results, rateLimited }`; detecta o
  `429` (`error.status === 429`) e sinaliza `rateLimited`.
- `app/(tabs)/index.tsx` (`runAiSearch`): ao `rateLimited`, exibe aviso
  **"Limite de buscas atingido" — "Você fez 20 buscas hoje. Tente novamente
  amanhã."** (antes só mostrava "Sem resultados" para todo mundo).
- Ajuste da dica da barra de busca: o `placeholder` longo estourava e **cortava**.
  A barra virou **coluna** (linha de busca + dica que **quebra em várias linhas**
  sem cortar). A dica foi corrigida para refletir o que a IA realmente usa: a
  busca é **só-visual** (embedding da FOTO do pet vs. texto da consulta, via
  `match_pets` por cosseno) — `location`/`city` **não** entram no embedding
  quando há foto (ver `embed-pets/index.ts:172`). Dica final:
  **"Descreva a aparência do pet: espécie, cor e marcações. Ex.: gato cinza com
  manchas brancas"**.

### Aplicar em produção (ordem)
1. SQL Editor (idempotente, não recria tabela):
   ```sql
   alter table if exists public.ai_searches add column if not exists device_id text;
   create index if not exists ai_searches_device_day_idx on public.ai_searches (device_id, created_at);
   ```
2. Redeploy: `supabase functions deploy search-pets`.
3. App: **rebuild nativo** (`npx expo run:android`) — mudou `lib/search.ts` e a UI.

### Notas
- `ai_searches.created_at` é `timestamptz` (armazenado em **UTC**); o reset do
  limite ocorre à meia-noite UTC.
- `device_id` é spoofável (trade-off aceito no projeto); para limitar custo de
  tokens é suficiente.
- O `reveal-contact` mantém seu próprio limite de 10/min (separado).

### Arquivos alterados
| Arquivo | O que mudou |
|---|---|
| `supabase/functions/search-pets/index.ts` | `DAILY_LIMIT=20`; rate-limit diário por `device_id` (UTC); grava `device_id`. |
| `supabase/schema.sql` | `ai_searches.device_id` + índice `(device_id, created_at)`. |
| `lib/search.ts` | `searchPets` retorna `{ results, rateLimited }`. |
| `app/(tabs)/index.tsx` | aviso de limite diário; barra de busca em coluna + dica quebra-linha. |

- Validação: `tsc --noEmit` limpo.

## Atualizações (2026-08-21, tarde) — Espécie/Raça: "Cachorro", ordem alfabética e correção do autocomplete da Raça

Trabalho nesta sessão em `app/(tabs)/index.tsx` (validado com `tsc --noEmit`).

### 1. Espécie "Cão" → "Cachorro" + ordem alfabética
- Chave do `SPECIES_BREEDS` renomeada de `"Cão"` para `"Cachorro"` (linha ~101).
- `SPECIES_OPTIONS` (Espécie) já é ordenado em tempo de definição com
  `localeCompare("pt-BR")`. As **raças** de cada espécie também passaram a ser
  ordenadas **uma vez** na definição (ver item 2).
- Observação: pets já cadastrados com `species: "Cão"` mantêm o valor antigo no
  servidor (o card mostra "Cão"); só os novos usam "Cachorro". Backfill opcional.

### 2. BUG RAIZ: autocomplete do dropdown "Raça" não filtrava ao digitar
- **Sintoma:** no modal "Reportar Pet Perdido", ao abrir o dropdown da Raça e
  digitar para achar a raça, a lista **não filtrava** (o Espécie filtrava normal).
- **Causa raiz:** a versão anterior desta sessão ordenava as raças **por render**
  (`options={[...].sort(...)}`), criando um **array novo a cada render**. O
  `react-native-element-dropdown` captura o `data` por closure na função interna
  de busca (`onSearch`, `node_modules/.../Dropdown/index.js:268`), cujas deps
  **não incluem `data`** — então ele conserva o `data` da 1ª montagem (geralmente
  vazio / `NO_BREEDS`) e passa a filtrar contra a lista errada → "não filtra".
  O Espécie funcionava porque `SPECIES_OPTIONS` é uma **constante estável** de
  módulo.
- **Correção:**
  - Ordena-se as raças **uma vez** na definição de `SPECIES_BREEDS`
    (`Object.values(SPECIES_BREEDS).forEach(list => list.sort(...))`), mantendo a
    **referência do array estável**.
  - O `options` da Raça voltou a ser a constante direta:
    `options={SPECIES_BREEDS[species] ?? NO_BREEDS}` (sem `.sort()` por render).
  - Regra (não repetir): **nunca** criar `options` novo a cada render em dropdown
    com busca interna — ordene na fonte ou use `useMemo`, senão a busca interna
    da lib filtra contra `data` obsoleto.

### Arquivos alterados
| Arquivo | O que mudou |
|---|---|
| `app/(tabs)/index.tsx` | `"Cão"`→`"Cachorro"`; `SPECIES_BREEDS` com raças ordenadas 1× na definição; `options` da Raça estável (sem `.sort()` por render). |

- Validação: `tsc --noEmit` limpo. Requer **rebuild nativo** (`npx expo run:android`).

## ESTADO ATUAL — ONDE PARAMOS (leia isto ao retomar)

> Atualizado em 2026-08-21 (fim da sessão). Próxima sessão: leia daqui pra baixo.

### Concluído e em produção (ou rebuild já feito pelo usuário)
- **Rate-limit diário da busca por IA**: 20 buscas/dia por `device_id`, janela
  UTC. SQL aplicado, `search-pets` redeployado, app rebuildado (usuário confirmou
  "ja rodei tudo"). Aviso "Limite de buscas atingido" implementado.
- **Dica da busca por IA** corrigida para o que a IA faz de fato (só-visual) e
  sem cortar (barra em coluna + quebra-linha).
- **Espécie/Raça**: "Cachorro", ordem alfabética PT-BR, e autocomplete da Raça
  consertado (commit desta sessão, pendente de rebuild/teste do usuário).

### Pendências / em aberto
1. **Busca por IA e acentos (cão vs cao):** explicada a causa (embedding do pet é
   só-foto; "cao" sem acento gera similaridade abaixo do piso fixo de `0.2` em
   `search-pets/index.ts:117` → zero resultados; "cão" passa). **Não foi aplicada
   correção** — opções propostas: (A) baixar o piso `0.2→0.15`; (B) embedding
   híbrido do pet (foto+texto, excluindo `species` inconsistente); (C) log de
   diagnóstico primeiro. Aguarda decisão do usuário.
2. **Backfill opcional** de pets antigos `species:"Cão"` → `"Cachorro"` (apenas
   cosmético no card).
 3. **Rebuild nativo pendente** das últimas mudanças de `app/(tabs)/index.tsx`
    (ordenação + dropdown-picker da Raça) para validação em emulador/dispositivo.

### Regras de ouro deste projeto (já no topo, reforço de aprendizado desta sessão)
- Não criar `options`/arrays novos a cada render em dropdowns com busca interna
  (`react-native-element-dropdown`) — a busca interna da lib trava em `data`
  obsoleto por closure.
- Não chutar causa raiz sem prova; perguntar quando ambíguo (ex.: "pesquisa por
  raça" precisou ser esclarecida entre autocomplete do dropdown vs filtro no mapa).
- Busca por IA é **só-visual** (foto do pet vs texto); `location`/`city` não
  entram no embedding quando há foto.

## Atualizações (2026-08-21, noite) — modal "Reportar Pet": ordem de campos, sem auto-open e dropdowns em listMode=MODAL (react-native-dropdown-picker)

Trabalho **não commitado** (desde o commit `d685116`), todo em
`app/(tabs)/index.tsx`. `tsc --noEmit` limpo.

### 1. Ordem dos campos do modal
- Campo **"Última Localização Vista *"** movido para logo após o botão
  **"Usar meu GPS (onde estou)"** (e a dica "Cidade: …"). Nova ordem:
  mapa/pino → Usar meu GPS → Cidade → Última Localização Vista → Espécie →
  Raça → Descrição → Recompensa → Contato.

### 2. Espécie não abre Raça automaticamente
- Removido o `onSelect` da Espécie que chamava `breedDropdownRef.current?.open()`.
  Ao selecionar a Espécie, a Raça **não** abre sozinha; o usuário toca no campo
  Raça quando quiser.

### 3. Scroll do modal vs lista do dropdown + teclado (IDA E VOLTA — lição)
- **Problema:** ao abrir Espécie/Raça, o scroll do modal "não funcionava" (a
  lista interna sobrepõe e o gesto de rolagem conflita com o `ScrollView` do
  modal).
- **Tentativa A (travamento de scroll):** `scrollEnabled={!dropdownOpen}` no
  `ScrollView` + estado `dropdownOpen` via `onFocus`/`onBlur`. Funcionou para a
  lista, MAS o teclado passou a sobrepor Espécie/Raça (modal travado não sobe).
- **Tentativa B (scroll programático):** ao `keyboardDidShow`, medir o campo com
  `measureLayout`/`findNodeHandle` e `scrollTo`. **FALHOU em Fabric (nova
  arquitetura):** `measureLayout` exigia ref nativo e `measure` deu
  `Cannot read property '__internalInstanceHandle' of undefined`. Gambiarra
  instável — **não repetir esse caminho**.
- **SOLUÇÃO FINAL (limpa e robusta):** dropdowns em **`listMode="MODAL"`**
  (`DropDownPicker` com `listMode="MODAL"`). A lista de opções abre
  num **Modal próprio** do RN, isolada do `ScrollView` do formulário e do
  teclado. Assim: some o conflito de scroll (a lista não fica aninhada no
  ScrollView) e some a sobreposição do teclado (o picker é um Modal em tela
  cheia). Os `onFocus`/`onBlur`/refs de travamento foram **removidos** (voltou ao
  `SearchableSelect` original + `onBlur` que consolida o texto digitado).
- **Trade-off:** o picker de Espécie/Raça agora é **tela cheia** (campo de busca
  no topo), não mais o menu suspenso inline. É o comportamento padrão/mais seguro
  da lib.

### Arquivos alterados
| Arquivo | O que mudou |
|---|---|
| `app/(tabs)/index.tsx` | Ordem dos campos (Localização após Usar meu GPS); Espécie não auto-abre Raça; dropdowns Espécie/Raça em `listMode="MODAL"` do `react-native-dropdown-picker`; removidos os hacks de `scrollEnabled`/`measure`/`keyboard`/refs. |

### Pendente de validação
- **Rebuild nativo** (`npx expo run:android`) para testar no emulador/dispositivo.
- Conferir se o `mode="modal"` atende à UX (tela cheia). Se o usuário preferir o
  menu inline, a alternativa seria `KeyboardAvoidingView` + `nestedScrollEnabled`
  sem travamento (o caminho de medir/`scrollTo` está descartado).

> **Nota:** as mudanças desde `d685116` (ordem de campos + Espécie não
> auto-abre Raça + `listMode="MODAL"` do `react-native-dropdown-picker` + ajustes
> de Espécie/Raça) foram consolidadas e **commitadas** num único commit. A
> validação em emulador/dispositivo (`npx expo run:android`) segue pendente.
## Atualizações (2026-08-21, fim) — Espécie/Raça via react-native-dropdown-picker

Troca do `react-native-element-dropdown` (v2) pelo **`react-native-dropdown-picker` (v5.4.6)** nos campos Espécie e Raça do modal "Reportar Pet". Mantido o comportamento desejado: texto livre + busca filtrável (`searchable`), raça amarrada à espécie (limpa ao trocar espécie) e foco encadeado (ao selecionar Espécie, abre o picker de Raça).

- `package.json`: removido `react-native-element-dropdown`; adicionado `react-native-dropdown-picker@^5.4.6` (peers satisfeitos: react 19, react-native 0.81).
- `app/(tabs)/index.tsx`:
  - Import default de `DropDownPicker`.
  - Dois `DropDownPicker` (`speciesPickerOpen` / `breedPickerOpen`) com `listMode="MODAL"` — a lista abre num `Modal` próprio do RN, isolada do `ScrollView` do formulário e do teclado (resolveu de vez o conflito scroll/teclado das tentativas anteriores com `element-dropdown`).
  - `items` de Raça derivam de `SPECIES_BREEDS[species] ?? []`; `disabled` quando vazio. `onChangeValue` da Espécie limpa a Raça se incompatível, mas **não** abre o picker de Raça automaticamente (usuário toca no campo Raça quando quer).
  - `modalProps={{ transparent: true, presentationStyle: "overFullScreen" }}` para o picker cobrir a tela; `searchable` com `searchPlaceholder="Digite para buscar"`.
  - Estilos: `rdpPicker`, `rdpDropdown`, `rdpText`, `rdpPlaceholder`, `rdpModalTitle`, `rdpModalContent` (temáticos). Removidos os estilos órfãos do `element-dropdown` (`dropdown`, `dropdownContainer`, `dropdownPlaceholder`, `dropdownSelectedText`, `dropdownInputSearch`).
- Validação: `tsc --noEmit` limpo. Rebuild nativo (`npx expo run:android`) necessário para testar a UI (lib nova nativa).

> **Correção de registro:** uma anotação anterior deste arquivo citava
> `react-native-autocomplete-dropdown` (v5.1.0) como a lib final. Isso NÃO
> confere com o código/package.json em disco, que usam `react-native-dropdown-picker`.
> Esta seção é a fonte autoritativa.

## Atualizações (2026-08-21, noite) — safe area, ordem de campo e imagem do card

Sessão de correções de UX/layout (validado com `tsc --noEmit` a cada passo).
Todas as mudanças em `app/(tabs)/index.tsx`; exigem **rebuild nativo**
(`npx expo run:android`) para validar no emulador/dispositivo.

### 1. Dropdown Espécie/Raça — não invade a status bar (safe area da lib)
- `DropDownPicker` (`listMode="MODAL"`) agora recebe `maxHeight={400}` (limita a
  altura da lista, que rola internamente) e `modalContentContainerStyle` injeta
  `{ marginTop: insets.top + 8 }` para a janela da lib descer abaixo da status
  bar. A lista é renderizada pela biblioteca, então o ajuste é via props, não
  por `Modal`/`FlatList` nosso.

### 2. Card de pet (demoOverlay) — safe area superior
- O `demoOverlay` (fundo do modal do card) ganhou `paddingTop: insets.top + 24`
  (inline), empurrando o cartão para baixo da status bar em telas com notch.
  `paddingBottom: 120` (barra de ações) e `maxHeight: "90%"` do card mantidos.

### 3. Action sheet "Adicionar foto" — card inteiro acima da nav bar
- `SafeAreaView edges={["bottom"]}` agora é o **container externo** do action
  sheet (não mais só o card). Assim o card inteiro (fundo arredondado incluso)
  fica acima da barra de navegação do sistema. Antes, `paddingBottom: 24 +
  insets.bottom` vinha 0 dentro do `<Modal>` no Android e o "Cancelar" ficava
  sob o menu de sistema; o fundo do card também sobrepunha a nav bar. Toque fora
  para fechar preservado.

### 4. Modal "Reportar Pet" — ordem dos campos
- Campo **"Última Localização Vista *"** movido para logo após o botão
  **"Usar meu GPS (onde estou)"** (e o hint de Cidade), antes de Espécie/Raça.
  Nova ordem: Usar GPS → Cidade → Última Localização Vista → Espécie → Raça →
  Descrição → Recompensa → Contato. Encadeamento de foco mantido
  (Localização → Descrição → Contato).

### 5. ImageCarousel — foto inteira centralizada + fundo borrado (estilo Instagram)
- Antes usava `resizeMode="cover"` (centralizado com recorte). O usuário pediu a
  foto **inteira, centralizada e sem distorcer** → `resizeMode="contain"`.
- Para o efeito Instagram, cada slide tem camadas: (1) **fundo** = mesma imagem
  com `resizeMode="stretch"` (distorcida) **e `blurRadius={20}` fixo** (sempre
  borrada, independente de denúncia) + overlay escuro `rgba(0,0,0,0.55)`; (2)
  **frente** = foto com `resizeMode="contain"` (inteira, nítida, centralizada).
- Para pet **denunciado**, o `BlurView` por cima borra a frente (privacidade),
  como antes. `tsc --noEmit` limpo.
- **Armadilha evitada:** tentar top-anchor com `position:"absolute"` + sem
  `height` fez a imagem sumir (RN colapsa altura em absoluto); e em `ScrollView`
  horizontal o RN não infere altura natural em fluxo normal — por isso a solução
  final foi `contain` + fundo borrado em vez de corte ancorado no topo.

### Arquivos alterados
| Arquivo | O que mudou |
|---|---|
| `app/(tabs)/index.tsx` | DropDownPicker: `maxHeight` + `marginTop` inset; `demoOverlay` `paddingTop`; action sheet `SafeAreaView` externo; campo Localização após GPS; `ImageCarousel` `contain` + fundo borrado. |

### Validação
- Rebuild nativo (`npx expo run:android`) **já executado** e validado no
  emulador/dispositivo — as mudanças de UI acima estão confirmadas em runtime.

## Atualizações (2026-08-22) — interface web de patrocinadores (pins no mapa)

Pedido: interface web (Node local) para cadastrar patrocinadores; pins aparecem
no mapa do app e, ao clicar, levam ao endereço/link cadastrado.

### Arquitetura
- **Backend:** tabela `public.sponsors` no Supabase (já é o backend do app).
- **Interface web:** `sponsor-admin/` — Vite + React + TS, `react-leaflet` (mesma
  lib Leaflet do `MapLeaflet`) e `@supabase/supabase-js`. Roda com `npm install`
  && `npm run dev` (porta 5173). Reaproveita `EXPO_PUBLIC_SUPABASE_URL`/ANON_KEY
  do `.env` do projeto (copiados para `sponsor-admin/.env` como `VITE_*`).
- **Auth:** Supabase Auth (e-mail/senha) na interface. RLS da tabela:
  - `select` **público** (anon) — o app mobile lista os pins.
  - `all` (insert/update/delete) **só para `authenticated` NÃO anônimo**, via
    claim `is_anonymous` do JWT (`(auth.jwt() ->> 'is_anonymous')::boolean is
    distinct from true`). Isso bloqueia os usuários anônimos do app (que também
    são `authenticated`) de escrever patrocinadores.
- **App mobile:** `lib/sponsors.ts` (`fetchSponsors` via anon) → `MapLeaflet`
  recebe `sponsors` e desenha pins **laranja (★)**; toque → `onSponsorPress`
  abre `link` se houver, senão `https://maps.google.com/?q=lat,lng` via `Linking`.

### Como rodar
1. SQL Editor (Supabase): rodar `supabase/sponsors.sql` (cria tabela + RLS).
2. Supabase: criar um usuário (e-mail/senha) para o admin em Authentication.
3. Web: `cd sponsor-admin && npm install && npm run dev` → abrir `localhost:5173`,
   logar e cadastrar patrocinadores (clique no mapa define lat/lng).
4. App: rebuild nativo (`npx expo run:android`) — os pins de patrocinadores
   aparecem no mapa e abrem o link/endereço ao toque.

### Arquivos
| Arquivo | O que mudou |
|---|---|
| `supabase/sponsors.sql` | tabela `sponsors` + RLS (read anon, write admin autenticado não-anônimo). |
| `sponsor-admin/` | app web novo (Vite+React+TS): login, CRUD, mapa de seleção. |
| `lib/sponsors.ts` | tipo `SponsorPin` + `fetchSponsors()` (anon). |
| `app/(tabs)/index.tsx` | `MapLeaflet`: prop `sponsors`/`onSponsorPress`, ícone laranja, `__renderSponsors`; HomeScreen busca sponsors e trata o toque. |

### Cadastro de patrocinador DENTRO do app (mobile) — 2026-08-22 (sessão seguinte)
O usuário queria cadastrar o patrocinador **pelo próprio celular**, usando o GPS
do telefone (que é o correto — o GPS do computador no admin web vinha errado) e
**só como admin**. Adicionado fluxo de admin dentro do app:
- Botão **Admin** (canto superior esquerdo do mapa) → modal de login (e-mail/senha
  do painel) → tela de cadastro com **mapa Leaflet tocável**, botão **📍 Usar meu
  GPS** (centraliza no celular), campo **Endereço + Procurar** (geocodifica e
  posiciona o mapa) e campos **Nome\*** e **Link\*** (obrigatórios; o link é o que
  abre ao tocar o pin). Ao abrir a tela, o mapa já centraliza no GPS do usuário.
- O insert usa um **cliente Supabase separado** (`lib/sponsorAdmin.ts`, com
  `storageKey` próprio) para não sobrescrever a sessão anônima dos pets; a RLS
  `sponsors admin write` (`is_anonymous` distinto de true) libera a escrita.
- `fetchSponsors` (`lib/sponsors.ts`) teve o filtro `.or()` do PostgREST trocado
  por filtro client-side de validade (a comparação estrita escondia o pin no
  próprio dia da data-limite); e o `sponsor-admin` grava `visible_from` como
  fim-do-dia.

| Arquivo | O que mudou |
|---|---|
| `lib/sponsorAdmin.ts` | NOVO: cliente Supabase de admin (storageKey próprio) + `addSponsorAdmin()`. |
| `components/SponsorAdminModal.tsx` | NOVO: modal de login + cadastro (mapa Leaflet, GPS, endereço/Procurar, Nome/Link). |
| `app/(tabs)/index.tsx` | botão **Admin** + `<SponsorAdminModal>` + `refreshSponsors`. |
| `lib/sponsors.ts` | filtro de validade feito client-side (sem `.or()`). |
| `sponsor-admin/src/Admin.tsx` | `visible_from` como fim-do-dia; botão de GPS do PC desligado (GPS do computador vinha errado). |

### Validação
- `tsc --noEmit` limpo no app e no `sponsor-admin`; `npm run build` do web OK.
- Pendente: rodar o SQL no Supabase, criar usuário admin e testar em runtime
  (emulador/dispositivo) — não validado em runtime ainda.

### Problemas operacionais encontrados (2026-08-22)
- **Vite não abre o navegador sozinho.** Adicionado `open: true` no
  `server` do `vite.config.ts`. Se não abrir, acesse manualmente
  `http://localhost:5173`.
- **Página em branco / `GET /` retorna 404.** Causa quase sempre: **dois
  processos `npm run dev`** (o do usuário + um do agente) disputando a 5173;
  o mais antigo fica quebrado e responde 404 para `/` e `/index.html`.
  Sintoma: `curl http://localhost:5173/` → 404; browser branco.
  Correção: matar os PIDs em 5173 (`taskkill /PID <pid> /F`) e subir **um**
  servidor limpo; confirmar `GET /` → 200 e `GET /index.html` → `<!doctype html>`.
  Dica: encerrar o servidor no PowerShell com `Ctrl+C` antes de abrir outro.
- **Criar usuário admin sem `service_role` no `.env`.** O `.env` do projeto só
  tem URL + anon key. Use o endpoint de **signup** com a anon key
  (header `apikey:`), que cria usuário e-mail/senha normal (não anônimo → RLS
  de escrita aceita). Ex.:
  `curl.exe -X POST "$URL/auth/v1/signup" -H "apikey: $ANON" -H "Content-Type: application/json" -d '{"email":"ifujaoapp@gmail.com","password":"Microsiga@9"}'`
  - Se retornar `email_address_invalid`: há regra **Authorized email domains**
    em Authentication → Providers → Email; use um domínio permitido ou limpe
    a regra. (No projeto, `admin@ifujao.com` foi rejeitado; `ifujaoapp@gmail.com` ok.)
  - `confirmation_sent_at` sem `email_confirmed_at`: e-mail não confirmado →
    desmarque "Confirm email" ou crie pelo painel com Auto Confirm.
- **`esbuild` bloqueado no install.** Se o `vite` falhar por postinstall do
  esbuild, rodar `npm install-scripts approve esbuild` no `sponsor-admin`.

## Atualizações (2026-08-23) — GitHub, deploy e UX dos patrocinadores

> Validado com `tsc --noEmit` (limpo) no app e no `sponsor-admin`; build do
> web OK. Exige **rebuild nativo** (`npx expo run:android`) para testar a UI.

### 1. Repositório GitHub + deploy do sponsor-admin (GitHub Pages)
- Criado repo `ifujaoapp/ifujao` (**público**) no GitHub. Autenticação via `gh`
  com token que tem `repo` + `workflow` + `read:org` — o `read:org` é exigido
  pelo próprio `gh` na validação do login (sem ele: `missing required scope
  'read:org'`). Token passado via pipe:
  `echo "TOKEN" | gh auth login --with-token`.
- Secrets do repo: `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` (setados via
  `gh secret set`, lidos do `.env` local — **sem expor valores**).
- GitHub Pages habilitado com `build_type=workflow`. O workflow
  `deploy-sponsor-admin.yml` publica o `sponsor-admin` em
  `https://ifujaoapp.github.io/ifujao/`. Push para `main` dispara o deploy.
- **Por que repo público:** GitHub Pages **não** está disponível para repo
  privado no plano atual. Os secrets são só URL + anon key (públicos por
  design); `service_role` e chave Gemini ficam nas Edge Functions do Supabase
  (fora do repo).
- Comandos úteis: `gh auth setup-git` (liga o Git ao token do `gh`),
  `gh repo edit ifujaoapp/ifujao --visibility public --accept-visibility-change-consequences`.

### 2. Usuário admin do patrocinador
- Criado em Authentication → Users: `fujaoapp@gmail.com` (confirmado). Login por
  e-mail/senha (NÃO anônimo) → a RLS `sponsors admin write`
  (`is_anonymous` distinto de true) libera a escrita.

### 3. Pin de patrocinador (mapa do app)
- Ícone: `★` → **🏪** → **🛍️** (sacola). O 🏪 desenha um letreiro "24h" em
  vários aparelhos, ficando estranho; 🛍️ é limpo e comunica "loja/parceiro".
- **Nome não corta mais**: rótulo do pin agora **quebra linha**
  (`white-space:normal; word-break:break-word`) em vez de `ellipsis`.
- **Legenda** no canto inferior direito do mapa: `🛍️ Patrocinador`.
- Ícone reduzido (círculo 48→**38px**); pulso laranja mantido (2.8s).

### 4. Pulso dos pins de patinha
- Efeito de pulso (anel expandindo) aplicado aos pets: **azul** (`#0A84FF`) no
  normal, **vermelho** (`#FF3B30`) no denunciado. Anel atrás do SVG
  (`z-index`) e `pointer-events:none`.
- Frequência reduzida: patas `1.8s→3s`, patrocinador `1.6s→2.8s`.

### 5. Janelinha de informações do patrocinador (modal no app)
- Ao tocar o pin, abre um **Modal** (não vai mais direto ao link) com: nome,
  endereço, **WhatsApp** (ícone verde oficial, abre `wa.me/<numero>` com DDI
  `55`), **Instagram** (ícone rosa) e **Facebook** (ícone azul) quando
  preenchidos, e **Abrir link** (ou "Ver no mapa" se não houver link).
- Botão de telefone mostra **só o ícone + o número** (rótulo "WhatsApp:"
  removido para não quebrar linha).
- Fluxo: `__renderSponsors` (WebView) passa `name/address/phone/instagram/
  facebook` no `postMessage`; `onMessage` repassa a `onSponsorPress`, que seta
  `sponsorInfo` e abre o modal.

### 6. Campos telefone/redes sociais (DB + admin)
- `supabase/sponsors.sql`: colunas `phone`, `instagram`, `facebook` (text),
  idempotentes (`add column if not exists`). **Reaplicar no Supabase** para
  criá-las — sem elas o app loga `column sponsors.phone does not exist` e
  nenhum pin aparece.
- `lib/sponsors.ts`: `SponsorPin` + `fetchSponsors` incluem os 3 campos.
- `sponsor-admin/src/types.ts` + `Admin.tsx`: formulário de cadastro ganha
  Telefone / Instagram / Facebook e os envia no insert/update.

### Arquivos alterados
| Arquivo | O que mudou |
|---|---|
| `app/(tabs)/index.tsx` | pin 🛍️ menor + nome quebra linha + legenda; pulso azul/vermelho nos pets; modal de info (WhatsApp/IG/FB/link) com ícones de marca; WebView passa phone/instagram/facebook. |
| `lib/sponsors.ts` | `SponsorPin` + fetch com `phone/instagram/facebook`. |
| `supabase/sponsors.sql` | colunas `phone/instagram/facebook` (idempotente). |
| `sponsor-admin/src/types.ts` | `Sponsor`/`SponsorInput` com `phone/instagram/facebook`. |
| `sponsor-admin/src/Admin.tsx` | campos e payload de Telefone/Instagram/Facebook. |

### Commits (2026-08-23)
- `bc52c5c` feat(sponsors): pin com icone de loja, nome quebra linha e modal de info; campos phone/instagram/facebook
- `6f5d47b` fix(sponsors): botao de telefone abre WhatsApp (wa.me)
- `d8af0d8` feat(sponsors): icones de marca WhatsApp/Instagram/Facebook no modal
- `a7b8456` fix(sponsors): remove rotulo 'WhatsApp' do botao; mostra so o icone e o numero
- (+ commit da legenda 🛍️ e deste STATUS.md — pendente)

### Pendências
- **Rebuild nativo** (`npx expo run:android`) para validar pin/modal no
  emulador/dispositivo.
- O admin de patrocinador **dentro do app** citado em sessões anteriores
  (`SponsorAdminModal` / `lib/sponsorAdmin`) **não existe no código atual** —
  só o admin web (`sponsor-admin`) cadastra patrocinadores. (Registro a
  confirmar/corrigir se necessário.)

## Atualizações (2026-08-23, tarde/noite) — logo, Storage, compressão e segurança

> `tsc --noEmit` limpo no app e no `sponsor-admin`; build do web OK.
> Requer **rebuild nativo** e **rerodar `supabase/sponsors.sql`** (bucket +
> coluna `logo` + policies).

### 1. Legenda e botões do modal
- **Legenda** do mapa atualizada para 🛍️ (igual ao pin; antes aparecia 🏪).
- Botões de **Instagram/Facebook** mostram o **@usuário/perfil** cadastrado
  (em vez de "Instagram"/"Facebook"); se for URL completa, extrai só o
  usuário. Fonte do @ reduzida para **13** (evitar quebra de linha).
- Botão de telefone: só ícone verde do WhatsApp + o número (sem rótulo).

### 2. Logo do patrocinador (arquivo real, não URL externa)
- Decisão: o `logo` deixou de ser uma URL externa (que sumia se o patrocinador
  removesse a imagem) e passou a ser **upload de arquivo** para o
  **Supabase Storage** (bucket `sponsor-logos`). O `logo` guarda a URL pública
  estável do Storage.
- `supabase/sponsors.sql`: coluna `logo text` + criação do bucket
  `sponsor-logos` (público, limite 2MB, MIME só imagem) + policies.
- `sponsor-admin/src/Admin.tsx`: campo "Logo" virou `<input type="file">` com
  prévia; no `save`, o arquivo sobe via `supabase.storage.from('sponsor-logos')
  .upload(...)` (path = id do patrocinador ou uuid) e o `logo` recebe
  `getPublicUrl`.
- `app/(tabs)/index.tsx`: modal exibe `<Image source={{ uri: logo }}>` no topo.

### 3. Compressão da imagem (economia de Storage)
- `sponsor-admin/src/Admin.tsx`: helper `compressImage()` usa **Canvas** para
  redimensionar o maior lado para **256px** e exportar **WebP** (qualidade
  0.8, com fallback JPEG). O arquivo que vai pro Storage já vai leve
  (~10–40KB). Sem dependência nova.

### 4. Ajuste de segurança do Storage (advisory "Clients can list all files")
- O bucket é **público**, então a imagem é servida via URL pública (o app só
  carrega a URL — não precisa de RLS para ler).
- Removida a policy de **SELECT** (`sponsor logos public read`) e a policy
  `for all` (que inclui SELECT) foi trocada por **3 policies separadas**
  (`insert` / `update` / `delete`) para o admin — nenhuma concede SELECT, então
  ninguém consegue `list()` via RLS.
- O aviso do Security Advisor **persistiu**: em bucket público o `list()` é
  permitido por *design* (não por policy). Como os logos são imagens de marca
  públicas (baixa sensibilidade), decidiu-se **Dismiss** o aviso — postura já
  está na configuração mais segura possível para bucket público. (Alternativa
  seria bucket privado + URL assinada, desnecessária aqui.)

### Arquivos alterados (complementar)
| Arquivo | O que mudou |
|---|---|
| `app/(tabs)/index.tsx` | legenda 🛍️; botões IG/FB mostram @usuário (fonte 13); modal exibe `logo` (Image). |
| `lib/sponsors.ts` | `SponsorPin` + fetch com `logo`. |
| `supabase/sponsors.sql` | coluna `logo`; bucket `sponsor-logos` + policies (insert/update/delete, sem SELECT). |
| `sponsor-admin/src/types.ts` | `Sponsor`/`SponsorInput` com `logo`. |
| `sponsor-admin/src/Admin.tsx` | upload de arquivo de logo (+ prévia) + `compressImage()` (Canvas/WebP). |

### Commits adicionais (2026-08-23)
- `dbb4765` docs(status): sessao 2026-08-23 + legenda com 🛍️
- `86a3002` feat(sponsors): botao mostra o @usuario do Instagram/Facebook
- `7b4d4d2` fix(sponsors): fonte menor (13) no @usuario
- `9c0c39d` feat(sponsors): campo logo (URL) no DB/admin e exibicao no modal
- `d444ffc` feat(sponsors): upload de arquivo de logo p/ Supabase Storage
- `3e7d9b5` feat(sponsors): comprime/redimensiona logo no browser (Canvas, WebP)
- `f4dd87d` security(sponsors): remove SELECT policy do bucket publico
- `ce30dbc` security(sponsors): restringe policy a insert/update/delete (sem SELECT) — **erro de sintaxe** (Postgres não aceita lista)
- `879594a` fix(sponsors): policies de Storage separadas (insert/update/delete) sem SELECT
- `status` (pendente de commit): esta seção

### Pendências
- **Reaplicar `supabase/sponsors.sql`** (cria bucket + coluna `logo` + policies)
  e **rebuild nativo** para validar o fluxo de logo no emulador/dispositivo.
- Dismiss do advisory de Storage confirmado (bucket público por design).

### Correções de sessão 2026-08-23 (embed-pets / RLS / busca IA / mapa)
Série de bugs descobertos e corrigidos após quebra reportada na busca por IA.

1. **RLS de `pets`/`pet_contacts` quebrava o upsert (anon).** Causa raiz:
   o campo `device_id` da `user_metadata` é **reservado pelo Gotrue** para
   usuários anônimos — ele o sobrescreve com um UUID próprio (de forma
   intermitente), então `current_device_id()` ora pegava nosso valor, ora o
   UUID, falhando a policy `owner_device_id = current_device_id()`.
   - App: `ensureSession` agora grava **`app_device_id`** (chave nossa) no
     sign-in anônimo, usa `getUser()` (servidor) em vez de `getSession()`
     (cache que mentia) e refaz o sign-in quando o valor não bate.
   - Banco (SQL Editor do Supabase — **não versionado aqui**):
     ```sql
     create or replace function public.current_device_id()
     returns text language sql stable security definer set search_path = public
     as $$ select raw_user_meta_data->>'app_device_id' from auth.users where id = auth.uid() $$;
     grant execute on function public.current_device_id() to anon, authenticated;
     ```
   - ⚠️ Se o banco for recriado, este SQL precisa ser reaplicado.

2. **Persistência local (op-sqlite) falhava:** `NOT NULL constraint failed:
   pets.id`. `toLocalPet` montava o `PetRecord` só do `payload` e não copiava
   `row.id` (chave primária). Agora usa `row.id` como autoridade.

3. **Busca por IA (`search-pets`) funciona com 3072 dims** (pgvector do
   Supabase aceita). O erro reportado de "3072 não aceito" era, na verdade, o
   RLS do item 1 (pets sem embedding porque o upsert falhava).

4. **Botão "Aa"** na barra lateral desliga/liga o rótulo de texto do
   patrocinador (oculto por padrão, para não poluir o mapa).

5. **Pin do patrocinador deslocado.** `iconAnchor` estava fixo em `[75,19]`
   enquanto o `iconSize` mudava com o "Aa" (sem rótulo = `38x38`, com rótulo =
   `150x96`). Agora o anchor acompanha: `[19,19]` (sem rótulo) / `[75,19]`
   (com rótulo). Também fixado `box-sizing: border-box` na `.sponsor-star`
   (a borda de 3px fazia o centro ficar ~3px errado).

#### Arquivos alterados
| Arquivo | O que mudou |
|---|---|
| `lib/supabase.ts` | `ensureSession` usa `app_device_id` + `getUser()`. |
| `lib/sync.ts` | `toLocalPet` copia `row.id`. |
| `app/(tabs)/index.tsx` | botão "Aa"; `iconAnchor` condicional; `box-sizing` na estrela. |
| `supabase/schema.sql` | `current_device_id()` lê `app_device_id` (espelha o SQL acima). |

#### Commits (2026-08-23, push em `origin/main`)
- `92dba83` feat(map): botao Aa desliga o texto do patrocinador (oculto por padrao)
- `e95855e` fix(auth): refaz sign-in anonimo quando device_id nao bate (RLS)
- `c0e1cde` fix(sync): toLocalPet usa row.id (corrige NOT NULL pets.id local)
- `b719e7f` fix(auth): usa app_device_id (device_id reservado da Gotrue)
- `48f9124` fix(map): iconAnchor do patrocinador acompanha o tamanho
  - `a873983` fix(map): box-sizing border-box na estrela (elimina 3px)

## Como limpar (ambiente de teste)

- **Reset manual (recomendado):** Config → Apps → StudyFlow → Limpar dados / Clear storage (ou reinstalar o app). O pull full parte do zero e traz só o que está no servidor.
- **Reconciliação automática (IMPLEMENTADA em `lib/sync.ts`):** no `runSync`, após um FULL pull bem-sucedido (`doFull && pullOk`), pets locais que não existem no servidor **e não têm mudança pendente** (`!dirty` e fora de `failedIds`) são removidos do `merged` → `savePets` (DELETE + INSERT) apaga o órfão do SQLite. Assim a tela espelha o servidor sem reset manual. Preserva pets `dirty`/`failedIds` (ainda não subiram). Só roda no full pull — o incremental (delta) não cataloga tudo e não reconcilia.

## Atualizações (2026-08-23, fim) — remoção da legenda "🛍️ Patrocinador"

- A legenda do canto inferior direito (`<div id="legend">` no HTML do `MapLeaflet`, `app/(tabs)/index.tsx`) era **estática e incondicional** — aparecia para todo mundo, inclusive o finder. Não era botão, só rótulo do pin.
- **Removida de vez** (decisão do usuário). O pin 🛍️ e o modal de info (toque) continuam; o rótulo explicativo sumiu. O CSS `.map-legend` ficou órfão no `<style>` (inofensivo).
- Validação: `tsc --noEmit` limpo. Exige **rebuild nativo** (`npx expo run:android`) para validar em runtime.

## Atualizações (2026-08-23) — pulso no botão de patinha (FAB)

- Botão de patinha (FAB "reportar pet", `floatingButtonContainer`): adicionado anel pulsante igual aos pins do mapa — `Animated.loop` (1800ms) expande a escala `0.6→1.8` e some a opacidade `0.9→0`. Estilo `pawPulseRing` (`app/(tabs)/index.tsx`).
- Só renderiza quando `canReport` (não aparece no estado desabilitado). `useNativeDriver: true`.
- Validação: `tsc --noEmit` limpo. Exige **rebuild nativo** para validar.

## Atualizações (2026-08-23, fim) — busca por IA híbrida (imagem + espécie)

Sintoma reportado pelo usuário: ao buscar `cahorro` (ou `cachorro`/`cão`/`dog`),
a busca devolvia um **Gato** (similaridade ~0,33–0,35) e o app mentia "achou um
cachorro" — mesmo não havendo nenhum cachorro cadastrado.

### Causa raiz (comprovada com testes reais na função deployada)
A busca era **só-visual**: o `match_pets` ranqueia o pet cuja **foto** é mais
parecida com o **texto** da consulta. Como o embedding do pet é da foto e o da
consulta é do texto, palavras de animal ("cachorro") tiravam nota ~0,33 de uma
foto de gato — passando do piso absoluto (0,32) e devolvendo o gato como se
fosse a resposta. O piso sozinho não distingue "acerto" de "ruído de espécie
errada" porque as faixas se sobrepõem (ruído 0,26–0,27; acerto 0,33+; mas
espécie-errada-casando 0,33–0,35).

### Decisão (usuário): busca HÍBRIDA
Conferir também a **Espécie cadastrada** do pet. Se a consulta nomeia uma
espécie, só devolvemos pets **daquela** espécie; se não houver nenhum, devolve
vazio ("não tem"). Consultas que só descrevem aparência (sem espécie) continuam
usando só a imagem (com o piso 0,32).

### Implementação (`supabase/functions/search-pets/index.ts`)
- Helpers: `stripDiacritics` (normaliza PT/EN, tira acento), `levenshtein`
  (tolera digitação: `cahorro`≈`cachorro` = 1), `SPECIES_SYNONYMS`
  (PT + EN + variantes, espelhando as chaves de `SPECIES_BREEDS` do app),
  `SYN_TO_CANON`, `petCanon(payload)` e `detectImpliedSpecies(query)`.
- Fluxo: `detectImpliedSpecies` descobre a espécie implícita na consulta (match
  exato / substring de sinônimo ≥4 chars / Levenshtein ≤2 em tokens ≥4).
  - Se há espécie implícita: `pool` = pets cujo `species` (canônico) bate OU
    cuja `breed` casa com a consulta. `pool` vazio → `{results:[]}` (é o "não
    tem" para `cachorro` sem cachorro no banco). Pula o piso absoluto (o rótulo
    é a autoridade).
  - Se não há espécie implícita: mantém o caminho visual com `MIN_BEST_SIMILARITY=0.32`.
- Limiar relativo (`REL_MARGIN=0.06`) mantido para agrupar o cluster certo.

### Evidência (função redeployada, banco só com gatos)
| Consulta | Resultado |
|---|---|
| `cahorro` / `cachorro` / `cão` / `cao` / `dog` | **vazio** (não tem) ✓ |
| `furacao` (perto de furão, mas ausente) | **vazio** ✓ |
| `zxqwzk` | **vazio** ✓ |
| `gato` | 2 Gatos ✓ |
| `gato cinza com manchas brancas` | 2 Gatos ✓ |
| `gato preto` | Gato (sim 0,44) ✓ |
| `navio` (palavra sem animal) | Gato (sim 0,33) — caso conhecido, ver abaixo |

### Deploy
`supabase functions deploy search-pets` (só a função; sem SQL/RLS novo, sem
rebuild do app). **Validação:** testes acima via chamada HTTP real à função.

### Pendência conhecida (deixada assim por escolha do usuário)
Palavras que **não nomeiam animal** (ex.: `navio`, sim 0,33) ainda podem
devolver o pet mais próximo, pois caem no caminho visual e passam do piso 0,32.
Para eliminar, subir `MIN_BEST_SIMILARITY` para ~0,34 — o trade-off é que
buscas genéricas de gato podem mostrar 1 a menos nos empates (ex.: "gato cinza"
segundo resultado 0,329 seria cortado). Não alterado a pedido.
