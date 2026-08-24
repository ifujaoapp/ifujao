# EstudoFlow — Refatoração de `app/(tabs)/index.tsx` em "maestro"

> Arquivo de continuação. O chat anterior travou no meio da refatoração de `HomeScreen`
> para ser apenas um "maestro": chama hooks e renderiza a estrutura visual de alto nível.
> Estado atual: **build verde** (`tsc --noEmit` passa, `eslint` com **0 erros**, só warnings).

## Objetivo final
`app/(tabs)/index.tsx` deve conter apenas:
- chamadas aos hooks (`usePets`, `useMapLocation`, `useReportForm`, `useAiSearch`,
  `useImageViewer`, `usePetCamera`);
- renderização de componentes de alto nível (modais/composites) e pouca lógica.

## O que JÁ foi feito (verificado, build verde)

### Hooks criados em `hooks/`
1. **`usePetCamera.ts`** — câmera/galeria (criado no chat anterior, já conectado).
   Retorna: `images, setImages, isCameraOpen, setIsCameraOpen, isPhotoSourceVisible,
   facing, setFacing, cameraReady, setCameraReady, zoom, flash, cameraRef,
   abrirCamera, escolherFonte, fecharFonte, abrirGaleria, zoomIn, zoomOut,
   toggleFlash, tirarFoto, removerFoto`.
2. **`useImageViewer.ts`** — viewer de fotos.
   Retorna: `viewerImages, setViewerImages, viewerIndex, setViewerIndex,
   viewerVisible, setViewerVisible, openInViewer`.
3. **`useAiSearch.ts`** — busca por IA + barra arrastável.
   Calcula internamente `insets` (useSafeAreaInsets) e `screenH` (useWindowDimensions).
   Retorna: `aiQuery, setAiQuery, aiResults, setAiResults, aiSearching, setAiSearching,
   aiSearchVisible, setAiSearchVisible, titleBarH, setTitleBarH, aiBarXY, setAiBarXY,
   aiBarXYRef, aiPan, runAiSearch, clearAiSearch`.
4. **`usePets.ts`** — pets, patrocinadores, identidade (myPhone/myDeviceId), sync,
    seleção de pet, denúncia, delete.
5. **`useReportForm.ts`** — **CRIADO E CONECTADO** (fase "lógica nos hooks" COMPLETA).
    Recebe como parâmetros os cross-deps dos outros hooks + `setReportModalVisible`
    e `setIsCameraOpen` (UI state de `HomeScreen`).
    Estado movido: `species, breed, location, cityName, searchAddress, description,
    reward, contact, contactError, lostDate, showDatePicker, speciesPickerOpen,
    breedPickerOpen` (+ setters) e `speciesItems`/`breedItems` (useMemo).
    Handlers movidos: `formatPhone, isValidPhone, handleAddPet, openReport,
    atualizarEndereco, procurarEndereco, handlePickLocation, usarMeuGps`.
    `HomeScreen` agora só chama `useReportForm({...})` e desestrutura os nomes
    idênticos — o JSX do modal de report continua compilando sem reescrita.
   Retorna: `pets, setPets, sponsors, myPhone, setMyPhone, myDeviceId, setMyDeviceId,
   selectedPet, setSelectedPet, showOnlyMine, setShowOnlyMine, showDescriptionModal,
   setShowDescriptionModal, reportTarget, setReportTarget, sponsorInfo, setSponsorInfo,
   shareCardRef, commitPets, triggerSync, openPetFromDeepLink, handleSponsorPress,
   sharePetCard, onMarkerPress, reportPet, submitReport, deletePet`.
5. **`useMapLocation.ts`** — região do mapa, GPS, geocoding reverso, recentralização.
   **Recebe `triggerSync` como parâmetro** (`useMapLocation(triggerSync)`), pois o
   efeito de AppState chama `triggerSync()` de `usePets`.
   Retorna: `mapRegion, setMapRegion, userLocation, setUserLocation, gpsCity,
   recenterNonce, setRecenterNonce, petLocation, setPetLocation, gpsNonce, setGpsNonce,
   initialCenterRef, locationEnabled, setLocationEnabled, now, setNow, isDay,
   getCityForLocation, selectedCity, canReport, applyCenter, fetchGps,
   checkPermissionAndServices, centerOnUserGps`.

