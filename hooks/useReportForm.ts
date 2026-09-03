import { useMemo, useState } from "react";
import * as Location from "expo-location";
import { ssSet } from "@/lib/secureStoreSafe";
import { showAlert } from "@/src/components/AppAlert";
import { getTermsAccepted, setTermsAccepted } from "@/lib/terms";
import {
  NO_BREEDS,
  SPECIES_BREEDS,
  SPECIES_OPTIONS,
  normalizePhone,
  type PetPost,
} from "@/constants/breeds";
import { reverseGeocodeCity } from "@/lib/geocode";
import { getOrCreateDeviceId } from "@/lib/deviceId";
import { persistPhotos } from "@/lib/storage";
import { canCreatePet } from "@/lib/limits";
import { checkSpeciesMatch } from "@/lib/speciesMatch";
import { File } from "expo-file-system";

// Le um arquivo local (file://) como base64 (sem prefixo data:). Usado pelo
// validador de especie para enviar a foto inline ao Gemini.
const readAsBase64 = async (uri: string): Promise<string> => {
  const buf = await new File(uri).arrayBuffer();
  let bin = "";
  const bytes = new Uint8Array(buf);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)));
  }
  // btoa funciona no Hermes/React Native moderno. Fallback: retorna string vazia.
  try { return globalThis.btoa(bin); } catch { return ""; }
};

const toLocalISOString = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();
import { type Region } from "react-native-maps";
import type { City } from "@/constants/cities";

type Coords = { latitude: number; longitude: number };

export type UseReportFormParams = {
  images: string[];
  setImages: (value: React.SetStateAction<string[]>) => void;
  commitPets: (next: PetPost[]) => void;
  myDeviceId: string;
  myPhone: string;
  setMyPhone: (value: string) => void;
  pets: PetPost[];
  petLocation: Coords | null;
  getCityForLocation: (loc: Coords | null) => City;
  userLocation: Coords | null;
  mapRegion: Region;
  selectedCity: City;
  setPetLocation: (value: Coords | null) => void;
  setGpsNonce: (updater: (n: number) => number) => void;
  setUserLocation: (value: Coords | null) => void;
  checkPermissionAndServices: () => Promise<boolean>;
  canReport: boolean;
  setReportModalVisible: (value: boolean) => void;
  setIsCameraOpen: (value: boolean) => void;
  godMode?: boolean;
  onNeedAcceptTerms?: () => void;
};

