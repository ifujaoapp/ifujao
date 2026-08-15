# STATUS — Projeto iFujão (StudyFlow)

Última atualização: 2026-08-15 (tarde)
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

## O que foi feito nesta sessão (2026-08-15, rework do compartilhamento)

### Compartilhar pet — rework (texto + link da loja)
- `sharePetCard` (`app/(tabs)/index.tsx`) reescrito para mandar **texto com link clicável** via
  `Share.share({ message })` (funciona iOS + Android). Mensagem:
  `🐾 Ajude a encontrar este pet perdido em <cidade>!\nBaixe o iFujão e veja mais: <SHARE_BASE_URL>`.
- `SHARE_BASE_URL` = `https://play.google.com/store/apps/details?id=br.com.petz` (link da loja, clicável no WhatsApp).
- Removido o envio de imagem do share (`shareImageFile`/`Sharing.shareAsync`) e os imports que ficaram
  sem uso (`Sharing`, `Constants`, `Paths`/`FSFile`). `tsc --noEmit` ✅.

### Descoberta importante (limitação do RN/Expo nesta versão)
- `Share.share({ url, message })` **NÃO anexa o arquivo**: no `ShareModule.kt` (RN new-arch) o `url` é
  ignorado — só vai `EXTRA_TEXT`. Por isso qualquer tentativa de imagem+legenda via `Share.share` mandava
  só texto (ou, no Android, nem a imagem ia).
- `Sharing.shareAsync` (expo-sharing) manda **só o arquivo**, sem legenda/texto.
- Conclusão: com as libs atuais **não dá pra mandar imagem + link clicável juntos numa mesma mensagem do
  WhatsApp**. É escolha binária: imagem (poster) OU link clicável de texto.

### Deep link `ifujao://` (tentativa, atualmente sem uso)
- `app.json` já tinha `"scheme": "ifujao"`.
- Criada rota `app/pet/[id].tsx` + `getPetById` em `lib/storage.ts` + registro em `app/_layout.tsx`
  (`Stack.Screen name="pet/[id]"`). A tela abre o pet se o SO receber `ifujao://pet/<id>` no mesmo aparelho.
- **Não resolve o caso WhatsApp**: (1) o WhatsApp não torna clicável scheme custom (`ifujao://`); e
  (2) os pets são locais por dispositivo (sem backend) → outro celular não tem o dado para exibir.
- Como o share agora usa o link da loja, a rota `app/pet/[id].tsx` está **sem uso** (pode ser removida).

### DECISÃO FINAL (2026-08-15) — share é TEXTO com link (sem imagem)
- Usuário desistiu da imagem anexa: "deixe pra lá esse negócio de imagem (não vai funcionar no iOS)".
- `sharePetCard` (`app/(tabs)/index.tsx`) volta a ser `Share.share({ message })` — só texto:
  `🐾 Ajude a encontrar este pet perdido em <cidade>!\nBaixe o iFujão e veja mais: <SHARE_BASE_URL>`.
- `SHARE_BASE_URL` = `https://play.google.com/store/apps/details?id=br.com.petz`.
- `react-native-share` foi instalado e testado mas NÃO funcionou (imagem não anexava / caía no
  fallback de texto no S23). Foi REMOVIDO do projeto (`npm uninstall react-native-share`).
  Motivo técnico: no RN/Expo atual, imagem+legenda numa mesma mensagem do WhatsApp exige
  módulo nativo, e o `content://`+caption esbarrava em limites do Android (e o usuário julgou
  inviável para iOS também). Sem backend, não há como um link clicável abrir o pet de forma
  cross-plataforma.
- O dev build atual (APK instalado) ainda contém o binário do `react-native-share` (rebuild
  antigo), mas o JS não o importa mais — funciona normalmente com share de texto. Próximo
  `prebuild`/rebuild não o incluirá.
- `app/pet/[id].tsx` (deep link `ifujao://`) permanece no código mas sem uso (link de share é da loja).

## EM ANDAMENTO (2026-08-15 tarde) — Viewer de imagens do card do pet

