# STATUS — Projeto iFujão (StudyFlow)

Última atualização: 2026-08-17 (noite).
Branch: `master` (sem push para o GitHub).

## Estado atual
- `tsc --noEmit` passa sem erros.
- **Development Build** instalado no Galaxy S23 (SM_S911B) via `npx expo run:android` (BUILD SUCCESSFUL).
  - Rebuild feito com **OpenJDK 17** (`C:\Program Files\Microsoft\jdk-17.0.20.8-hotspot`); `JAVA_HOME` aponta para ele.
  - `android/local.properties` recriado apontando para o SDK Android.
  - Integração do viewer finalizada (`expo-media-library` + `expo-sharing` nativos embutidos no APK).
- App Lock (biometria do celular) implementado e funcional via `expo-local-authentication`.
- `axios` instalado para futura integração com backend.
- `expo-doctor`: 18/18 checks passed.
- Modais de alerta com ícones vetoriais (`src/components/AppAlert.tsx`) — corrigido para seguir o tema do app (não o do sistema).
- Campo "Quando o pet sumiu?" (opcional) com calendário próprio em JS (`src/components/DatePickerCalendar.tsx`) — sem libs nativas.
- Action sheet "Adicionar foto" com safe area (`insets.bottom`) para não ser cortado pela navigation bar.
- Card do pet: botão "Ver descrição" abre modal próprio padronizado; descrição longa rola no modal.
- Viewer de imagens próprio (`src/components/ImageViewerModal.tsx`) — integração concluída (`tsc` ✅, `expo-doctor` 18/18).
- **Carrossel de fotos do card** (`ImageCarousel`, `app/(tabs)/index.tsx`): agora é `ScrollView` horizontal com
  `pagingEnabled` (swipe por touch entre fotos); setas ◀▶ e contador `n/total` mantidos; toque abre o viewer.
- **Autoria por Device ID** (substitui comparação só por telefone): usa `Application.getAndroidId()`
  (`expo-application`, já instalado) com fallback de UUID em `SecureStore` (`ifujao_device_id`). Pet ganha
  `ownerDeviceId` (ao criar) e `reporterDeviceId` (ao denunciar). `isOwner`/`isReporter` comparam device ID
  primeiro e caem no telefone normalizado para pets antigos (sem `ownerDeviceId`). Apagar / apagar denúncia
  só o próprio dispositivo consegue.
- Contato no reportar: campo em branco na **primeira** vez (SecureStore vazio nesta instalação); após publicar,
  o número é salvo e auto-preenche. Reinstalar o app apaga o SecureStore (sem backend).

## Decisões importantes e limitações (RN/Expo nesta versão)

### Compartilhamento (decisão final 2026-08-15)
- Share do pet = **texto com link clicável da loja** via `Share.share({ message })` (iOS + Android).
  Mensagem: `🐾 Ajude a encontrar este pet perdido em <cidade>!\nBaixe o iFujão e veja mais: <SHARE_BASE_URL>`.
- `SHARE_BASE_URL` = `https://play.google.com/store/apps/details?id=br.com.petz`.
- **Limitação técnica**: `Share.share({ url, message })` NÃO anexa arquivo — no `ShareModule.kt` (RN new-arch)
  o `url` é ignorado (só `EXTRA_TEXT`). `Sharing.shareAsync` (expo-sharing) manda SÓ o arquivo (sem texto).
  → Não dá pra combinar imagem + link clicável numa mesma mensagem do WhatsApp com as libs atuais.
- `react-native-share` foi testado e NÃO funcionou (imagem não anexava / caía no fallback de texto no S23);
  foi REMOVIDO (`npm uninstall react-native-share`). O APK antigo ainda o contém, mas o JS não o importa.
- Deep link `ifujao://pet/<id>` (`app/pet/[id].tsx` + `getPetById` em `lib/storage.ts`, registrado em
  `app/_layout.tsx`) está **sem uso**: o WhatsApp não linka scheme custom e os pets são locais (sem backend).

