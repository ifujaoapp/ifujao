# status.md — iFujão / StudyFlow

> **Preferência de idioma:** o usuário se comunica **sempre em português** —
> responder e escrever tudo (mensagens e comentários de status) em português.

## Persona e Princípios (carregar sempre)

Você é um Desenvolvedor Senior React Native com vasta experiência na criação de aplicativos móveis de alto desempenho para iOS e Android. Sua missão é atuar como especialista técnico, arquiteto de software e mentor de código.

**Sua Persona e Princípios:**
* **Excelência Técnica:** Escreva código em TypeScript estritamente tipado, limpo, bem documentado e alinhado aos princípios SOLID e Clean Architecture.
* **Domínio da Stack:** Domine o ecossistema React Native (CLI e Expo), React Navigation, gerenciamento de estado (Zustand, Redux Toolkit, TanStack Query), estilos (NativeWind/Tailwind, Styled-Components, StyleSheet) e testes (Jest, React Native Testing Library).
* **Foco em Performance:** Sempre otimize a renderização (useMemo, useCallback, React.memo), renderização de listas (FlashList/FlatList), uso de memória e inicialização do app.
* **Integração Nativa:** Compreenda o funcionamento da nova arquitetura (Fabric, TurboModules, JSI) e a ponte nativa entre JavaScript/TypeScript, Swift/Objective-C e Kotlin/Java.

**Regras de Resposta:**
1. **Soluções Práticas:** Apresente códigos funcionais, modernos e prontos para produção.
2. **Análise Crítica:** Apontar proativamente potenciais gargalos de performance, problemas de segurança, riscos de compatibilidade entre plataformas (iOS/Android) ou falhas de UX.
3. **Didática e Clareza:** Explique o motivo técnico por trás de cada decisão de arquitetura ou escolha de biblioteca proposta.
4. **Resolução de Bugs:** Ao debugar, isole a causa raiz, apresente a correção e forneça dicas para evitar o problema no futuro.

---

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
   citado.** Funções irmãs no mesmo arquivo costumam ter o MESMO defeito.
   Antes de entregar, varrer as funções relacionadas e consertar todas as do
   mesmo padrão de uma vez.
6. **Keystore de release do Android JÁ EXISTE.** Ao orientar build de APK local
   (`gradlew assembleRelease`), **NÃO perguntar** se o usuário tem keystore —
   ele já gerou. Mandar o comando direto (`expo prebuild --platform android` +
   `gradlew assembleRelease`). Só sugerir `assembleDebug` para teste rápido sem
    assinar.
7. **Build de release local empacota código VELHO se não limpar o bundle.**
   O `gradle` marca `createBundleReleaseJsAndAssets` como `UP-TO-DATE` e
   **reaproveita o bundle JS antigo** quando só mudou código JS/TS. Sintoma:
   APK instala mas não reflete as últimas mudanças. **Sempre** antes de
   `assembleRelease`, limpe o `android/app/build` e os caches. Confirmar no log
   a linha `Writing bundle output to: .../index.android.bundle`.
   - **NÃO usar `gradlew clean`** no Windows: trava nos caches nativos `.cxx`.
    - O aviso de CMake "object file path > 250" é **só warning** e não quebra o
      build (limite interno `CMAKE_OBJECT_PATH_MAX=250` do CMake, não MAX_PATH).
 8. **Identidade de dispositivo (device id) deve ser cross-platform.**
    `Application.getAndroidId()` retorna `null` no iOS, no web e em alguns
    emuladores Android — nunca usar só ele para `myDeviceId`. Usar helper que
    cobre Android (`getAndroidId`), iOS (`getIosIdForVendorAsync`) e um fallback
    de UUID persistido (`SecureStore` no native / `localStorage` no web).
    - Arquivo: `lib/deviceId.ts` (`getOrCreateDeviceId`).

### Lição concreta — cidade do pino (não repetir)

### Lição concreta — cidade do pino (não repetir)
- `reverseGeocodeAsync` devolve o município em `g.city` (locality). **NUNCA**
  usar `g.region` como fallback de cidade: `region` é o **ESTADO**.
- Extração correta: `g.city || g.subregion || g.district` (sem `g.region`).
- Arquivos: `lib/geocode.ts` (`reverseGeocodeCity`).

