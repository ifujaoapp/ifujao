# STATUS — StudyFlow

## Sessão atual (2026-09-02) — Performance do mapa (pulse + banner)

### Pulse removido dos pins de pets
- **O que:** Removida a animação `pawPulse` (3s ease-out infinite) que
  pulsava atrás do ícone de pata dos pets perdidos, encontrados,
  encontrados-confirmados e perdidos-denunciados.
- **Por quê:** Cada pulse repinta uma camada a 3s infinitamente. Em
  visão geral do mapa com muitos pets, isso sobrecarrega o compositor.
- **Arquivos:** `components/home/MapLeaflet.tsx` — `.paw-pulse*` e
  `@keyframes pawPulse` removidos do `<style>`; 4 `<div class="paw-pulse...">`
  substituídas por `<div></div>`.

### Pulse removido do pin de patrocinador
- **O que:** Removida a animação `sponsorPulse` (2.8s) que pulsava o
  box-shadow do `🛍️` (estrela) do patrocinador.
- **Por quê:** Mesmo motivo do pulse dos pets — paint constante no
  compositor. O `box-shadow:0 0 0 5px rgba(255,149,0,0.35)` estático
  continua para dar a aura do pin.
- **Arquivos:** `components/home/MapLeaflet.tsx` — `animation:sponsorPulse`
  removido do `.sponsor-star`; `@keyframes sponsorPulse` removido.

### Bug: banner do pássaro sumia antes de sair do mapa
- **Sintoma:** Em zooms mais altos (>=14), o pássaro desaparecia antes
  do banner (270px) sair completamente pela borda esquerda.
- **Causa:** A folga extra era calculada como 60% da largura visível
  **em graus** (`extraLng = totalLng * 0.6`). Em zoom 14, a largura
  visível em graus é pequena (~0.005-0.01°), então 60% disso não
  cobria os 270px do banner.
- **Solução:** Converter a folga para pixels usando
  `pxPerDeg = map.getSize().x / totalLng` e exigir 280+40=320px de
  folga (banner + margem). Agora o pássaro continua voando até o
  banner inteiro sair, independente do zoom.
- **Arquivos:** `components/home/MapLeaflet.tsx` — `__setupBird`
  calcula `extraLng` em pixels.

### Tentativa de overlay HTML (revertida)
- **O que foi tentado:** Substituir o `L.marker + setLatLng` por uma
  div overlay HTML com `transform: translate3d` (animação GPU, sem
  redraw do Leaflet). Objetivo: reduzir travadinhas no espelhamento
  de tela W11.
- **Resultado:** Performance no espelhamento não melhorou
  perceptivelmente; o tap continuou funcionando.
- **Decisão:** Revertido para a versão `L.marker` em `f09b980`. O
  `pickNearestSponsors` (8 mais próximos) e o tempo aleatório (16-30s)
  foram mantidos.

### Pendências
- Investigar otimização alternativa para o espelhamento W11 (ex.:
  `L.canvas` em vez de `L.svg` para os tiles; ou reduzir a área do
  WebView com `viewport`).

---

## Sessão 2026-09-02 (anterior) — Pássaro Lottie e melhorias do patrocinador

### Pássaro Lottie como sponsor animado dentro do mapa
- **O que:** Pássaro animado em Lottie (`assets/sponsor-bird.json`) carregado
  via `lottie-web` (CDN) dentro do HTML do Leaflet. Voa da direita para a
  esquerda carregando um card compacto do patrocinador (logo, nome,
  distância, badge "Ad"). Tap em qualquer parte do banner envia mensagem
  para o RN abrir o `SponsorDetailModal`.
- **Decisões técnicas:**
  - `L.marker` + `L.divIcon` (não overlay HTML separado) — assim o pássaro
    fica dentro do mundo do mapa e se move junto com o pan/zoom.
  - `zIndexOffset: 500` (abaixo dos pets em 1000) para pets sempre prevalecerem.
  - `requestAnimationFrame` para movimento linear suave (16s, com folga de
    60% da largura visível para o banner sair inteiro).
  - Troca de sponsor a cada ciclo: `__pickSponsor` faz `Math.random` no
    array, destruindo a animação anterior (`birdAnim.destroy()`) e criando
    nova instância.

