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

### Pendências / em aberto
1. **Rebuild nativo pendente** (`npx expo run:android`) para validar em runtime
   as mudanças de UI (banner AJUDE, legenda removida, pulso FAB, dropdowns).
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
