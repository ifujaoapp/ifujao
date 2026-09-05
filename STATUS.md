# Status - StudyFlow (iFujao)

## Estado atual (2026-09-04)

### Validação de espécie×foto (Gemini)
- **Edge Function `validate-species`** deployed:
  - Usa `gemini-embedding-2` multimodal (embeddings + dot product).
  - Threshold `0.35` (gato vs "Gato" ~0.36+, gato vs coelho ~0.26).
  - 1 chamada API por validação, sem banco/RPC.
  - Reusa o padrão do `embed-pets`/`search-pets` (fetch URL → base64 inline).
  - Tratamento de rate limit 429 (não bloqueia o app, retorna `mismatch: false` silencioso).
- **Client (`useReportForm`)**:
  - **Validação assíncrona pós-post** (não bloqueia o submit).
  - Upload de **só 1 foto** (a principal) pro Storage.
  - `checkSpeciesMatch({imageUrl, mimeType, chosenSpecies})` → Edge Function.
  - **Cache de validação** (`lastValidationRef`): mesma foto + mesma espécie não revalida.
  - Se mismatch, mostra alerta com 2 ações:
    - **"Apagar e refazer"** (vermelho) → remove o post, limpa formulário, reabre modal pré-selecionado em "Perdi"/"Encontrei".
    - **"Manter publicação"** (cinza) → apenas fecha o alerta.
  - `deletePet` aceita `skipConfirm` para apagar sem confirmação extra no fluxo de mismatch.

### Faixa do patrocinador (arara voadora)
- Revertido para versão **shimmer simples** (commit `6c19e04`).
- Banner `<div>` retangular com `border-radius: 8px`.
- Background: `linear-gradient(110deg, #FF8A33 0%, #FFA54D 40%, #FFD580 50%, #FFA54D 60%, #FF8A33 100%)` com `background-size: 200% 100%`.
- Animação CSS: `background-position` deslizando em 3.6s loop linear.
- `prefers-reduced-motion` desativa a animação.
- Tentativas de tremulação (rotate, skew, mask SVG, clipPath animado) foram abandonadas.

### GPS — drenagem de bateria RESOLVIDA (commit `70e9cf6`)
**Antes (vampiro de bateria):**
- `setInterval(5000)` chamando `fetchGps()` → 3 tentativas de `getCurrentPositionAsync({ accuracy: High })` com timeout 3s cada.
- Pior caso: 12s de atividade GPS por ciclo.
- `accuracy: High` ligava hardware GPS + Wi-Fi + Cell scanning.
- ~17 chamadas de GPS por minuto em foreground.

**Agora:**
- `setInterval(30000)` chamando **só** `getLastKnownPositionAsync` (instantâneo, leitura de cache, não liga hardware).
- ~2 chamadas por minuto, todas de cache.
- `fetchGps(1)` (com `accuracy: High`) só roda **1x no mount** + sob demanda no botão "Centralizar no meu GPS".
- App atualiza o pino quando o OS tem fix novo em cache.
- Sem UI nova, sem botão novo. Mesmo comportamento pro usuário.

### Título nos modais de detalhe
- Adicionado título curto no topo dos modais `PetLostModal` e `PetFoundModal`:
  - `PetLostModal` → **"Pet perdido"**
  - `PetFoundModal` → **"Pet encontrado"**
- Renderizado dentro do `PetDetailModalBase` (slot novo `title?: string`).
- Estilo: `fontSize: 16`, `fontWeight: 700`, cor `#000000`, `textAlign: center`.
- Sem pill/badge, sem ícone — texto plain centralizado.

### Scripts de reset
- `supabase/RESET_DADOS_TESTE.sql`: limpa tabelas de pets, contatos, match proofs, reveals, AI searches (mantém sponsors, moderators, banned_users).
- `scripts/reset-storage.ts`: limpa buckets `pet-photos` e `match-proofs` via Supabase JS client.
- Para usar: rodar SQL no Supabase Dashboard + `npx tsx scripts/reset-storage.ts`.

### OpenStreetMap User-Agent
- Corrigido header `User-Agent` nas requisições de tiles do OSM em `MapLeaflet.tsx`, `MapPicker.tsx` e `SponsorMap.tsx`.
- Valor: `iFujao/1.0 (https://github.com/ifujaoapp/ifujao)`.
- Evita bloqueio por parte dos servidores do OSM em produção.

### Política de privacidade (GitHub Pages)
- Repo: https://github.com/ifujaoapp/ifujao-privacidade
- URL pública: https://ifujaoapp.github.io/ifujao-privacidade/
- Páginas: `/` (Política de Privacidade) e `/termos` (Termo de Uso).
- Pronto para colar na Play Store quando for publicar.

### APK de release / Google Play
- Keystore de upload: `android/app/ifujao-upload.jks` (fora do repo, no `.gitignore`).
- `signingConfigs.release` configurado em `android/app/build.gradle`.
- `release.ps1` na raiz do projeto gera APK assinado:
  ```powershell
  .\release.ps1
  ```
  Saída: `android\app\build\outputs\apk\release\app-release.apk`
