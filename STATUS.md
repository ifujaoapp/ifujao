# STATUS — Projeto iFujão (StudyFlow)

Última atualização: 2026-08-12
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

## Decisão: compartilhamento PARADO (opção 3)
No Expo Go, compartilhar SÓ texto/link (imagem anexa inviável — `FileUriExposedException`). Em APK/dev
build o fluxo completo com `ViewShot` + QR real é mantido. Ver histórico em sessões anteriores.

## Pendências conhecidas
- Compartilhar imagem no Expo Go (Android): inviável. Só funciona em APK/dev build.
- Botão "Sair" no Android (`BackHandler.exitApp()` não funciona no Android moderno): pendente.
- Push para o GitHub (opcional).
- URL/QR `https://ifujao.app` é placeholder; trocar pela real quando houver backend.
- Backend Supabase: app guarda pets só em estado local.
- Contador flutuante de pets: conta `pets.length + DEMO_SPOTS.length`; se algum pet não desenhar
  no mapa (coords inválidas), o número pode diferir dos pins visíveis.

## Como testar
- Expo Go / dev: `npx expo start` (mesma Wi-Fi, sem `--tunnel`).
- Card compartilhável com imagem: requer DEV BUILD/APK (`npx eas build --profile preview --platform android`).
- Ao importar `react-native-reanimated` pela primeira vez, reiniciar com cache limpo: `npx expo start -c`.

## Comandos úteis
- Typecheck: `npx tsc --noEmit -p tsconfig.json`
- Limpar cache dev: `npx expo start -c`