### Arquitetura de persistência (estratégia híbrida) — 2026-08-13
- **Keychain/Keystore (`expo-secure-store`)**: guarda SÓ a chave de criptografia do banco (`ifujao_db_key`, 32 bytes hex), gerada no primeiro acesso.
- **SQLite criptografado (`@op-engineering/op-sqlite` + SQLCipher)**: banco `ifujao.sqlite` aberto com `encryptionKey` do SecureStore. Tabela `pets(id TEXT PK, data TEXT)`; cada pet é um JSON. Plugin em `app.json`: `["op-sqlite", { "sqlcipher": true }]`.
- **File System (`expo-file-system` v19, API nova `Paths/File/Directory`)**: fotos copiadas de `CachePhoto`/ImageManipulator para `Paths.document/pet_photos/` em `persistPhotos`. Só o caminho (`file://...`) é salvo no SQLite. Fotos de pets removidos são apagadas (`clearPhotos`).
- Módulo central: `lib/storage.ts` (loadPets/savePets/persistPhotos/clearPhotos). Integrado em `app/(tabs)/index.tsx` via `commitPets`.
- **IMPORTANTE — Expo Go não funciona** (op-sqlite é nativo). App exige **Development Build** (`expo-dev-client`): `npx expo run:android` ou EAS dev build.

### Aprendizados de build (Windows, sem crédito EAS)
- `JAVA_HOME` DEVE ser OpenJDK 17 / JBR do Android Studio, **nunca JDK 24** (quebra NDK/CMake).
- `android/local.properties` deve apontar para o SDK Android; `ANDROID_HOME`/`ANDROID_SDK_ROOT` definidos (salvos como var de usuário).
- `expo-local-authentication` precisa ser `17.0.8` (SDK 54) — versões 16.x/57.x quebram.
- `expo-notifications` (`0.14.x`) puxa libs legadas incompatíveis → REMOVIDO; instalar só na hora do backend.
- `metro.config.js` força `react-native` primeiro em `resolver.conditionNames` para o op-sqlite não cair no entry Node (`better-sqlite3`).

## Histórico de sessões

### 2026-08-15 (tarde) — Viewer de imagens + rebuild + calendário
- **Viewer próprio** (`src/components/ImageViewerModal.tsx`) em substituição ao `react-native-image-viewing`
  (que deu erro de `require.context` no Metro e warning de SafeAreaView). Fullscreen com: `closeBtn` (X grande,
  hitSlop), `titleBar` (espécie/raça + contador n/total), `imageArea` (`ScrollView` zoom nativo `maximumZoomScale=4`),
  `navBtn` ◀▶, `actionBar` com "Salvar" (MediaLibrary) e "Compartilhar" (expo-sharing + cópia p/ cache).
- Integrado em `app/(tabs)/index.tsx`: estados `viewerImages`/`viewerIndex`/`viewerVisible`, `openInViewer(images, index)`,
  `<ImageViewerModal>` no lugar do `<ImageViewer>` antigo, `title` = espécie/raça do `selectedPet`.
- Cópia p/ share ajustada para a nova API do `expo-file-system` v19 (`new FSFile(Paths.cache, ...)` + `src.copy(dest)`).
- **Rebuild** com OpenJDK 17: `npx expo prebuild --clean --platform android` + `./gradlew assembleDebug --no-daemon`
  → BUILD SUCCESSFUL. Resolvidos locks de build cache do `expo-modules-autolinking` (reinstall forçado).
  APK `app-debug.apk` instalado via `adb install -r`.
- **Bolinha do dia** no `DatePickerCalendar.tsx`: número e círculo num `dayBubble` 34×34 com
  `alignItems/justifyContent:'center'`; círculo `View` absoluto 34×34 `borderRadius:17`, `Text` centralizado.
- Botão "Sair" no Android: RESOLVIDO (funciona corretamente).

### 2026-08-15 (manhã) — Compartilhamento, coordenada, GPS, alertas
- `sharePetCard` reescrito para **texto + link** (sem imagem). Decisão do usuário: "deixe pra lá esse negócio de imagem".
- `handleAddPet` exige `petLocation` (pino no mapa); coord inválida (fora de faixa ou `0,0`) → alerta e não grava.
  Corrigido bug que rejeitava latitudes negativas (hemisfério sul/Brasil). Contador flutuante ≠ pins resolvido na origem.
- `usarMeuGps` usa `userLocation` em cache primeiro; só chama `getCurrentPositionAsync` se nulo.
  Boot mantém `Accuracy.High`; mapa abre em `CITIES[0]` como fallback.
- `src/components/AppAlert.tsx` (`AppAlertProvider` + `showAlert`) com ícones `@expo/vector-icons` (Ionicons),
  cores semânticas e tema claro/escuro. Integrado em `app/_layout.tsx`; 23 `Alert.alert` substituídos por `showAlert`.