### Card do patrocinador (atrás do pássaro)
- **Dimensões:** 200×40px, retangular com sombra, cor `#FF9500`.
- **Linha 1:** logo 26×26 (ou 🛍️ fallback) + nome do patrocinador em 9px
  negrito, com `text-overflow:ellipsis`.
- **Linha 2:** distância do usuário (9px) à esquerda + badge "Ad" (8px
  bold em fundo translúcido) à direita, via `flex space-between`.
- **Distância:** calculada via `__haversine` no JS da WebView quando o RN
  injeta `__userLatLng` (em `MapLeaflet` via `__setUserLatLng`).

### Limitação a 8 sponsors mais próximos
- **Problema:** com 100+ sponsors cadastrados, mostrar todos em sequência
  é inviável (poluição visual e anúncios irrelevantes distantes).
- **Solução:** `pickNearestSponsors(list, center, n=8)` em `lib/sponsors.ts`
  filtra os 8 mais próximos do `userLocation` (ou do centro do mapa como
  fallback) via haversine. Sem centro, embaralha toda a lista. O resultado
  é injetado no pássaro via `nearestSponsors` memoizado no `MapLeaflet`.
- **Arquivos:**
  - `lib/sponsors.ts` — novo helper `pickNearestSponsors`
  - `components/home/MapLeaflet.tsx` — `nearestSponsors` em useMemo, deps
    `[sponsors, userLocation, center]`; useEffect do pássaro usa essa lista

### Tempo entre aparições aleatório (16-30s)
- **Problema:** vôo fixo de 16s ficava repetitivo e cansativo.
- **Solução:** duração do vôo aleatória entre 16000ms e 29999ms
  (`Math.floor(Math.random() * 14000) + 16000`). Pausa entre ciclos
  também aleatória 1-3s.
- **Arquivos:** `components/home/MapLeaflet.tsx` — `__setupBird` /
  `step` com `duration` e pausa randomizados.

### Y do pássaro mais flexível
- **Problema:** pássaro aparecia sempre na faixa central do mapa
  (25-75% da altura), nunca perto do topo.
- **Solução:** faixa ampliada para 5-85% da altura visível, evitando
  apenas os 15% mais altos/baixos (onde o banner seria cortado pela UI
  do mapa).
- **Arquivos:** `components/home/MapLeaflet.tsx` — `startLat` em
  `__setupBird`.

### Bug: pássaro só aparecia após reload manual
- **Causa:** `mapReady` não voltava a `false` quando o `center` mudava
  (e a WebView recarregava), então os `useEffect` não re-disparavam
  para injetar `__setSponsorsBird` e `__setUserLatLng`.
- **Solução:** o `onLoad` agora re-injeta os sponsors filtrados
  (`nearestSponsorsRef.current`) e a posição do usuário
  (`userLocationRef.current`) após cada carregamento.
- **Arquivos:** `components/home/MapLeaflet.tsx` — `onLoad` do WebView.

### Pendências
- Nenhuma. Lint e type-check limpos.

---

## Sessão 2026-09-02 (anterior-2) — Filtro "Todos" e pets reencontrados

### Bug crítico: pets reencontrados somiam do mapa
- **Sintoma:** Ao alternar para o filtro "Todos" (`showOnlyMine: false`),
  pets do próprio device somiam do mapa (mas o contador `totalPetsNoMapa`
  ainda os contava, gerando inconsistência entre o número do badge e os
  pins visíveis).
- **Causa raiz:** A função `withinFoundWindow` no script HTML inicial do
  `MapLeaflet.tsx` referencia `_serverNow` que nunca é declarado no
  escopo global, então a checagem `(_serverNow - t) <= 48h` sempre
  retornava `NaN <= …` = `false`. Pets com `foundAt` definido eram
  descartados no `addMarker` (`if (p.foundAt && !withinFoundWindow(...)) return;`).
- **Correção:** O `renderPetsJs` agora sobrescreve `window.withinFoundWindow`
  com a versão correta (usando `_serverNow` capturado na hora da injeção)
  e o `addMarker` chama `window.withinFoundWindow`. Pets reencontrados
  voltam a aparecer no mapa (dentro da janela de 48h).
