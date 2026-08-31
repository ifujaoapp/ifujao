# STATUS — StudyFlow

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

## Sessão atual (2026-08-31) — UX do Fluxo de Reivindicação e Correções

### Melhorias no PetFoundModal (Claim)
- **Banner de alerta**: Quando há reivindicações pendentes, aparece banner laranja "🔔 Você tem 1 reivindicação pendente. Confirme se é o pet correto."
- **Auto-expansão**: A seção de claimants abre automaticamente na primeira montagem para mostrar os detalhes.
- **Ocultar "Marcar como encontrado"**: Quando há claims pendentes, o botão é substituído por "Confirme as reivindicações pendentes" (desabilitado).
- **Validação de espécie**: Mostra aviso "⚠️ Espécie diferente: seu pet é X e o pet encontrado é Y" quando as espécies não batem.
- **Validação de data**: Mostra aviso "⚠️ A data que este pet sumiu é posterior à data que o pet encontrado foi visto" quando há inconsistência temporal.
- **Correção do toggle**: A expansão/colapso dos detalhes do claimant agora funciona corrigidamente (usando `useRef` para controlar auto-expansão apenas na montagem).

### Melhorias no PetDetailBase
- **ScrollView no modal**: Adicionado `ScrollView` no conteúdo do modal (`maxHeight: "90%"` no `Animated.View`) para evitar overflow quando há muitos claimants.
- **Correção de fechamento**: O `Animated.View` agora tem `maxHeight: "90%"` para limitar o tamanho do modal.

### Pendências
- Nenhuma. Lint e type-check limpos.