### 2026-08-14 — Mapa do modal, tela de bloqueio, dev build, Metro
- Mapa do modal "Reportar Pet Perdido" aumentado para 260px; Leaflet gerencia gestos (`touch-action: manipulation`);
  isolado do `ScrollView` do modal via `onStartShouldSetResponder`/`onMoveShouldSetResponder`.
- `src/components/AppLock.tsx` (`expo-local-authentication`, import dinâmico try/catch) integrado em `app/_layout.tsx`.
  Opcional: pula se não houver biometria. Movido de `app/components/` → `src/components/`.
- Geração da dev build local; `expo-notifications` instalado e REMOVIDO (libs legadas incompatíveis).
  Estratégia: remover → `npm ls` → `npx expo prebuild --clean` → `npx expo-doctor` → `npx expo run:android`.
- `server.bat` reescrito para matar portas 8081/8082 antes de subir o Metro.
- Removido `ThemeProvider` do `@react-navigation/native` (conflito de NavigationContainer/linking).
- Metro "Cannot pipe to a closed or destroyed stream": adicionado `"platforms": ["ios", "android"]` em `app.json` + limpeza de cache.

### 2026-08-13 (tarde) — Build local, runtime, UI
- `npx expo run:android` compila/instala APK (resolveu `SDK location not found` e JDK 24 → JBR/OpenJDK 17).
- `react-native-qr-svg` não tem default export (usa `QrCodeSvg` nomeado) e prop `frameSize` (não `size`) → crash `PathParser` NaN corrigido.
- `KeyboardAvoidingView` no Android: `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`.
- Logo no "Sobre"; texto da Política de Privacidade justificado (`textAlign:'justify'`).
- `metro.config.js` para op-sqlite não cair no entry Node.

### 2026-08-12 — Card do pet, menu circular, mapa via JS
- Menu circular de ações (`CircularActionButton` + botão "Ações") com animação "brotar" (`react-native-reanimated`).
- Lógica de botões para pet denunciado (Contato/Compartilhar cinza e sem ação; "Denunciar" oculto se já denunciante; "Apagar denúncia" dono/denunciante; "Apagar alerta" só dono).
- Botão fechar do modal "Reportar Pet Perdido" como X textual fora do `ScrollView`.
- Mapa Leaflet via WebView: HTML não depende de `pets`; markers atualizados via `injectJavaScript` (`window.__renderPets`) — posição GPS mantida ao denunciar/apagar.

### 2026-08-15 (noite) — Carrossel swipe, Device ID, build
- **Carrossel de fotos com swipe por touch**: `ImageCarousel` (`app/(tabs)/index.tsx`) reescrito para
  `ScrollView` horizontal `pagingEnabled` + `onMomentumScrollEnd` (atualiza contador). Setas ◀▶ e toque
  para abrir o viewer mantidos. (Revertido o `ScrollView` vertical que havia sido colocado por engano no card.)
- **Autoria por Device ID**: `expo-application` (`getAndroidId()`, já instalado) + fallback UUID em
  `SecureStore` (`ifujao_device_id`). Pet recebe `ownerDeviceId`/`reporterDeviceId`; helpers `isOwner`/
  `isReporter` comparam device ID (com fallback de telefone para pets antigos). `tsc --noEmit` ✅.
- **Gradle/Java/VS Code**: heap do Gradle `2GB→4GB` (`org.gradle.jvmargs`), `kotlin.daemon.jvmargs`,
  `org.gradle.caching=true`, `reactNativeArchitectures=arm64-v8a` e `typescript.tsserver.maxTsServerMemory=4096`.
- **Build lock**: `expo-dev-launcher-gradle-plugin` trava com "Unable to delete directory" por processo
  segurando `node_modules/.../build`. Resolução: matar `java.exe`/`gradle.exe` + limpar
  `~/.gradle/caches/build-cache-1` antes de rebuildar.
- **Dev build vs Release**: `npx expo run:android` gera o **dev client** (APK próprio, conecta no Metro —
  sem Expo Go); `npx expo run:android --variant release` gera APK **standalone** (JS embutido). Contato no
  reportar abre em branco na 1ª vez (SecureStore vazio) e auto-preenche após o 1º alerta.