- **Arquivos:** `components/home/MapLeaflet.tsx`.

### Contador do mapa consistente com o filtro do MapLeaflet
- `totalPetsNoMapa` (badge azul) agora ignora pets reencontrados fora da
  janela de 48h, alinhando com o filtro que oculta esses pins no mapa.
- Cálculo: `visiblePetsOnMap = visiblePets.filter(p => !p.foundAt || now - foundAt <= 48h)`.
- `pendingMatches` continua usando o `visiblePets` completo (matches
  pendentes não devem ser escondidos pela janela de reencontro).
- **Arquivos:** `app/(tabs)/index.tsx`.

### Banner "Encontrado!" não flutua mais sobre a foto
- O banner saía de dentro do `reportImageWrap` (que era `position: relative`
  com o banner em `position: absolute`, `top: 10`, `alignSelf: center`),
  ficando sobreposto à imagem.
- Agora o banner é renderizado **entre as fotos e o nome do pet**, com
  `alignSelf: center`, `marginTop: 4`, `marginBottom: 6`, sem `position: absolute`.
- Novo estilo `foundBannerInline` adicionado em `app/(tabs)/index.tsx`.
- **Arquivos:** `components/home/PetDetailBase.tsx`, `app/(tabs)/index.tsx`.

### Lint: dependência faltante em useCallback
- `triggerSync` em `hooks/usePets.ts` usava `myPhone` (em `isOwner(...)`)
  mas o array de deps do `useCallback` só tinha `[myDeviceId]`.
- Adicionado `myPhone` ao array de deps.
- **Arquivos:** `hooks/usePets.ts`.

### Pendências
- Nenhuma. Lint e type-check limpos.

---

## Diretrizes gerais (sempre aplicar)
- **Tema claro/escuro em TODAS as telas:** qualquer tela/componente novo ou modificado
  deve usar as variáveis de tema (`themeColors` / `c.*` de `constants/theme`) em vez de
  cores hardcoded. Nunca usar hex fixo para fundo, texto, borda ou ícone — senão some no
  tema escuro. Falha recorrente já corrigida: estilos de `claimants*` (PetFoundModal/
  index.tsx) estavam com `#1C1C1E`/`#F2F2F7` hardcoded e os nomes dos pets sumiam no escuro.

## Sessão (2026-08-31) — Verificação de posse (Tier 1 + Tier 2)

### Tier 1 — Prova de posse estruturada
- `pet_match_proofs` agora tem `proof_image` (caminho no bucket restrito) e `microchip`.
- Novo bucket **restrito** `match-proofs` (private, não público): imagem de prova só é
  lida via URL assinada pelas duas partes + moderação (policy `match-proofs parties read`
  cruza `proof_image` com a linha de `pet_match_proofs`).
- `lib/matchProofs.ts`: `uploadMatchProofImage` (upload p/ bucket restrito),
  `getProofImageSignedUrl` (URL assinada 1h), `upsertMatchProof` agora recebe
  `{ microchip, proofImage, notes }`.
- `components/home/PetFoundModal.tsx`: dono que reclama anexa **foto de comprovação**
  (galeria), informa **microchip** (validado 9–15 dígitos) e observações. Enviar exige
  ao menos um dos três.

### Tier 2 — Checagem automática de compatibilidade
- `lib/matchScore.ts`: `computeMatchCompat(lost, found)` cruza espécie (+40), raça (+30),
  proximidade geo por haversine (<=3km +30 / <=10km +20 / <=30km +10) e plausibilidade
  temporal perdido<=achado (+10). Resulta em score 0-100 e nível alta/media/baixa.
- Na tela do finder, cada claimant mostra: foto da prova, microchip, observações e um
  bloco **Compatibilidade** (score % + nível + flags legíveis) para apoiar confirmar/disputar.

### Pendências
- Aplicar `supabase/migrations/20260831000000_match_proof_image_and_scores.sql` (ou
  `supabase db push` a partir de `schema.sql` atualizado) no projeto Supabase.
