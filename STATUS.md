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

### Visual (`AppAlert`)
- Botões sempre em **coluna** (1 por linha), separador hairline entre eles.
- Texto do botão não encolhe (`numberOfLines` removido, layout mais alto).

### Validação
- `tsc --noEmit` e `npm run lint` passam (0 erros, 6 warnings pré-existentes).

### Edge Functions deployed
| Função | Versão | Status |
|---|---|---|
| reveal-contact | 12 | ACTIVE |
| search-pets | 30 | ACTIVE |
| embed-pets | 27 | ACTIVE |
| god-login | 2 | ACTIVE |
| confirm-match | 1 | ACTIVE |
| ban-user | 4 | ACTIVE |
| get-contact | 2 | ACTIVE |
| **validate-species** | **atual** | **ACTIVE** |

## Pendente
- (você decide)

## Notas de ambiente
- PC no cabo, IP `192.168.15.5`.
- Celular em outra rede (`10.236.x.x`).
- Expo Go 57 no celular vs projeto SDK 54 → usar QR do tunnel ou URL manual.
- Regra firewall `Expo mDNS` (UDP 5353) criada para descoberta automática.
- `@op-engineering/op-sqlite` instalado: requer Expo Dev Client (não roda no Expo Go SDK 57).
- `app.json` agora tem `"owner": "mrollo"` (vinculado à conta Expo).