Objetivo: ao tocar na foto do card do pet, abrir viewer profissional (não o share sheet).
Decisão do usuário: fazer viewer PRÓPRIO (não `react-native-image-viewing`, que deu erro de
`require.context`/entry errado no Metro e warning de SafeAreaView deprecado, e não expõe layout).
Escopo aprovado pelo usuário (opções 1, 2 e 3):
  1. Viewer próprio: título espécie/raça sobreposto, botão X grande/acessível, setas ◀ ▶, botões flutuantes.
  2. Compartilhar via `expo-sharing` (com cópia da foto para `FileSystem.cacheDirectory` antes, porque
     fotos ficam em `Paths.document/pet_photos/` que o FileProvider do Android 13+ nem sempre expõe).
  3. Botão "Salvar na galeria" via `expo-media-library` (`saveToLibraryAsync` + `requestPermissionsAsync`).

Status da implementação (INTEGRAÇÃO CONCLUÍDA):
- `npx expo install expo-media-library` ✅ e `expo-sharing` ✅ instalados (ambos SDK 54 compatíveis, up to date).
- `react-native-image-viewing` removido (`npm uninstall`).
- Criado `src/components/ImageViewerModal.tsx`: Modal fullscreen próprio com:
  - `closeBtn` (X grande, hitSlop, topo direito), `titleBar` (espécie/raça + contador n/total),
    `imageArea` com `ScrollView` (zoom nativo `maximumZoomScale=4`), `navBtn` esquerda/direita,
    `actionBar` com "Salvar" (MediaLibrary) e "Compartilhar" (expo-sharing + cópia p/ cache).
  - Usa `Image.getSize` + `Dimensions` para dimensionar; `useColorScheme` para fundo claro/escuro.
- No `app/(tabs)/index.tsx` (FINALIZADO):
  - Import `ImageViewerModal` ✅; removido import `react-native-image-viewing` ✅.
  - Estados `viewerImages`/`viewerIndex` + NOVO `viewerVisible` (linhas ~206-209).
  - `openInViewer(images, index)` reescrito (linha ~549) para setar imagens, index clampado e `viewerVisible=true`.
  - `<ImageViewer>` antigo substituído por `<ImageViewerModal visible={viewerVisible && ...} images index
    title={selectedPet?.species} onClose onIndexChange />` (linhas ~1193-1200).
  - `title` passado = espécie/raça do `selectedPet` (campo `species`).
- Corrigido compatibilidade com `expo-file-system` v19 na cópia p/ share: trocado `FileSystem.cacheDirectory`
  + `copyAsync({from,to})` por nova API `Paths`/`File` (`new FSFile(Paths.cache, ...)` + `src.copy(dest)`).

Verificações:
- `npx tsc --noEmit -p tsconfig.json` ✅ EXIT 0 (sem erros).
- `npx expo-doctor` ✅ 18/18 checks passed.

Próximos passos (PENDENTES — exigem dispositivo):
  d. REBUILD do dev build (`npx expo run:android`) — `expo-media-library` e `expo-sharing` são nativos
     e foram adicionados/confirmados; o APK precisa ser reconstruído para embutir os módulos nativos.
  e. Testar no Galaxy S23: tocar na foto do card → viewer fullscreen, zoom, navegar ◀▶,
     "Salvar na galeria" (permissão), "Compartilhar" (cópia p/ cache + share sheet).

## O que foi feito nesta sessão (2026-08-15 tarde, rebuild + calendário)

### Rebuild do dev build com OpenJDK 17
- Troca do `JAVA_HOME` do JBR do Android Studio para OpenJDK 17 Microsoft (`C:\Program Files\Microsoft\jdk-17.0.20.8-hotspot`).
- `npx expo prebuild --clean --platform android` + `./gradlew assembleDebug --no-daemon` → `BUILD SUCCESSFUL`.
- Problemas resolvidos no caminho: processos `java` antigos seguravam locks de build cache do
  `expo-modules-autolinking`; ao limpar, apaguei o `build/` desse pacote e o autolinking quebrava
  (`Cannot find module '../build'`). Restaurado com reinstall forçado de `expo-modules-autolinking`.
- APK `app-debug.apk` instalado no Galaxy S23 via `adb install -r`.
- `expo-doctor`: 18/18 checks passed.

### Bolinha do dia no calendário (DatePickerCalendar.tsx) — CORRIGIDO
- Sintoma: a bolinha azul que marca o dia selecionado não ficava centralizada sobre o número (e, numa
  tentativa, virou um círculo gigante quando `width:'84%'+aspectRatio` esticou a célula).