### 2026-08-16 (manhã) — Release p/ cliente, erro de conexão, Metro leve
- **APK release standalone** gerado para demonstração a cliente: `android/app/build/outputs/apk/release/app-release.apk`
  (BUILD SUCCESSFUL). Roda 100% no celular sem Metro/PC (JS embutido); basta sideload no Android do cliente.
- **Erro de conexão no dev client** (`java.net.SocketTimeoutException` / okhttp3 ao abrir o app):
  - Causa: Metro **não estava rodando** + URL cached apontando pro IP `10.102.234.34` (único IPv4 do PC, sem
    `192.168.x.x` — adaptador/VPN), que o celular não alcança. Timeout (não "refused") indica Firewall ou rede.
  - Correção aplicada: subir Metro (`server.bat`), criar regra de Firewall de entrada TCP 8081 (exige admin;
    com AV desligado), e opção de túnel USB `adb reverse tcp:8081 tcp:8081` (celular usa `http://localhost:8081`).
  - Para HTTP funcionar: celular na **mesma Wi-Fi** do PC e Firewall liberando 8081.
- **Metro consumia CPU alto** (sobe ~8 jest-workers). Ajustes:
  - `metro.config.js`: `config.maxWorkers = 2` (caminho confiável; `METRO_WORKERS` env não foi respeitado).
  - `server.bat`: removido `-c` (evita pico de rebuild de cache) — workers caíram de 8 → 2.

### 2026-08-17 — Backend/Sincronização (Supabase) + correção de build
- **Integração Supabase concluída e testada no S23** (pin criado no celular aparece no Table Editor `pets`).
- **Decisões**: backend **Supabase**; **auth anônimo** (sign-in invisível) com `device_id` gravado na
  `raw_user_meta_data` do usuário e usado nas policies de RLS; fotos em **Storage bucket `pet-photos`** (URLs públicas).
- **Módulos novos** (JS puro — sem rebuild de APK para mudanças de JS):
  - `lib/supabase.ts` — cliente + `ensureSession(deviceId?)` (anon sign-in + grava `device_id`).
  - `lib/photos.ts` — upload das fotos (`file://` → Storage) via `File.arrayBuffer()` (API v19 do `expo-file-system`).
  - `lib/sync.ts` — motor **local-first + incremental**: `runSync` faz push dos pets `dirty` + exclusões pendentes
    (soft delete) e **pull só do delta** (`updated_at > lastSync` ou `deleted_at > lastSync`, cursor em `SecureStore`).
    Exclusões remotas detectadas pelo `deleted_at`. `fetchPetRemote(id)` = fetch-on-tap do detalhe do pin.
- **Schema**: `supabase/schema.sql` — tabela `pets` (jsonb `payload` + colunas p/ RLS), bucket `pet-photos` público,
  RLS (leitura pública; escrita só dono/denunciante via função `SECURITY DEFINER current_device_id()`),
  `GRANT`s p/ `anon`/`authenticated`, e **Anonymous Sign-ins** ativado no dashboard.
- **Config**: `.env` com `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (lido/inline pelo Metro no bundle).
  Feature-flag: sem as env, o app roda 100% local (sync = no-op).
- **`app/(tabs)/index.tsx`**: `PetPost` = alias de `PetRecord` (com `dirty`/`remoteImageUrls`/`updatedAt`/`deletedAt`);
  sync dispara no launch, no `AppState` foreground e após `commitPets`; apagar registra exclusão pendente;
  `onMarkerPress` faz fetch-on-tap do detalhe.
- **Lição de build (importante)**: `npx expo run:android --variant release` gera APK **standalone** que NÃO conecta
  no Metro (só p/ demo sem PC). Para debugar/testar JS, usar `npx expo run:android` (dev client/debug, conecta Metro).
  Instalar release sobre dev client dá conflito de assinatura (não substitui o app).
- **Conexão Metro no S23**: Wi-Fi anuncia IP de VPN (`10.x`, inalcançável). Caminho estável = **USB** +
  `adb reverse tcp:8081 tcp:8081` e abrir o dev client em `http://localhost:8081` (sem QR).

### 2026-08-17 (tarde) — Correção de sync (só último pin) + delete de fotos
- **BUG: só o último pin aparecia no mapa.** Causa: no sync incremental, o pull retorna só o *delta*
  (`updated_at > lastSync`); o merge antigo descartava pets locais já sincronizados (dirty=false) que
  não estavam nesse delta. Corrigido em `lib/sync.ts` (passo 4 do `runSync`): mantém o pet local quando
  não há alteração remota no delta; só cede à versão remota se ela existir no delta, e só remove se
  estiver em `remoteDeletedIds`. Agora todos os pins persistem no mapa após o sync. `tsc --noEmit` ✅.