export function useReportForm(params: UseReportFormParams) {
  const {
    images,
    setImages,
    commitPets,
    myDeviceId,
    myPhone,
    setMyPhone,
    pets,
    petLocation,
    getCityForLocation,
    userLocation,
    mapRegion,
    selectedCity,
    setPetLocation,
    setGpsNonce,
    setUserLocation,
    checkPermissionAndServices,
    canReport,
    setReportModalVisible,
    setIsCameraOpen,
    godMode,
    onNeedAcceptTerms,
  } = params;

  const [species, setSpecies] = useState("");
  const [breed, setBreed] = useState("");
  const [name, setName] = useState("");
  const [location, setLocation] = useState("");
  const [cityName, setCityName] = useState("");
  const [searchAddress, setSearchAddress] = useState("");
  const [description, setDescription] = useState("");
  const [reward, setReward] = useState("");
  const [contact, setContact] = useState("");
  const [contactError, setContactError] = useState("");
  const [lostDate, setLostDate] = useState<Date | null>(null);
  // Tipo de post: 'lost' (dono perdeu) ou 'found' (terceiro encontrou).
  const [postType, setPostType] = useState<'lost' | 'found'>('lost');
  // Trava o tipo quando o usuário já escolheu Perdido/Encontrado no seletor do FAB:
  // o toggle interno do ReportModal desabilita a opção que não foi escolhida.
  const [postTypeLocked, setPostTypeLocked] = useState(false);
  // Data do achado (usada quando postType === 'found').
  const [foundDate, setFoundDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [speciesPickerOpen, setSpeciesPickerOpen] = useState(false);
  const [breedPickerOpen, setBreedPickerOpen] = useState(false);
  const speciesItems = useMemo(
    () => SPECIES_OPTIONS.map((o) => ({ label: o, value: o })),
    [],
  );
  const breedItems = useMemo(
    () =>
      (SPECIES_BREEDS[species] ?? NO_BREEDS).map((o) => ({
        label: o,
        value: o,
      })),
    [species],
  );

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, "").slice(0, 11);
    if (digits.length <= 2) return digits.replace(/(\d{0,2})/, "($1");
    if (digits.length <= 6)
      return digits.replace(/(\d{2})(\d{0,4})/, "($1) $2");
    if (digits.length <= 10)
      return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, "($1) $2-$3");
    return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, "($1) $2-$3");
  };

  const isValidPhone = (value: string) => {
    const digits = value.replace(/\D/g, "");
    const national = digits.startsWith("55") ? digits.slice(2) : digits;
    if (!/^\d{10,11}$/.test(national)) return false;
    const ddd = national.slice(0, 2);
    if (Number(ddd) < 11 || Number(ddd) > 99) return false;
    if (national.length === 11 && national[2] !== "9") return false;
    return true;
  };

  const handleAddPet = async () => {
    const terms = await getTermsAccepted();
    if (!terms.accepted) {
      onNeedAcceptTerms?.();
      return;
    }
    if (
      images.length === 0 ||
      !species ||
      !breed ||
      !location ||
      !contact ||
      (postType === 'lost' ? !lostDate : !foundDate)
    ) {
      showAlert(
        "warning",
        "Atenção",
        "Preencha todos os campos e adicione ao menos uma foto.",
      );
      return;
    }
    if (!isValidPhone(contact)) {
      setContactError("Número de WhatsApp inválido (use DDD + 9 dígitos).");
      showAlert(
        "warning",
        "Atenção",
        "Digite um número de WhatsApp válido (com DDD, 10 ou 11 dígitos).",
      );
      return;
    }
    let latitude: number;
    let longitude: number;
    if (petLocation) {
      latitude = petLocation.latitude;
      longitude = petLocation.longitude;
    } else {
      showAlert(
        "location",
        "Marque o local",
        'Defina onde o pet foi visto: toque no mapa para posicionar o pino ou use o botão "Usar meu GPS". O alerta não foi gravado.',
      );
      return;
    }
    const isValidCoord = (n: number) =>
      typeof n === "number" && Number.isFinite(n) && n >= -90 && n <= 90;
    const isValidLng = (n: number) =>
      typeof n === "number" && Number.isFinite(n) && n >= -180 && n <= 180;
    if (
      !isValidCoord(latitude) ||
      !isValidLng(longitude) ||
      (latitude === 0 && longitude === 0)
    ) {
      showAlert(
        "warning",
        "Coordenada inválida",
        'As coordenadas obtidas não são válidas. Mova o pino ou use "Usar meu GPS" novamente antes de publicar. O alerta não foi gravado.',
      );
      return;
    }
    const ownerPhone = normalizePhone(contact);
    ssSet("ifujao_my_phone", ownerPhone).catch(() => {});
    setMyPhone(ownerPhone);
    const storedImages = await persistPhotos(images);
    // Valida especie x foto via Edge Function validate-species (Gemini
    // multimodal embedding no server). Se mismatch E o usuario nao for
    // moderador, mostra alerta com opcao de voltar (cancelar publicacao,
    // manter modal aberto para trocar foto) ou postar mesmo assim.
    let speciesMismatch = false;
    try {
      if (storedImages.length > 0 && species) {
        const photoUri = storedImages[0];
        const match = await checkSpeciesMatch({
          imageUrl: photoUri.startsWith("http") ? photoUri : undefined,
          imageBase64: photoUri.startsWith("http") ? undefined : await readAsBase64(photoUri),
          mimeType: "image/jpeg",
          chosenSpecies: species,
        });
        speciesMismatch = match.mismatch;
      }
    } catch {
      speciesMismatch = false;
    }
    // Mismatch: pergunta antes de commitar. "Voltar" cancela; "Postar mesmo
    // assim" commita com a flag. Moderador (godMode) pula o aviso.
    if (speciesMismatch && !godMode) {
      showAlert(
        "warning",
        "Foto pode não condizer",
        `A foto parece não ser de ${species.toLowerCase()}. Você pode trocar a foto antes de publicar.`,
        [
          { text: "Voltar", style: "cancel" },
          { text: "Postar mesmo assim", onPress: () => doCommit(storedImages, latitude, longitude, ownerPhone, myDeviceId, true) },
        ],
      );
      return;
    }
    await doCommit(storedImages, latitude, longitude, ownerPhone, myDeviceId, speciesMismatch);
  };

  // Faz o commit efetivo do post. Chamado apos a validacao e (se mismatch)
  // apos o usuario confirmar no alerta. Recebe `withMismatch` para marcar
  // speciesMismatch no payload quando o usuario optou por postar mesmo assim.
  const doCommit = async (
    storedImages: string[],
    latitude: number,
    longitude: number,
    ownerPhone: string,
    initialDeviceId: string | undefined,
    withMismatch: boolean,
  ) => {
    let deviceId: string | undefined = initialDeviceId;
    if (!deviceId) {
      try {
        deviceId = await getOrCreateDeviceId();
      } catch {}
    }
    // Limite anti-spam (bypass para moderadores em modo deus).
    if (!godMode) {
      const check = canCreatePet(pets, deviceId ?? "");
      if (!check.ok) {
        showAlert("warning", "Limite atingido", check.message!);
        return;
      }
    }
    const newPet: PetPost = {
      id: Date.now().toString(),
      species,
      name: name.trim() || undefined,
      location,
      description,
      contact,
      breed,
      ownerPhone,
      ownerDeviceId: deviceId,
      images: storedImages,
      latitude,
      longitude,
      city: cityName || getCityForLocation(petLocation)?.name,
      lostDate: postType === 'lost' ? (lostDate ? toLocalISOString(lostDate) : undefined) : undefined,
      foundDate: postType === 'found' ? (foundDate ? toLocalISOString(foundDate) : undefined) : undefined,
      postType,
      reward:
        postType === 'lost' && reward.trim()
          ? Number(reward.replace(/\D/g, ""))
          : undefined,
      speciesMismatch: withMismatch || undefined,
      createdAt: new Date().toISOString(),
      dirty: true,
    };
    commitPets([newPet, ...pets]);
    setSpecies("");
    setBreed("");
    setName("");
    setLocation("");
    setCityName("");
    setDescription("");
    setReward("");
    setContact("");
    setContactError("");
    setSearchAddress("");
    setImages([]);
    setLostDate(null);
    setFoundDate(null);
    setPostType('lost');
    setIsCameraOpen(false);
    setReportModalVisible(false);
    showAlert("success", "Sucesso!", "Alerta publicado!");
  };

  const openReport = async (type?: 'lost' | 'found') => {
    if (!canReport) return;
    // Reseta o tipo de post e as datas a cada abertura (evita resíduo de rascunho).
    setPostType(type ?? 'lost');
    // Trava o tipo se veio de uma escolha explícita no seletor (Perdido/Encontrado).
    setPostTypeLocked(!!type);
    setLostDate(null);
    setFoundDate(null);
    if (!location) {
      const coords = userLocation ?? {
        latitude: mapRegion.latitude,
        longitude: mapRegion.longitude,
      };
      try {
        const geo = await Location.reverseGeocodeAsync({
          latitude: coords.latitude,
          longitude: coords.longitude,
        });
        if (geo.length > 0) {
          const g = geo[0];
          const partes = [g.street, g.district].filter(Boolean);
          const endereco =
            partes.length > 0
              ? partes.join(", ")
              : g.city || g.region || selectedCity.name;
          setLocation(endereco);
        } else {
          setLocation(selectedCity.name);
        }
      } catch {
        setLocation(selectedCity.name);
      }
      setCityName(
        (await reverseGeocodeCity(coords.latitude, coords.longitude)) ||
          selectedCity.name,
      );
    }
    if (myPhone) {
      setContact(formatPhone(myPhone));
    }
    setPetLocation(
      userLocation
        ? { latitude: userLocation.latitude, longitude: userLocation.longitude }
        : {
            latitude: selectedCity.latitude,
            longitude: selectedCity.longitude,
          },
    );
    setReportModalVisible(true);
  };

  // Geocoding direto (endereço -> coordenadas) usando o geocoder NATIVO do
  // aparelho (Location.geocodeAsync, sem chave/API externa — igual ao padrão
  // do reverseGeocodeAsync já usado). Move o pino e sincroniza o campo
  // "Última Localização Vista" + cidade via atualizarEndereco.
  const procurarEndereco = async () => {
    const q = searchAddress.trim();
    if (!q) return;
    try {
      const query = cityName ? `${q}, ${cityName}` : q;
      const res = await Location.geocodeAsync(query);
      if (!res.length) {
        showAlert(
          "warning",
          "Endereço não encontrado",
          "Não foi possível localizar esse endereço. Tente ser mais específico (rua, número e cidade).",
        );
        return;
      }
      const { latitude, longitude } = res[0];
      setPetLocation({ latitude, longitude });
      await atualizarEndereco(latitude, longitude);
    } catch {
      showAlert(
        "error",
        "Erro na busca",
        "Não foi possível buscar o endereço. Verifique sua conexão e tente novamente.",
      );
    }
  };

  const atualizarEndereco = async (lat: number, lng: number) => {
    try {
      const geo = await Location.reverseGeocodeAsync({
        latitude: lat,
        longitude: lng,
      });
      if (geo.length > 0) {
        const g = geo[0];
        const partes = [g.street, g.district].filter(Boolean);
        setLocation(
          partes.length > 0 ? partes.join(", ") : g.city || g.region || "",
        );
      } else {
        setLocation("");
      }
    } catch {
      setLocation("");
    }
    setCityName(await reverseGeocodeCity(lat, lng));
  };

  const handlePickLocation = (lat: number, lng: number) => {
    setPetLocation({ latitude: lat, longitude: lng });
    atualizarEndereco(lat, lng);
  };

  const usarMeuGps = async () => {
    const ok = await checkPermissionAndServices();
    if (!ok) {
      showAlert(
        "location",
        "Localização",
        "Ative a localização do dispositivo e conceda a permissão para usar seu GPS.",
      );
      return;
    }

    // Movimento instantâneo: usa o GPS já conhecido (evita esperar o cold fix de 10-15s).
    if (userLocation) {
      setPetLocation(userLocation);
      atualizarEndereco(userLocation.latitude, userLocation.longitude);
      setGpsNonce((n) => n + 1);
      // Refina em segundo plano com um fix novo, sem bloquear a UI.
      Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
        .then((fresh) => {
          if (!fresh) return;
          const coords = {
            latitude: fresh.coords.latitude,
            longitude: fresh.coords.longitude,
          };
          setUserLocation(coords);
          setPetLocation(coords);
          atualizarEndereco(coords.latitude, coords.longitude);
        })
        .catch(() => {});
      return;
    }

    // Sem GPS conhecido ainda: busca (pode demorar o cold fix).
    let current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    }).catch(() => null);
    if (!current) {
      current = await Location.getLastKnownPositionAsync().catch(() => null);
    }

    if (!current) {
      showAlert(
        "location",
        "Sem sinal de GPS",
        "Não foi possível obter sua posição atual.",
      );
      return;
    }

    const coords = {
      latitude: current.coords.latitude,
      longitude: current.coords.longitude,
    };

    setUserLocation(coords);
    setPetLocation(coords);
    atualizarEndereco(coords.latitude, coords.longitude);
  };

  return {
    species,
    setSpecies,
    breed,
    setBreed,
    name,
    setName,
    location,
    setLocation,
    cityName,
    setCityName,
    searchAddress,
    setSearchAddress,
    description,
    setDescription,
    reward,
    setReward,
    contact,
    setContact,
    contactError,
    setContactError,
    lostDate,
    setLostDate,
    showDatePicker,
    setShowDatePicker,
    postType,
    setPostType,
    postTypeLocked,
    foundDate,
    setFoundDate,
    speciesPickerOpen,
    setSpeciesPickerOpen,
    breedPickerOpen,
    setBreedPickerOpen,
    speciesItems,
    breedItems,
    formatPhone,
    isValidPhone,
    handleAddPet,
    openReport,
    atualizarEndereco,
    procurarEndereco,
    handlePickLocation,
    usarMeuGps,
  };
}
