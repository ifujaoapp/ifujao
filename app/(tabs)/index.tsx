import { showAlert } from "@/src/components/AppAlert";
import { DatePickerCalendar } from "@/src/components/DatePickerCalendar";
import { ImageViewerModal } from "@/src/components/ImageViewerModal";
import { Ionicons } from "@expo/vector-icons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import * as Application from "expo-application";
import { isDevice } from "expo-device";
import { BlurView } from "expo-blur";
import { CameraType, CameraView, useCameraPermissions } from "expo-camera";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  Animated,
  AppState,
  BackHandler,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import DropDownPicker from "react-native-dropdown-picker";
import { type Region } from "react-native-maps";
import Reanimated, {
  Easing,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import ViewShot from "react-native-view-shot";
import { WebView } from "react-native-webview";

import { CITIES, distanceMeters } from "@/constants/cities";
import { Colors } from "@/constants/theme";
import { useThemeMode } from "@/hooks/use-theme-mode";
import { revealContact, resolveContact } from "@/lib/contacts";
import { reverseGeocodeCity } from "@/lib/geocode";
import { consumePendingPetId, onDeepLinkPet } from "@/lib/deeplink";
import { searchPets, type SearchResult } from "@/lib/search";
import { deletePetPhotos } from "@/lib/photos";
import {
  clearPhotos,
  loadPets,
  persistPhotos,
  savePets,
  type PetRecord,
} from "@/lib/storage";
import {
  addPendingDelete,
  fetchPetRemote,
  isSupabaseConfigured,
  runSync,
} from "@/lib/sync";
import * as FileSystem from "expo-file-system";
import * as ImageManipulator from "expo-image-manipulator";
import * as DocumentPicker from "expo-document-picker";
import * as ImagePicker from "expo-image-picker";
import * as Location from "expo-location";
import * as SecureStore from "expo-secure-store";

type PetPost = PetRecord;

const normalizePhone = (value?: string | null) => {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.startsWith("55") ? digits.slice(2) : digits;
};

// Autoria por device ID (mais forte). Fallback de telefone para pets criados antes do deviceId existir.
const isOwner = (pet: PetPost, myDeviceId: string, myPhone: string) =>
  (!!pet.ownerDeviceId && !!myDeviceId && pet.ownerDeviceId === myDeviceId) ||
  (myPhone !== "" && normalizePhone(pet.ownerPhone) === myPhone);

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

// Espécie -> raças válidas. A raça fica "amarrada" à espécie (não dá para
// escolher uma raça de gato para um cão). A espécie é editável (texto livre)
// e sugerida a partir destas opções; a raça também aceita texto livre.
const SPECIES_BREEDS: Record<string, string[]> = {
  "Cachorro": [
    "Shih Tzu", "Golden Retriever", "Labrador Retriever", "Poodle",
    "Buldogue Francês", "Spitz Alemão (Lulu da Pomerânia)", "Pastor Alemão",
    "Pinscher", "Yorkshire Terrier", "Beagle", "Rottweiler", "Doberman",
    "Boxer", "Dachshund", "Border Collie", "Pastor Australiano", "Akita",
    "Shiba Inu", "Husky Siberiano", "Maltês", "Pug", "Chihuahua",
    "Cavalier King Charles Spaniel", "Cane Corso", "Pit Bull",
    "American Bully", "Bull Terrier", "Chow Chow", "Basset Hound",
    "Shar Pei", "Cocker Spaniel", "Lhasa Apso", "Bernese Mountain Dog",
    "São Bernardo", "Dogue Alemão", "Boston Terrier", "Whippet",
    "Sem Raça Definida",
  ],
  "Gato": [
    "Persa", "Maine Coon", "Siamês", "Ragdoll", "Sphynx", "Bengal",
    "British Shorthair", "Angorá", "Abissínio", "Birmanês", "Chartreux",
    "Cornish Rex", "Devon Rex", "Exótico", "Norwegian Forest", "Oriental",
    "Russian Blue", "Scottish Fold", "Selkirk Rex", "Somali", "Tonquinês",
    "Turkish Van", "American Shorthair", "Sem Raça Definida",
  ],
  "Calopsita": [
    "Ancestral", "Lutino", "Cara Branca", "Pérola", "Arlequim", "Canela",
    "Albina", "Bochecha Amarela", "Prata", "Pastel", "Fulvo",
  ],
  "Papagaio": [
    "Papagaio-verdadeiro", "Papagaio-chauá", "Papagaio-cinzento",
    "Papagaio-eclectus", "Papagaio-do-mangue", "Papagaio-diadema",
    "Papagaio-moleiro", "Papagaio-de-charão", "Papagaio-galego",
    "Papagaio-de-cabeça-amarela",
  ],
  "Arara": [
    "Arara-canindé", "Arara-vermelha", "Arara-azul-grande", "Arara-militar",
    "Arara-verde", "Ararinha-maracanã", "Arara-juba",
  ],
  "Cacatua": [
    "Cacatua-de-crista-amarela", "Cacatua-galah", "Cacatua-branca",
    "Cacatua-das-molucas", "Cacatua-de-crista-rosa", "Cacatua-negra",
  ],
  "Periquito-australiano": [
    "Periquito Comum", "Periquito Inglês", "Arlequim", "Lutino", "Albino",
    "Asa Cinza", "Opalino", "Asas Claras",
  ],
  "Agapornis": [
    "Agapornis Roseicollis", "Agapornis Personatus", "Agapornis Fischeri",
    "Agapornis Lilianae", "Agapornis Nigrigenis", "Agapornis Cana",
    "Agapornis Taranta",
  ],
  "Ferret": [
    "Sável", "Albino", "Canela", "Prateado", "Panda", "Chocolate",
    "Champagne", "Blaze",
  ],
  "Hámster": [
    "Hámster Sírio", "Hámster Anão Russo Winter White",
    "Hámster Anão Russo Campbell", "Hámster Roborovski", "Hámster Chinês",
  ],
  "Coelho": [
    "Mini Lion Head", "Netherland Dwarf", "Mini Lop", "Holandês",
    "Gigante de Flandres", "Angorá", "Nova Zelândia", "Rex", "Mini Rex",
    "Califórnia", "Chinchila", "Lop Francês", "Borboleta", "Tan",
  ],
  "Porquinho-da-índia": [
    "Inglês", "Abissínio", "Peruano", "Sheltie", "Skinny", "Coronet",
    "Texel", "Alpaca", "Merino", "Crestado Americano", "Chinchila",
    "Standard", "Bege", "Branca", "Preta Velvet", "Safira", "Violeta",
    "Ébano", "Mosaico",
  ],
  "Gerbil": [
    "Agouti", "Black", "Argente", "Sapphire", "Lilac", "Schimmel",
  ],
  "Rato Twister": [
    "Dumbo", "Standard", "Rex", "Double Rex", "Hairless", "Tailless", "Satin",
  ],
  "Jabuti e Cágado": [
    "Jabuti-piranga", "Jabuti-tinga", "Tigre-d'água", "Cágado-de-barbicha",
    "Cágado-pescoço-de-cobra", "Muçuã",
  ],
  "Gecko": [
    "Gecko-leopardo", "Crested Gecko", "Gecko-diurno", "Gecko-gárgula",
    "Tokay Gecko",
  ],
  "Iguana": [
    "Iguana-verde", "Iguana-azul", "Iguana-vermelha",
  ],
  "Cobra": [
    "Corn Snake", "Piton-real", "Jiboia-constritora", "Falsa-coral",
    "Milk Snake", "Cobra-rei-da-califórnia", "Piton-carpete", "Piton-verde",
  ],
};

// Ordena as raças alfabeticamente (pt-BR) UMA vez, aqui na definição, para que a
// referência de cada array permaneça estável. O dropdown de busca interna da lib
// captura `data` por closure e quebra se a referência mudar a cada render (a
// busca passa a filtrar contra a lista da 1ª montagem). Por isso NÃO se faz
// `.sort()` no `options` por render — ordena-se aqui, de forma estável.
Object.values(SPECIES_BREEDS).forEach((list) =>
  list.sort((a, b) => a.localeCompare(b, "pt-BR")),
);

const SPECIES_OPTIONS = Object.keys(SPECIES_BREEDS).sort((a, b) =>
  a.localeCompare(b, "pt-BR"),
);
const NO_BREEDS: string[] = [];

const formatBytes = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
};

const formatLostDate = (iso?: string): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("pt-BR");
};

const getFileSize = async (uri: string): Promise<number | null> => {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists ? (info.size ?? null) : null;
  } catch {
    return null;
  }
};

const redimensionarPara1080p = async (uri: string): Promise<string> => {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1080 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG },
    );
    return result.uri;
  } catch {
    return uri;
  }
};

