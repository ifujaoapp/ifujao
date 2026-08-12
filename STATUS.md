# STATUS — Projeto iFujão (StudyFlow)

Última atualização: 2026-08-12
Branch: `master` (sem push para o GitHub).

## Onde paramos
Todas as features pedidas foram implementadas e o `tsc --noEmit` passa sem erros.
A única mudança não commitada está em `app/(tabs)/index.tsx` (+236 / -39 linhas).

## O que foi feito nesta sessão (sobre o commit 5354502)
1. **Denúncia de pet**
   - Botão "Denunciar" no card do pet (laranja `#FF9500`, ícone `flag`).
   - Modal de denúncia com lista de motivos e botão X de fechar IGUAL ao `demoClose`
     do card (fundo `rgba(0,0,0,0.5)`, 36x36, borderRadius 18, ícone branco).
   - `PetPost` ganhou `reported?`, `reportReason?`, `reportedBy?`.
2. **Pet denunciado no card**
   - Foto borrada (`ImageCarousel` recebe `blurRadius={18}` quando `reported`).
   - Texto "DENUNCIA" vermelho (`#FF3B30`) centralizado sobre a imagem.
   - Botão "Entrar em contato" desabilitado (`disabled` + opacidade 0.4) quando denunciado.
3. **Apagar denúncia / apagar alerta**
   - "Apagar denúncia" (azul `#0A84FF`): visível para dono **ou** denunciante; limpa só
     `reported`/`reportReason`/`reportedBy` (NÃO apaga o post).
   - "Apagar alerta" (vermelho, só dono): apaga o post inteiro (`deletePet`).
4. **Formulário reportar pet**
   - Campo "Contato" pré-preenchido com `myPhone` (formatado) ao abrir.
5. **Balão "toque para reportar"**: visual de gibi (branco, borda preta, setinha) e
   pisca em loop (aparece ~2,2s, somo ~0,4s, espera ~1,2s) via `Animated`.
6. **Som removido** do botão da patinha (`playClickSound` e import `Audio` removidos).
7. **Compartilhar corrigido**
   - Voltou a `Share.share` (react-native core), abre o sheet nativo padrão.
   - Texto: "🐾 iFujão — ajude a encontrar pets perdidos! ... https://ifujao.app".
   - `react-native-share` foi testado mas CRASHA no Expo Go (módulo nativo não linkado);
     foi removido. Funciona em APK, mas mantemos o core para testar via Expo Go.
   - zIndex da `sideToolbar` subido para 20 (+elevation) e WebView do mapa recebeu
     `zIndex: 0`, para a barra lateral não ser coberta pelo mapa.
8. **Modal reportar pet**: envolvido em `KeyboardAvoidingView` para o teclado não
   cobrir o campo no APK Android (`keyboardShouldPersistTaps="handled"`).
9. **Modal "i" (informação)**: removida redundância da palavra "contato" e adicionado
   `logo.png` (`assets/images/logo.png`, 72x72) acima do título.

## Pendências conhecidas
- Botão "Sair" no Android (`BackHandler.exitApp()` não funciona no Android moderno):
  decisão pendente (minimizar vs native module + novo APK).
- Push para o GitHub (opcional).
- Tratar pets denunciados no mapa (ocultar/marcar) — opcional.
- URL de compartilhamento `https://ifujao.app` é placeholder; trocar pela real.

## Como testar
- Expo Go / dev: `npx expo start` (mesma Wi-Fi, sem `--tunnel`).
- APK: `npx eas build --profile preview --platform android` (usar `--clear-cache` se necessário).

## Comandos úteis
- Typecheck: `npx tsc --noEmit -p tsconfig.json`
- Limpar cache dev: `npx expo start -c`