- Microchip registry externo (Tier 5) fica para depois.


## Sessão atual (2026-08-27/28)

### Refatoração dos modais de pet
- `PetDetailModal.tsx` foi separado em:
  - `PetDetailBase.tsx` — chrome compartilhado (sheet, imagens, nome, local, descrição, ações comuns, modal de descrição, shareCard).
  - `PetFoundModal.tsx` — lógica de achado (claimants, reivindicação com prova, WhatsApp pós-confirmação).
  - `PetLostModal.tsx` — lógica de perdido (banner "ME AJUDE A VOLTAR PARA CASA!", ações de contato/denúncia/compartilhar).
  - `petModalActions.ts` — helpers compartilhados para ações (contato, denunciar, apagar, desfazer denúncia, marcar/desmarcar encontrado).
- O call site em `app/(tabs)/index.tsx` agora escolhe o modal conforme `postType`.

### Reivindicação de achado (match/claims)
- Fluxo: "É o seu pet?" → escolhe pet perdido (se houver vários) → envia prova (texto) via `upsertMatchProof` → cria `matchedPetId`/`matchStatus:'pending'`/`matchRequestedBy:'owner'`.
- Finder vê claimants com prova e pode Confirmar/Disputar. Confirmar marca `confirmed` em ambos os posts e **invalida os demais** claimants automaticamente.
- WhatsApp do finder só aparece após `matchStatus === "confirmed"` (opção 2). Antes disso, contato direto fica oculto.
- Se o viewer não tiver pet perdido, aparece banner amarelo: "Registre um pet perdido para reivindicar este pet encontrado".

### Imagens no card
- `ImageCarousel` removido do card.
- Miniaturas horizontais centralizadas em um card compacto (`56x56`), com fundo/borda adaptáveis ao tema.

### HelpFindBanner
- Texto alterado para "ME AJUDE A VOLTAR PARA CASA!" com cor vermelha e fonte ajustada para caber no modal.

### Limpeza / qualidade
- Lint limpo (0 erros, 0 warnings).
- Type-check limpo.
- `.gitignore` ganhou `bugreport-*.zip` (arquivo de diagnóstico Android/Expo não deve ser commitado).
- `PetDetailModal.tsx` antigo removido.

### Backend/sincronização (mantido)
- Cursor incremental usa `updated_at` e `deleted_at` do servidor.
- Limpeza de match fantasma quando contraparte é apagada.
- Modo deus zera vínculo de match no pet e contrapartes.

---

## Sessão atual (2026-08-31) — Termo de Uso e Política de Privacidade

### Substituição do conteúdo do modal
- Criado `components/home/TermsContent.tsx` com o conteúdo do termo de uso/política de privacidade convertido para componentes React Native (sem markdown).
- Atualizado `PrivacyModal` em `components/home/Modals.tsx` para utilizar `<TermsContent />`.
- Editado o termo (`termo-de-uso-privacidade.md`):
  - Clausula 1.1 ajustada (removido "sem fins lucrativos e").
  - Adicionada cláusula 1.4: Exibição de Publicidade e Monetização.
  - Reforço em 7.3/7.4 sobre recebimento de mensagens via WhatsApp.

### Ajustes de UI
- Título do modal alterado de "Política de Privacidade" para "Termo de Uso e Política de Privacidade".
- Reduzido `aboutCard.padding` de 24 para 16.
- Reduzido `privacyScroll.maxHeight` de 70% para 65%.
- Removido `textAlign: "justify"` de `privacyText` (texto alinhado à esquerda).
- Ajustado `privacyText.fontSize` de 14 para 12 (mais compacto).
- Tamanhos de fonte reduzidos em `TermsContent.tsx` (títulos: 18→15, 16→13).
- Botão "Fechar" centralizado verticalmente usando wrapper `<View style={{ flex: 1, justifyContent: "center" }}>`.
- Adicionado `alignSelf: "center"` em `aboutClose` para centralização horizontal.

### Arquivos criados
- `components/home/TermsContent.tsx` — componente com o texto do termo formatado.

### Pendências
- Nenhuma. Lint e type-check limpos.

---

## Sessão atual (2026-08-31) — Fluxo de Reivindicação (Claim) e Melhorias

