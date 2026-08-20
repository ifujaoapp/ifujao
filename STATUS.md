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