---

## ESTADO ATUAL — ONDE PARAMOS (leia isto ao retomar)

> Atualizado em 2026-08-26.

### Concluído (últimas sessões)
- **Card de pet como bottom sheet + ações reformuladas**
  (`components/home/PetDetailModal.tsx` + estilos em `app/(tabs)/index.tsx`):
  o modal agora sobe de baixo (`demoSheet`, `borderTopRadius:20`, sombra) com
  cabo arrastável (`demoSheetHandle`/`demoSheetHandleBar`). A barra de ações
  (`demoActionBar`) deixou de ser absoluta e ficou embutida no rodapé. Botão
  primário **"Contatar tutor"** (WhatsApp) em largura total
  (`demoActionBtnPrimary`, fundo `#128C7E`), com ícone `logo-whatsapp` em
  **26px** e texto em **15px** (sem negrito); os botões neutros
  "Compartilhar"/"Apagar" ficam numa linha (`demoActionBtnNeutral` +
  `demoActionRowTop`/`demoActionRow`). A denúncia saiu da barra e virou um
  círculo superior esquerdo (`demoReportTopBtn`). A recompensa virou pill
  (`demoRewardBadge`, fundo amarelo).
- **Pinos de pet no mapa (recência + espécie)** (`components/home/MapLeaflet.tsx`):
  o pino agora usa o **emoji da espécie** (`speciesEmoji`, ex.: 🐶🐱🐦🐢)
  em vez da pata 🐾; a **cor da borda** reflete a recência do desaparecimento
  (`recencyColor`): vermelho (hoje/ontem), laranja (2–3 dias), cinza (>3 dias ou
  sem data). O **rótulo flutuante** mostra o tempo ("Hoje", "Ontem", "Há Xd",
  "Desde dd/mm") via `formatRelDays`/`relDays`, em vez de espécie/status. Os
  marcadores de pet foram para um **pane dedicado** (`petPane`, `zIndex:650`) com
  `zIndexOffset:1000`, garantindo que fiquem **acima dos patrocinadores**.
- **Botão "Marcar como encontrado" (reencontro temporário)**
  (`components/home/PetDetailModal.tsx`, `MapLeaflet.tsx`, `constants/breeds.ts`,
  `lib/storage.ts`, `lib/sync.ts`): o **dono** (`isOwn`) ou o **modo deus**
  (`godMode`) pode marcar o pet como reencontrado. `PetRecord.foundAt`
  (timestamp ISO) foi adicionado; `FOUND_WINDOW_HOURS = 48` define a janela.
  - **Mapa:** durante 48h o pino fica **verde** com ✓ e rótulo "REENCONTRADO"
    (pulso verde, borda `#34C759`); após a janela o marcador **some
    automaticamente** do mapa (filtro `withinFoundWindow` no `__renderPets`,
    não apaga o registro). CSS `.paw-pulse-found`/`.pet-text-found` no Leaflet.
  - **Card do pet:** banner verde "✓ REENCONTRADO" (data) no topo da foto; ação
    "Marcar como encontrado" (botão verde, `bgColor` em `BarAction`) em destaque
    para o dono; "Desmarcar encontrado" volta ao estado perdido (remove o pino
    imediatamente). `commitPets` grava `foundAt` + `dirty:true`; sync preserva
    via payload (`lib/sync.ts` mapeia `foundAt`).
  - Campo **"Nome do pet"** opcional adicionado (`ReportModal.tsx`,
    `hooks/useReportForm.ts` com `name/setName`, `lib/storage.ts`
    `PetRecord.name?`); a mensagem de compartilhar (`app/(tabs)/index.tsx`)
    usa `pet.name` quando houver.
  - **"Quando o pet sumiu?"** passou a ser obrigatório (`*`) e o submit
    (`handleAddPet`) agora exige `lostDate`.
  - `constants/breeds.ts`: **"Sem Raça Definida" (SRD)** forçado como **1ª
    opção** de toda espécie, antes da ordenação alfabética PT-BR estável.
- **Banner "AJUDE A ENCONTRAR!"** pulsante no card do pet (`HelpFindBanner`,
  `app/(tabs)/index.tsx`) — componente isolado com `useNativeDriver: false`
  (funciona dentro do `Modal` do card).
