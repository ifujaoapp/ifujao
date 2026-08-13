# STATUS — Projeto iFujão (StudyFlow)

Última atualização: 2026-08-13 (noite)
Branch: `master` (sem push para o GitHub).

## Estado atual
- `tsc --noEmit` passa sem erros.
- Mudanças da sessão de 2026-08-12 commitadas em `app/(tabs)/index.tsx` (menu circular do card,
  animação de brotar, lógica de botões p/ pet denunciado, correção do mapa que não recarrega ao denunciar).

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

## Decisão: compartilhamento PARADO (opção 3)
No Expo Go, compartilhar SÓ texto/link (imagem anexa inviável — `FileUriExposedException`). Em APK/dev
build o fluxo completo com `ViewShot` + QR real é mantido. Ver histórico em sessões anteriores.

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
- Botão "Sair" no Android (`BackHandler.exitApp()` não funciona no Android moderno): pendente.
- Push para o GitHub (opcional).
- URL/QR `https://ifujao.app` é placeholder; trocar pela real quando houver backend.
- Backend Supabase (sincronização entre dispositivos): pets ainda são locais por dispositivo.
- Contador flutuante de pets: conta `pets.length` (pins reais); se algum pet tiver coords
  inválidas, o número pode diferir dos pins visíveis no mapa.

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
- Mudanças só de JS: o hot-reload do dev build costuma bastar. Mudança nativa (novo pacote,
  permissão, plugin): precisa `npx expo run:android` de novo para reconstruir o APK.
- **Development Build (obrigatório agora)**: `npx expo run:android` (precisa Android SDK/NDK) ou
  `npx eas build --profile development --platform android` e instalar o APK. Depois `npx expo start`
  conecta ao dev build (não ao Expo Go).
- Card compartilhável com imagem: requer DEV BUILD/APK (`npx eas build --profile preview --platform android`).
- Ao importar `react-native-reanimated` pela primeira vez, reiniciar com cache limpo: `npx expo start -c`.

## Comandos úteis
- Typecheck: `npx tsc --noEmit -p tsconfig.json`
- Limpar cache dev: `npx expo start -c`