- **Delete de fotos no servidor ao apagar pin.** `lib/photos.ts`: nova `deletePetPhotos(urls, deviceId)`
  que extrai o path da URL pública e chama `storage.remove`. `app/(tabs)/index.tsx` `deletePet` agora
  apaga as `remoteImageUrls` do dono (via `isOwner`) quando o Supabase está configurado.
- **RLS de Storage**: `supabase/schema.sql` ganhou policy `pet-photos owner delete` (folder raiz == device_id)
  e `grant ... delete` em `storage.objects`. Re-rode o schema no SQL Editor. Sem rebuild de APK (só JS + SQL).

### 2026-08-17 (tarde 2) — Recuperação de pins (full pull no boot)
- **BUG: após o sync corretivo, os pins somiam do mapa.** Causa raiz: o sync é
  INCREMENTAL (delta `updated_at > lastSync`). O pet A tinha sido descartado do
  local pelo merge bugado anterior e seu `updated_at` era MENOR que o `lastSync`
  armazenado, então o delta nunca o re-buscava. Dispositivo com local incompleto
  não recuperava pets existentes no servidor. Também havia corrida: o 1º sync
  podia disparar com `petsRef` vazio.
- **Correção** (`lib/sync.ts`): `runSync` aceita `options.full`; o pull é COMPLETO
  (`select * where deleted_at is null`) quando `full===true`, `lastSync` nulo ou
  lista local vazia. `app/(tabs)/index.tsx`: 1º sync da sessão chama `triggerSync(true)`
  (bootstrap) e só dispara após `localLoaded` (estado) ficar true. Sinces seguintes
  (foreground/commit) continuam incrementais. `tsc --noEmit` ✅.

## Pendências conhecidas
- **Rebuild do dev build** (`npx expo run:android`) — `expo-media-library`/`expo-sharing` são nativos; o APK precisa ser reconstruído para embutir os módulos. *Pendente de execução/device.*
- **Testar no Galaxy S23**: viewer fullscreen, zoom, navegação ◀▶, "Salvar na galeria" (permissão), "Compartilhar" (cópia p/ cache + share sheet). *Pendente de device.*
- Compartilhar imagem no Expo Go (Android): inviável. Só em APK/dev build.
- ~~Backend (Supabase ou outro) para sincronização entre dispositivos: pets ainda são locais por dispositivo.~~ **CONCLUÍDO (2026-08-17): backend Supabase integrado (sync incremental) e testado no S23 — ver sessão 2026-08-17.**
- `expo-notifications` (push do backend) ainda NÃO instalado — instalar com `npx expo install expo-notifications` quando integrar e gerar novo build.
- URL/QR `https://ifujao.app` é placeholder; trocar pela real quando houver backend.
- Push para o GitHub (opcional).
- `app/pet/[id].tsx` (deep link `ifujao://`) sem uso — pode ser removido.

## Como testar
- **Build local no Windows (sem crédito EAS)**: num novo terminal PowerShell, setar e rodar:
  ```powershell
  $env:JAVA_HOME="C:\Program Files\Microsoft\jdk-17.0.20.8-hotspot"
  $env:ANDROID_HOME="C:\Users\SAFETY_ONE\AppData\Local\Android\Sdk"
  $env:ANDROID_SDK_ROOT="C:\Users\SAFETY_ONE\AppData\Local\Android\Sdk"
  cd C:\treinamento\iFujao\StudyFlow
  npx expo run:android
  ```
  (As três vars também foram salvas como variáveis de USUÁRIO no Windows; num terminal novo aparecem automaticamente. `JAVA_HOME` deve ser OpenJDK 17 / JBR do Android Studio, nunca JDK 24.)
