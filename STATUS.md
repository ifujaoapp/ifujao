# Status - StudyFlow (iFujao)

## Estado atual (2026-09-03)

### Validação de espécie×foto (Gemini)
- **Edge Function `validate-species`** deployed:
  - Foto × texto da espécie (gemini-embedding-2 multimodal).
  - Threshold `0.30` (cachorro × "Cachorro" ~0.38 → match).
  - 1 chamada API por validação, sem banco/RPC.
  - Reusa o padrão do `embed-pets`/`search-pets` (fetch URL → base64 inline).
- **Client (`useReportForm`)**:
  - Upload de **só 1 foto** (a principal) pro Storage.
  - `checkSpeciesMatch({imageUrl, mimeType, chosenSpecies})` → Edge Function.
  - **Cache de validação** (`lastValidationRef`): mesma foto + mesma espécie não revalida (economiza Storage e quota Gemini).
  - `ActivityIndicator` no botão com estágios "Enviando foto..." / "Verificando foto...".
  - `finalImages = [URL_remota, ...locais]` (embed-pets sobe as outras depois).
  - Alerta de mismatch com botões em **coluna**:
    - "Postar mesmo assim" (azul, em cima) → commita com `speciesMismatch: true`.
    - "Voltar" (cinza, embaixo) → cancela.

### Faixa do patrocinador (arara voadora)
- Revertido para versão **shimmer simples** (commit `6c19e04`).
- Banner `<div>` retangular com `border-radius: 8px`.
- Background: `linear-gradient(110deg, #FF8A33 0%, #FFA54D 40%, #FFD580 50%, #FFA54D 60%, #FF8A33 100%)` com `background-size: 200% 100%`.
- Animação CSS: `background-position` deslizando em 3.6s loop linear.
- `prefers-reduced-motion` desativa a animação.
- Tentativas de tremulação (rotate, skew, mask SVG, clipPath animado) foram abandonadas — todas ou cortavam o conteúdo, ou não comunicavam "pano".

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
- App atualiza o pino quando o OS tem fix novo em cache (gerado por outros apps ou pelo próprio `centerOnUserGps`).
- Sem UI nova, sem botão novo. Mesmo comportamento pro usuário.

### Título nos modais de detalhe (commit atual)
- Adicionado título curto no topo dos modais `PetLostModal` e `PetFoundModal`:
  - `PetLostModal` → **"Pet perdido"**
  - `PetFoundModal` → **"Pet encontrado"**
- Renderizado dentro do `PetDetailModalBase` (slot novo `title?: string`).
- Estilo: `fontSize: 16`, `fontWeight: 700`, cor `#000000`, `textAlign: center`, `marginTop: 4`, `marginBottom: 4`.
- Aparece entre o `headerExtra` (banner "Ajude a encontrar" / etc.) e a área de fotos.
- Sem pill/badge, sem ícone — texto plain centralizado, ocupando ~24px de altura (1 linha).

### Visual (`AppAlert`)
- Botões sempre em **coluna** (1 por linha), separador hairline entre eles.

### Validação
- `tsc --noEmit` e `npm run lint` passam (0 erros, 6 warnings pré-existentes).

### Commits dessa sessão (já no `origin/main`)
| Hash | Descrição |
|---|---|
| `744819b` | fix(species): upload só da foto principal + threshold 0.30 |
| `6c19e04` | feat(map): efeito shimmer na faixa do patrocinador |
| `70e9cf6` | fix(gps): polling pesado estava drenando bateria do celular |

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
- (você decide)

## Notas de ambiente
- PC no cabo, IP `192.168.15.5`.
- Celular em outra rede (`10.236.x.x`).
- Expo Go 57 no celular vs projeto SDK 54 → usar QR do tunnel ou URL manual.
- Regra firewall `Expo mDNS` (UDP 5353) criada para descoberta automática.
- `@op-engineering/op-sqlite` instalado: requer Expo Dev Client (não roda no Expo Go SDK 57).
- `app.json` agora tem `"owner": "mrollo"` (vinculado à conta Expo).