- Solução final: o número e o círculo ficam dentro de um `dayBubble` de 34×34 com
  `alignItems/justifyContent:'center'`; o círculo é `View` absoluto preenchendo o bubble (`34×34`,
  `borderRadius:17`) e o `Text` é centralizado no mesmo box. Assim a bolinha centraliza exata e
  consistentemente sobre o dia, para 1 ou 2 dígitos.

- `expo-doctor`: 18/18 checks passed.
- Botão "Sair" no Android: funciona corretamente (resolvido).
- Modal de alertas customizado com ícones vetoriais (`src/components/AppAlert.tsx`) substituiu o `Alert.alert` nativo.

## O que foi feito nesta sessão (2026-08-15)

### Proteção de coordenada no modal "Reportar Pet Perdido"
- `handleAddPet` (`app/(tabs)/index.tsx`) agora exige `petLocation` (pino posicionado no mapa). Se nulo →
  alerta "Marque o local" e não grava. Se coord for inválida (fora de faixa ou `0,0`) → alerta "Coordenada
  inválida" e não grava. Remove a divergência do contador flutuante vs pins (não há pet sem coord).
- Corrigido bug na validação: rejeitava latitudes negativas (`n < -89.9`) — quebrava o Brasil (hemisfério sul).
  Agora valida só faixa `-90..90` / `-180..180` + não ser exatamente `(0,0)`.

### Botão "Usar meu GPS" (modal reportar pet)
- `usarMeuGps` reescrito: usa o `userLocation` em cache (do boot/background) primeiro → posiciona o pino
  instantaneamente se o usuário não se moveu. Só chama `getCurrentPositionAsync` se o cache estiver nulo.
- Boot (`getOnce`) mantém `Accuracy.High` para não atrasar o mapa principal na entrada; `userLocation` é
  resolvido em background (mapa já abre em `CITIES[0]` como fallback, sem depender do GPS).

### Modais de alerta com ícones vetoriais
- Criado `src/components/AppAlert.tsx`: `AppAlertProvider` + `showAlert(type, title, message?, buttons?)`.
  Ícones via `@expo/vector-icons` (Ionicons): error/warning/success/info/location/permission/trash/share/
  search/exit, com cores semânticas e suporte a tema claro/escuro.
- Integrado `AppAlertProvider` em `app/_layout.tsx`.
- Substituídos os 23 `Alert.alert` de `app/(tabs)/index.tsx` por `showAlert` (removeu os emojis dos títulos).

## O que foi feito nesta sessão (2026-08-14)

### Mapa do modal "Reportar Pet Perdido"
- Aumentado de 180px → 260px (`pickMapWrap` em `app/(tabs)/index.tsx`).
- Leaflet agora gerencia gestos: CSS `touch-action` trocado de `none` para `manipulation` e o mapa
  habilita `tap`, `dragging`, `scrollWheelZoom`, `doubleClickZoom`, `zoomControl`, `inertia`.
- Isolado o gesto do `ScrollView` do modal: `MapPicker` e `pickMapWrap` capturam
  `onStartShouldSetResponder`/`onMoveShouldSetResponder` para o mapa rolar/arrastar sem rolar o modal.

### Tela de bloqueio (biometria do celular)
- Criado `src/components/AppLock.tsx` usando `expo-local-authentication` (import dinâmico com
  `try/catch` para não quebrar no Expo Go, onde o módulo nativo não existe).
- Integrado em `app/_layout.tsx` envolvendo toda a navegação.
- **Opcional**: se o dispositivo não tiver biometria/hardware, o bloqueio é pulado automaticamente.
- Corrigida versão: `expo-local-authentication` precisa ser `17.0.8` (SDK 54), não `16.x` nem `57.x`.
- Movido de `app/components/` para `src/components/` (o `app/` é tratado como rota do expo-router).

### Geração da Dev Build local (aprendizado importante)
- `expo-local-authentication@57` (SDK 55+) quebrava no SDK 54 (`NoClassDefFoundError`).
- `expo-notifications` foi instalado e depois REMOVIDO: a versão `0.14.x` puxava libs legadas
  (`unimodules-task-manager-interface`) com `build.gradle` incompatível (erro `classifier`, JVM target,
  erros de compilação Kotlin). Decisão: deixar para instalar com `npx expo install expo-notifications`
  na hora real do backend, evitando troca de versões no escuro.