### Validação de reivindicação (PetFoundModal)
- Adicionada verificação de **espécie diferente** entre pet perdido e pet encontrado no passo "pick" (aviso laranja).
- Adicionada verificação de **data inconsistente** (pet sumiu depois de ter sido encontrado) no passo "pick" (aviso laranja).
- Adicionado **emoji da espécie** (🐶 Cachorro, 🐱 Gato, etc.) antes do nome do pet na lista de seleção.
- Adicionada informação **"Desapareceu em DD/MM/YYYY"** abaixo do nome do pet.

### Ajustes de UI
- Miniaturas dos pets nos modais aumentadas de 56x56 para 80x80 (`PetDetailBase.tsx`).
- `aboutCard` recebeu `maxHeight: "85%"` para evitar overflow.
- Texto do termo de uso ajustado: identificação do controlador movida para seção 11, lei aplicável para seção 12.

### Arquivos criados
- `lib/terms.ts` — helper para aceite dos termos (SecureStore).

### Arquivos modificados
- `components/home/PetFoundModal.tsx` — validações de claim + emoji + data.
- `components/home/PetDetailBase.tsx` — miniaturas 80x80.
- `components/home/Modals.tsx` — `PrivacyModal` com checkbox + 2 botões (Continuar/Cancelar).
- `components/home/TermsContent.tsx` — texto do termo atualizado.
- `components/home/ReportModal.tsx` — recebe prop `onNeedAcceptTerms`.
- `hooks/useReportForm.ts` — verifica aceite dos termos antes de publicar.
- `app/(tabs)/index.tsx` — gerencia modal de aceite + import `setTermsAccepted`.
- `termo-de-uso-privacidade.md` — texto do termo atualizado.

### Pendências
- Nenhuma. Lint e type-check limpos.

---

## Sessão atual (2026-08-31) — Correção da rolagem do modal pet

### Problema
A rolagem do modal pet não funcionava corretamente. Algumas áreas rolavam (imagens, botões) mas outras não (nome do pet, local, data).

### Causa raiz
O `Animated.View` do sheet tinha `onStartShouldSetResponder={() => true}` e `onTouchStart={(e) => e.stopPropagation()}`, que capturavam **todos os toques** e impediam o `ScrollView` interno de se tornar o responder para rolar.

### Solução
Separar o backdrop (área escura que fecha o modal) do sheet (conteúdo) como **irmãos** em vez de pai-filho:
- `TouchableOpacity` (backdrop) → fecha o modal ao toque
- `Animated.View` (sheet) → contém o ScrollView, não propaga toques para o backdrop
- `ScrollView` → recebe toques normalmente e rola

### Arquivos modificados
- `components/home/PetDetailBase.tsx` — estrutura do modal pet
- `components/home/PetFoundModal.tsx` — claim sheet com mesma correção

### Pendências
- Nenhuma. Lint e type-check limpos.

---

## Sessão atual (2026-09-01) — Correção de RLS no match e UI do banner

### Correção de RLS ao confirmar match
- **Problema:** Ao confirmar um pet, o sync tentava pushar ambos os pets (perdido + encontrado), mas o finder não era dono do pet perdido → erro RLS.
- **Solução:** 
  - Criada Edge Function `confirm-match` que atualiza ambos os pets com `service_role` (bypassa RLS)
  - Sync agora pula pets que não pertencem ao dispositivo atual
  - `resolveMatch` atualiza UI localmente + chama Edge Function para o servidor

### Melhorias na UI do banner de reivindicação
- **Banner "Reivindicação confirmada":** Fundo verde (`#34C759`), ícone `checkmark-circle`, texto branco destacado
- **Banner pendente:** Fundo laranja (`#FF9500`), ícone `time-outline`
- **Banner de claimants:** Usa `themeColors.primaryButton` em vez de cor fixa, com ícone de alerta

### Ajustes no botão "Entrar em contato"
- Padding interno corrigido (`paddingHorizontal: 16`)
- Espaçamento entre ícone e texto (`marginRight: 8`)
- Fonte ajustada (17px para botão primário) com `adjustsFontSizeToFit` para evitar overflow