- Registro do `com.ifujao.app` em andamento no Play Console (verificação de propriedade por APK assinado).
- Ainda não é hora de publicar — faltam testes e ajustes.

### Fireworks na confirmação de pet encontrado
- Componente `components/home/FireworksLottie.tsx` com animação Lottie via WebView + `lottie-web`.
- Som via `expo-audio` (`assets/sounds/fireworks.mp3`), sincronizado com evento `DOMLoaded` do Lottie via `postMessage`.
- Trigger: quando o dono/moderador confirma um pet encontrado em `PetFoundModal` (`confirmMatch` → `onMatchConfirmed`) ou quando o dono marca como encontrado em `PetLostModal` (`buildFoundMarkAction` → `onFireworks`).
- **Não é disparado ao publicar um pet encontrado no `ReportModal`** (`handleAddPet` removido em `08512b0`).
- Posicionado na coordenada do pet no mapa (`latitude`/`longitude` + `mapRegion`).
- Loop: executa 2x (1ª imediata, 2ª após 3s).
- `app.json` atualizado com plugin `expo-audio` para Expo Dev Client.
- Requer rebuild do Dev Client após alterações no plugin.

### OpenStreetMap User-Agent
- Corrigido header `User-Agent` nas requisições de tiles do OSM em `MapLeaflet.tsx`, `MapPicker.tsx` e `SponsorMap.tsx`.
- Valor: `iFujao/1.0.0 (ifujaoapp@gmail.com)`.
- Evita bloqueio por parte dos servidores do OSM em produção.

### Visual (`AppAlert`)
- Botões sempre em **coluna** (1 por linha), separador hairline entre eles.

### Validação
- `npm run lint` passa (0 erros, 6 warnings pré-existentes).

### Animações nos pins do mapa
- Pins de pets animados via CSS `@keyframes` no `MapLeaflet.tsx` (dentro do `<style>` do WebView).
- Diferenciação por status:
  - **Perdido** (`lost`): bounce 6px, 1s `ease-in-out` — `pin-bounce-lost`
  - **Encontrado** (`found`): float 4px, 2.2s — `pin-float-found`
  - **Denúncia** (`reported`): pulse scale/opacity, 3s — `pin-pulse-report`
  - **Reencontro confirmado**: float 4px, 3s — `pin-anim-confirmed`
- Animações aplicadas no **inner div** do `L.divIcon` com `transform-origin: center bottom`, mantendo `iconAnchor` fixo na coordenada GPS.
- Respeita `prefers-reduced-motion` (desabilita se configurado no SO).
- Classe `.pin-anim-*` aplicada ao wrapper interno do pin; outer div mantém `className: 'paw-pin'` para sombras e posicionamento do Leaflet.

### Commits dessa sessão (já no `origin/main`)
| Hash | Descrição |
|---|---|
| `87c635a` | feat(modal): título 'Pet perdido' / 'Pet encontrado' no topo dos modais |
| `aeb6eec` | feat: validação assíncrona de espécie com Gemini + compressão de imagem |
| `31da76b` | chore: atualiza app.json e dependências (dotenv) |
| `aabde8c` | feat: validação assíncrona com gemini-embedding-2 + alerta apagar/refazer |
| `9de2e07` | fix(map): adiciona User-Agent nas requisições de tiles do OpenStreetMap |
| `7a15632` | feat: fireworks overlay on pet found confirmation + OSM User-Agent + expo-audio plugin |
| `a741278` | feat: fireworks Lottie via WebView + expo-audio sync via postMessage |
| `08512b0` | fix: remove fireworks trigger from report pet found flow |
| `50d0dc0` | feat(map): add smooth bounce/pulse animations to pet pins by status |

### Edge Functions deployed
| Função | Status |
|---|---|
| reveal-contact | ACTIVE |
| search-pets | ACTIVE |
| embed-pets | ACTIVE |
| god-login | ACTIVE |
| confirm-match | ACTIVE |
| ban-user | ACTIVE |
| get-contact | ACTIVE |
| **validate-species** | **ACTIVE** |

## Pendente
- Publicação na Play Store (aguardando testes e correções)
- Edição de posts (usuário não consegue corrigir espécie após publicar)
- Possível migração para AAB (App Bundle) quando for subir produção

## Notas de ambiente
- PC no cabo, IP `192.168.15.5`.
- Celular em outra rede (`10.236.x.x`).
- Expo Go 57 no celular vs projeto SDK 54 → usar QR do tunnel ou URL manual.
- Regra firewall `Expo mDNS` (UDP 5353) criada para descoberta automática.
- `@op-engineering/op-sqlite` instalado: requer Expo Dev Client (não roda no Expo Go SDK 57).
- `app.json` agora tem `"owner": "mrollo"` (vinculado à conta Expo).