- `axios@1.19.0` mantido (HTTP puro JS, não exige rebuild).
- Estratégia segura aplicada (sugerida pelo usuário): remover → `npm ls` confirmar →
  `npx expo prebuild --clean` → `npx expo-doctor` (corrigiu `expo-local-authentication` 16→17) →
  remover `eas-cli` local → `npx expo run:android`. Resultado: build estável, 18/18 checks.

### server.bat (Metro com limpeza de portas)
- Reescrito para matar processos nas portas 8081/8082 (`netstat` + `taskkill /F`) antes de subir o
  Metro, evitando "Port 8081 is being used by another process" e múltiplos Metros. Gravado em ASCII.

### Correção de duplicate NavigationContainer / linking
- Removido o `ThemeProvider` do `@react-navigation/native` em `app/_layout.tsx` (ele cria um
  `NavigationContainer` próprio → conflito de deep linking com o `Stack` do expo-router).
  Tema agora aplicado via `Stack screenOptions`. Elimina o warning "linking in multiple places".

### Correção do Metro "Cannot pipe to a closed or destroyed stream"
- Causa: app tinha target `web` habilitado por padrão → Metro tentava servir bundle web ao dev client
  Android e o pipeline quebrava. Adicionado `"platforms": ["ios", "android"]` em `app.json`.
- Limpo cache do Metro (`.expo/metro`, `node_modules/.cache/metro`).

## Pendências conhecidas
- Compartilhar imagem no Expo Go (Android): inviável. Só funciona em APK/dev build.
- ~~Botão "Sair" no Android (`BackHandler.exitApp()` não funciona no Android moderno)~~: RESOLVIDO — funciona corretamente no Android.
- Push para o GitHub (opcional).
- URL/QR `https://ifujao.app` é placeholder; trocar pela real quando houver backend.
- Backend (Supabase ou outro) para sincronização entre dispositivos: pets ainda são locais por dispositivo.
- `expo-notifications` (push do backend) ainda NÃO instalado — instalar com `npx expo install expo-notifications`
  quando for integrar, e gerar novo build.
- ~~Contador flutuante de pets: conta `pets.length` (pins reais); se algum pet tiver coords
  inválidas, o número pode diferir dos pins visíveis no mapa~~: RESOLVIDO na origem — o modal
  "Reportar Pet Perdido" (`handleAddPet`) agora exige coordenada GPS válida (getCurrentPositionAsync
  + validação de faixa) e não grava o alerta se não obtiver; logo não há pet sem coord.

## Como testar
- **Build local no Windows (sem crédito EAS)**: num novo terminal PowerShell, setar e rodar:
  ```powershell
  $env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
  $env:ANDROID_HOME="C:\Users\SAFETY_ONE\AppData\Local\Android\Sdk"
  $env:ANDROID_SDK_ROOT="C:\Users\SAFETY_ONE\AppData\Local\Android\Sdk"
  cd C:\treinamento\iFujao\StudyFlow
  npx expo run:android
  ```
  (As três vars também foram salvas como variáveis de USUÁRIO no Windows; num terminal novo
  aparecem automaticamente. `JAVA_HOME` DEVE ser o JBR do Android Studio, nunca um JDK 24.)
- Celular: ativar Modo Dev (7 toques em "Número da versão"), Depuração USB, conexão USB como
  "Transferência de arquivos (MTP)", autorizar o PC. Validar com `adb devices`.
- **Metro**: rode `.\server.bat` (mata portas antigas e sobe `npx expo start -c --host lan`).
  Abra o app **iFujão** (dev client, NÃO Expo Go) no celular, na mesma rede Wi-Fi do PC.
- **Development Build (obrigatório)**: op-sqlite e expo-local-authentication são nativos → Expo Go não funciona.
- Mudanças só de JS: hot-reload do dev build costuma bastar. Mudança nativa (nova lib/permissão/plugin):
  precisa `npx expo run:android` de novo para reconstruir o APK.

## Comandos úteis
- Typecheck: `npx tsc --noEmit -p tsconfig.json`
- Limpar cache dev: `npx expo start -c`
- Doctor: `npx expo-doctor`
- Prebuild limpo: `npx expo prebuild --clean --platform android`

## O que foi feito nesta sessão (2026-08-12)