### `app/(tabs)/index.tsx` (`HomeScreen`)
- Já chama os 5 hooks e desestrutura os retornos (nomes preservados 1:1, então o JSX
  continua funcionando).
- Lógica de pets/mapa/IA/viewer/câmera **removida** do arquivo.
- **Imports removidos** de `index.tsx` (ficaram sem uso após extração):
  `Application`, `Share`, `PanResponder`, `useWindowDimensions`, `AppState`, `CITIES`,
  `clearPhotos`, `loadPets`, `savePets`, `runSync`, `isSupabaseConfigured`,
  `fetchPetRemote`, `addPendingDelete`, `deletePetPhotos`, `onDeepLinkPet`,
  `consumePendingPetId`, `fetchSponsors`, `searchPets`/`SearchResult`.
- **Imports que DEVEM continuar em index.tsx**: `distanceMeters` (usado por
  `MapLeaflet` que ainda está inline), `reverseGeocodeCity` (usado em `atualizarEndereco`
  / `openReport`), `Region` (tipo usado em `MapLeaflet`/`MapPicker`), `SponsorPin` (tipo),
  `PetRecord` (tipo), `persistPhotos`, `SecureStore`, `showAlert`, `isOwner`,
  `normalizePhone`, `SPECIES_*`, `formatBytes`, `formatLostDate`, etc.

## O que AINDA falta

1. **(FEITO)** `useReportForm` — concluído: lógica do formulário de report extraída
   para `hooks/useReportForm.ts` e conectada em `HomeScreen`. Todos os handlers
   (`handleAddPet`, `openReport`, `formatPhone`, `isValidPhone`, `atualizarEndereco`,
   `procurarEndereco`, `handlePickLocation`, `usarMeuGps`) e o estado do form saíram
   de `index.tsx`. `tsc --noEmit` e `eslint` continuam verdes (0 erros).
2. **Extrair composites de JSX** (em andamento):
    - **FEITO**: modais pequenos extraídos para `components/home/Modals.tsx`
      (`AboutModal`, `PrivacyModal`, `PhotoSourceModal`, `SponsorInfoModal`,
      `ReportReasonModal`). `HomeScreen` renderiza esses 5 via props
      (`visible/onClose/styles` + `themeColors`/`onCamera`/`onGallery` no
      PhotoSource; `sponsor` no SponsorInfo; `target/onSubmit` no ReportReason).
    - **FEITO**: `ReportModal` extraído para `components/home/ReportModal.tsx`.
      Recebe `form` (`useReportForm`), `camera` (`usePetCamera`), `map`
      (`useMapLocation`), `themeColors`, `theme`, `insets`, `styles`, `onClose`.
      `HomeScreen` chama `useReportForm`/`usePetCamera`/`useMapLocation` e passa
      os objetos (`form`/`camera`/`mapLocation`) como props. `tsc`/`eslint` verdes.
    - **CONCLUÍDO**: `PetDetailModal` (card do pet selecionado + ação bar +
      share card + descrição) e `MapArea` (engloba `MapLeaflet`, counter, side
      toolbar, FAB, city box, location warning). Ambos em `components/home/`
      (`PetDetailModal.tsx`, `MapArea.tsx`), recebendo as props necessárias
      (`MapAreaProps`/`PetDetailModalProps`). `HomeScreen` passa a apenas montar
      esses composites via `<MapArea .../>` e `<PetDetailModal .../>`.
 3. **Mover componentes de apresentação para `components/`** — **CONCLUÍDO**:
     - `MapPicker` → `components/home/MapPicker.tsx` (usado por `ReportModal`).
     - `HelpFindBanner` → `components/home/HelpFindBanner.tsx` (exportado,
       recebe `styles: HomeStyles`).
     - `CircularActionButton` → `components/home/CircularActionButton.tsx`
       (exportado). **Código morto**: não é renderizado em `HomeScreen` (o FAB é
       desenhado manualmente com `styles.floatingButton`/`TouchableOpacity`). Mantido
       como componente reutilizável, import já removido de `index.tsx`.
     - `MapLeaflet` → `components/home/MapLeaflet.tsx` (exportado; `WebView` vem de
       `react-native-webview`, não de `react-native`; usa `HomeStyles`/`PetRecord`/
       `SponsorPin`/`City`/`Region`/`distanceMeters`).
     - `ImageCarousel` → `components/home/ImageCarousel.tsx` (exportado).
    `index.tsx` agora importa `HelpFindBanner`, `MapLeaflet`, `ImageCarousel` de
    `@/components/home/*`. `HomeScreen` passa a apenas montar esses composites.
 4. **`makeStyles` / `HomeStyles`** — **NÃO movido para arquivo separado**:
    `makeStyles` continua em `index.tsx` e `export type HomeStyles =
    ReturnType<typeof makeStyles>` é exportado (fim de `index.tsx`, ~linha 3045).
    Os componentes tipam `styles: HomeStyles` via
    `import type { HomeStyles } from "@/app/(tabs)/index";` (convenção já usada por
    `Modals.tsx`/`ReportModal.tsx`).