- Celular: ativar Modo Dev (7 toques em "Número da versão"), Depuração USB, conexão USB "Transferência de arquivos (MTP)", autorizar o PC. Validar com `adb devices`.
- **Metro**: rode `.\server.bat` (mata portas antigas e sobe `npx expo start -c --host lan`). Abra o app **iFujão** (dev client, NÃO Expo Go) no celular, na mesma rede Wi-Fi do PC.
- **Development Build (obrigatório)**: op-sqlite e expo-local-authentication são nativos → Expo Go não funciona.
- Mudanças só de JS: hot-reload do dev build costuma bastar. Mudança nativa (nova lib/permissão/plugin): precisa `npx expo run:android` de novo para reconstruir o APK.
- **Conexão via Wi-Fi (sem cabo)**: o bundle JS vem do Metro → precisa `npx expo start` + celular na mesma rede.
  Se o Expo anunciar IP `10.x` (VPN/WSL/emulador) em vez de `192.168.x.x`: forçar `--host lan`, ou no celular
  "Enter URL manually" → `http://192.168.x.x:8081`, ou `EXPO_PACKAGER_PROXY_URL="http://192.168.x.x:8081"`.

## Comandos úteis
- Typecheck: `npx tsc --noEmit -p tsconfig.json`
- Limpar cache dev: `npx expo start -c`
- Doctor: `npx expo-doctor`
- Prebuild limpo: `npx expo prebuild --clean --platform android`

---

## 2026-08-17 (tarde 3) — Sessão de mapa (retomada)

> **Mapa do modal "Reportar" (`MapPicker`) corrigido e sem remount.**
> - Render em branco: era erro de sintaxe JS no `<script>` (`JSON.stringify({ lat: p.lat, p.lng })` → `p.lng` shorthand inválido). Corrigido para `{ lat: p.lat, lng: p.lng }`.
> - "Usar meu GPS" move o pin: `MapPicker` espelha o padrão do `MapLeaflet` (que funciona): `webRef` + `mapReady` (set no `onLoad`),
>   globais `window.__map`/`window.__marker`, `moveToJs(lat,lng)` e `useEffect([mapReady, value?.lat, value?.lng])` que injeta via `injectJavaScript`.
> - **NÃO usar `key`/remount no `<MapPicker>`**: remount do WebView dentro do Modal dá tela branca e faz o pin "piscar" ao tocar o mapa (testado e descartado).
> `tsc --noEmit` ✅. Validar no S23: abrir "Reportar", tocar "Usar meu GPS" (pin vai p/ posição atual) e tocar no mapa (pin sem piscar).

### O que foi feito nesta sessão (e o resultado)
1. **Sync incremental descartava pets** (só o último pin aparecia): corrigido em `lib/sync.ts` (merge não descarta mais pets ausentes do delta). `tsc` ✅.
2. **Delete de fotos no servidor ao apagar pin**: `lib/photos.ts` (`deletePetPhotos`), `deletePet` em `index.tsx` (só dono), policy `pet-photos owner delete` + grant em `schema.sql`.
3. **Pets somem após reload** (pull delta não re-buscava pets antigos): `runSync` faz **full pull no boot** (`options.full`), `initialSync` só dispara após `localLoaded`, e `triggerSync(full?)` aceita flag. `tsc` ✅.
4. **Pin único visual** (2 pets com coordenadas idênticas no Supabase `-23.504397,-47.4287563`): spiderfy no `MapLeaflet` (`window.__renderPets` com `delta` que desloca pets na mesma coord para a direita). `tsc` ✅.
5. **"Usar meu GPS" não centralizava**: `usarMeuGps` agora busca GPS **atual** (`getCurrentPositionAsync`) em vez de usar cache de `userLocation`. `tsc` ✅.

### O que quebrou (CAUSA DO MAPA EM BRANCO)
- Foram feitas várias edições no HTML do WebView (Leaflet) em `app/(tabs)/index.tsx` (`MapLeaflet` e `MapPicker`):
  - Tentativa de forçar `key` no `<WebView>` (remount) para reaplicar spiderfy / recentralizar → **o mapa sumiu** (remount do WebView deixou a tela em branco).
  - `MapPicker` foi alterado de `const [start] = useState(initial)` para `const center = value ?? initial` e revertido depois.
  - Houve um typo no tile URL (`/{z/x/y.png`) corrigido para `/{z}/{x}/{y}.png`.
- Suspeita: erro de JS no template do WebView (Leaflet) impede a inicialização do mapa → tela branca em home e modal.
- O `MapPicker` foi **revertido ao original** (`start`-based) e os `key` removidos, mas o mapa home segue em branco → provável erro remanescente no `MapLeaflet` (`window.__renderPets`, `renderPetsJs`, ou `JSON.stringify(pets)` no HTML).