### Card do pet (modal ao clicar no pin)
1. **Menu circular de ações** (`CircularActionButton` + botão central "Ações").
   - Botão central "Ações" (`c.primaryButton`) no meio; ao redor, em cruz (0°/90°/180°/270°),
     os botões: Contato, Denunciar, Compartilhar, Apagar (e Apagar denúncia quando aplicável).
   - Posicionamento radial por trigonometria (`RADIUS=85`, `BUTTON_W=60`), centralizado no card
     via `left/top: 50%` + `transform: translate(-30,-30)` + translate radial (corrigido o
     erro de ancoragem que deslocava os botões).
   - Se não for dono, os botões são redistribuídos uniformemente (3, 4 ou 5 conforme dono/denúncia).
2. **Animação de "brotar"** com `react-native-reanimated` (já instalado, v4.1.1).
   - `menuProgress` (SharedValue 0→1) anima ao abrir o card (`useEffect([selectedPet])`,
     `withDelay(120)` + `withTiming` 420ms, easing out).
   - Cada botão surge de **trás do botão central** (translate 0, scale 0.2, opacity 0) e expande
     para sua posição radial (translate x,y, scale 1, opacity 1), com pequeno atraso escalonado
     por índice (60ms) — efeito de brotar um a um. Não recolhem ao fechar.
   - `CircularActionButton` é componente top-level estável (não declarado dentro do componente
     principal) para evitar remonte em loop que causava piscar.
3. **Lógica de botões para pet denunciado**.
   - Contato e Compartilhar ficam **cinza (`#8E8E93`) e sem ação** (`pointerEvents:'none'` +
     `TouchableOpacity disabled`) quando `selectedPet.reported` — não faz sentido contactar/
     compartilhar um pet denunciado.
   - Botão "Denunciar" oculto se o usuário for o próprio denunciante (`alreadyReportedByMe`).
   - "Apagar denúncia" (azul): dono **ou** denunciante. "Apagar alerta" (vermelho): só dono.

### Botão fechar do modal "Reportar Pet Perdido"
- Trocado para X textual (`✕`) dentro de `TouchableOpacity`, com `hitSlop` e header do modal
  movido para **fora do `ScrollView`** — corrige o clique que não funcionava no espelhamento
  do Phone Link (W11) e o alinhamento.
- Estilo copiado do `demoClose` do card do pin (círculo preto 50%, ✕ branco), tamanho 24x24.

### Mapa (Leaflet via WebView)
- Corrigido bug: ao denunciar/apagar denúncia, o mapa **não recarregava mais para a posição GPS**.
  - Antes: `pets` nas dependências do `useMemo` do HTML → WebView recriava o mapa em `initialCenter`.
  - Agora: HTML do mapa **não depende de `pets`**; os markers dos pets são desenhados/atualizados
    via injeção de JavaScript (`window.__renderPets` + `injectJavaScript` no load e em `useEffect([pets])`,
    com retry interno). O WebView não recarrega → posição do usuário é mantida.
  - Os pins atualizam a cor (azul↔vermelho) ao denunciar e ao apagar a denúncia.

## O que foi feito nesta sessão (2026-08-13, tarde)

### Build local no Windows (sem gastar crédito EAS)
- O Expo Go não compila (op-sqlite é nativo); a alternativa local é `npx expo run:android`.
- Erros resolvidos na máquina:
  1. **`SDK location not found`**: criado `android/local.properties` apontando para
     `C:\Users\SAFETY_ONE\AppData\Local\Android\Sdk` + var de usuário `ANDROID_HOME`.
  2. **CMake/NDK quebrava (JDK 24)**: o `JAVA_HOME` antigo apontava para `C:\Program Files\Java\jdk-24`.
     Redirecionado para o **JBR do Android Studio** (`C:\Program Files\Android\Android Studio\jbr`),
     que é o JDK correto para o Gradle/React Native. `eas-cli` local foi removido (usar global).
- `npx expo run:android` compila o APK e instala no celular conectado via USB (depuração USB + MTP).

### Correções de runtime no card do pet / QR
- **`Element type is invalid: got: undefined` ao clicar no pin**: `react-native-qr-svg` **não tem
  default export** — exporta nomeado `QrCodeSvg`. Trocado o import em `app/(tabs)/index.tsx` para
  `import { QrCodeSvg as QRCodeSvg } from 'react-native-qr-svg'`.