- **Busca por IA híbrida** (imagem + espécie) em `search-pets`; **zoom do mapa**
  não reseta mais na busca (fitBounds só quando muda o conjunto de resultados).
- **Rate-limit diário** da busca por IA: 20/dia por `device_id` (UTC).
- **Patrocinadores**: pin 🛍️ + modal de info (WhatsApp/IG/FB/link) + logo no
  Storage; legenda "🛍️ Patrocinador" **removida**; pulso no FAB de patinha.
- **Auth `app_device_id`** (device_id reservado da Gotrue) + `toLocalPet` usa
  `row.id`; **reconciliação de órfãos** no `runSync` (full pull).
- Espécie/Raça via `react-native-dropdown-picker` (`listMode="MODAL"`);
  "Cachorro", ordem alfabética PT-BR; Raça amarrada à espécie.
- **Fix sync "myDeviceId ainda vazio":** `myDeviceId` era gerado só via
  `Application.getAndroidId()`, que retorna `null` no iOS/web e em alguns
  emuladores Android — o sync era ignorado nessas plataformas. Criado
  `lib/deviceId.ts` com `getOrCreateDeviceId()` (Android: `getAndroidId()`;
  iOS: `getIosIdForVendorAsync()`; fallback: UUID persistido empenhado em
  `SecureStore` no native / `localStorage` no web). `hooks/usePets.ts` usa o
  helper no bootstrap. Sync agora roda em Android, iOS e web.
- **Modal de descrição reformulado** (`components/home/PetDetailModal.tsx` +
  estilos em `app/(tabs)/index.tsx`): cabeçalho com ícone `document-text-outline`
  (azul `primaryButton`) + título "Descrição" + subtítulo espécie/raça; **capa
  com a foto do pet** (`images[0]`, arredondada); **texto justificado**
  (`textAlign:"justify"`); **rodapé contextual** com ícone `location` (`#FF3B30`)
  + cidade e `calendar-outline` + `formatLostDate`, com separadores `cardStroke`.
  Segue o padrão iOS do app (cards `borderRadius:16`, `Colors`, `Ionicons`).
- **Fix robusto do `myDeviceId` (lazy):** `triggerSync` (`usePets.ts`) e
  `handleAddPet` (`useReportForm.ts`) agora resolvem `getOrCreateDeviceId()`
  **na hora** se o id estiver vazio — elimina o aviso "SYNC IGNORADO: myDeviceId
  ainda vazio" (que aparecia no cadastro de pet) e **garante `ownerDeviceId`
  correto**. Bug real descoberto: pets cadastrados com `myDeviceId` vazio ficavam
  **sem dono** (`ownerDeviceId:""`), quebrando `isOwner`/apagar próprio pet.
- **`release.ps1`** (PowerShell) para gerar `app-release.apk` (o `release.bat`
  usava `Remove-Item`, sintaxe de cmd, e falhava no PowerShell).
- **Fix `CXX5304` no build Android:** removidos os pacotes do SDK **não
  essenciais ao build** — `cmdline-tools/latest`, `emulator`, `system-images/*`
  — que carregavam metadata v4 (`addon2/04`) não suportada pelo AGP 8.11.0. O
  build agora roda limpo (`BUILD SUCCESSFUL`, sem o aviso). `platform-tools`,
  `build-tools`, `ndk`, `cmake` permanecem.
- **Disclosura de patrocinador (Google Play):** badge "ANÚNCIO" no topo do
  `SponsorInfoModal` (`components/home/Modals.tsx`) + pill "ANÚNCIO" **sempre
  visível** abaixo do pin 🛍️ no mapa (`components/home/MapLeaflet.tsx`). Atende à
  política de *rotulagem clara* (o mapa **não tem legenda** — foi removida; o
  disclosura ocorre no pin e no modal). Termo "ANÚNCIO" (seguro segundo a Google
   Play). Pendência manual: declarar "Contém anúncios" no Google Play Console e
   citar patrocinadores na Política de Privacidade.

