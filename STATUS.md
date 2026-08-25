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

> Atualizado em 2026-08-24.

### Concluído (últimas sessões)
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
   24×24), e o modal de descrição rolando. O admin web (GitHub Pages) reconstrói
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

## Índice do histórico

O histórico completo das sessões (PII/RLS/Edge Function, mapa/GPS, busca por IA,
patrocinadores, deep link, etc.) está em **`STATUS.historico.md`**.