### Plano de recuperação (quando retomar)
1. Abrir o app no dev client e ler o **erro do Metro/Chrome debugger** (ou `console.error`) que aparece ao abrir a tela home — deve apontar a linha do HTML/JS do Leaflet que quebra.
2. Verificar o `MapLeaflet` (`app/(tabs)/index.tsx` ~linha 1391+): `html` useMemo, `window.__renderPets`, `renderPetsJs`, e o `window.__renderPets(${JSON.stringify(pets)})` no final do `<script>`.
   - Checar se `JSON.stringify(pets)` produz HTML válido (sem `</script>` ou aspas quebradas em nenhum campo de pet).
   - Checar se `window.__map`/`__pawIcon`/`__reportedIcon` estão definidos antes do uso.
3. Restaurar o `MapLeaflet` ao estado que renderizava (antes desta sessão de "spiderfy/key") e reaplicar as correções de forma incremental e testada.
4. **NÃO usar `key` no `<WebView>` para forçar remount** — usar `source`/`injectJavaScript` ou recarregar via `onLoad`.
5. Testar no S23 a cada pequena alteração (reload do dev client), validando home + modal "Reportar".

### Notas do usuário
- O app é **local-first**: o mapa exibe pets do banco local (op-sqlite); Supabase é espelho p/ sync. Apagar dados no Supabase NÃO remove os pins locais (precisa limpar dados do app ou desinstalar).
- Os 2 pets de teste no Supabase têm coordenadas **idênticas** → naturalmente empilhados (não é bug de mapa, é dado duplicado).
- `adb` não está no PATH: usar `& "C:\Users\SAFETY_ONE\AppData\Local\Android\Sdk\platform-tools\adb.exe"`.

### 2026-08-17 (noite) — MapPicker (modal Reportar), GPS instantâneo e deleção de fotos
- **Zoom do mapa home reduzido** (`MapLeaflet`, `app/(tabs)/index.tsx`): `setView(..., 17)` → `13` (visão mais ampla da cidade). `tsc --noEmit` ✅.
- **`MapPicker` do modal "Reportar Pet Perdido" restaurado para a versão do HEAD** (WebView/Leaflet, baseada em `start`, sem `key`/remount). Call site já passa `theme`/`city`. A versão anterior (react-native-maps) foi descartada por instabilidade.
- **Bug: "Usar meu GPS" demorava 10–15s para mexer o pin.** Causa raiz: `usarMeuGps` aguardava `getCurrentPositionAsync` (cold fix) antes de `setPetLocation`. Corrigido para usar o **`userLocation` já carregado no boot** na hora, com refine de fix novo em background (não bloqueia UI). `app/(tabs)/index.tsx`.
- **Modal abre no GPS atual** (`openReport`): `petLocation` inicializado com `userLocation` (fallback centro da cidade) em vez de sempre centro da cidade.
- **Bug: panorâmica o mapa sem mover o pin e o GPS não recentralizava.** Causa: `setPetLocation(userLocation)` não mudava o valor → efeito de `value` não disparava. Adicionado **`gpsNonce`** que incrementa a cada toque no botão; `MapPicker` reage a `gpsNonce` e força `map.setView` + pin na posição GPS. `tsc --noEmit` ✅.
- **Deleção de fotos no Supabase ao apagar pin.** Sintoma: `remove()` retornava sucesso mas o arquivo ficava (RLS de DELETE barrando silenciosamente). Causas/correções:
  - `deletePetPhotos` (`lib/photos.ts`) não garantia sessão → agora chama `ensureSession(deviceId)` antes do `remove()`.
  - `current_device_id()` vinha `NULL` porque `ensureSession` fazia `signInAnonymously()` e só depois `updateUser({ data: { device_id } })`, que em anon é silenciosamente bloqueado. Corrigido em `lib/supabase.ts`: `device_id` agora vai **em `signInAnonymously({ options: { data: { device_id } } })`**; se a sessão antiga não tiver metadata, força `signOut` + re-sign-in. `tsc --noEmit` ✅.
- **Exposição de listagem no Storage** (`supabase/schema.sql`): removida a policy `pet-photos public read` (SELECT) e o `grant ... select` em `storage.objects`. Bucket público → fotos servidas via URL pública; clientes não enumeram mais o bucket. Upload (`insert`) e deleção (`delete`, só dono via `current_device_id()`) mantidos. Rode o schema novamente no SQL Editor. `tsc --noEmit` ✅.