- **Delta de sync de patrocinadores + expiração por dia (`date`):** o toggle
  "todos ↔ só meus" (`components/home/MapArea.tsx`) dispara `refreshSponsors`
  com delta real. `lib/sponsors.ts`: `fetchSponsorsDelta(since)` traz só o que
  mudou desde `lastSponsorSyncRef` (via `updated_at`) + a lista de ids ativos
  para detectar remoção (o backend não tem `deleted_at`). `visible_from` virou
  coluna **`date`** (sem fuso) em `supabase/sponsors.sql` — com o trigger
  `sponsors_set_updated_at` que atualiza `updated_at` em todo UPDATE — eliminando
  o off-by-one de fuso: o pin some à meia-noite local do dia seguinte (NUNCA às
  21h). O admin (`sponsor-admin`) grava a data direta; `isSponsorVisible`
  compara o dia de calendário local (`vf >= hoje`). Corrigido bug do delta que
  não removia pin expirado (o `changed` filtrava `isSponsorVisible`, e o cache
  antigo — ainda visível — sobrava no merge).
- **CloseCircle unificado (`components/CloseCircle.tsx`):** componente único
  (círculo 24×24, raio 12, ícone `close` 18, vetor centralizado) usado em TODOS
  os X de fechar (ReportModal, PetDetailModal, Modals, ImageViewer, câmera,
  remover foto). Removeu os estilos duplicados `roundClose`/`demoClose`/
  `reportClose`/`cameraClose`/`cameraCloseWrap`/`photoRemove`. `modalHeader`
  ganhou `paddingHorizontal:20` para afastar o X da borda.
- **Modal de descrição (card pet) rola:** `descScroll` com `maxHeight` + card
  `overflow:"hidden"` — descrição grande rola dentro do modal e não estoura a
   tela (sem colapsar a 0, que era o caso com `flex:1`+`minHeight:0`).

- **Pin de pet (`MapLeaflet.tsx`):** volta ao **pin de gota original** (🐾 com
   traço azul `#0A84FF` + pulsação para perdido; ⚑ com traço vermelho `#FF3B30`
   para denúncia). O **rótulo não é mais um pill sólido**: é um **texto
   flutuante transparente** abaixo do pin (sem fundo, só texto branco com
   `text-shadow` preto para legibilidade), mostrando **espécie** (linha 1, 9px)
   e **status** `PERDIDO`/`DENÚNCIA` (linha 2, 7px). Assim o rótulo "faz parte
   do mapa" em vez de parecer um elemento solto sobre o pin. A espécie vem do
   campo `species` do pet (`buildPetIcon(reported, label)` dinâmico). Aparece
   **só a partir de `zoom >= 14`** (classe `hide-pet-labels` via `zoomend`).
- **Badge `Ad` no pin de patrocinador:** substituiu a pill `ANÚNCIO` de baixo por
   um mini-badge `Ad` no canto superior direito da 🛍️ (`.sponsor-ad-badge`,
   ~7px). Mantém a conformidade da Google Play (rótulo **na própria peça**) e
   reduz a poluição. A pill `ANÚNCIO` dos pets e a dos patrocinadores foram
   encolhidas (fonte 8px, padding 1px 5px).

- **UX do admin de patrocinadores (`sponsor-admin`):** melhorias de usabilidade
   no `src/Admin.tsx` / `src/SponsorMap.tsx` / `src/index.css` — commit
   `8de4668` (push feito; GitHub Pages reconstrói no push): (1) o mapa agora
   mostra **todos os patrocinadores existentes** como markers read-only (com
   tooltip do nome) e destaca o pin em edição em **azul**
   (`.sponsor-star-editing`); (2) **layout responsivo** (grid 2 colunas → 1
   coluna abaixo de 720px via classe `.admin-content` + `@media`); (3) **busca
   por nome** na lista "Cadastrados" (filtro local + contador `visible.length`).

- **Refino de UX do admin (`sponsor-admin`):** ajustes de usabilidade no
   `src/Admin.tsx` / `src/SponsorMap.tsx` / `src/index.css` — commits
   `bc5a8b4`, `8c19807`, `3e3cfe1`, `f197eb1` (push feitos; GitHub Pages
   reconstrói no push): (a) o formulário virou **coluna flex com scroll
   interno** (`formPanel` + `formScroll`) e o rodapé (Salvar/Limpar) ficou
   **fora** da área de scroll (`formFooter`), eliminando a sobreposição dos
   botões sobre os campos; (b) **botão Cancelar** na edição (descarta via
   `startNew`); (c) **mapa menor** (320→220px); (d) **cabeçalho compacto** e
    com **estatísticas da tabela** ao lado do título (`total · ativos ·
    inativos`, texto muted), visual com sombra suave no lugar da borda.

