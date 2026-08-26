import { useMemo, useState } from "react";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";
import { showAlert } from "@/src/components/AppAlert";
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
    if (Number(ddd) < 11) return false;
    if (national.length === 11 && national[2] !== "9") return false;
    return true;
  };

  const handleAddPet = async () => {
    if (
      images.length === 0 ||
      !species ||
      !breed ||
      !location ||
      !contact ||
      !lostDate
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
    SecureStore.setItemAsync("ifujao_my_phone", ownerPhone).catch(() => {});
    setMyPhone(ownerPhone);
    const storedImages = await persistPhotos(images);
    let deviceId = myDeviceId;
    if (!deviceId) {
      try {
        deviceId = await getOrCreateDeviceId();
      } catch {}
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
      lostDate: lostDate ? lostDate.toISOString() : undefined,
      reward: reward.trim() ? Number(reward.replace(/\D/g, "")) : undefined,
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
    setIsCameraOpen(false);
    setReportModalVisible(false);
    showAlert("success", "Sucesso!", "Alerta publicado!");
  };

  const openReport = async () => {
    if (!canReport) return;
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