### Arquivos criados
- `supabase/functions/confirm-match/index.ts` — Edge Function para confirmar match
- `lib/confirmMatch.ts` — helper para chamar a Edge Function

### Arquivos modificados
- `components/home/PetFoundModal.tsx` — banner de reivindicação + filtro de claimants pendentes
- `components/home/PetDetailBase.tsx` — estilo dos botões de ação
- `lib/sync.ts` — sync não pusha pets de terceiros

### Pendências
- Nenhuma. Lint e type-check limpos.

---

## Sessão atual (2026-08-31) — UX do Fluxo de Reivindicação e Correções

### Melhorias no PetFoundModal (Claim)
- **Banner de alerta**: Quando há reivindicações pendentes, aparece banner laranja "🔔 Você tem 1 reivindicação pendente. Confirme se é o pet correto."
- **Auto-expansão**: A seção de claimants abre automaticamente na primeira montagem para mostrar os detalhes.
- **Ocultar "Marcar como encontrado"**: Quando há claims pendentes, o botão é substituído por "Confirme as reivindicações pendentes" (desabilitado).
- **Validação de espécie**: Mostra aviso "⚠️ Espécie diferente: seu pet é X e o pet encontrado é Y" quando as espécies não batem.
- **Validação de data**: Mostra aviso "⚠️ A data que este pet sumiu é posterior à data que o pet encontrado foi visto" quando há inconsistência temporal.
- **Correção do toggle**: A expansão/colapso dos detalhes do claimant agora funciona corrigidamente (usando `useRef` para controlar auto-expansão apenas na montagem).

### Pendências
- Nenhuma. Lint e type-check limpos.

---

## Sessão atual (2026-09-01) — Correção de Timezone e Modal de Claim

### Correção de timezone nas datas
- **Problema:** Datas de perdido/achado gravavam com dia anterior no emulador (fuso ahead of UTC).
- **Causa:** `toISOString()` converte para UTC, podendo voltar 1 dia em fusos ahead of UTC.
- **Solução:** Criada função `toLocalISOString()` em `hooks/useReportForm.ts` que ajusta o offset antes de converter.
- **Exibição corrigida:** `formatLostDate` (breeds.ts) agora usa `{ timeZone: "UTC" }`.
- **MapLeaflet.tsx:** Funções `formatRelDays` e `relDays` ajustadas para usar métodos UTC (`getUTCDate`, etc.).

### Modal de Claim (É o seu pet?)
- **Problema:** TextInput de microchip/observações cobertos pelo teclado, sem rolagem.
- **Solução:** claimSheet agora é um **Modal separado** com `KeyboardAvoidingView` (behavior="padding").
- **Estrutura:**
  - `Modal` com `animationType="slide"` e `statusBarTranslucent`
  - `KeyboardAvoidingView` empurra conteúdo para cima quando teclado abre
  - `ScrollView` com `keyboardShouldPersistTaps="handled"` permite rolar tocando nos inputs
  - Padding inferior no `contentContainerStyle` evita corte pelo menu do celular
- **Botão "Voltar" removido** — usuário fecha no X ou tocando fora.