- **Crash `com.horcrux.svg.PathParser` (NaN)**: o `react-native-qr-svg` (v1.5.0) usa a prop
  **`frameSize`**, não `size`. O código passava `size={96}` → `frameSize` undefined → `cellSize = NaN`
  em todos os paths do SVG. Corrigido para `frameSize={96}` no card compartilhável.

### Teclado sobrepondo campos do modal "Reportar Pet Perdido" (Android)
- `KeyboardAvoidingView` tinha `behavior={undefined}` no Android (só funcionava no iOS).
  Trocado para `behavior={Platform.OS === 'ios' ? 'padding' : 'height'}`. No Android o KAV reduz a
  altura quando o teclado abre e o `ScrollView` interno rola até o campo focado.

### Ajustes de UI
- **Logo no modal "Sobre"**: o `logo.png` (120x120) já era exibido no topo do `aboutCard` (linha ~845).
  O botão "Sobre" continua com o ícone `information-circle` (não foi trocado por imagem).
- **Texto da Política de Privacidade justificado**: `privacyText` mudou de `textAlign: 'left'`
  para `'justify'`.

### Erro `better-sqlite3` / `Cannot pipe to a closed or destroyed stream` no Metro
- Sintoma: ao abrir o app, o Metro falhava resolvendo `@op-engineering/op-sqlite` e caía na
  condition `node` do `exports` do pacote (`node/dist/index.js` → importa `better-sqlite3`, que não
  existe no app). O `react-native` field do op-sqlite aponta para `src/index` (source .ts) e o Metro
  acabava resolvendo o entry Node.
- Esse erro só "apareceu" depois de consertar QR/teclado, pois antes o bundle travava antes de
  chegar em `lib/storage.ts` (que importa op-sqlite). Não foi regressão de código novo.
- **Correção**: criado `metro.config.js` forçando `react-native` primeiro em `resolver.conditionNames`
  (baseado em `getDefaultConfig` do Expo). Limpar cache (`node_modules/.cache` + `.expo`) e subir com
  `npx expo start -c`. O banco nativo (SQLCipher) então carrega sem o `better-sqlite3`.

## Decisão: compartilhamento (estado atual — 2026-08-15)
- Share do pet = **texto com link clicável da loja** (`Share.share({ message })`, `SHARE_BASE_URL` =
  `https://play.google.com/store/apps/details?id=br.com.petz`). Sem imagem anexa.
- Motivo: nesta versão do RN/Expo, `Share.share` só manda texto (ignora `url`/arquivo) e `Sharing.shareAsync`
  manda só arquivo (sem texto) → não dá pra combinar imagem + link clicável numa mesma mensagem do WhatsApp.
- Histórico: tentou-se `ifujao://pet/<id>` (rota `app/pet/[id].tsx`) mas o WhatsApp não linka scheme custom
  e os pets são locais (sem backend) → sem uso hoje.
- Para imagem + link juntos: falta `react-native-share` (setup nativo) — pendente.

## Arquitetura de persistência (estratégia híbrida) — 2026-08-13
Substituiu o `SecureStore` de pets (que só guardava JSON de texto) por camadas separadas:
- **Keychain/Keystore (`expo-secure-store`)**: guarda SÓ a chave de criptografia do banco
  (`ifujao_db_key`, 32 bytes hex), gerada no primeiro acesso. Nada de dados pesados lá.
- **SQLite criptografado (`@op-engineering/op-sqlite` + SQLCipher)**: banco `ifujao.sqlite`
  aberto com `encryptionKey` vinda do SecureStore. Tabela `pets(id TEXT PK, data TEXT)`;
  cada pet é um JSON. Habilitado via plugin no `app.json`: `["op-sqlite", { "sqlcipher": true }]`.
- **File System (`expo-file-system` v19, API nova `Paths/File/Directory`)**: as fotos são copiadas
  de `file://.../CachePhoto`/ImageManipulator para `Paths.document/pet_photos/` (pasta de documentos,
  que o SO não limpa) no momento de publicar o alerta (`persistPhotos`). Só o caminho (`file://...`)
  é salvo no SQLite. Fotos de pets removidos são apagadas (`clearPhotos`).
- Módulo central: `lib/storage.ts` (loadPets/savePets/persistPhotos/clearPhotos). Integrado em
  `app/(tabs)/index.tsx` via `commitPets` (substitui os antigos `setPets`+SecureStore).