## Armadilhas / notas
- Os hooks mantêm os **nomes das variáveis idênticos** ao original para o JSX de
  `HomeScreen` continuar compilando sem reescrita.
- `useMapLocation` precisa de `triggerSync` vindo de `usePets` (ordem de chamada:
  `usePets()` antes de `useMapLocation(triggerSync)`).
- `onMarkerPress` foi movido para dentro de `usePets` (era inline no JSX do `MapLeaflet`);
  o JSX agora usa `onMarkerPress={onMarkerPress}`.
- `submitReport` mantém a mensagem original: `"Obrigado. Nossa equipe irá analisar este alerta."`
- `tsc --noEmit -p tsconfig.json` deve continuar passando após cada extração. `eslint`
  está com 0 erros (só warnings de `react-hooks/exhaustive-deps` e alguns setters
  "never used" desestruturados mas não usados diretamente — inofensivos).
- `constants/breeds.ts` (criado no chat anterior) já contém `SPECIES_BREEDS`,
  `SPECIES_OPTIONS`, `NO_BREEDS`, `MAX_IMAGES`, `MAX_IMAGE_BYTES`, `formatBytes`,
  `formatLostDate`, `isOwner`, `normalizePhone`.

## Comandos de verificação
```
npx tsc --noEmit -p tsconfig.json
npx eslint "app/(tabs)/index.tsx" "hooks/*.ts" "hooks/*.tsx" "constants/breeds.ts"
```
(guardar log em arquivo e ler as últimas linhas, pois `head` não existe no PowerShell)

## Próximo passo recomendado
A fase "lógica nos hooks" está COMPLETA (inclui `useReportForm`). Itens 3 e 4 (mover
componentes de apresentação + `HomeStyles`) também CONCLUÍDOS, assim como a
extração dos composites `PetDetailModal` e `MapArea` (item 2). **Refatoração
CONCLUÍDA**: `app/(tabs)/index.tsx` agora contém apenas as chamadas aos hooks
(`usePets`, `useMapLocation`, `useReportForm`, `useAiSearch`, `useImageViewer`,
`usePetCamera`) e a montagem dos composites de alto nível (`MapArea`,
`PetDetailModal`, `ReportModal`, `Modals`, `ImageViewerModal`, `DatePickerCalendar`).
Os componentes/presentação e composites vivem em `components/home/`. `tsc` e `eslint`
seguem verdes (0 erros; warnings de vars não usadas/exhaustive-deps, inofensivos).