### Ajustes de UI
- **Banner "Confirme as reivindicações pendentes":** Agora com fundo laranja (#FF9500), texto branco, e `fontSize: 18`.
- **Banner "Reivindicação enviada":** Fonte 14px com `adjustsFontSizeToFit` para não estourar.
- **Botões desabilitados:** Cor de texto alterada de `#C7C7CC` para `#636366` (mais legível).
- **Fonte dos botões:** Adicionada prop `fontSize` ao `BarAction` para customização.

### Arquivos modificados
- `hooks/useReportForm.ts` — `toLocalISOString()` para corrigir timezone
- `constants/breeds.ts` — `formatLostDate` com `timeZone: "UTC"`
- `components/home/MapLeaflet.tsx` — funções de data usando UTC
- `components/home/PetFoundModal.tsx` — Modal separado para claim, banners melhorados
- `components/home/PetDetailBase.tsx` — prop `fontSize` em `BarAction`
- `app/(tabs)/index.tsx` — ajustes nos estilos de botões

### Pendências
- Nenhuma. Lint e type-check limpos.

---

## Sessão atual (2026-09-01) — Badge "Reunido" e Ações Confirmadas

### Badge 🏠 Reunido no pin do mapa
- **Problema:** Quando pet é confirmado como devolvido ao dono, o pin voltava ao estado "achado" normal, confundindo outros usuários.
- **Solução:** Pin agora mostra badge ✓ verde + label "🏠" quando `confirmed === true`.
- **Lógica:** Pet `found` é considerado `confirmed` se existe algum pet perdido com `matchedPetId === p.id` e `matchStatus === 'confirmed'`.
- **Arquivos:** `components/home/MapLeaflet.tsx` — `buildPetIcon` agora aceita parâmetro `confirmed`.

### Desabilitar Denunciar/Compartilhar quando confirmado
- **Problema:** Ações de denunciar e compartilhar continuavam habilitadas após confirmação.
- **Solução:** Adicionada propriedade `confirmedDisabled` em `BarAction` que desabilita o botão quando `selectedPet.confirmed === true`.
- **Arquivos:**
  - `components/home/PetDetailBase.tsx` — `renderBtn` verifica `confirmedDisabled`
  - `components/home/petModalActions.ts` — `buildShareAction` e `buildReportAction` com `confirmedDisabled: true`
  - `components/home/PetFoundModal.tsx` — calcula `confirmedPet` com `useMemo`
  - `components/home/PetLostModal.tsx` — calcula `confirmedPet` com `useMemo`
  - `lib/storage.ts` — adicionado campo `confirmed?: boolean` em `PetRecord`

### Correção: confirmed persiste ao filtrar meus/todos
- **Problema:** Ao clicar em "meus", o pin voltava a mostrar "achado" em vez de "reunido".
- **Causa:** O filtro removia o pet perdido (do dono), perdendo a referência para calcular `confirmed`.
- **Solução:** `confirmed` é calculado ANTES da filtragem via `useMemo` em `app/(tabs)/index.tsx` (`enrichedPets`).
- **Arquivos:** `app/(tabs)/index.tsx` — `enrichedPets` com `confirmed` calculado antes do filtro.

### Arquivos modificados
- `app/(tabs)/index.tsx` — `enrichedPets` para calcular confirmed antes de filtrar
- `components/home/MapLeaflet.tsx` — badge 🏠 e contador de claims corrigido
- `components/home/PetDetailBase.tsx` — `confirmedDisabled` em BarAction
- `components/home/PetFoundModal.tsx` — `confirmedPet` com useMemo
- `components/home/PetLostModal.tsx` — `confirmedPet` com useMemo
- `components/home/petModalActions.ts` — `confirmedDisabled` em share/report
- `lib/storage.ts` — campo `confirmed` em PetRecord

### Pendências
- Nenhuma. Lint e type-check limpos.

## Sessão 2026-09-02/03 — Sistema de banimento (modo deus)

### Objetivo
Adicionar um sistema completo de banimento de usuários para que
moderadores autenticados (`is_moderator: true` no JWT do `god-login`)
possam banir/desbanir donos de pets via long-press no pin de qualquer
pet no mapa, com efeito imediato (com cooldown de UI e tela cheia de
"em análise" para o dispositivo banido).

### Implementação
- **Tabela `banned_users`** (`supabase/banned_users.sql`):
  - Colunas: `id uuid pk`, `device_id text`, `phone text`, `banned_by text`,
    `banned_at timestamptz`, `unbanned_at timestamptz null`,
    `reason text null`, `expires_at timestamptz null`.
  - Índices parciais em `device_id` e `phone` onde `unbanned_at IS NULL`.
  - RLS: `SELECT` público (anon + authenticated) para checagem no
    cliente; `INSERT/UPDATE/DELETE` apenas `service_role` (chamadas
    via Edge Function).
- **Edge Function `ban-user`** (`supabase/functions/ban-user/index.ts`):
  - `POST` com `Authorization: Bearer <jwt>`.
  - Valida `is_moderator: true` no payload do JWT (assinado pelo
    `god-login`).
  - Body: `{action: "ban" | "unban", deviceId?, phone?, reason?, expiresAt?}`.
  - Upsert de ban (com `unbanned_at = null`); unban seta `unbanned_at`.
  - Usa `SUPABASE_SERVICE_ROLE_KEY`.
- **`lib/bans.ts`**: helpers `checkBan`, `banUser`, `unbanUser`,
  `listActiveBans`. Cache em `SecureStore` (chave `banned_cache_v1`)
  com TTL de 60s; `checkBan` é offline-first (cache → fallback rede).
  `banUser`/`unbanUser` chamam a Edge Function e invalidam o cache.
- **`src/components/BanProvider.tsx`** (Context):
  - Lê `deviceId` (de `lib/deviceId.ts`) e checa ban na montagem.
  - Polling a cada **60s** enquanto app está em foreground.
  - Listener `AppState` para recheck imediato ao voltar do background.
  - Exposição: `isBanned`, `banInfo`, `refresh()`, `clearLocal()`.
- **`src/components/BannedScreen.tsx`**: tela cheia, sem ações,
  mensagem **não ofensiva** ("Sua conta está em análise por atividade
  incomum. Caso acredite que houve engano, entre em contato com o
  suporte."). Tema claro/escuro via `themeColors`.
- **`app/_layout.tsx`**: agora envolve com `<BanProvider>` e renderiza
  `<BannedScreen>` quando `isBanned`, **substituindo** o `<Stack>` (o
  app inteiro fica bloqueado).
- **Long-press no pin de pet (godMode)**:
  - `MapLeaflet.tsx` ganhou um helper `__attachLongPress(el, petId)`
    que dispara `postMessage({type:"petLongPress", petId, deviceId, phone, contact})`
    após **500ms** de pointer-down sem pointer-up/move.
  - Chamado em ambos os pontos onde pins de pet são renderizados
    (`__renderPets` no escopo global e no escopo de `__initMap`).
  - `MapLeaflet` aceita prop `onPetLongPress(info)`; `MapArea.tsx`
    propaga; `app/(tabs)/index.tsx` recebe e abre
    `ModerationDetailModal` para o pet correspondente.
- **`components/home/ModerationDetailModal.tsx`** (novo): exibe dados
  do dispositivo (deviceId, phone, contact, plataforma, app version,
  total de pets, banido?), com botões "Banir usuário" (vermelho) e
  "Liberar banimento" (verde). `banUser` desabilitado por **60s** após
  sucesso (cooldown). `unbanUser` requer confirmação via `Alert`.

### Integração no `app/(tabs)/index.tsx`
- Import de `ModerationDetailModal` adicionado.
- `const [modPet, setModPet] = useState<PetRecord | null>(null)`
  declarado após `useMapLocation`.
- `onPetLongPress={(info) => { const p = pets.find(x => x.id === info.petId); if (p) setModPet(p); }}`
  passado para `<MapArea>`.
- `<ModerationDetailModal visible={!!modPet} pet={modPet} allPets={pets} onClose={() => setModPet(null)} />`
  renderizado antes de `<GodLoginModal>`.

### Validação
- `npm run lint` — 0 erros / 0 warnings.
- A confirmar: deploy da Edge Function e aplicação da migration
  `banned_users.sql` no Supabase.

### Arquivos
- `supabase/banned_users.sql` (novo)
- `supabase/functions/ban-user/index.ts` (novo)
- `lib/bans.ts` (novo)
- `src/components/BanProvider.tsx` (novo)
- `src/components/BannedScreen.tsx` (novo)
- `components/home/ModerationDetailModal.tsx` (novo)
- `app/_layout.tsx` — `<BanProvider>` + gate `BannedScreen`
- `app/(tabs)/index.tsx` — `modPet` + handler + modal
- `components/home/MapLeaflet.tsx` — `__attachLongPress` em 2 escopos
- `components/home/MapArea.tsx` — prop `onPetLongPress`

### Pendências
- Deploy da Edge Function `ban-user` (`supabase functions deploy ban-user`).
- Aplicar migration no Supabase.
- Documentar em `AGENTS.md` que o JWT de `god-login` precisa ter
  `is_moderator: true` (já é o caso atual).