**IMPORTANTE — Expo Go não funciona mais.** op-sqlite é código nativo → o app agora exige
**Development Build** (`expo-dev-client`). Rodar com `npx expo run:android` ou EAS dev build;
`npx expo start` no Expo Go quebra. Ver "Como testar".

## Pendências conhecidas
- Compartilhar imagem no Expo Go (Android): inviável. Só funciona em APK/dev build.
- ~~Botão "Sair" no Android (`BackHandler.exitApp()` não funciona no Android moderno)~~: RESOLVIDO — funciona corretamente no Android.
- Push para o GitHub (opcional).
- URL/QR `https://ifujao.app` é placeholder; trocar pela real quando houver backend.
- Backend Supabase (sincronização entre dispositivos): pets ainda são locais por dispositivo.
- ~~Contador flutuante de pets: conta `pets.length` (pins reais); se algum pet tiver coords
  inválidas, o número pode diferir dos pins visíveis no mapa~~: RESOLVIDO na origem — `handleAddPet`
  exige coordenada GPS válida e não grava sem ela.

## Como testar
- **Build local no Windows (sem crédito EAS)**: num novo terminal PowerShell, setar e rodar:
  ```powershell
  $env:JAVA_HOME="C:\Program Files\Android\Android Studio\jbr"
  $env:ANDROID_HOME="C:\Users\SAFETY_ONE\AppData\Local\Android\Sdk"
  $env:ANDROID_SDK_ROOT="C:\Users\SAFETY_ONE\AppData\Local\Android\Sdk"
  cd C:\treinamento\iFujao\StudyFlow
  npx expo run:android
  ```
  (As três vars também foram salvas como variáveis de USUÁRIO no Windows; num terminal novo
  aparecem automaticamente. `JAVA_HOME` DEVE ser o JBR do Android Studio, nunca um JDK 24.)
- Celular: ativar Modo Dev (7 toques em "Número da versão"), Depuração USB, conexão USB como
  "Transferência de arquivos (MTP)", autorizar o PC. Validar com `adb devices`.

### Conexão via Wi-Fi (sem cabo USB)
- O app (APK dev build já instalado) abre sem cabo, mas o bundle JS vem do servidor Metro → precisa
  do `npx expo start` rodando e do celular na **mesma rede Wi-Fi** do PC.
- O Expo às vezes anuncia um IP virtual (`10.x.x.x` de adaptador/emulador/VPN/WSL) em vez do Wi-Fi
  (`192.168.x.x`), e aí o celular não conecta. Correções:
  - Forçar LAN: `npx expo start -c --host lan` (geralmente anuncia o IP `192.x` correto).
  - Se ainda vier `10.x`, apontar manualmente: no celular, no dev build, "Enter URL manually" →
    `http://192.168.x.x:8081` (IP real do PC, visto via `ipconfig | Select-String "IPv4"`).
  - Ou definir a var de ambiente `EXPO_PACKAGER_PROXY_URL="http://192.168.x.x:8081"` antes do start.
- Sem cabo E sem Wi-Fi pro PC → só funciona com build de preview/produção (JS embutido no APK).
- Mudanças só de JS: o hot-reload do dev build costuma bastar. Mudança nativa (novo pacote,
  permissão, plugin): precisa `npx expo run:android` de novo para reconstruir o APK.
- **Development Build (obrigatório agora)**: `npx expo run:android` (precisa Android SDK/NDK) ou
  `npx eas build --profile development --platform android` e instalar o APK. Depois `npx expo start`
  conecta ao dev build (não ao Expo Go).
- Card compartilhável com imagem: requer DEV BUILD/APK (`npx eas build --profile preview --platform android`).
- Ao importar `react-native-reanimated` pela primeira vez, reiniciar com cache limpo: `npx expo start -c`.
- **Viewer de imagens (em andamento)**: usa `expo-media-library` (salvar) e `expo-sharing` (compartilhar)
  — ambos nativos → após finalizar a integração, rodar `npx expo run:android` para rebuild do dev build.
  Fotos ficam em `Paths.document/pet_photos/`; para compartilhar, copiar para `cacheDirectory` primeiro.

## Comandos úteis
- Typecheck: `npx tsc --noEmit -p tsconfig.json`
- Limpar cache dev: `npx expo start -c`