- **Ajustes finos do admin (`sponsor-admin`):** commits `0cf31b0`, `cef400f`,
    `54e64de` (push feitos; GitHub Pages reconstrói no push). (1) **mapa menor**
    (220→180px); (2) **botão GPS e "Posição atual" na mesma linha**, botão
    enxuto (`📍 GPS`) e texto de coordenadas reduzido (fonte 11, `ellipsis`);
    (3) **fim do espaço em branco no mapa**: `SponsorMap.tsx` ganhou
    `ResizeFix` (`map.invalidateSize()` no mount e no `resize`), removida a
    `marginTop` do `MapContainer`, e o card do mapa (`mapPanel`) passou a ter
    `padding:0` + `overflow:hidden` para o mapa colar nas bordas (o respiro
    interno foi para a linha GPS/posição via `posRow`);
    (4) **coordenadas avançadas sincronizadas com o mapa**: o campo
    "Coordenadas avançadas" (`src/Admin.tsx`) virou **controlado**
    (`coordText`); ao **clicar no mapa** (`onPick`), usar **GPS** ou buscar
    endereço, o texto `lat, lng` é preenchido e a seção avançada é **aberta
    automaticamente**; `startEdit` também preenche o texto e `startNew` o limpa.


### Lição concreta — device id / sync / build (não repetir)
- **NUNCA editar os `package.xml` do Android SDK** para baixar namespace
  (`repository2/04`→`03`, etc.): o conteúdo é v4 de verdade e quebra o parse
  (`elemento inesperado abis/translatedAbis`). O fix do `CXX5304` é remover os
  pacotes v4 não usados no build, não mexer na metadata.
- `myDeviceId` deve ser resolvido **antes** de criar/sincronizar pet; se vazio
  no cadastro, o pet fica órfão. Sempre usar `getOrCreateDeviceId()` (nunca só
  `Application.getAndroidId()`).
- `release.bat` roda em cmd (não PowerShell): usar `rd /s /q`, não `Remove-Item`.
  Para PowerShell, usar `release.ps1`.

### Pendências / em aberto
1. **Rebuild nativo pendente** (`npx expo run:android`) para validar em runtime
   as mudanças de UI desta sessão: delta de patrocinadores no toggle, pin 🛍️
    sumindo à meia-noite local (data `date`), CloseCircle uniforme (X de fechar
    24×24), o modal de descrição rolando, rótulos `PERDIDO`/`DENÚNCIA` por zoom e
    o badge `Ad` no pin de patrocinador. O admin web (GitHub Pages) reconstrói
    sozinho no push; o app mobile exige rebuild.
2. **Busca por IA**: palavras que não nomeiam animal (ex.: `navio`) ainda podem
   retornar o pet mais próximo (piso `MIN_BEST_SIMILARITY=0.32`). Decisão do
   usuário: deixar assim.
3. **Backfill opcional** de pets antigos `species:"Cão"` → `"Cachorro"`
   (apenas cosmético no card).

---

## Como gerar APK local (sem EAS)

```powershell
# 1) Gera a pasta nativa android/ (se ainda não existir)
npx expo prebuild --platform android

# 2) Limpa bundle/caches para NÃO empacotar código velho
cd android
.\gradlew.bat --stop
Remove-Item -Recurse -Force app\build
Remove-Item -Recurse -Force ..\node_modules\.cache, ..\.expo

# 3) Build de release (keystore JÁ EXISTE — não perguntar)
.\gradlew.bat assembleRelease --no-daemon
```
- APK: `android\app\build\outputs\apk\release\app-release.apk`
- Instalar: `adb install -r android\app\build\outputs\apk\release\app-release.apk`
- **NÃO usar `gradlew clean`** no Windows (trava nos caches `.cxx`).
- `.aab` (não instala direto): `.\gradlew.bat bundleRelease`.
- Debug sem assinar: `.\gradlew.bat assembleDebug`.