const filtrarPorTamanho = async (
  uris: string[],
  fileSizes?: (number | null)[],
): Promise<string[]> => {
  const aceitas: string[] = [];
  const rejeitadas: string[] = [];
  for (let i = 0; i < uris.length; i++) {
    const uri = uris[i];
    const size = fileSizes?.[i] ?? (await getFileSize(uri));
    if (size != null && size > MAX_IMAGE_BYTES)
      rejeitadas.push(formatBytes(size));
    else aceitas.push(uri);
  }
  if (rejeitadas.length > 0) {
    showAlert(
      "warning",
      "Foto muito grande",
      `Algumas fotos foram ignoradas por excederem ${formatBytes(MAX_IMAGE_BYTES)}: ${rejeitadas.join(", ")}.`,
    );
  }
  return aceitas;
};

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { theme, toggleTheme } = useThemeMode();
  const themeColors = Colors[theme];
  const styles = makeStyles(themeColors);

  const [pets, setPets] = useState<PetPost[]>([]);
  const [myPhone, setMyPhone] = useState("");
  const [myDeviceId, setMyDeviceId] = useState("");
  const petsRef = useRef<PetPost[]>([]);
  const initialSyncDone = useRef(false);
  const [localLoaded, setLocalLoaded] = useState(false);
  const triggerSyncRef = useRef<() => void>(() => {});
  const [isReportModalVisible, setReportModalVisible] = useState(false);
  const [isAboutVisible, setIsAboutVisible] = useState(false);
  const [isPrivacyVisible, setIsPrivacyVisible] = useState(false);
  const [species, setSpecies] = useState("");
  const [breed, setBreed] = useState("");
  const [location, setLocation] = useState("");
  const [cityName, setCityName] = useState("");
  const [searchAddress, setSearchAddress] = useState("");
  const [description, setDescription] = useState("");
  const [reward, setReward] = useState("");
  const [contact, setContact] = useState("");
  const [contactError, setContactError] = useState("");
  const [lostDate, setLostDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [images, setImages] = useState<string[]>([]);
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
  const locationRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);
  const contactRef = useRef<TextInput>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isPhotoSourceVisible, setIsPhotoSourceVisible] = useState(false);
  const [facing, setFacing] = useState<CameraType>("back");
  const [cameraReady, setCameraReady] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [flash, setFlash] = useState<"off" | "on" | "auto">("off");
  const cameraRef = useRef<CameraView>(null);
  const [, requestCameraPermission] = useCameraPermissions();
  const [mapRegion, setMapRegion] = useState<Region>({
    latitude: CITIES[0].latitude,
    longitude: CITIES[0].longitude,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  });
  const [userLocation, setUserLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  // Cidade exibida no mapa (canto inferior esquerdo). Obtida por geocoding
  // reverso da posição REAL do GPS (não mais a lista fixa de CITIES). Começa em
  // Sorocaba como fallback e só troca quando o GPS devolve um município válido.
  const [gpsCity, setGpsCity] = useState<string>(CITIES[0].name);
  const lastGeocodeRef = useRef<{ latitude: number; longitude: number } | null>(
    null,
  );
  // Geocodifica a cidade real a partir do GPS. Respeita um limiar de 500m para
  // não martelar o geocoder nativo a cada poll de GPS (5s). Mantém o último
  // valor válido em caso de falha/offline (não zera para "").
  useEffect(() => {
    if (!userLocation) return;
    const last = lastGeocodeRef.current;
    if (
      last &&
      distanceMeters(
        last.latitude,
        last.longitude,
        userLocation.latitude,
        userLocation.longitude,
      ) < 500
    ) {
      return;
    }
    let cancelled = false;
    lastGeocodeRef.current = {
      latitude: userLocation.latitude,
      longitude: userLocation.longitude,
    };
    reverseGeocodeCity(userLocation.latitude, userLocation.longitude).then(
      (name) => {
        if (!cancelled && name) setGpsCity(name);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [userLocation]);
  // Incrementado pelo botão "Centralizar no meu GPS" para forçar o
  // recentramento do mapa, ignorando o limiar de ruído de GPS.
  const [recenterNonce, setRecenterNonce] = useState(0);
  const [petLocation, setPetLocation] = useState<{
    latitude: number;
    longitude: number;
  } | null>(null);
  const [gpsNonce, setGpsNonce] = useState(0);
  const initialCenterRef = useRef<{
    latitude: number;
    longitude: number;
  } | null>(null);
  // O mapa deve abrir SEMPRE, centrado na cidade, mesmo que o GPS falhe, trave
  // ou devolva a posição padrão do emulador. Sem isto, o mapa só montava após
  // um fix de GPS e sumia quando o GPS não respondia.
  if (!initialCenterRef.current) {
    initialCenterRef.current = {
      latitude: CITIES[0].latitude,
      longitude: CITIES[0].longitude,
    };
  }
  const [locationEnabled, setLocationEnabled] = useState<boolean | null>(null);
  const [now, setNow] = useState(new Date());
  const isDay = now.getHours() >= 6 && now.getHours() < 18;

  const bubbleOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const MAX_CYCLES = 3;
    let cycle = 0;
    const blink = () => {
      if (cycle >= MAX_CYCLES) return;
      cycle++;
      Animated.sequence([
        Animated.timing(bubbleOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.delay(2200),
        Animated.timing(bubbleOpacity, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.delay(1200),
      ]).start(() => blink());
    };
    blink();
    return () => bubbleOpacity.stopAnimation();
  }, [bubbleOpacity]);

  const getCityForLocation = (
    loc: { latitude: number; longitude: number } | null,
  ): import("@/constants/cities").City => {
    if (!loc) return CITIES[0];
    let nearest = CITIES[0];
    let nearestDist = Infinity;
    CITIES.forEach((c) => {
      const d = distanceMeters(
        loc.latitude,
        loc.longitude,
        c.latitude,
        c.longitude,
      );
      if (d < nearestDist) {
        nearestDist = d;
        nearest = c;
      }
    });
    return nearest;
  };

  const selectedCity = getCityForLocation(userLocation);

  const canReport = locationEnabled === true;

  const [selectedPet, setSelectedPet] = useState<PetPost | null>(null);
  const [showOnlyMine, setShowOnlyMine] = useState(false);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);
  // Busca semântica por IA (Gemini). Quando `aiResults` não é null, o mapa fica
  // filtrado só para os pets ranqueados pela busca.
  const [aiQuery, setAiQuery] = useState("");
  const [aiResults, setAiResults] = useState<SearchResult[] | null>(null);
  const [aiSearching, setAiSearching] = useState(false);
  // Barra de busca: visível só ao clicar em "Pesquisar"; posição arrastável.
  const [aiSearchVisible, setAiSearchVisible] = useState(false);
  const [titleBarH, setTitleBarH] = useState(0);
  const { width: screenW, height: screenH } = useWindowDimensions();
  const [aiBarXY, setAiBarXY] = useState({ x: 12, y: insets.top + 72 });
  const aiBarXYRef = useRef(aiBarXY);
  const aiDragStart = useRef({ x: 0, y: 0 });
  const aiPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        aiDragStart.current = { ...aiBarXYRef.current };
      },
      onPanResponderMove: (_, g) => {
        const ny = aiDragStart.current.y + g.dy;
        const next = {
          x: 12,
          y: Math.max(8, Math.min(ny, screenH - 120)),
        };
        aiBarXYRef.current = next;
        setAiBarXY(next);
      },
    })
  ).current;
  const menuProgress = useSharedValue(0);
  useEffect(() => {
    if (selectedPet !== null) {
      menuProgress.value = 0;
      menuProgress.value = withDelay(
        120,
        withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }),
      );
    }
  }, [selectedPet?.id, menuProgress]);
  const [reportTarget, setReportTarget] = useState<PetPost | null>(null);
  const shareCardRef = useRef<any>(null);

  const sharePetCard = async (pet: PetPost) => {
    const link = `https://ifujaoapp.github.io/ifujao-links/pet/?id=${pet.id}`;
    const place = `${pet.location || "Sorocaba"}${pet.city ? ` — ${pet.city}` : ""}`;
    const message = `🐾 Ajude a encontrar este pet perdido em ${place}!\n${link}`;
    try {
      await Share.share({ message });
    } catch {
      showAlert("error", "Erro", "Não foi possível compartilhar.");
    }
  };

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync("ifujao_my_phone");
        if (saved) setMyPhone(saved);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        let id: string | null = await Application.getAndroidId();
        if (!id) {
          id = await SecureStore.getItemAsync("ifujao_device_id");
          if (!id) {
            id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
            await SecureStore.setItemAsync("ifujao_device_id", id);
          }
        }
        if (id) setMyDeviceId(id);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const loaded = await loadPets();
        if (loaded.length > 0) {
          petsRef.current = loaded as PetPost[];
          setPets(loaded as PetPost[]);
        }
      } catch {}
      setLocalLoaded(true);
    })();
  }, []);

  useEffect(() => {
    petsRef.current = pets;
  }, [pets]);

  // Deep link (link de contato do WhatsApp): abre o modal do card do pet na
  // aba principal, em vez da tela isolada app/pet/[id].tsx.
  const openPetFromDeepLink = useCallback(async (pid: string) => {
    const local = petsRef.current.find((p) => p.id === pid);
    const pet = local ?? (await fetchPetRemote(pid));
    if (pet) setSelectedPet(pet);
  }, []);

  useEffect(() => {
    const unsub = onDeepLinkPet((pid) => {
      openPetFromDeepLink(pid);
    });
    const pending = consumePendingPetId();
    if (pending) openPetFromDeepLink(pending);
    return unsub;
  }, [openPetFromDeepLink]);

  const commitPets = useCallback(
    async (next: PetPost[]) => {
      setPets(next);
      petsRef.current = next;
      try {
        const prevUris = new Set(pets.flatMap((p) => p.images));
        const nextUris = new Set(next.flatMap((p) => p.images));
        const orphans = [...prevUris].filter((u) => !nextUris.has(u));
        if (orphans.length > 0) await clearPhotos(orphans);
        await savePets(next as PetRecord[]);
      } catch {}
      triggerSyncRef.current();
    },
    [pets],
  );

  const triggerSync = useCallback(
    async (full = false) => {
      if (!isSupabaseConfigured) {
        console.warn(
          "[index] SYNC IGNORADO: Supabase não configurado (EXPO_PUBLIC_SUPABASE_* ausentes no bundle).",
        );
        return;
      }
      if (!myDeviceId) {
        console.warn("[index] SYNC IGNORADO: myDeviceId ainda vazio.");
        return;
      }
      try {
        const synced = await runSync(
          petsRef.current,
          myDeviceId,
          async (p) => {
            petsRef.current = p;
            setPets(p);
            await savePets(p as PetRecord[]);
          },
          { full },
        );
        petsRef.current = synced;
        setPets(synced);
        console.log(
          "[index] SYNC concluído -> pets no estado:",
          synced.length,
          synced.map((p) => p.id),
        );
      } catch (e) {
        console.warn("[index] sync erro:", e);
      }
    },
    [myDeviceId],
  );

  useEffect(() => {
    triggerSyncRef.current = triggerSync;
  }, [triggerSync]);

  useEffect(() => {
    if (myDeviceId && localLoaded && !initialSyncDone.current) {
      initialSyncDone.current = true;
      triggerSync(true); // pull completo no boot (recupera pets que sumiram do local)
    }
  }, [myDeviceId, localLoaded, triggerSync]);

  const checkPermissionAndServices = useCallback(async () => {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status !== "granted") {
      status = (await Location.requestForegroundPermissionsAsync()).status;
    }
    if (status !== "granted") return false;

    const servicesEnabled = await Location.hasServicesEnabledAsync().catch(
      () => false,
    );
    return servicesEnabled;
  }, []);

  // Recentraliza o mapa na posição do GPS em QUALQUER lugar do mundo.
  // Importante: NÃO muta `initialCenterRef` — ele é o centro INICIAL fixo do
  // WebView. O recentramento real é feito pelo efeito de pan via
  // injectJavaScript (setView), sem rebuild do html (que recarregaria o mapa).
  const applyCenter = (coords: { latitude: number; longitude: number }) => {
    setMapRegion({
      latitude: coords.latitude,
      longitude: coords.longitude,
      latitudeDelta: 0.005,
      longitudeDelta: 0.005,
    });
  };

  // Tenta obter o fix de GPS. Cada tentativa tem timeout de 3s (Promise.race)
  // para o getCurrentPositionAsync NUNCA travar o app. Reduzido para 3
  // tentativas para o 1º fix recentralizar o mapa mais cedo.
  const fetchGps = async (
    attempts = 3,
  ): Promise<{ latitude: number; longitude: number } | null> => {
    for (let i = 0; i < attempts; i++) {
      const loc = await Promise.race<null | Awaited<
        ReturnType<typeof Location.getCurrentPositionAsync>
      >>([
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        }).catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
      if (loc)
        return {
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
        };
      await new Promise((r) => setTimeout(r, 1000));
    }
    return null;
  };

  // Centraliza o mapa no GPS do usuário sob demanda (botão "Centralizar no meu
  // GPS"). Válido em qualquer lugar do mundo.
  const centerOnUserGps = async () => {
    const ok = await checkPermissionAndServices();
    if (!ok) {
      showAlert(
        "location",
        "Localização",
        "Ative a localização do dispositivo e conceda a permissão para usar seu GPS.",
      );
      return;
    }
    // Posição conhecida (cache) — instantânea, igual ao Google Maps. Centraliza
    // JÁ, na hora, sem esperar o fix fresco.
    const last = await Location.getLastKnownPositionAsync().catch(() => null);
    if (last) {
      const coords = {
        latitude: last.coords.latitude,
        longitude: last.coords.longitude,
      };
      setUserLocation(coords);
      applyCenter(coords);
      // Força o recentramento na hora (ignora o limiar de ruído de GPS).
      setRecenterNonce((n) => n + 1);
    }
    // Refina com fix fresco em SEGUNDO PLANO (não bloqueia a centralização).
    const coords = await fetchGps();
    if (!coords) {
      if (!last) {
        showAlert(
          "location",
          "Sem sinal de GPS",
          "Não foi possível obter sua posição atual.",
        );
      }
      return;
    }
    setUserLocation(coords);
    applyCenter(coords);
    setRecenterNonce((n) => n + 1);
  };

  useEffect(() => {
    let cancelled = false;

    const getOnce = async () => {
      const ok = await checkPermissionAndServices();
      if (!ok) {
        setLocationEnabled(false);
        return;
      }
      // Posição conhecida (cache) — instantânea, igual ao Google Maps: mostra o
      // seu pino e centraliza JÁ, sem esperar fix fresco de GPS (que num
      // dispositivo "frio" pode levar vários segundos).
      const last = await Location.getLastKnownPositionAsync().catch(
        () => null,
      );
      if (!cancelled && last) {
        const coords = {
          latitude: last.coords.latitude,
          longitude: last.coords.longitude,
        };
        setUserLocation(coords);
        applyCenter(coords);
        setLocationEnabled(true);
      }
      // Refina com fix fresco (não trava o app: timeout por tentativa).
      const coords = await fetchGps();
      if (cancelled || !coords) return;
      setUserLocation(coords);
      applyCenter(coords);
      setLocationEnabled(true);
    };

    getOnce();

    // Reconsulta o GPS periodicamente e atualiza a posição do usuário. Isso
    // faz o mapa (via pan no MapLeaflet) acompanhar a localização real, inclusive
    // quando ela é definida tarde no emulador.
    const poll = setInterval(async () => {
      const ok = await checkPermissionAndServices();
      if (!ok) {
        setLocationEnabled(false);
        return;
      }
      // Usa fetchGps (com timeout por tentativa) em vez de
      // getCurrentPositionAsync sem timeout, que pode travar e nunca resolver
      // — era o motivo de o mapa só centralizar ao clicar no botão.
      const coords = await fetchGps();
      if (!coords) return;
      setUserLocation(coords);
      applyCenter(coords);
    }, 5000);

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        checkPermissionAndServices().then((ok) => {
          if (!ok) setLocationEnabled(false);
        });
        triggerSyncRef.current();
      }
    });

    return () => {
      cancelled = true;
      appStateSub.remove();
      clearInterval(poll);
    };
  }, [checkPermissionAndServices]);

  const abrirCamera = async () => {
    fecharFonte();
    const { granted } = await requestCameraPermission();
    if (!granted) {
      showAlert(
        "permission",
        "Permissão Negada",
        "Precisamos de permissão para acessar a câmera.",
      );
      return;
    }
    setCameraReady(false);
    setZoom(0);
    setIsCameraOpen(true);
  };

  const escolherFonte = () => setIsPhotoSourceVisible(true);

  const fecharFonte = () => setIsPhotoSourceVisible(false);

  const abrirGaleria = async () => {
    fecharFonte();
    if (images.length >= MAX_IMAGES) {
      showAlert(
        "warning",
        "Limite atingido",
        `Você pode adicionar no máximo ${MAX_IMAGES} fotos.`,
      );
      return;
    }
    let assets: { uri: string; fileSize?: number | null }[] | null = null;
    if (isDevice) {
      // Dispositivo físico: galeria padrão do Android/iOS.
      const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!granted) {
        showAlert(
          "permission",
          "Permissão Negada",
          "Precisamos de permissão para acessar sua galeria.",
        );
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 0.8,
        allowsMultipleSelection: true,
        selectionLimit: MAX_IMAGES - images.length,
      });
      if (!result.canceled) {
        assets = result.assets.map((a) => ({
          uri: a.uri,
          fileSize: a.fileSize ?? null,
        }));
      }
    } else {
      // Emulador: sem app de galeria nativa -> seletor de arquivos.
      try {
        const res = await DocumentPicker.getDocumentAsync({
          type: "image/*",
          multiple: true,
          copyToCacheDirectory: true,
        });
        if (!res.canceled && res.assets?.length) {
          assets = res.assets.map((a: any) => ({
            uri: a.uri,
            fileSize: a.size ?? null,
          }));
        }
      } catch (e) {
        console.warn("[index] document picker falhou:", e);
      }
    }
    if (assets && assets.length > 0) {
      const uris = assets.map((a) => a.uri);
      const redimensionadas = await Promise.all(
        uris.map(redimensionarPara1080p),
      );
      const sizes = assets.map((a) => a.fileSize ?? null);
      const aceitas = await filtrarPorTamanho(redimensionadas, sizes);
      if (aceitas.length > 0) {
        setImages((prev) => [...prev, ...aceitas].slice(0, MAX_IMAGES));
      }
    }
  };

  const zoomStep = 0.1;
  const zoomIn = () => setZoom((prev) => Math.min(prev + zoomStep, 1));
  const zoomOut = () => setZoom((prev) => Math.max(prev - zoomStep, 0));

  const flashModes: ("off" | "on" | "auto")[] = ["off", "on", "auto"];
  const toggleFlash = () =>
    setFlash(
      (prev) => flashModes[(flashModes.indexOf(prev) + 1) % flashModes.length],
    );

  const tirarFoto = async () => {
    if (!cameraRef.current || !cameraReady) return;
    if (images.length >= MAX_IMAGES) {
      showAlert(
        "warning",
        "Limite atingido",
        `Você pode adicionar no máximo ${MAX_IMAGES} fotos.`,
      );
      return;
    }
    const foto = await cameraRef.current.takePictureAsync({ quality: 0.8 });
    const redimensionada = await redimensionarPara1080p(foto.uri);
    const aceitas = await filtrarPorTamanho([redimensionada]);
    if (aceitas.length > 0) {
      setImages((prev) => [...prev, aceitas[0]]);
    }
  };

  const removerFoto = (uri: string) => {
    setImages((prev) => prev.filter((item) => item !== uri));
  };

  const fecharModal = () => {
    setIsCameraOpen(false);
    setReportModalVisible(false);
    setCityName("");
  };

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
    if (images.length === 0 || !species || !breed || !location || !contact) {
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
    const newPet: PetPost = {
      id: Date.now().toString(),
      species,
      location,
      description,
      contact,
      breed,
      ownerPhone,
      ownerDeviceId: myDeviceId,
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

  const deletePet = (petId: string) => {
    showAlert(
      "trash",
      "Apagar alerta",
      "Tem certeza que deseja apagar este alerta? Esta ação não pode ser desfeita.",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Apagar",
          style: "destructive",
          onPress: async () => {
            const pet = pets.find((p) => p.id === petId);
            const next = pets.filter((p) => p.id !== petId);
            await addPendingDelete(petId);
            commitPets(next);
            if (
              pet &&
              isSupabaseConfigured &&
              isOwner(pet, myDeviceId, myPhone)
            ) {
              const urls = pet.remoteImageUrls ?? [];
              if (urls.length > 0) {
                deletePetPhotos(urls, myDeviceId).catch((e) =>
                  console.warn("[index] delete fotos:", e),
                );
              }
            }
            setSelectedPet(null);
          },
        },
      ],
    );
  };

  const reportPet = (pet: PetPost) => {
    // O dono não denuncia o próprio post (evita erro de RLS e confusão de UX).
    if (isOwner(pet, myDeviceId, myPhone)) return;
    setReportTarget(pet);
  };

  const submitReport = (pet: PetPost, reason: string) => {
    // O dono não denuncia o próprio post.
    if (isOwner(pet, myDeviceId, myPhone)) return;
    const reporter = myPhone ? normalizePhone(myPhone) : "";
    commitPets(
      pets.map((p) =>
        p.id === pet.id
          ? {
              ...p,
              reported: true,
              reportReason: reason,
              reportedBy: reporter,
              reporterDeviceId: myDeviceId,
              dirty: true,
            }
          : p,
      ),
    );
    setReportTarget(null);
    setSelectedPet(null);
    showAlert(
      "info",
      "Denúncia enviada",
      "Obrigado. Nossa equipe irá analisar este alerta.",
    );
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

  const openInViewer = (images: string[], index: number) => {
    setViewerImages(images);
    setViewerIndex(Math.max(0, Math.min(index, images.length - 1)));
    setViewerVisible(true);
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

  const openWhatsApp = (contactNumber: string, pet?: PetRecord) => {
    let phoneNumber = contactNumber.replace(/\D/g, "");
    if (!isValidPhone(phoneNumber)) {
      showAlert(
        "warning",
        "Atenção",
        "O contato informado não é um número de WhatsApp válido.",
      );
      return;
    }
    if (!phoneNumber.startsWith("55")) phoneNumber = `55${phoneNumber}`;
    // Quem contata é o finder (viu/encontrou o pet) falando com o DONO: não
    // faz sentido enviar o card do pet para quem já o conhece. A mensagem foca
    // em avisar o dono que o pet foi avistado/encontrado.
    const petLabel = pet
      ? `${pet.species}${pet.breed ? ` - ${pet.breed}` : ""}`
      : "";
    const message = encodeURIComponent(
      petLabel
        ? `Olá! Vi o alerta do seu pet (${petLabel}) no iFujão e acho que tenho informações sobre ele. Podemos conversar?`
        : `Olá! Vi o alerta do seu pet no iFujão e acho que tenho informações sobre ele. Podemos conversar?`,
    );
    const url =
      Platform.OS === "android"
        ? `whatsapp://send?phone=${phoneNumber}&text=${message}`
        : `https://wa.me/${phoneNumber}?text=${message}`;
    Linking.openURL(url).catch(() =>
      showAlert("error", "Erro", "Não foi possível abrir o WhatsApp."),
    );
  };

  // Contato: dono/reporter já têm `contact` local; finder revela via Edge
  // Function (rate-limited). Se não vier contato, avisa ao usuário.
  const handleContact = async (pet: PetRecord) => {
    const contact = await resolveContact(pet, revealContact);
    if (!contact) {
      showAlert(
        "warning",
        "Contato indisponível",
        "Não foi possível obter o contato agora. Tente novamente em instantes.",
      );
      return;
    }
    openWhatsApp(contact, pet);
  };

  // Busca semântica por IA (Gemini): ranqueia pets por linguagem natural e
  // filtra o mapa só para os resultados. Quando `aiResults` é null, o mapa
  // volta ao comportamento normal (Todos / Somente meus).
  const runAiSearch = async () => {
    const q = aiQuery.trim();
    if (!q) return;
    setAiSearching(true);
    const { results, rateLimited } = await searchPets(q);
    setAiSearching(false);
    if (rateLimited) {
      showAlert(
        "warning",
        "Limite de buscas atingido",
        "Você fez 20 buscas hoje. Tente novamente amanhã.",
      );
      return;
    }
    if (results.length === 0) {
      showAlert("info", "Sem resultados", "Nenhum pet encontrado para essa busca.");
      return;
    }
    setAiResults(results);
  };
  const clearAiSearch = () => {
    setAiResults(null);
    setAiQuery("");
  };

  // Filtro da barra lateral + busca por IA. Aplica-se só à visualização no
  // mapa; o estado completo (pets) continua abrindo o card pelo marcador.
  const visiblePets = (() => {
    let base = showOnlyMine
      ? pets.filter((p) => isOwner(p, myDeviceId, myPhone))
      : pets;
    if (aiResults) {
      const ids = new Set(aiResults.map((r) => r.id));
      base = base.filter((p) => ids.has(p.id));
    }
    return base;
  })();
  const petsDenunciados = visiblePets.filter((p) => p.reported);
  const totalPetsNoMapa = visiblePets.length;

  return (
    <View style={styles.container}>
      <View style={{ paddingTop: insets.top }}>
        <View
          style={styles.titleBar}
          onLayout={(e) => setTitleBarH(e.nativeEvent.layout.height)}
        >
          <Ionicons
            style={styles.clockIcon}
            name={isDay ? "sunny" : "moon"}
            size={22}
            color={isDay ? "#FFD60A" : "#E6E6FA"}
          />
          <View style={styles.clockText}>
            <Text style={styles.clockTime}>
              {now.toLocaleTimeString("pt-BR", {
                hour: "2-digit",
                minute: "2-digit",
                second: "2-digit",
              })}
            </Text>
            <Text style={styles.clockDate}>
              {now.toLocaleDateString("pt-BR", {
                weekday: "short",
                day: "2-digit",
                month: "short",
              })}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.titleInfoBtn}
            onPress={() => setIsAboutVisible(true)}
          >
            <Ionicons
              name="information-circle"
              size={24}
              color={themeColors.text}
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.titleInfoBtn}
            onPress={() => setIsPrivacyVisible(true)}
          >
            <Ionicons
              name="shield-checkmark"
              size={24}
              color={themeColors.text}
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* Barra de busca semântica por IA (Gemini) — só aparece ao clicar em
          "Pesquisar"; arrastável pelo pegador (ícone de grip) à esquerda. */}
      {aiSearchVisible && (
        <View
          style={[styles.aiSearchBar, { top: aiBarXY.y }]}
        >
          <View style={styles.aiSearchRow}>
            <View
              {...aiPan.panHandlers}
              style={styles.aiDragHandle}
            >
              <Ionicons name="reorder-two" size={18} color="#8E8E93" />
            </View>
            <Ionicons name="search" size={16} color="#8E8E93" />
            <TextInput
              style={styles.aiSearchInput}
              placeholder="Buscar pet com IA"
              placeholderTextColor="#8E8E93"
              value={aiQuery}
              onChangeText={setAiQuery}
              onSubmitEditing={runAiSearch}
              returnKeyType="search"
            />
            {aiSearching ? (
              <ActivityIndicator size="small" color={themeColors.primaryButton} style={{ marginRight: 8 }} />
            ) : aiResults ? (
              <TouchableOpacity style={styles.aiSearchClear} onPress={clearAiSearch}>
                <Ionicons name="close-circle" size={18} color="#8E8E93" />
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                style={styles.aiSearchBtn}
                onPress={runAiSearch}
                disabled={!aiQuery.trim()}
              >
                <Text style={styles.aiSearchBtnText}>Buscar</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={styles.aiSearchHint}>
            Descreva a aparência do pet: espécie, cor e marcações. Ex.: gato cinza com manchas brancas
          </Text>
        </View>
      )}

      <View style={styles.mapArea}>
        <View
          style={[
            styles.counterFloat,
            { top: insets.top + 8, right: 12, left: undefined },
          ]}
        >
          <Ionicons name="paw" size={13} color="#FFFFFF" />
          <Text style={styles.counterFloatText}>{totalPetsNoMapa}</Text>
          {petsDenunciados.length > 0 && (
            <View style={styles.counterFloatBadge}>
              <Text style={styles.counterFloatBadgeText}>
                {petsDenunciados.length}
              </Text>
            </View>
          )}
        </View>
        {initialCenterRef.current && (
          <MapLeaflet
            key={`${theme}-${selectedCity.id}`}
            initialCenter={initialCenterRef.current}
            region={mapRegion}
            userLocation={userLocation}
            recenterNonce={recenterNonce}
            pets={visiblePets}
            fitToResults={!!aiResults}
            onMarkerPress={async (petId) => {
              const pet = pets.find((p) => p.id === petId);
              if (pet) setSelectedPet(pet);
              const remote = await fetchPetRemote(petId);
              if (remote) {
                // Preserva o estado de denúncia local caso o servidor ainda
                // não tenha propagado o relatório (evita perder a bandeira
                // DENÚNCIA e a opção "Apagar denúncia" ao reabrir o card).
                const merged =
                  pet && pet.reported && !remote.reported
                    ? {
                        ...remote,
                        reported: pet.reported,
                        reportReason: pet.reportReason,
                        reportedBy: pet.reportedBy,
                        reporterDeviceId: pet.reporterDeviceId,
                      }
                    : remote;
                setPets((prev) => {
                  const exists = prev.some((p) => p.id === petId);
                  return exists
                    ? prev.map((p) => (p.id === petId ? merged : p))
                    : [merged, ...prev];
                });
                setSelectedPet(
                  (cur) => (cur && cur.id === petId ? merged : cur) ?? merged,
                );
              }
            }}
            theme={theme}
            city={selectedCity}
          />
        )}

        {locationEnabled === false && (
          <View style={styles.locationWarning}>
            <Ionicons name="location-outline" size={18} color="#FFFFFF" />
            <Text style={styles.locationWarningText}>
              Ative a localização para reportar um pet perdido.
            </Text>
          </View>
        )}

        <View style={[styles.sideToolbar, { zIndex: 20 }]}>
          <TouchableOpacity style={styles.sideToolbarBtn} onPress={centerOnUserGps}>
            <Ionicons name="locate" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sideToolbarBtn}
            onPress={() => {
              setShowOnlyMine((v) => !v);
              triggerSyncRef.current();
            }}
          >
            <Ionicons
              name={showOnlyMine ? "person" : "people"}
              size={24}
              color="#FFFFFF"
            />
          </TouchableOpacity>
          <TouchableOpacity style={styles.sideToolbarBtn} onPress={toggleTheme}>
            <Ionicons
              name={theme === "dark" ? "sunny" : "moon"}
              size={24}
              color="#FFFFFF"
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sideToolbarBtn}
            onPress={() => {
              const nv = !aiSearchVisible;
              setAiSearchVisible(nv);
              if (nv) setAiBarXY({ x: 12, y: insets.top + (titleBarH || 64) + 8 });
              if (!nv) setAiResults(null);
            }}
          >
            <Ionicons
              name={aiSearchVisible ? "close" : "search"}
              size={24}
              color="#FFFFFF"
            />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sideToolbarBtn}
            onPress={() => {
              if (Platform.OS === "android") {
                showAlert("exit", "Sair", "Deseja realmente sair do app?", [
                  { text: "Cancelar", style: "cancel" },
                  {
                    text: "Sair",
                    style: "destructive",
                    onPress: () => BackHandler.exitApp(),
                  },
                ]);
              } else {
                showAlert(
                  "exit",
                  "Sair",
                  "Não é possível fechar o app no iOS. Encerre-o manualmente.",
                );
              }
            }}
          >
            <Ionicons name="log-out" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <SafeAreaView
          style={[
            styles.floatingButtonContainer,
            { bottom: insets.bottom + 4 },
          ]}
        >
          <Animated.View
            style={[styles.speechBubble, { opacity: bubbleOpacity }]}
          >
            <Text style={styles.speechBubbleText}>
              Toque para{"\n"}reportar um pet perdido
            </Text>
            <View style={styles.speechBubbleArrow} />
          </Animated.View>
          <TouchableOpacity
            style={[
              styles.floatingButton,
              !canReport && styles.floatingButtonDisabled,
            ]}
            disabled={!canReport}
            activeOpacity={0.8}
            onPress={() => openReport()}
          >
            <MaterialCommunityIcons name="paw" size={42} color="#FFFFFF" />
          </TouchableOpacity>
        </SafeAreaView>

        <SafeAreaView
          style={[styles.cityBox, { bottom: insets.bottom + 16, left: 16 }]}
        >
          <View style={styles.cityButton}>
            <Ionicons name="location" size={14} color="#FFFFFF" />
            <Text style={styles.cityButtonText}>{gpsCity}</Text>
          </View>
        </SafeAreaView>
      </View>

      <Modal
        animationType="slide"
        transparent={false}
        visible={isReportModalVisible}
        onRequestClose={fecharModal}
      >
        <SafeAreaView style={styles.modalContainer}>
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={0}
          >
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Reportar Pet Perdido</Text>
              <TouchableOpacity
                style={styles.roundClose}
                onPress={fecharModal}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                activeOpacity={0.7}
              >
                <Text style={styles.roundCloseText}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={styles.modalScrollView}
              keyboardShouldPersistTaps="handled"
              nestedScrollEnabled={true}
            >
              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons
                    name="images"
                    size={16}
                    color={themeColors.primaryButton}
                  />
                  <Text style={styles.sectionTitle}>Fotos</Text>
                </View>
                {isCameraOpen ? (
                <View style={styles.cameraBox}>
                  <CameraView
                    ref={cameraRef}
                    style={styles.camera}
                    facing={facing}
                    zoom={zoom}
                    flash={flash}
                    onCameraReady={() => setCameraReady(true)}
                  >
                    {!cameraReady && (
                      <View style={styles.cameraLoading}>
                        <ActivityIndicator size="large" color="#FFFFFF" />
                      </View>
                    )}
                  </CameraView>
                  <View style={styles.cameraHeader}>
                    <View style={styles.cameraPill}>
                      <Text style={styles.cameraCounter}>
                        {images.length}/{MAX_IMAGES}
                      </Text>
                    </View>
                    <View style={styles.cameraHeaderRight}>
                      <TouchableOpacity
                        style={styles.cameraActionBtn}
                        onPress={toggleFlash}
                      >
                        <Ionicons
                          name={
                            flash === "off"
                              ? "flash-off"
                              : flash === "on"
                                ? "flash"
                                : "flash-outline"
                          }
                          size={22}
                          color="#FFFFFF"
                        />
                      </TouchableOpacity>
                      <View style={styles.cameraCloseWrap}>
                        <TouchableOpacity
                          style={styles.cameraClose}
                          onPress={() => setIsCameraOpen(false)}
                        >
                          <Ionicons name="close" size={22} color="#FFFFFF" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                  <View style={styles.cameraControls}>
                    <View style={styles.cameraFlip}>
                      <TouchableOpacity
                        onPress={() =>
                          setFacing((f) => (f === "back" ? "front" : "back"))
                        }
                      >
                        <Ionicons
                          name="camera-reverse"
                          size={28}
                          color="#FFFFFF"
                        />
                      </TouchableOpacity>
                    </View>
                    <TouchableOpacity
                      style={styles.captureButton}
                      onPress={tirarFoto}
                      disabled={!cameraReady}
                    />
                    <View style={styles.cameraZoomGroup}>
                      <TouchableOpacity
                        style={styles.cameraZoomBtn}
                        onPress={zoomOut}
                        disabled={zoom <= 0}
                      >
                        <Ionicons
                          name="remove"
                          size={24}
                          color={
                            zoom <= 0 ? "rgba(255,255,255,0.4)" : "#FFFFFF"
                          }
                        />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.cameraZoomBtn}
                        onPress={zoomIn}
                        disabled={zoom >= 1}
                      >
                        <Ionicons
                          name="add"
                          size={24}
                          color={
                            zoom >= 1 ? "rgba(255,255,255,0.4)" : "#FFFFFF"
                          }
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={styles.photoBlock}>
                  <View style={styles.photoRow}>
                    {images.map((uri, idx) => (
                      <View key={uri} style={styles.photoThumb}>
                        <Image
                          source={{ uri }}
                          style={styles.photoThumbImage}
                        />
                        <TouchableOpacity
                          style={styles.photoRemove}
                          onPress={() => removerFoto(uri)}
                        >
                          <Ionicons name="close" size={16} color="#FFFFFF" />
                        </TouchableOpacity>
                        {idx === 0 && (
                          <View style={styles.photoPrimaryBadge}>
                            <Text style={styles.photoPrimaryText}>
                              Principal
                            </Text>
                          </View>
                        )}
                      </View>
                    ))}
                    {images.length < MAX_IMAGES && (
                      <TouchableOpacity
                        style={styles.photoAdd}
                        onPress={escolherFonte}
                      >
                        <Ionicons
                          name="camera"
                          size={40}
                          color={themeColors.primaryButton}
                        />
                        <Text style={styles.bigCameraButtonText}>
                          Adicionar
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                  <Text style={styles.photoHint}>
                    Até {MAX_IMAGES} fotos (máx. {formatBytes(MAX_IMAGE_BYTES)}{" "}
                    cada). A primeira será a foto principal do alerta.
                  </Text>
                </View>
              )}

              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons
                    name="location"
                    size={16}
                    color={themeColors.primaryButton}
                  />
                  <Text style={styles.sectionTitle}>Localização</Text>
                </View>
              <Text style={styles.fieldLabel}>
                Quando o pet sumiu? (opcional)
              </Text>
              <TouchableOpacity
                style={styles.dateField}
                onPress={() => setShowDatePicker(true)}
                activeOpacity={0.7}
              >
                <Ionicons
                  name="calendar"
                  size={18}
                  color={themeColors.primaryButton}
                />
                <Text
                  style={[
                    styles.dateFieldText,
                    !lostDate && { color: themeColors.icon },
                  ]}
                >
                  {lostDate
                    ? lostDate.toLocaleDateString("pt-BR")
                    : "Toque para selecionar a data"}
                </Text>
              </TouchableOpacity>

              <Text style={styles.pickLabel}>Onde o pet foi visto?</Text>
              <View style={styles.searchAddressRow}>
                <TextInput
                  style={styles.searchAddressInput}
                  placeholder="Rua, número, cidade"
                  placeholderTextColor="#8E8E93"
                  value={searchAddress}
                  onChangeText={setSearchAddress}
                  returnKeyType="search"
                  onSubmitEditing={procurarEndereco}
                />
                <TouchableOpacity
                  style={styles.searchAddressBtn}
                  onPress={procurarEndereco}
                >
                  <Ionicons name="search" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
              <View
                style={styles.pickMapWrap}
                onStartShouldSetResponder={() => true}
                onMoveShouldSetResponder={() => true}
                onResponderTerminationRequest={() => false}
              >
                <MapPicker
                  initial={
                    petLocation ?? {
                      latitude: mapRegion.latitude,
                      longitude: mapRegion.longitude,
                    }
                  }
                  value={petLocation}
                  userLocation={userLocation}
                  gpsNonce={gpsNonce}
                  theme={theme}
                  city={selectedCity}
                  onPick={handlePickLocation}
                />
              </View>
              <TouchableOpacity style={styles.useGpsBtn} onPress={usarMeuGps}>
                <Ionicons name="locate" size={18} color="#0A84FF" />
                <Text style={styles.useGpsText}>Usar meu GPS (onde estou)</Text>
              </TouchableOpacity>
              {cityName ? (
                <View style={styles.cityHintRow}>
                  <Ionicons
                    name="location"
                    size={14}
                    color={themeColors.icon}
                  />
                  <Text style={styles.cityHintText}>Cidade: {cityName}</Text>
                </View>
              ) : null}

              <Text style={styles.fieldLabel}>Última Localização Vista *</Text>
              <TextInput
                ref={locationRef}
                style={styles.input}
                placeholder="Ex.: Rua das Flores, perto da praça"
                placeholderTextColor="#8E8E93"
                value={location}
                onChangeText={setLocation}
                returnKeyType="next"
                onSubmitEditing={() => descriptionRef.current?.focus()}
              />
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons
                    name="paw"
                    size={16}
                    color={themeColors.primaryButton}
                  />
                  <Text style={styles.sectionTitle}>Sobre o pet</Text>
                </View>
              <Text style={styles.fieldLabel}>Espécie *</Text>
              <DropDownPicker
                open={speciesPickerOpen}
                value={species || null}
                items={speciesItems}
                setOpen={setSpeciesPickerOpen}
                setValue={(v) =>
                  setSpecies(
                    typeof v === "function"
                      ? (v as (p: string) => string)(species)
                      : ((v as string) ?? ""),
                  )
                }
                onChangeValue={(v) => {
                  const t = v ?? "";
                  // Se a nova espécie é conhecida e a raça atual não pertence
                  // a ela, limpa a raça (evita "cão com raça de gato").
                  const valid = SPECIES_BREEDS[t];
                  if (valid && breed && !valid.includes(breed)) {
                    setBreed("");
                  }
                  // Não abre o picker de Raça automaticamente: o usuário
                  // toca no campo Raça quando quiser.
                }}
                listMode="MODAL"
                maxHeight={400}
                placeholder="Selecione a espécie"
                searchPlaceholder="Digite para buscar"
                searchable
                modalTitle="Selecione a Espécie"
                modalTitleStyle={styles.rdpModalTitle}
                modalContentContainerStyle={[
                  styles.rdpModalContent,
                  { marginTop: insets.top + 8 },
                ]}
                modalProps={{ transparent: true, presentationStyle: "overFullScreen" }}
                style={styles.rdpPicker}
                dropDownContainerStyle={styles.rdpDropdown}
                textStyle={styles.rdpText}
                placeholderStyle={styles.rdpPlaceholder}
                searchTextInputStyle={styles.rdpText}
              />
              <Text style={styles.fieldLabel}>Raça *</Text>
              <DropDownPicker
                open={breedPickerOpen}
                value={breed || null}
                items={breedItems}
                setOpen={setBreedPickerOpen}
                setValue={(v) =>
                  setBreed(
                    typeof v === "function"
                      ? (v as (p: string) => string)(breed)
                      : ((v as string) ?? ""),
                  )
                }
                listMode="MODAL"
                maxHeight={400}
                placeholder="Selecione a raça"
                searchPlaceholder="Digite para buscar"
                searchable
                disabled={breedItems.length === 0}
                modalTitle="Selecione a Raça"
                modalTitleStyle={styles.rdpModalTitle}
                modalContentContainerStyle={[
                  styles.rdpModalContent,
                  { marginTop: insets.top + 8 },
                ]}
                modalProps={{ transparent: true, presentationStyle: "overFullScreen" }}
                style={styles.rdpPicker}
                dropDownContainerStyle={styles.rdpDropdown}
                textStyle={styles.rdpText}
                placeholderStyle={styles.rdpPlaceholder}
                searchTextInputStyle={styles.rdpText}
              />
              <Text style={styles.fieldLabel}>Descrição Adicional (opcional)</Text>
              <TextInput
                ref={descriptionRef}
                style={[styles.input, styles.textArea]}
                placeholder="Detalhes que ajudem a identificar o pet"
                placeholderTextColor="#8E8E93"
                value={description}
                onChangeText={setDescription}
                multiline
                returnKeyType="next"
                onSubmitEditing={() => contactRef.current?.focus()}
              />
              </View>

              <View style={styles.section}>
                <View style={styles.sectionHeader}>
                  <Ionicons
                    name="call"
                    size={16}
                    color={themeColors.primaryButton}
                  />
                  <Text style={styles.sectionTitle}>Contato e Recompensa</Text>
                </View>
              <Text style={styles.fieldLabel}>Recompensa (opcional)</Text>
              <View style={styles.rewardField}>
                <Text style={styles.rewardPrefix}>R$</Text>
                <TextInput
                  style={styles.rewardInput}
                  placeholder="0,00"
                  placeholderTextColor="#8E8E93"
                  value={reward ? Number(reward).toLocaleString("pt-BR") : ""}
                  onChangeText={(t) => setReward(t.replace(/\D/g, ""))}
                  keyboardType="number-pad"
                  returnKeyType="next"
                  onSubmitEditing={() => contactRef.current?.focus()}
                />
              </View>
              <Text style={styles.fieldLabel}>Contato (WhatsApp) *</Text>
              <TextInput
                ref={contactRef}
                style={[styles.input, contactError ? styles.inputError : null]}
                placeholder="(15) 99999-9999"
                placeholderTextColor="#8E8E93"
                value={contact}
                onChangeText={(t) => {
                  const f = formatPhone(t);
                  setContact(f);
                  setContactError(
                    f && !isValidPhone(f)
                      ? "Número de WhatsApp inválido (use DDD + 9 dígitos)."
                      : "",
                  );
                }}
                keyboardType="phone-pad"
                returnKeyType="done"
                maxLength={16}
              />
              {contactError ? (
                <Text style={styles.fieldError}>{contactError}</Text>
              ) : null}

              </View>

              <TouchableOpacity
                style={styles.submitButton}
                onPress={handleAddPet}
              >
                <Text style={styles.submitButtonText}>Publicar Alerta</Text>
              </TouchableOpacity>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

        <Modal
          animationType="slide"
          transparent={true}
          visible={isPhotoSourceVisible}
          onRequestClose={fecharFonte}
        >
          <SafeAreaView
            edges={["bottom"]}
            style={styles.actionSheetOverlay}
          >
            <TouchableOpacity
              style={{ flex: 1, justifyContent: "flex-end" }}
              activeOpacity={1}
              onPress={fecharFonte}
            >
              <View style={styles.actionSheet}>
                <Text style={styles.actionSheetTitle}>Adicionar foto</Text>
            <TouchableOpacity
              style={styles.actionSheetOption}
              onPress={abrirCamera}
            >
              <Ionicons name="camera" size={22} color={themeColors.text} />
              <Text style={styles.actionSheetOptionText}>Câmera</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.actionSheetOption}
              onPress={abrirGaleria}
            >
              <Ionicons name="images" size={22} color={themeColors.text} />
              <Text style={styles.actionSheetOptionText}>Galeria</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionSheetOption, styles.actionSheetCancel]}
              onPress={fecharFonte}
            >
              <Text
                style={[
                  styles.actionSheetOptionText,
                  styles.actionSheetCancelText,
                ]}
              >
                Cancelar
              </Text>
            </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </SafeAreaView>
        </Modal>

      <Modal
        animationType="fade"
        transparent={true}
        visible={isAboutVisible}
        onRequestClose={() => setIsAboutVisible(false)}
      >
        <TouchableOpacity
          style={styles.aboutOverlay}
          activeOpacity={1}
          onPress={() => setIsAboutVisible(false)}
        >
          <View style={styles.aboutCard}>
            <Image
              source={require("../../assets/images/logo.png")}
              style={{
                width: 120,
                height: 120,
                marginBottom: 16,
                resizeMode: "contain",
              }}
            />
            <Text style={styles.aboutText}>
              App para ajudar a encontrar pets perdidos. Registre um pet,
              informe a localização e o seu número para quem encontrá-lo entrar
              em contato pelo WhatsApp.
            </Text>
            <Text style={styles.aboutVersion}>Versão 1.0.0</Text>
            <TouchableOpacity
              style={styles.aboutClose}
              onPress={() => setIsAboutVisible(false)}
            >
              <Text style={styles.aboutCloseText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        animationType="fade"
        transparent={true}
        visible={isPrivacyVisible}
        onRequestClose={() => setIsPrivacyVisible(false)}
      >
        <View style={styles.aboutOverlay}>
          <View style={styles.aboutCard}>
            <Text style={styles.aboutTitle}>Política de Privacidade</Text>
            <ScrollView
              style={styles.privacyScroll}
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
            >
              <Text style={styles.privacyText}>
                <Text style={{ fontWeight: "bold" }}>
                  Política de Privacidade e Tratamento de Dados Pessoais{"\n"}
                </Text>
                Esta Política de Privacidade descreve como o iFujão
                ("aplicativo", "nós") coleta, utiliza, armazena, compartilha e
                protege as informações dos usuários, em conformidade com a Lei
                Geral de Proteção de Dados (Lei nº 13.709/2018 - LGPD), com o
                Marco Civil da Internet (Lei nº 12.965/2014) e com boas práticas
                inspiradas em políticas de grandes plataformas como WhatsApp,
                Instagram e Facebook.{"\n\n"}
                <Text style={{ fontWeight: "bold" }}>1. Quem somos{"\n"}</Text>O
                iFujão é um aplicativo cujo propósito é ajudar pessoas a
                encontrarem pets perdidos, permitindo o registro de alertas com
                localização e contato para reencontro. Esta política aplica-se a
                todos os usuários do app, independentemente da plataforma
                (Android ou iOS).{"\n\n"}
                <Text style={{ fontWeight: "bold" }}>
                  2. Dados que coletamos{"\n"}
                </Text>
                Coletamos apenas os dados estritamente necessários ao
                funcionamento:{"\n"}• Dados do pet: espécie/raça, localização
                informada, descrição e fotografias.{"\n"}• Dados de contato:
                número de WhatsApp informado como forma de contato pelo
                responsável.{"\n"}• Identificador de dispositivo: utilizamos um
                identificador local para reconhecer os alertas criados por você
                neste aparelho.{"\n"}• Dados de localização: obtidos com sua
                permissão, apenas para posicionar o alerta no mapa e verificar a
                área de cobertura da cidade.{"\n"}
                Não coletamos dados sensíveis (origem racial, religião, opinião
                política, dados de saúde ou biometricos) nem lemos sua agenda ou
                mensagens de outros aplicativos.{"\n\n"}
                <Text style={{ fontWeight: "bold" }}>
                  3. Como usamos seus dados{"\n"}
                </Text>
                Utilizamos os dados exclusivamente para: (a) exibir os alertas
                de pets perdidos no mapa; (b) permitir o contato entre quem
                encontrou o pet e o responsável via WhatsApp; (c) identificar e
                permitir a exclusão dos seus próprios alertas; e (d) melhorar a
                experiência e a segurança do app. Não utilizamos seus dados para
                publicidade comportamental ou venda a anunciantes.{"\n\n"}
                <Text style={{ fontWeight: "bold" }}>
                  4. Armazenamento e criptografia{"\n"}
                </Text>
                No estado atual, os alertas e o seu identificador de dispositivo
                são armazenados localmente neste aparelho por meio do
                SecureStore, um cofre criptografado nativo do sistema
                operacional (Keychain no iOS e Keystore/SharedPreferences
                criptografado no Android). Os dados sensíveis permanecem
                protegidos em repouso pela criptografia do próprio dispositivo.
                {"\n"}
                Quando os dados passarem a ser sincronizados com servidores,
                eles serão transmitidos exclusivamente por canais seguros (TLS
                1.2 ou superior) e armazenados em bases criptografadas, seguindo
                os mesmos padrões de proteção adotados por grandes plataformas
                de mensageria. O número de WhatsApp é tratado como dado de
                contato e não é exposto publicamente além do necessário para o
                reencontro.{"\n\n"}
                <Text style={{ fontWeight: "bold" }}>
                  5. Compartilhamento e terceiros{"\n"}
                </Text>
                Não vendemos, alugamos ou comercializamos seus dados pessoais. O
                número de contato é exibido apenas dentro do alerta, para que
                terceiros possam entrar em contato pelo WhatsApp e ajudar no
                reencontro. Poderemos compartilhar dados somente: (a) com seu
                consentimento; (b) para cumprimento de obrigação legal ou
                decisão judicial; ou (c) com prestadores de serviço essenciais
                (como hospedagem e infraestrutura), sob obrigações de
                confidencialidade. Ao utilizar o WhatsApp para contato,
                aplica-se também a Política de Privacidade da Meta/WhatsApp.
                {"\n\n"}
                <Text style={{ fontWeight: "bold" }}>6. Retenção{"\n"}</Text>
                Mantemos seus dados apenas pelo tempo necessário às finalidades
                descritas ou conforme exigido por lei. Você pode remover seus
                próprios alertas a qualquer momento; ao desinstalar o app, os
                dados locais são apagados junto com o armazenamento do
                dispositivo.{"\n\n"}
                <Text style={{ fontWeight: "bold" }}>7. Segurança{"\n"}</Text>
                Adotamos medidas técnicas e organizacionais razoáveis para
                proteger seus dados contra acesso não autorizado, perda ou
                alteração, incluindo criptografia em repouso (SecureStore),
                transmissão segura e princípio de minimização de dados. Contudo,
                nenhum sistema é infalível, e recomendamos cautela ao divulgar
                informações de contato em espaços públicos.{"\n\n"}
                <Text style={{ fontWeight: "bold" }}>
                  8. Seus direitos (LGPD){"\n"}
                </Text>
                Nos termos da LGPD, você pode, a qualquer momento, solicitar:
                confirmação da existência de tratamento; acesso; correção;
                anonimização, bloqueio ou eliminação de dados desnecessários;
                portabilidade; revogação do consentimento; e eliminação dos
                dados tratados com base no seu consentimento. No app, você
                exerce parte desses direitos diretamente: apagando seus alertas
                e desinstalando o aplicativo para remover dados locais. Para
                demais solicitações, use nossos canais oficiais.{"\n\n"}
                <Text style={{ fontWeight: "bold" }}>
                  9. Menores de idade{"\n"}
                </Text>
                O app pode ser utilizado por menores com autorização dos pais ou
                responsáveis. Não coletamos conscientemente dados de crianças
                sem o consentimento dos responsáveis.{"\n\n"}
                <Text style={{ fontWeight: "bold" }}>
                  10. Alterações nesta política{"\n"}
                </Text>
                Poderemos atualizar esta Política de tempos em tempos. A versão
                vigente estará sempre disponível no app, e alterações relevantes
                serão comunicadas antes de entrarem em vigor.{"\n\n"}
                <Text style={{ fontWeight: "bold" }}>11. Contato{"\n"}</Text>
                Em caso de dúvidas, solicitações relativas aos seus dados ou
                questões sobre privacidade, entre em contato pelos canais
                oficiais do iFujão. Última atualização: 2026.
              </Text>
            </ScrollView>
            <TouchableOpacity
              style={styles.aboutClose}
              onPress={() => setIsPrivacyVisible(false)}
            >
              <Text style={styles.aboutCloseText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {selectedPet !== null && (
        <>
          <Modal
            animationType="fade"
            transparent={true}
            visible={true}
            onRequestClose={() => setSelectedPet(null)}
          >
            <View
              style={[styles.demoOverlay, { paddingTop: insets.top + 24 }]}
              onStartShouldSetResponder={() => true}
              onTouchStart={() => setSelectedPet(null)}
            >
              <View
                style={styles.demoCard}
                onStartShouldSetResponder={() => true}
                onTouchStart={(e) => e.stopPropagation()}
              >
                <TouchableOpacity
                  style={styles.demoClose}
                  onPress={() => setSelectedPet(null)}
                >
                  <Ionicons name="close" size={22} color="#FFFFFF" />
                </TouchableOpacity>
                <View style={styles.reportImageWrap}>
                  <ImageCarousel
                    images={selectedPet.images}
                    blurRadius={selectedPet.reported ? 18 : 0}
                    onPressImage={(imgs, idx) => {
                      if (!selectedPet.reported) openInViewer(imgs, idx);
                    }}
                  />
                  {selectedPet.reported ? (
                    <View style={styles.reportedBanner}>
                      <Text style={styles.reportedBannerText}>DENÚNCIA</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.demoName}>
                  {selectedPet.species}
                  {selectedPet.breed ? ` - ${selectedPet.breed}` : ""}
                </Text>
                <View style={styles.demoRow}>
                  <Ionicons
                    name="location"
                    size={16}
                    color={themeColors.primaryButton}
                  />
                  <Text style={styles.demoLocation}>
                    {selectedPet.location}
                    {selectedPet.city ? ` — ${selectedPet.city}` : ""}
                  </Text>
                </View>
                {formatLostDate(selectedPet.lostDate) ? (
                  <View style={styles.demoRow}>
                    <Ionicons
                      name="calendar"
                      size={16}
                      color={themeColors.primaryButton}
                    />
                    <Text style={styles.demoDate}>
                      Sumiu em {formatLostDate(selectedPet.lostDate)}
                    </Text>
                  </View>
                ) : null}
                {typeof selectedPet.reward === "number" &&
                Number.isFinite(selectedPet.reward) ? (
                  <View style={styles.demoRow}>
                    <Ionicons
                      name="cash"
                      size={16}
                      color={themeColors.primaryButton}
                    />
                    <Text style={styles.demoReward}>
                      Recompensa:{" "}
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(selectedPet.reward)}
                    </Text>
                  </View>
                ) : null}
                {selectedPet.description ? (
                  <TouchableOpacity
                    style={styles.demoDescBtn}
                    onPress={() => setShowDescriptionModal(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="document-text"
                      size={16}
                      color={themeColors.primaryButton}
                    />
                    <Text style={styles.demoDescBtnText}>Ver descrição</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View
                style={[styles.demoActionBar, { bottom: insets.bottom + 16 }]}
                onTouchStart={(e) => e.stopPropagation()}
              >
                {(() => {
                  type BarAction = {
                    key: string;
                    icon: string;
                    label: string;
                    color: string;
                    reportedDisabled?: boolean;
                    onPress: () => void;
                  };
                  // Não faz sentido "Denunciar" de novo um pet já denunciado:
                  // oculta o botão sempre que reported=true (qualquer denúncia,
                  // não importa quem fez). Quem denunciou vê "Apagar denúncia".
                  const jaDenunciado = selectedPet.reported;
                  const actions: BarAction[] = [
                    ...(isOwner(selectedPet, myDeviceId, myPhone)
                      ? []
                      : [
                          {
                            key: "contact",
                            icon: "logo-whatsapp",
                            label: "Contatar tutor",
                            color: "#25D366",
                            reportedDisabled: true,
                            onPress: () => {
                              const pet = selectedPet;
                              setSelectedPet(null);
                              handleContact(pet);
                            },
                          } as BarAction,
                        ]),
                    ...((jaDenunciado || isOwner(selectedPet, myDeviceId, myPhone))
                      ? []
                      : [
                          {
                            key: "report",
                            icon: "flag",
                            label: "Denunciar",
                            color: "#FF9500",
                            onPress: () => reportPet(selectedPet),
                          } as BarAction,
                        ]),
                    {
                      key: "share",
                      icon: "share-social",
                      label: "Compartilhar",
                      color: "#25D366",
                      reportedDisabled: true,
                      onPress: () => sharePetCard(selectedPet),
                    },
                  ];
                  if (isOwner(selectedPet, myDeviceId, myPhone)) {
                    actions.push({
                      key: "delete",
                      icon: "trash",
                      label: "Apagar",
                      color: "#FF3B30",
                      onPress: () => deletePet(selectedPet.id),
                    });
                  }
                  if (
                    selectedPet.reported &&
                    !!myDeviceId &&
                    selectedPet.reporterDeviceId === myDeviceId
                  ) {
                    actions.push({
                      key: "undoReport",
                      icon: "flag",
                      label: "Apagar denúncia",
                      color: "#0A84FF",
                      onPress: () => {
                        commitPets(
                          pets.map((p) =>
                            p.id === selectedPet.id
                              ? {
                                  ...p,
                                  reported: false,
                                  reportReason: undefined,
                                  reportedBy: undefined,
                                  dirty: true,
                                }
                              : p,
                          ),
                        );
                        setSelectedPet(null);
                      },
                    });
                  }
                  return (
                    <View style={styles.demoActionRow}>
                      {actions.map((item) => {
                        const disabled =
                          item.reportedDisabled && selectedPet.reported;
                        return (
                          <TouchableOpacity
                            key={item.key}
                            style={[
                              styles.demoActionBtn,
                              { borderColor: item.color },
                              disabled && styles.demoActionBtnDisabled,
                            ]}
                            disabled={disabled}
                            activeOpacity={0.7}
                            onPress={item.onPress}
                          >
                            <Ionicons
                              name={item.icon as any}
                              size={22}
                              color={disabled ? "#8E8E93" : item.color}
                            />
                            <Text
                              numberOfLines={1}
                              style={[
                                styles.demoActionLabel,
                                { color: disabled ? "#8E8E93" : item.color },
                              ]}
                            >
                              {item.label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                })()}
              </View>
            </View>
          </Modal>
          <ViewShot
            ref={shareCardRef}
            options={{ format: "png", quality: 1 }}
            style={styles.shareCardOffscreen}
          >
            <View style={styles.shareCard} collapsable={false}>
              <View style={styles.shareCardHeader}>
                <Image
                  source={require("../../assets/images/logo.png")}
                  style={styles.shareCardLogo}
                />
                <Text style={styles.shareCardApp}>iFujão</Text>
                <Text style={styles.shareCardTag}>Pet perdido</Text>
              </View>
              <Image
                source={{ uri: selectedPet.images[0] }}
                style={styles.shareCardPhoto}
                resizeMode="cover"
                blurRadius={selectedPet.reported ? 18 : 0}
              />
              {selectedPet.reported && (
                <View style={styles.shareCardReported}>
                  <Text style={styles.shareCardReportedText}>DENÚNCIA</Text>
                </View>
              )}
              <View style={styles.shareCardMap}>
                <Ionicons name="location" size={28} color="#FF3B30" />
                <Text style={styles.shareCardLocation}>
                  {selectedPet.location || "Local não informado"}
                  {selectedPet.city ? ` — ${selectedPet.city}` : ""}
                </Text>
                <Text style={styles.shareCardCoords}>
                  {selectedPet.latitude.toFixed(4)},{" "}
                  {selectedPet.longitude.toFixed(4)}
                </Text>
              </View>
              <View style={styles.shareCardFooter}>
                <View style={styles.shareCardFooterText}>
                  <Text style={styles.shareCardHelp}>
                    Ajude a encontrar!{"\n"}Compartilhe com seus contatos{"\n"}
                    para aumentar as chances. 🐾
                  </Text>
                </View>
              </View>
            </View>
          </ViewShot>
        </>
      )}

      <Modal
        animationType="fade"
        transparent={true}
        visible={showDescriptionModal}
        onRequestClose={() => setShowDescriptionModal(false)}
      >
        <View
          style={styles.descOverlay}
          onStartShouldSetResponder={() => true}
          onTouchStart={() => setShowDescriptionModal(false)}
        >
          <View
            style={styles.descCard}
            onStartShouldSetResponder={() => true}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <Text style={styles.descTitle}>Descrição</Text>
            <ScrollView
              style={styles.descScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator={true}
            >
              <Text style={styles.descText}>{selectedPet?.description}</Text>
            </ScrollView>
            <TouchableOpacity
              style={styles.descCloseBtn}
              onPress={() => setShowDescriptionModal(false)}
              activeOpacity={0.6}
            >
              <Text style={styles.descCloseText}>Fechar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <Modal
        animationType="fade"
        transparent={true}
        visible={reportTarget !== null}
        onRequestClose={() => setReportTarget(null)}
      >
        <View style={styles.reportOverlay}>
          <View style={styles.reportCard}>
            <TouchableOpacity
              style={styles.reportClose}
              onPress={() => setReportTarget(null)}
            >
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <Ionicons
              name="flag"
              size={40}
              color="#FF9500"
              style={styles.reportIcon}
            />
            <Text style={styles.reportTitle}>Denunciar alerta</Text>
            <Text style={styles.reportSubtitle}>
              Selecione o motivo da denúncia:
            </Text>
            {[
              "Conteúdo impróprio ou ofensivo",
              "Foto inadequada",
              "Informação falsa/engano",
              "Spam",
              "Outro",
            ].map((m) => (
              <TouchableOpacity
                key={m}
                style={styles.reportOption}
                onPress={() => reportTarget && submitReport(reportTarget, m)}
              >
                <Text style={styles.reportOptionText}>{m}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </Modal>

      <ImageViewerModal
        visible={viewerVisible && viewerImages.length > 0}
        images={viewerImages}
        index={viewerIndex}
        title={
          selectedPet
            ? `${selectedPet.species}${selectedPet.breed ? ` (${selectedPet.breed})` : ""}`
            : undefined
        }
        onClose={() => setViewerVisible(false)}
        onIndexChange={setViewerIndex}
      />

      <DatePickerCalendar
        isVisible={showDatePicker}
        initialDate={lostDate ?? new Date()}
        maximumDate={new Date()}
        onCancel={() => setShowDatePicker(false)}
        onConfirm={(selected) => {
          setShowDatePicker(false);
          setLostDate(selected);
        }}
      />
    </View>
  );
}

const MapPicker = ({
  initial,
  value,
  userLocation,
  gpsNonce,
  theme,
  city,
  onPick,
}: {
  initial: { latitude: number; longitude: number };
  value?: { latitude: number; longitude: number } | null;
  userLocation: { latitude: number; longitude: number } | null;
  gpsNonce: number;
  theme: "light" | "dark";
  city: import("@/constants/cities").City;
  onPick: (lat: number, lng: number) => void;
}) => {
  const isDark = theme === "dark";
  const [start] = useState(initial);
  const webRef = useRef<WebView>(null);
  const html = useMemo(() => {
    const mapFilter = isDark
      ? "filter: invert(1) hue-rotate(180deg) brightness(0.95);"
      : "";
    return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>html,body,#map{height:100%;margin:0;padding:0;touch-action:manipulation;} .leaflet-control-attribution{display:none !important;} #map{${mapFilter}}</style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', { attributionControl: false, tap: true, dragging: true, scrollWheelZoom: true, doubleClickZoom: true, zoomControl: true, inertia: true }).setView([${start.latitude}, ${start.longitude}], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
        var marker = L.marker([${start.latitude}, ${start.longitude}], { draggable: true }).addTo(map);
        map.on('click', function(e){ marker.setLatLng(e.latlng); window.ReactNativeWebView.postMessage(JSON.stringify({ lat: e.latlng.lat, lng: e.latlng.lng })); });
        marker.on('dragend', function(){ var p = marker.getLatLng(); window.ReactNativeWebView.postMessage(''+JSON.stringify({ lat: p.lat, lng: p.lng })); });
        document.addEventListener('message', function(e){
          try {
            var d = JSON.parse(e.data);
            if (d && d.move && typeof d.move.lat === 'number' && typeof d.move.lng === 'number') {
              marker.setLatLng([d.move.lat, d.move.lng]);
              map.setView([d.move.lat, d.move.lng]);
            }
          } catch (err) {}
        });
      </script>
    </body>
  </html>`;
  }, [
    isDark,
    start.latitude,
    start.longitude,
    city.latitude,
    city.longitude,
  ]);

  useEffect(() => {
    if (value && webRef.current) {
      webRef.current.postMessage(
        JSON.stringify({ move: { lat: value.latitude, lng: value.longitude } }),
      );
    }
  }, [value?.latitude, value?.longitude]);

  // Força o recentramento no GPS a cada toque no botão, mesmo quando o
  // petLocation já é igual ao GPS (ex.: usuário só panorâmico o mapa).
  useEffect(() => {
    if (gpsNonce > 0 && userLocation && webRef.current) {
      webRef.current.postMessage(
        JSON.stringify({
          move: { lat: userLocation.latitude, lng: userLocation.longitude },
        }),
      );
    }
  }, [gpsNonce]);

  return (
    <View
      style={{ width: "100%", height: "100%" }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onStartShouldSetResponderCapture={() => true}
      onMoveShouldSetResponderCapture={() => true}
    >
      <WebView
        ref={webRef}
        style={{ width: "100%", height: "100%", borderRadius: 12 }}
        originWhitelist={["*"]}
        source={{ html }}
        setSupportMultipleWindows={false}
        overScrollMode="never"
        nestedScrollEnabled={true}
        javaScriptEnabled={true}
        onMessage={(e) => {
          try {
            const d = JSON.parse(e.nativeEvent.data);
            if (typeof d.lat === "number" && typeof d.lng === "number")
              onPick(d.lat, d.lng);
          } catch {}
        }}
      />
    </View>
  );
};

const CircularActionButton = ({
  index,
  progress,
  x,
  y,
  size,
  color,
  icon,
  label,
  disabled,
  onPress,
  styles,
}: {
  index: number;
  progress: SharedValue<number>;
  x: number;
  y: number;
  size: number;
  color: string;
  icon: string;
  label: string;
  disabled?: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}) => {
  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const delay = index * 60;
    const local = Math.max(0, Math.min(1, p * (1 + delay / 420) - delay / 420));
    const eased = local * local * (3 - 2 * local);
    return {
      transform: [
        { translateX: -size / 2 + x * eased },
        { translateY: -size / 2 + y * eased },
        { scale: 0.2 + 0.8 * eased },
      ],
      opacity: eased,
    };
  });

  return (
    <Reanimated.View
      pointerEvents={disabled ? "none" : "auto"}
      style={[
        styles.circularBtn,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: disabled ? "#8E8E93" : color,
        },
        animatedStyle,
      ]}
    >
      <TouchableOpacity
        style={{
          width: "100%",
          height: "100%",
          justifyContent: "center",
          alignItems: "center",
        }}
        disabled={disabled}
        onPress={onPress}
      >
        <Ionicons name={icon as any} size={26} color="#FFFFFF" />
        <Text style={styles.circularBtnLabel}>{label}</Text>
      </TouchableOpacity>
    </Reanimated.View>
  );
};

const MapLeaflet = ({
  initialCenter,
  region,
  userLocation,
  recenterNonce,
  pets,
  onMarkerPress,
  theme,
  city,
  fitToResults,
}: {
  initialCenter: { latitude: number; longitude: number } | null;
  region: Region;
  userLocation: { latitude: number; longitude: number } | null;
  recenterNonce: number;
  pets: PetPost[];
  onMarkerPress: (petId: string) => void;
  theme: "light" | "dark";
  city: import("@/constants/cities").City;
  fitToResults?: boolean;
}) => {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [mapReady, setMapReady] = useState(false);
  const petsRef = useRef(pets);
  petsRef.current = pets;
  const center = initialCenter ?? {
    latitude: city.latitude,
    longitude: city.longitude,
  };
  const isDark = theme === "dark";
  const mapFilter = isDark
    ? "filter: invert(1) hue-rotate(180deg) brightness(0.95);"
    : "";
  const html = useMemo(
    () => `
  <!DOCTYPE html>
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>html,body,#map{height:100%;margin:0;padding:0;touch-action:none;} .leaflet-control-attribution{display:none !important;} #map{${mapFilter}} .paw-pin{filter:drop-shadow(0 2px 3px rgba(0,0,0,0.5));} .paw-pin svg{display:block;} .paw-pin .paw-emoji{position:absolute;top:6px;left:0;right:0;text-align:center;font-size:16px;line-height:1;}</style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', { attributionControl: false }).setView([${center.latitude}, ${center.longitude}], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19
        }).addTo(map);

        // Corrige mapa preto/cinza quando o container ainda está com tamanho 0
        // na inicialização (Leaflet calcula tiles com tamanho 0). Recalcula o
        // tamanho em vários momentos e quando os tiles terminam de carregar.
        var __invalidate = function(){ try { if (window.__map) window.__map.invalidateSize(); } catch (e) {} };
        setTimeout(__invalidate, 200);
        setTimeout(__invalidate, 500);
        setTimeout(__invalidate, 1000);
        map.on('load', __invalidate);

        var pawIcon = L.divIcon({
          className: 'paw-pin',
          html: '<div style="position:relative;width:30px;height:40px;">' +
            '<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 13.2 22.6 13.9 23.3.5.5 1.3.5 1.8 0C16.4 37.6 30 25.5 30 15 30 6.7 23.3 0 15 0z" fill="#ffffff" stroke="#0A84FF" stroke-width="2"/>' +
            '</svg>' +
            '<div class="paw-emoji">🐾</div>' +
            '</div>',
          iconSize: [30, 40],
          iconAnchor: [15, 40],
          popupAnchor: [0, -36],
        });

        var reportedIcon = L.divIcon({
          className: 'paw-pin',
          html: '<div style="position:relative;width:30px;height:40px;">' +
            '<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg">' +
            '<path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 13.2 22.6 13.9 23.3.5.5 1.3.5 1.8 0C16.4 37.6 30 25.5 30 15 30 6.7 23.3 0 15 0z" fill="#ffffff" stroke="#FF3B30" stroke-width="2"/>' +
            '</svg>' +
            '<div class="paw-emoji" style="color:#FF3B30;">⚑</div>' +
            '</div>',
          iconSize: [30, 40],
          iconAnchor: [15, 40],
          popupAnchor: [0, -36],
        });

        window.__map = map;
        window.__pawIcon = pawIcon;
        window.__reportedIcon = reportedIcon;
        window.__petMarkers = [];
        window.__renderPets = function(pets){
          if (!window.__petMarkers) window.__petMarkers = [];
          window.__petMarkers.forEach(function(m){ window.__map.removeLayer(m); });
          window.__petMarkers = [];
          function addMarker(p, lat, lng){
            var m = L.marker([lat, lng], { icon: p.reported ? window.__reportedIcon : window.__pawIcon }).addTo(window.__map);
            m.on('click', function(){ window.ReactNativeWebView.postMessage(JSON.stringify({petId:p.id, contact:p.contact})); });
            window.__petMarkers.push(m);
          }
          var groups = {};
          pets.forEach(function(p){
            if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') return;
            var key = p.latitude.toFixed(5) + ',' + p.longitude.toFixed(5);
            (groups[key] = groups[key] || []).push(p);
          });
          var delta = 0.0003;
          Object.keys(groups).forEach(function(key){
            groups[key].forEach(function(p, i){ addMarker(p, p.latitude, p.longitude + delta * i); });
          });
        };
        window.__renderPets([]);
      </script>
    </body>
  </html>`,
    [
      initialCenter,
      city,
      center.latitude,
      center.longitude,
      mapFilter,
    ],
  );

  // Delta de separação (graus) para pets na mesma coordenada (~33m). Como esta
  // string é re-injetada a cada mudança de `pets` (e no onLoad), o valor novo
  // entra em vigor SEM precisar recarregar o WebView.
  const SPIDER_DELTA = 0.0003;
  const renderPetsJs = (list: PetPost[]) =>
    `(function(){
      window.__renderPets = function(pets){
        if (!window.__petMarkers) window.__petMarkers = [];
        window.__petMarkers.forEach(function(m){ window.__map.removeLayer(m); });
        window.__petMarkers = [];
        function addMarker(p, lat, lng){
          var m = L.marker([lat, lng], { icon: p.reported ? window.__reportedIcon : window.__pawIcon }).addTo(window.__map);
          m.on('click', function(){ window.ReactNativeWebView.postMessage(JSON.stringify({petId:p.id, contact:p.contact})); });
          window.__petMarkers.push(m);
        }
        var groups = {};
        pets.forEach(function(p){
          if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') return;
          var key = p.latitude.toFixed(5) + ',' + p.longitude.toFixed(5);
          (groups[key] = groups[key] || []).push(p);
        });
        var delta = ${SPIDER_DELTA};
        Object.keys(groups).forEach(function(key){
          groups[key].forEach(function(p, i){ addMarker(p, p.latitude, p.longitude + delta * i); });
        });
      };
      var tryRender = function(){ if (window.__renderPets && window.__map) { window.__renderPets(${JSON.stringify(list)}); } else { setTimeout(tryRender, 200); } };
      tryRender();
    })();`;

  useEffect(() => {
    if (!mapReady || !webRef.current) return;
    webRef.current.injectJavaScript(renderPetsJs(pets));
  }, [mapReady, pets, SPIDER_DELTA]);

  // Centraliza o mapa na posição real do usuário quando ela chega/atualiza
  // (incluindo quando definida tarde). Usa um limiar para não "pular" o mapa a
  // cada pequeno ruído de GPS. Válido em qualquer lugar do mundo.
  const lastPanRef = useRef<{ latitude: number; longitude: number } | null>(
    null,
  );
  useEffect(() => {
    if (!mapReady || !webRef.current || !userLocation) return;
    // Em modo busca (fitToResults) não roubamos o enquadramento dos resultados
    // com o auto-pan do GPS a cada poll de 5s.
    if (fitToResults) return;
    const last = lastPanRef.current;
    if (
      last &&
      distanceMeters(
        last.latitude,
        last.longitude,
        userLocation.latitude,
        userLocation.longitude,
      ) < 80
    ) {
      return;
    }
    lastPanRef.current = userLocation;
    const js = `(function(){ if (window.__map) { window.__map.setView([${userLocation.latitude}, ${userLocation.longitude}], Math.max(window.__map.getZoom(), 13)); } })();`;
    webRef.current.injectJavaScript(js);
  }, [mapReady, userLocation]);

  // Força o recentramento quando o botão "Centralizar no meu GPS" é clicado
  // (recenterNonce muda), ignorando o limiar de ruído de GPS — o botão deve
  // centralizar sempre, mesmo já estando próximo.
  useEffect(() => {
    if (!mapReady || !webRef.current || !userLocation) return;
    const js = `(function(){ if (window.__map) { window.__map.setView([${userLocation.latitude}, ${userLocation.longitude}], Math.max(window.__map.getZoom(), 13)); } })();`;
    webRef.current.injectJavaScript(js);
  }, [recenterNonce]);

  // Desenha/atualiza o círculo do usuário via JS (sem recarregar o WebView a
  // cada mudança de GPS — antes o userLocation estava no html e forcava reload +
  // recentralizacao na cidade a cada 5s).
  useEffect(() => {
    if (!mapReady || !webRef.current || !userLocation) return;
    const js = `(function(){
      if (window.__userCircle) { window.__map.removeLayer(window.__userCircle); }
      window.__userCircle = L.circleMarker([${userLocation.latitude}, ${userLocation.longitude}], { radius: 8, color: '#1a73e8', fillColor: '#1a73e8', fillOpacity: 1 }).addTo(window.__map);
    })();`;
    webRef.current.injectJavaScript(js);
  }, [mapReady, userLocation]);

  // Quando a busca por IA está ativa (fitToResults), enquadra o mapa em todos
  // os pets resultantes. Sem isso, o pin do pet aparece fora da tela (ex.: gato
  // preto em Aracoiaba da Serra fica a dezenas de km do centro padrão/Sorocaba)
  // e a busca "não traz nada" no mapa. Re-enquadra a cada mudança de resultados.
  useEffect(() => {
    if (!mapReady || !webRef.current || !fitToResults) return;
    if (!pets || pets.length === 0) return;
    const pts = pets
      .filter(
        (p) =>
          typeof p.latitude === "number" && typeof p.longitude === "number",
      )
      .map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
    if (pts.length === 0) return;
    const js = `(function(){
      if (!window.__map) return;
      var pts = ${JSON.stringify(pts)};
      if (!pts.length) return;
      var bounds = L.latLngBounds(pts.map(function(p){ return [p.latitude, p.longitude]; }));
      window.__map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    })();`;
    webRef.current.injectJavaScript(js);
  }, [mapReady, pets, fitToResults]);

  const source = useMemo(() => ({ html }), [html]);

  return (
    <WebView
      ref={webRef}
      style={[StyleSheet.absoluteFillObject, { zIndex: 0 }]}
      originWhitelist={["*"]}
      source={source}
      setSupportMultipleWindows={false}
      overScrollMode="never"
      nestedScrollEnabled={false}
      javaScriptEnabled={true}
      onLoad={() => {
        setMapReady(true);
        webRef.current?.injectJavaScript(renderPetsJs(petsRef.current));
        // Garante que o Leaflet recalcule o tamanho do container após o WebView
        // ter dimensões reais (evita mapa preto/cinza por tamanho 0).
        webRef.current?.injectJavaScript(
          "setTimeout(function(){ if (window.__map) window.__map.invalidateSize(); }, 300);",
        );
      }}
      onMessage={(e) => {
        try {
          const data = JSON.parse(e.nativeEvent.data);
          if (data.petId) onMarkerPress(data.petId);
        } catch {}
      }}
    />
  );
};

const ImageCarousel = ({
  images,
  blurRadius = 0,
  onPressImage,
}: {
  images: string[];
  blurRadius?: number;
  onPressImage?: (images: string[], index: number) => void;
}) => {
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const clamped = Math.max(0, Math.min(index, images.length - 1));
  const btn = (disabled: boolean): any => ({
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    opacity: disabled ? 0.3 : 1,
  });
  const goTo = (next: number) => {
    const target = Math.max(0, Math.min(next, images.length - 1));
    setIndex(target);
    if (width > 0 && scrollRef.current) {
      scrollRef.current.scrollTo({ x: target * width, animated: true });
    }
  };
  return (
    <View
      style={{
        width: "100%",
        height: 180,
        marginBottom: 14,
        position: "relative",
        borderRadius: 12,
        overflow: "hidden",
      }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={images.length > 1}
        onMomentumScrollEnd={(e) => {
          const w = e.nativeEvent.layoutMeasurement.width;
          if (w > 0) setIndex(Math.round(e.nativeEvent.contentOffset.x / w));
        }}
        style={StyleSheet.absoluteFill}
      >
        {images.map((uri, i) => (
          <View
            key={i}
            style={{
              width: width || "100%",
              height: 180,
              overflow: "hidden",
              position: "relative",
              backgroundColor: "#000",
            }}
          >
            {/* Fundo: mesma imagem distorcida (stretch) e BORRADA para preencher */}
            <Image
              source={{ uri }}
              style={[StyleSheet.absoluteFill, { resizeMode: "stretch" }]}
              blurRadius={20}
            />
            {/* Escurece o fundo para a foto da frente destacar */}
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: "rgba(0,0,0,0.55)" },
              ]}
            />
            {/* Frente: foto inteira, centralizada, sem distorcer */}
            <Image
              source={{ uri }}
              style={[StyleSheet.absoluteFill, { resizeMode: "contain" }]}
              blurRadius={blurRadius}
            />
            <BlurView
              intensity={blurRadius > 0 ? 70 : 0}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: "rgba(0,0,0,0.15)" },
              ]}
            />
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => onPressImage?.(images, i)}
            />
          </View>
        ))}
      </ScrollView>
      {images.length > 1 && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 8,
            paddingBottom: 8,
          }}
        >
          <TouchableOpacity
            style={btn(clamped === 0)}
            disabled={clamped === 0}
            onPress={() => goTo(clamped - 1)}
          >
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 13,
              fontWeight: "bold",
              backgroundColor: "rgba(0,0,0,0.5)",
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 12,
            }}
          >
            {clamped + 1} / {images.length}
          </Text>
          <TouchableOpacity
            style={btn(clamped === images.length - 1)}
            disabled={clamped === images.length - 1}
            onPress={() => goTo(clamped + 1)}
          >
            <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const makeStyles = (c: typeof Colors.light) =>
  StyleSheet.create({
    container: {
      flex: 1,
      flexDirection: "column",
      backgroundColor: c.background,
    },
    mapArea: { flex: 1, position: "relative" },
    map: { ...StyleSheet.absoluteFillObject },
    floatingButtonContainer: {
      position: "absolute",
      left: 0,
      right: 0,
      bottom: 40,
      alignItems: "center",
      zIndex: 10,
      pointerEvents: "box-none",
    },
    floatingButton: {
      width: 84,
      height: 84,
      borderRadius: 42,
      backgroundColor: c.primaryButton,
      justifyContent: "center",
      alignItems: "center",
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 6,
    },
    floatingButtonDisabled: {
      backgroundColor: "rgba(0,0,0,0.3)",
    },
    speechBubble: {
      backgroundColor: "#FFFFFF",
      borderRadius: 14,
      paddingVertical: 8,
      paddingHorizontal: 14,
      marginBottom: 14,
      borderWidth: 2,
      borderColor: "#000000",
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4,
      pointerEvents: "none",
    },
    speechBubbleText: {
      color: "#000000",
      fontSize: 13,
      fontWeight: "800",
      textAlign: "center",
      lineHeight: 17,
    },
    speechBubbleArrow: {
      position: "absolute",
      bottom: -10,
      alignSelf: "center",
      width: 0,
      height: 0,
      borderLeftWidth: 10,
      borderRightWidth: 10,
      borderTopWidth: 10,
      borderStyle: "solid",
      backgroundColor: "transparent",
      borderLeftColor: "transparent",
      borderRightColor: "transparent",
      borderTopColor: "#FFFFFF",
    },
    locationWarning: {
      position: "absolute",
      top: 16,
      left: 16,
      right: 16,
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      backgroundColor: "rgba(200,30,30,0.85)",
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 12,
    },
    locationWarningText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "600",
      flex: 1,
    },
    modalContainer: {
      flex: 1,
      backgroundColor: c.background,
    },
    modalScrollView: { padding: 20, overflow: "visible" as const },
    // Container pai do dropdown: zIndex/elevation altos para a lista flutuante
    // (renderizada em Modal pela lib) não ser sobreposta por campos irmãos.
    dropdownWrap: {
      position: "relative",
      zIndex: 2000,
      elevation: 2000,
    },
    modalHeader: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: 20,
    },
    modalTitle: {
      fontSize: 28,
      fontWeight: "bold",
      color: c.text,
    },
    roundClose: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      marginRight: 14,
    },
    roundCloseText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "bold",
      lineHeight: 13,
      includeFontPadding: false,
      textAlign: "center",
    },
    bigCameraButtonText: {
      color: c.primaryButton,
      fontWeight: "bold",
      fontSize: 16,
    },
    photoBlock: {
      marginBottom: 20,
    },
    photoRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 10,
    },
    photoThumb: {
      width: 100,
      height: 100,
      borderRadius: 12,
      overflow: "hidden",
      backgroundColor: c.secondaryButton,
    },
    photoThumbImage: {
      width: "100%",
      height: "100%",
    },
    photoRemove: {
      position: "absolute",
      top: 4,
      right: 4,
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
    },
    photoPrimaryBadge: {
      position: "absolute",
      bottom: 4,
      left: 4,
      backgroundColor: c.primaryButton,
      borderRadius: 6,
      paddingHorizontal: 6,
      paddingVertical: 2,
    },
    photoPrimaryText: {
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "bold",
    },
    photoAdd: {
      width: 100,
      height: 100,
      borderRadius: 12,
      borderWidth: 2,
      borderStyle: "dashed",
      borderColor: c.primaryButton,
      justifyContent: "center",
      alignItems: "center",
      backgroundColor: c.secondaryButton,
    },
    photoHint: {
      marginTop: 10,
      fontSize: 13,
      color: "#8E8E93",
    },
    pickMapWrap: {
      width: "100%",
      height: 260,
      borderRadius: 12,
      overflow: "hidden",
    },
    pickLabel: {
      marginTop: 18,
      marginBottom: 8,
      fontSize: 14,
      fontWeight: "600",
      color: c.text,
    },
    searchAddressRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
    },
    searchAddressInput: {
      flex: 1,
      backgroundColor: c.card,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 11,
      fontSize: 15,
      color: c.text,
      borderWidth: 1,
      borderColor: c.cardStroke,
      textAlignVertical: "center",
      includeFontPadding: false,
    },
    searchAddressBtn: {
      width: 40,
      height: 40,
      borderRadius: 10,
      backgroundColor: c.primaryButton,
      alignItems: "center",
      justifyContent: "center",
    },
    fieldLabel: {
      marginTop: 18,
      marginBottom: 8,
      fontSize: 14,
      fontWeight: "600",
      color: c.text,
    },
    section: {
      backgroundColor: c.card,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.cardStroke,
      padding: 14,
      marginBottom: 16,
    },
    sectionHeader: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      marginBottom: 12,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: "700",
      color: c.text,
    },
    dateField: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.cardStroke,
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 12,
    },
    dateFieldText: {
      marginLeft: 8,
      fontSize: 15,
      color: c.text,
    },
    useGpsBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      marginTop: 10,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "#0A84FF",
      backgroundColor: "rgba(10,132,255,0.08)",
    },
    useGpsText: {
      marginLeft: 6,
      color: "#0A84FF",
      fontSize: 14,
      fontWeight: "600",
    },
    cityHintRow: {
      flexDirection: "row",
      alignItems: "center",
      marginTop: 8,
      marginBottom: 4,
    },
    cityHintText: {
      marginLeft: 6,
      color: c.text,
      fontSize: 14,
      fontWeight: "600",
    },
    cameraBox: {
      position: "relative",
      height: 440,
      borderRadius: 14,
      overflow: "hidden",
      marginBottom: 20,
      backgroundColor: "#000000",
    },
    camera: {
      flex: 1,
      justifyContent: "flex-end",
    },
    cameraLoading: {
      ...StyleSheet.absoluteFillObject,
      justifyContent: "center",
      alignItems: "center",
    },
    cameraHeader: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 16,
      paddingTop: 16,
      zIndex: 2,
    },
    cameraPill: {
      backgroundColor: "rgba(0,0,0,0.4)",
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderRadius: 14,
    },
    cameraHeaderRight: {
      flexDirection: "row",
      alignItems: "center",
      gap: 12,
    },
    cameraActionBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
    },
    cameraCounter: {
      color: "#FFFFFF",
      fontSize: 15,
      fontWeight: "bold",
    },
    cameraControls: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 30,
      paddingBottom: 24,
      zIndex: 2,
    },
    cameraCloseWrap: {
      width: 40,
      height: 40,
      borderRadius: 20,
      overflow: "hidden",
    },
    cameraClose: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(0,0,0,0.55)",
      borderWidth: 1.5,
      borderColor: "rgba(255,255,255,0.85)",
      justifyContent: "center",
      alignItems: "center",
    },
    cameraFlip: {
      width: 44,
      height: 44,
      justifyContent: "center",
      alignItems: "center",
    },
    captureButton: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: "#FFFFFF",
      borderWidth: 5,
      borderColor: "rgba(0,0,0,0.3)",
    },
    cameraZoomGroup: {
      flexDirection: "column",
      justifyContent: "center",
      alignItems: "center",
      gap: 8,
    },
    cameraZoomBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
    },
    input: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.cardStroke,
      borderRadius: 12,
      paddingHorizontal: 15,
      paddingVertical: 15,
      fontSize: 16,
      color: c.text,
      marginBottom: 15,
    },
    inputError: {
      borderColor: "#FF3B30",
    },
    rewardField: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.cardStroke,
      borderRadius: 12,
      paddingHorizontal: 15,
      paddingVertical: 15,
      marginBottom: 15,
    },
    rewardPrefix: {
      fontSize: 16,
      color: c.text,
      fontWeight: "600",
      marginRight: 8,
    },
    rewardInput: {
      flex: 1,
      fontSize: 16,
      color: c.text,
    },
    dropdown: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.cardStroke,
      borderRadius: 12,
      paddingHorizontal: 15,
      paddingVertical: 15,
      marginBottom: 15,
    },
    dropdownContainer: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.cardStroke,
      borderRadius: 12,
    },
    dropdownPlaceholder: {
      color: "#8E8E93",
      fontSize: 16,
    },
    dropdownSelectedText: {
      color: c.text,
      fontSize: 16,
    },
    dropdownInputSearch: {
      color: c.text,
      fontSize: 16,
      borderWidth: 1,
      borderColor: c.cardStroke,
      borderRadius: 8,
      paddingHorizontal: 10,
      paddingVertical: 7,
      margin: 6,
    },
    dropdownItemText: {
      color: c.text,
      fontSize: 15,
    },
    rdpPicker: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.cardStroke,
      borderRadius: 12,
      minHeight: 52,
      paddingHorizontal: 15,
      marginBottom: 15,
    },
    rdpDropdown: {
      backgroundColor: c.card,
      borderWidth: 1,
      borderColor: c.cardStroke,
      borderRadius: 12,
      maxHeight: 320,
    },
    rdpModalContent: {
      maxHeight: 400,
      width: "90%",
      alignSelf: "center",
      backgroundColor: c.card,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: c.cardStroke,
      overflow: "hidden",
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.18,
      shadowRadius: 12,
      elevation: 8,
    },
    rdpModalTitle: {
      fontSize: 18,
      fontWeight: "700",
      color: c.text,
      textAlign: "center",
      paddingVertical: 14,
    },
    rdpText: {
      fontSize: 16,
      color: c.text,
    },
    rdpPlaceholder: {
      fontSize: 16,
      color: "#8E8E93",
    },
    fieldError: {
      color: "#FF3B30",
      fontSize: 13,
      marginBottom: 12,
      marginTop: -8,
    },
    textArea: {
      height: 100,
      textAlignVertical: "top",
    },
    submitButton: {
      backgroundColor: c.primaryButton,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: "center",
      marginTop: 10,
    },
    submitButtonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "bold",
    },
    titleBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-start",
      backgroundColor: c.card,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.cardStroke,
    },
    clockIcon: {
      marginRight: 8,
    },
    clockText: {
      alignItems: "flex-start",
    },
    clockTime: {
      color: c.text,
      fontSize: 18,
      fontWeight: "bold",
      letterSpacing: 1,
      fontVariant: ["tabular-nums"],
    },
    clockDate: {
      color: c.text,
      fontSize: 11,
      fontWeight: "600",
      textTransform: "capitalize",
      marginTop: 2,
    },
    titleInfoBtn: {
      marginLeft: "auto",
      padding: 4,
    },
    aiSearchBar: {
      position: "absolute",
      left: 12,
      right: 12,
      zIndex: 30,
      flexDirection: "column",
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.cardStroke,
      paddingVertical: 6,
      paddingHorizontal: 8,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 4,
    },
    aiSearchRow: {
      flexDirection: "row",
      alignItems: "center",
      width: "100%",
    },
    aiDragHandle: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginRight: 2,
    },
    aiSearchInput: {
      flex: 1,
      color: c.text,
      fontSize: 14,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    aiSearchHint: {
      fontSize: 11,
      color: "#8E8E93",
      paddingHorizontal: 4,
      paddingTop: 4,
      paddingBottom: 2,
    },
    aiSearchBtn: {
      backgroundColor: c.primaryButton,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    aiSearchBtnText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "600",
    },
    aiSearchClear: {
      padding: 4,
    },
    counterFloat: {
      position: "absolute",
      top: 8,
      zIndex: 20,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "rgba(10,132,255,0.92)",
      paddingVertical: 4,
      paddingHorizontal: 9,
      borderRadius: 14,
      elevation: 4,
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 2 },
    },
    counterFloatText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "bold",
      marginLeft: 5,
    },
    counterFloatBadge: {
      marginLeft: 6,
      backgroundColor: "#FF3B30",
      minWidth: 17,
      height: 17,
      borderRadius: 9,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 5,
    },
    counterFloatBadgeText: {
      color: "#FFFFFF",
      fontSize: 10,
      fontWeight: "bold",
    },
    cityBox: {
      position: "absolute",
      left: 16,
      bottom: 16,
      zIndex: 10,
    },
    cityButton: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    cityButtonText: {
      color: c.text,
      fontSize: 12,
      fontWeight: "bold",
    },
    aboutButtonContainer: {
      position: "absolute",
      top: 50,
      right: 16,
      zIndex: 10,
    },
    sideToolbar: {
      position: "absolute",
      top: "50%",
      right: 16,
      gap: 18,
      zIndex: 20,
      elevation: 20,
      transform: [{ translateY: "-50%" }],
    },
    sideToolbarBtn: {
      width: 46,
      height: 46,
      borderRadius: 23,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
    },
    aboutButton: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: "rgba(0,0,0,0.6)",
      justifyContent: "center",
      alignItems: "center",
    },
    aboutOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    actionSheetOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.4)",
      justifyContent: "flex-end",
    },
    actionSheet: {
      backgroundColor: c.card,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
      paddingHorizontal: 16,
      marginBottom: 8,
    },
    actionSheetTitle: {
      fontSize: 13,
      fontWeight: "600",
      color: "#8E8E93",
      textAlign: "center",
      paddingVertical: 14,
      textTransform: "uppercase",
    },
    actionSheetOption: {
      flexDirection: "row",
      alignItems: "center",
      gap: 14,
      paddingVertical: 16,
      paddingHorizontal: 12,
      borderRadius: 12,
    },
    actionSheetSelected: {
      backgroundColor: "rgba(10,132,255,0.12)",
    },
    actionSheetCheck: {
      marginLeft: "auto",
    },
    actionSheetOptionText: {
      fontSize: 17,
      fontWeight: "500",
      color: c.text,
    },
    actionSheetCancel: {
      justifyContent: "center",
      marginTop: 6,
      borderTopWidth: 1,
      borderTopColor: c.cardStroke,
    },
    actionSheetCancelText: {
      color: c.primaryButton,
      fontWeight: "600",
    },
    aboutCard: {
      width: "100%",
      backgroundColor: c.card,
      borderRadius: 18,
      padding: 24,
      alignItems: "center",
    },
    aboutTitle: {
      fontSize: 26,
      fontWeight: "bold",
      color: c.text,
      marginBottom: 12,
    },
    aboutText: {
      fontSize: 15,
      color: c.text,
      textAlign: "center",
      lineHeight: 22,
      marginBottom: 16,
    },
    aboutVersion: {
      fontSize: 13,
      color: "#8E8E93",
      marginBottom: 20,
    },
    aboutClose: {
      backgroundColor: c.primaryButton,
      borderRadius: 12,
      paddingVertical: 12,
      paddingHorizontal: 32,
    },
    aboutCloseText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "bold",
    },
    privacyScroll: {
      width: "100%",
      maxHeight: "70%",
      marginBottom: 16,
    },
    privacyText: {
      fontSize: 14,
      color: c.text,
      textAlign: "justify",
      lineHeight: 20,
    },
    demoOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
      paddingBottom: 120,
    },
    demoCard: {
      width: "100%",
      maxHeight: "90%",
      backgroundColor: c.card,
      borderRadius: 18,
      padding: 18,
      position: "relative",
    },
    demoCardScroll: {
      maxHeight: "100%",
    },
    demoClose: {
      position: "absolute",
      top: 14,
      right: 14,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 2,
    },
    demoImages: {
      height: 160,
      width: "100%",
      flexGrow: 0,
      marginBottom: 14,
    },
    demoImage: {
      width: 160,
      height: 160,
      borderRadius: 12,
      marginRight: 10,
      flexShrink: 0,
    },
    carousel: {
      width: "100%",
      height: 180,
      marginBottom: 14,
      position: "relative",
    },
    carouselImage: {
      width: "100%",
      height: 180,
      borderRadius: 12,
      backgroundColor: c.secondaryButton,
    },
    carouselControls: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "center",
      paddingHorizontal: 8,
      paddingBottom: 8,
    },
    carouselBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center",
      alignItems: "center",
    },
    carouselBtnDisabled: {
      opacity: 0.3,
    },
    carouselCount: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "bold",
      backgroundColor: "rgba(0,0,0,0.5)",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    demoName: {
      fontSize: 22,
      fontWeight: "bold",
      color: c.text,
      marginBottom: 2,
    },
    demoRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 8,
    },
    demoLocation: {
      fontSize: 14,
      color: c.text,
    },
    demoDate: {
      fontSize: 14,
      color: c.text,
    },
    demoReward: {
      fontSize: 14,
      color: c.text,
      fontWeight: "600",
    },
    demoDescription: {
      fontSize: 14,
      color: c.text,
      lineHeight: 20,
      marginBottom: 16,
    },
    demoDescBtn: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginBottom: 8,
    },
    demoDescBtnText: {
      fontSize: 14,
      color: c.primaryButton,
      fontWeight: "600",
    },
    descOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.45)",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
    },
    descCard: {
      width: "100%",
      maxWidth: 320,
      maxHeight: "80%",
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 24,
      alignItems: "center",
      position: "relative",
    },
    descTitle: {
      fontSize: 17,
      fontWeight: "600",
      color: c.text,
      textAlign: "center",
      marginBottom: 12,
    },
    descScroll: {
      maxHeight: 360,
      width: "100%",
    },
    descText: {
      fontSize: 15,
      color: c.text,
      lineHeight: 22,
      textAlign: "left",
    },
    descCloseBtn: {
      width: "100%",
      borderTopWidth: 1,
      borderColor: c.cardStroke,
      marginTop: 16,
      paddingTop: 12,
      alignItems: "center",
    },
    descCloseText: {
      fontSize: 16,
      fontWeight: "500",
      color: c.primaryButton,
    },
    disabledBtn: {
      opacity: 0.4,
    },
    shareCardOffscreen: {
      position: "absolute",
      left: -10000,
      top: 0,
      width: 360,
    },
    shareCard: {
      width: 360,
      backgroundColor: "#FFFFFF",
      borderRadius: 0,
      overflow: "hidden",
    },
    shareCardHeader: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#FF9500",
      paddingVertical: 14,
      paddingHorizontal: 16,
    },
    shareCardLogo: {
      width: 32,
      height: 32,
      borderRadius: 8,
    },
    shareCardApp: {
      color: "#FFFFFF",
      fontSize: 20,
      fontWeight: "bold",
      marginLeft: 10,
    },
    shareCardTag: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "600",
      marginLeft: "auto",
      opacity: 0.9,
    },
    shareCardPhoto: {
      width: 360,
      height: 360,
      backgroundColor: "#E5E5EA",
    },
    shareCardReported: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor: "rgba(255,59,48,0.25)",
    },
    shareCardReportedText: {
      color: "#FF3B30",
      fontSize: 34,
      fontWeight: "bold",
      letterSpacing: 2,
    },
    shareCardMap: {
      alignItems: "center",
      backgroundColor: "#F2F2F7",
      paddingVertical: 18,
      paddingHorizontal: 16,
    },
    shareCardLocation: {
      color: "#1C1C1E",
      fontSize: 18,
      fontWeight: "bold",
      marginTop: 6,
      textAlign: "center",
    },
    shareCardCoords: {
      color: "#8E8E93",
      fontSize: 12,
      marginTop: 2,
    },
    shareCardFooter: {
      flexDirection: "row",
      alignItems: "center",
      paddingVertical: 18,
      paddingHorizontal: 16,
      backgroundColor: "#FFFFFF",
    },
    shareCardFooterText: {
      flex: 1,
      marginLeft: 0,
    },
    shareCardHelp: {
      color: "#1C1C1E",
      fontSize: 15,
      fontWeight: "bold",
      lineHeight: 20,
    },
    demoUndoReportBtn: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      backgroundColor: "#0A84FF",
      borderRadius: 12,
      paddingVertical: 14,
      marginTop: 10,
    },
    circularMenu: {
      position: "relative",
      width: "100%",
      height: 260,
      alignSelf: "center",
      marginTop: 16,
    },
    circularCenter: {
      position: "absolute",
      left: "50%",
      top: "50%",
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: c.primaryButton,
      justifyContent: "center",
      alignItems: "center",
      zIndex: 2,
      transform: [{ translateX: -30 }, { translateY: -30 }],
    },
    circularCenterText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "bold",
    },
    demoActionBar: {
      position: "absolute",
      left: 16,
      right: 16,
      bottom: 16,
      backgroundColor: c.card,
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 8,
      flexDirection: "row",
      justifyContent: "space-around",
      alignItems: "center",
      elevation: 8,
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: -2 },
    },
    demoActionRow: {
      flexDirection: "row",
      justifyContent: "space-evenly",
      alignItems: "center",
      width: "100%",
    },
    demoActionBtn: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      paddingVertical: 6,
      marginHorizontal: 2,
      borderRadius: 12,
      borderWidth: 1.5,
      borderColor: "#25D366",
      backgroundColor: "transparent",
    },
    demoActionBtnDisabled: {
      borderColor: "#8E8E93",
      opacity: 0.5,
    },
    demoActionLabel: {
      marginTop: 4,
      fontSize: 10,
      fontWeight: "600",
      textAlign: "center",
      flexWrap: "nowrap",
    },
    circularBtn: {
      position: "absolute",
      left: "50%",
      top: "50%",
      justifyContent: "center",
      alignItems: "center",
      elevation: 5,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 3,
    },
    circularBtnLabel: {
      position: "absolute",
      top: 64,
      fontSize: 11,
      fontWeight: "bold",
      color: c.text,
      width: 90,
      textAlign: "center",
    },
    reportImageWrap: {
      width: "100%",
      position: "relative",
    },
    reportedBanner: {
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: "center",
      justifyContent: "center",
    },
    reportedBannerText: {
      color: "#FF3B30",
      fontSize: 22,
      fontWeight: "bold",
      letterSpacing: 1,
    },
    reportOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    reportCard: {
      width: "100%",
      backgroundColor: c.card,
      borderRadius: 18,
      padding: 24,
      alignItems: "stretch",
      position: "relative",
    },
    reportClose: {
      position: "absolute",
      top: 14,
      right: 14,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 2,
    },
    reportTitle: {
      fontSize: 20,
      fontWeight: "bold",
      color: c.text,
      marginBottom: 6,
      textAlign: "center",
    },
    reportIcon: {
      alignSelf: "center",
      marginBottom: 10,
    },
    reportSubtitle: {
      fontSize: 14,
      color: c.text,
      opacity: 0.7,
      marginBottom: 16,
    },
    reportOption: {
      backgroundColor: c.background,
      borderRadius: 12,
      paddingVertical: 14,
      paddingHorizontal: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: c.cardStroke,
    },
    reportOptionText: {
      fontSize: 15,
      color: c.text,
      fontWeight: "600",
    },
  });