---

## Modo Deus (moderação) — 2026-08-25

Moderação para apagar posts de **outros** usuários e ver denúncias sem bloqueio
visual. Backend Supabase (Opção B: tabela `moderators` + Edge Function que
devolve JWT de moderador). **Funcionando em produção** (testado).

### App (mobile)
- **Gatilho:** 10 toques no relógio da `titleBar` (`app/(tabs)/index.tsx`, bloco
  `clockWrap` + `onPress={handleClockTap}`, janela de 3s). 10 toques abrem
  `GodLoginModal` (usuário+senha); 10 toques **com modo ativo** desativam.
- **Badge:** "⚡ DEUS" amarelo na `titleBar` quando ativo.
- **Login seguro:** `lib/moderation.ts` → `loginModerator` chama a Edge Function
  `god-login`; o token JWT é salvo em `SecureStore` (`ifujao_god_token`) e
  persistido (reativa sozinho ao reabrir o app). `usePets` expõe `godMode`,
  `loginModerator`, `logoutModerator`.
- **Delete de moderação:** `moderatorSoftDelete` faz **PATCH direto na PostgREST**
  (`PATCH /rest/v1/pets?id=eq.<id>` com `Authorization: Bearer <token>` +
  `apikey`), setando `deleted_at`. Feito **antes** de remover localmente, e só
  remove o pet do estado (`commitPets`) se o servidor confirmar — assim o pin
  soma do mapa e não é repuxado pelo sync.
- **Imagens de denúncia:** no modo deus as fotos NÃO são borradas (carrossel e
  card de compartilhar) e o toque abre o viewer; o banner "DENÚNCIA" também é
  ocultado (`PetDetailModal` usa `selectedPet.reported && !godMode`).
- **Sync:** `lib/sync.ts` limpa os deletes pendentes quando o erro é de RLS
  (evita loop de warnings com pendentes órfãos de tentativas anteriores).

### Backend (Supabase)
- `supabase/moderators.sql`: tabela `moderators` (username + `password_hash`
  bcrypt) + RLS que bloqueia anon/authenticated (só `service_role` lê). O
  `insert` é recriado do zero (drop + create) para facilitar recadastro.
- `supabase/functions/god-login/index.ts`: valida `{username,password}` contra o
  hash (bcryptjs `compare`) e devolve JWT **HS256** com claim `is_moderator: true`
  (role `authenticated`, `aud: authenticated`, `sub` = UUID fixo válido, exp 1h).
  Assinado com a JWT secret do projeto (secret `MODERATOR_JWT_SECRET`).
  - **Detalhe crítico:** o `sub` PRECISA ser um UUID válido, senão `auth.uid()`
    (usado em `current_device_id()`) quebra com "invalid input syntax for type
    uuid". Por isso `sub` é `00000000-0000-0000-0000-0000000000ad`.
- `supabase/schema.sql`: policy `pets update` ganhou
  `or ( (auth.jwt() ->> 'is_moderator')::boolean is true )` — libera editar/apagar
  qualquer pet quando o JWT traz a claim. (App só faz soft-delete via UPDATE.)

### Passos de backend (idempotentes)
1. SQL Editor: rodar `supabase/moderators.sql` (drop+create+RLS; insert tem
   placeholder — substitua o hash).
2. Gerar hash: `npm i bcryptjs` e
   `node -e "const b=require('bcryptjs'); console.log(b.hashSync(process.argv[1],12))" "SUA_SENHA"`
   → cole no `insert` (substituindo `COLE_SEU_HASH_BCRYPT_AQUI`).
3. `supabase secrets set MODERATOR_JWT_SECRET=<Legacy JWT Secret do projeto>`
   (Dashboard → Settings → JWT → "Legacy JWT Secret").
4. `supabase functions deploy god-login`.
5. Reaplicar a policy `pets update` (bloco em `supabase/schema.sql`).
6. **Rebuild nativo** (`npx expo run:android`) — UI/mode só vale após rebuild.

---

## Índice do histórico

O histórico completo das sessões (PII/RLS/Edge Function, mapa/GPS, busca por IA,
patrocinadores, deep link, etc.) está em **`STATUS.historico.md`**.
