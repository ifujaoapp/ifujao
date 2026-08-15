import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { StyleSheet, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Image, View, Text, Modal, Linking, Platform, ActivityIndicator, AppState, BackHandler, Share, Pressable, Animated } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { DatePickerCalendar } from '@/src/components/DatePickerCalendar';
import { ImageViewerModal } from '@/src/components/ImageViewerModal';
import { showAlert } from '@/src/components/AppAlert';
import { Ionicons } from '@expo/vector-icons';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import { CameraView, CameraType, useCameraPermissions } from 'expo-camera';
import { WebView } from 'react-native-webview';
import ViewShot from 'react-native-view-shot';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, withDelay, Easing, SharedValue } from 'react-native-reanimated';
import type { Region } from 'react-native-maps';

import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Colors } from '@/constants/theme';
import { CITIES, distanceMeters } from '@/constants/cities';
import { useThemeMode } from '@/hooks/use-theme-mode';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system';
import * as ImageManipulator from 'expo-image-manipulator';
import { loadPets, savePets, persistPhotos, clearPhotos, type PetRecord } from '@/lib/storage';

interface PetPost {
  id: string;
  species: string;
  location: string;
  description: string;
  contact: string;
  ownerPhone: string;
  images: string[];
  latitude: number;
  longitude: number;
  reported?: boolean;
  reportReason?: string;
  reportedBy?: string;
  lostDate?: string;
}

const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits.startsWith('55') ? digits.slice(2) : digits;
};

const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

const formatBytes = (bytes: number) => {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${bytes} B`;
};

const formatLostDate = (iso?: string): string | null => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString('pt-BR');
};

const getFileSize = async (uri: string): Promise<number | null> => {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    return info.exists ? info.size ?? null : null;
  } catch {
    return null;
  }
};

const redimensionarPara1080p = async (uri: string): Promise<string> => {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1080 } }],
      { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
    );
    return result.uri;
  } catch {
    return uri;
  }
};

const filtrarPorTamanho = async (uris: string[], fileSizes?: (number | null)[]): Promise<string[]> => {
  const aceitas: string[] = [];
  const rejeitadas: string[] = [];
  for (let i = 0; i < uris.length; i++) {
    const uri = uris[i];
    const size = fileSizes?.[i] ?? (await getFileSize(uri));
    if (size != null && size > MAX_IMAGE_BYTES) rejeitadas.push(formatBytes(size));
    else aceitas.push(uri);
  }
  if (rejeitadas.length > 0) {
    showAlert('warning', 'Foto muito grande',
      `Algumas fotos foram ignoradas por excederem ${formatBytes(MAX_IMAGE_BYTES)}: ${rejeitadas.join(', ')}.`
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
  const [myPhone, setMyPhone] = useState('');
  const [isReportModalVisible, setReportModalVisible] = useState(false);
  const [isAboutVisible, setIsAboutVisible] = useState(false);
  const [isPrivacyVisible, setIsPrivacyVisible] = useState(false);
  const [species, setSpecies] = useState('');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [contact, setContact] = useState('');
  const [contactError, setContactError] = useState('');
  const [lostDate, setLostDate] = useState<Date | null>(null);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [images, setImages] = useState<string[]>([]);
  const speciesRef = useRef<TextInput>(null);
  const locationRef = useRef<TextInput>(null);
  const descriptionRef = useRef<TextInput>(null);
  const contactRef = useRef<TextInput>(null);
  const [isCameraOpen, setIsCameraOpen] = useState(false);
  const [isPhotoSourceVisible, setIsPhotoSourceVisible] = useState(false);
  const [facing, setFacing] = useState<CameraType>('back');
  const [cameraReady, setCameraReady] = useState(false);
  const [zoom, setZoom] = useState(0);
  const [flash, setFlash] = useState<'off' | 'on' | 'auto'>('off');
  const cameraRef = useRef<CameraView>(null);
  const [, requestCameraPermission] = useCameraPermissions();
  const [mapRegion, setMapRegion] = useState<Region>({
    latitude: CITIES[0].latitude,
    longitude: CITIES[0].longitude,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  });
  const [userLocation, setUserLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [petLocation, setPetLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const initialCenterRef = useRef<{ latitude: number; longitude: number } | null>(null);
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
        Animated.timing(bubbleOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.delay(2200),
        Animated.timing(bubbleOpacity, { toValue: 0, duration: 400, useNativeDriver: true }),
        Animated.delay(1200),
      ]).start(() => blink());
    };
    blink();
    return () => bubbleOpacity.stopAnimation();
  }, [bubbleOpacity]);

  const getCityForLocation = (loc: { latitude: number; longitude: number } | null): import('@/constants/cities').City => {
    if (loc) {
      const inside = CITIES.find(
        (c) => distanceMeters(loc.latitude, loc.longitude, c.latitude, c.longitude) <= c.radiusMeters
      );
      if (inside) return inside;
      let nearest = CITIES[0];
      let nearestDist = Infinity;
      CITIES.forEach((c) => {
        const d = distanceMeters(loc.latitude, loc.longitude, c.latitude, c.longitude);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = c;
        }
      });
      return nearest;
    }
    return CITIES[0];
  };

  const selectedCity = getCityForLocation(userLocation);

  const insideRadius =
    userLocation != null &&
    distanceMeters(
      userLocation.latitude,
      userLocation.longitude,
      selectedCity.latitude,
      selectedCity.longitude
    ) <= selectedCity.radiusMeters;

  const canReport = locationEnabled === true && insideRadius === true;

  const [selectedPet, setSelectedPet] = useState<PetPost | null>(null);
  const [showDescriptionModal, setShowDescriptionModal] = useState(false);
  const [viewerImages, setViewerImages] = useState<string[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);
  const menuProgress = useSharedValue(0);
  useEffect(() => {
    if (selectedPet !== null) {
      menuProgress.value = 0;
      menuProgress.value = withDelay(120, withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }));
    }
  }, [selectedPet, menuProgress]);
  const [reportTarget, setReportTarget] = useState<PetPost | null>(null);
  const shareCardRef = useRef<any>(null);
  const SHARE_BASE_URL = 'https://play.google.com/store/apps/details?id=br.com.petz';

  const sharePetCard = async (pet: PetPost) => {
    const message = `🐾 Ajude a encontrar este pet perdido em ${pet.location || 'Sorocaba'}!\nBaixe o iFujão e veja mais: ${SHARE_BASE_URL}`;
    try {
      await Share.share({ message });
    } catch {
      showAlert('error', 'Erro', 'Não foi possível compartilhar.');
    }
  };

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const saved = await SecureStore.getItemAsync('ifujao_my_phone');
        if (saved) setMyPhone(saved);
      } catch {}
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const loaded = await loadPets();
        if (loaded.length > 0) setPets(loaded as PetPost[]);
      } catch {}
    })();
  }, []);

  const commitPets = useCallback(async (next: PetPost[]) => {
    setPets(next);
    try {
      const prevUris = new Set(pets.flatMap((p) => p.images));
      const nextUris = new Set(next.flatMap((p) => p.images));
      const orphans = [...prevUris].filter((u) => !nextUris.has(u));
      if (orphans.length > 0) await clearPhotos(orphans);
      await savePets(next as PetRecord[]);
    } catch {}
  }, [pets]);

  const checkPermissionAndServices = useCallback(async () => {
    let { status } = await Location.getForegroundPermissionsAsync();
    if (status !== 'granted') {
      status = (await Location.requestForegroundPermissionsAsync()).status;
    }
    if (status !== 'granted') return false;

    const servicesEnabled = await Location.hasServicesEnabledAsync().catch(() => false);
    return servicesEnabled;
  }, []);


  useEffect(() => {
    let cancelled = false;

    const getOnce = async () => {
      const ok = await checkPermissionAndServices();
      if (!ok) {
        setLocationEnabled(false);
        return;
      }
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }).catch(() => null);
      if (cancelled || !location) return;
      const coords = { latitude: location.coords.latitude, longitude: location.coords.longitude };
      setUserLocation(coords);
      if (!initialCenterRef.current) {
        initialCenterRef.current = coords;
        setMapRegion({
          latitude: coords.latitude,
          longitude: coords.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        });
      }
      setLocationEnabled(true);
    };

    getOnce();

    const poll = setInterval(async () => {
      const ok = await checkPermissionAndServices();
      if (!ok) setLocationEnabled(false);
    }, 3000);

    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        checkPermissionAndServices().then((ok) => {
          if (!ok) setLocationEnabled(false);
        });
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
      showAlert('permission', 'Permissão Negada', 'Precisamos de permissão para acessar a câmera.');
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
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      showAlert('permission', 'Permissão Negada', 'Precisamos de permissão para acessar sua galeria.');
      return;
    }
    if (images.length >= MAX_IMAGES) {
      showAlert('warning', 'Limite atingido', `Você pode adicionar no máximo ${MAX_IMAGES} fotos.`);
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.8,
      allowsMultipleSelection: true,
      selectionLimit: MAX_IMAGES - images.length,
    });
    if (!result.canceled) {
      const uris = result.assets.map(a => a.uri);
      const redimensionadas = await Promise.all(uris.map(redimensionarPara1080p));
      const sizes = result.assets.map(a => a.fileSize ?? null);
      const aceitas = await filtrarPorTamanho(redimensionadas, sizes);
      if (aceitas.length > 0) {
        setImages(prev => [...prev, ...aceitas].slice(0, MAX_IMAGES));
      }
    }
  };

  const zoomStep = 0.2;
  const zoomIn = () => setZoom(prev => Math.min(prev + zoomStep, 1));
  const zoomOut = () => setZoom(prev => Math.max(prev - zoomStep, 0));

  const flashModes: ('off' | 'on' | 'auto')[] = ['off', 'on', 'auto'];
  const toggleFlash = () => setFlash(prev => flashModes[(flashModes.indexOf(prev) + 1) % flashModes.length]);

  const tirarFoto = async () => {
    if (!cameraRef.current || !cameraReady) return;
    if (images.length >= MAX_IMAGES) {
      showAlert('warning', 'Limite atingido', `Você pode adicionar no máximo ${MAX_IMAGES} fotos.`);
      return;
    }
    const foto = await cameraRef.current.takePictureAsync({ quality: 0.8 });
    const redimensionada = await redimensionarPara1080p(foto.uri);
    const aceitas = await filtrarPorTamanho([redimensionada]);
    if (aceitas.length > 0) {
      setImages(prev => [...prev, aceitas[0]]);
    }
  };

  const removerFoto = (uri: string) => {
    setImages(prev => prev.filter(item => item !== uri));
  };

  const fecharModal = () => {
    setIsCameraOpen(false);
    setReportModalVisible(false);
  };

  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits.replace(/(\d{0,2})/, '($1');
    if (digits.length <= 6) return digits.replace(/(\d{2})(\d{0,4})/, '($1) $2');
    if (digits.length <= 10) return digits.replace(/(\d{2})(\d{4})(\d{0,4})/, '($1) $2-$3');
    return digits.replace(/(\d{2})(\d{5})(\d{0,4})/, '($1) $2-$3');
  };

  const isValidPhone = (value: string) => {
    const digits = value.replace(/\D/g, '');
    const national = digits.startsWith('55') ? digits.slice(2) : digits;
    if (!/^\d{10,11}$/.test(national)) return false;
    const ddd = national.slice(0, 2);
    if (Number(ddd) < 11) return false;
    if (national.length === 11 && national[2] !== '9') return false;
    return true;
  };

  const handleAddPet = async () => {
    if (images.length === 0 || !species || !location || !contact) {
      showAlert('warning', 'Atenção', 'Preencha todos os campos e adicione ao menos uma foto.');
      return;
    }
    if (!isValidPhone(contact)) {
      setContactError('Número de WhatsApp inválido (use DDD + 9 dígitos).');
      showAlert('warning', 'Atenção', 'Digite um número de WhatsApp válido (com DDD, 10 ou 11 dígitos).');
      return;
    }
    let latitude: number;
    let longitude: number;
    if (petLocation) {
      latitude = petLocation.latitude;
      longitude = petLocation.longitude;
    } else {
      showAlert('location', 'Marque o local',
        'Defina onde o pet foi visto: toque no mapa para posicionar o pino ou use o botão "Usar meu GPS". O alerta não foi gravado.'
      );
      return;
    }
    const isValidCoord = (n: number) =>
      typeof n === 'number' && Number.isFinite(n) &&
      n >= -90 && n <= 90;
    const isValidLng = (n: number) =>
      typeof n === 'number' && Number.isFinite(n) &&
      n >= -180 && n <= 180;
    if (!isValidCoord(latitude) || !isValidLng(longitude) || (latitude === 0 && longitude === 0)) {
      showAlert('warning', 'Coordenada inválida',
        'As coordenadas obtidas não são válidas. Mova o pino ou use "Usar meu GPS" novamente antes de publicar. O alerta não foi gravado.'
      );
      return;
    }
    const ownerPhone = normalizePhone(contact);
    SecureStore.setItemAsync('ifujao_my_phone', ownerPhone).catch(() => {});
    setMyPhone(ownerPhone);
    const storedImages = await persistPhotos(images);
    const newPet: PetPost = {
      id: Date.now().toString(),
      species, location, description, contact, ownerPhone, images: storedImages,
      latitude,
      longitude,
      lostDate: lostDate ? lostDate.toISOString() : undefined,
    };
    commitPets([newPet, ...pets]);
    setSpecies(''); setLocation(''); setDescription(''); setContact(''); setContactError(''); setImages([]);
    setLostDate(null);
    setIsCameraOpen(false);
    setReportModalVisible(false);
    showAlert('success', 'Sucesso!', 'Alerta publicado!');
  };

  const deletePet = (petId: string) => {
    showAlert('trash', 'Apagar alerta',
      'Tem certeza que deseja apagar este alerta? Esta ação não pode ser desfeita.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Apagar',
          style: 'destructive',
          onPress: () => {
            commitPets(pets.filter((p) => p.id !== petId));
            setSelectedPet(null);
          },
        },
      ]
    );
  };

  const reportPet = (pet: PetPost) => {
    setReportTarget(pet);
  };

  const submitReport = (pet: PetPost, reason: string) => {
    const reporter = myPhone || normalizePhone(pet.contact);
    commitPets(
      pets.map((p) =>
        p.id === pet.id ? { ...p, reported: true, reportReason: reason, reportedBy: reporter } : p
      )
    );
    setReportTarget(null);
    setSelectedPet(null);
    showAlert('info', 'Denúncia enviada', 'Obrigado. Nossa equipe irá analisar este alerta.');
  };

  const openReport = async () => {
    if (!canReport) return;
    if (!location) {
      const coords = userLocation ?? { latitude: mapRegion.latitude, longitude: mapRegion.longitude };
      try {
        const geo = await Location.reverseGeocodeAsync({ latitude: coords.latitude, longitude: coords.longitude });
        if (geo.length > 0) {
          const g = geo[0];
          const partes = [g.street, g.district].filter(Boolean);
          const endereco = partes.length > 0 ? partes.join(', ') : (g.city || g.region || selectedCity.name);
          setLocation(endereco);
        } else {
          setLocation(selectedCity.name);
        }
      } catch {
        setLocation(selectedCity.name);
      }
    }
    if (myPhone) {
      setContact(formatPhone(myPhone));
    }
    setPetLocation(userLocation ?? { latitude: mapRegion.latitude, longitude: mapRegion.longitude });
    setReportModalVisible(true);
  };

  const openInViewer = (images: string[], index: number) => {
    setViewerImages(images);
    setViewerIndex(Math.max(0, Math.min(index, images.length - 1)));
    setViewerVisible(true);
  };

  const atualizarEndereco = async (lat: number, lng: number) => {
    try {
      const geo = await Location.reverseGeocodeAsync({ latitude: lat, longitude: lng });
      if (geo.length > 0) {
        const g = geo[0];
        const partes = [g.street, g.district].filter(Boolean);
        setLocation(partes.length > 0 ? partes.join(', ') : (g.city || g.region || ''));
      } else {
        setLocation('');
      }
    } catch {
      setLocation('');
    }
  };

  const handlePickLocation = (lat: number, lng: number) => {
    setPetLocation({ latitude: lat, longitude: lng });
    atualizarEndereco(lat, lng);
  };

  const usarMeuGps = async () => {
    const ok = await checkPermissionAndServices();
    if (!ok) {
      showAlert('location', 'Localização', 'Ative a localização do dispositivo e conceda a permissão para usar seu GPS.');
      return;
    }
    if (userLocation) {
      setPetLocation(userLocation);
      atualizarEndereco(userLocation.latitude, userLocation.longitude);
      return;
    }
    const current = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null);
    if (!current) {
      showAlert('location', 'Sem sinal de GPS', 'Não foi possível obter sua posição. Verifique se o GPS está ativo e há sinal de satélite, depois tente novamente.');
      return;
    }
    const coords = { latitude: current.coords.latitude, longitude: current.coords.longitude };
    setUserLocation(coords);
    setPetLocation(coords);
    atualizarEndereco(coords.latitude, coords.longitude);
  };

  const openWhatsApp = (contactNumber: string) => {
    let phoneNumber = contactNumber.replace(/\D/g, '');
    if (!isValidPhone(phoneNumber)) {
      showAlert('warning', 'Atenção', 'O contato informado não é um número de WhatsApp válido.');
      return;
    }
    if (!phoneNumber.startsWith('55')) phoneNumber = `55${phoneNumber}`;
    const message = encodeURIComponent('Olá! Vi seu alerta de pet perdido no iFujão. Posso ajudar a encontrá-lo?');
    const url = Platform.OS === 'android'
      ? `whatsapp://send?phone=${phoneNumber}&text=${message}`
      : `https://wa.me/${phoneNumber}?text=${message}`;
    Linking.openURL(url).catch(() => showAlert('error', 'Erro', 'Não foi possível abrir o WhatsApp.'));
  };

  const petsDenunciados = pets.filter((p) => p.reported);
  const totalPetsNoMapa = pets.length;

  return (
    <View style={styles.container}>
      <View style={{ paddingTop: insets.top }}>
        <View style={styles.titleBar}>
          <Ionicons style={styles.clockIcon} name={isDay ? 'sunny' : 'moon'} size={22} color={isDay ? '#FFD60A' : '#E6E6FA'} />
          <View style={styles.clockText}>
            <Text style={styles.clockTime}>
              {now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
            </Text>
            <Text style={styles.clockDate}>
              {now.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: 'short' })}
            </Text>
          </View>
          <TouchableOpacity style={styles.titleInfoBtn} onPress={() => setIsAboutVisible(true)}>
            <Ionicons name="information-circle" size={24} color={themeColors.text} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.titleInfoBtn} onPress={() => setIsPrivacyVisible(true)}>
            <Ionicons name="shield-checkmark" size={24} color={themeColors.text} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.mapArea}>
        <View style={[styles.counterFloat, { top: insets.top + 8, right: 12, left: undefined }]}>
          <Ionicons name="paw" size={13} color="#FFFFFF" />
          <Text style={styles.counterFloatText}>{totalPetsNoMapa}</Text>
          {petsDenunciados.length > 0 && (
            <View style={styles.counterFloatBadge}>
              <Text style={styles.counterFloatBadgeText}>{petsDenunciados.length}</Text>
            </View>
          )}
        </View>
        {initialCenterRef.current && (
          <MapLeaflet key={`${theme}-${selectedCity.id}`} initialCenter={initialCenterRef.current} region={mapRegion} userLocation={userLocation} pets={pets} onMarkerPress={(petId) => { const pet = pets.find((p) => p.id === petId); if (pet) setSelectedPet(pet); }} theme={theme} city={selectedCity} />
        )}

        {locationEnabled === false && (
          <View style={styles.locationWarning}>
            <Ionicons name="location-outline" size={18} color="#FFFFFF" />
            <Text style={styles.locationWarningText}>Ative a localização para reportar um pet perdido.</Text>
          </View>
        )}

        {locationEnabled === true && insideRadius === false && (
          <View style={styles.locationWarning}>
            <Ionicons name="location-outline" size={18} color="#FFFFFF" />
            <Text style={styles.locationWarningText}>Você está fora da área de {selectedCity.name}. O app funciona apenas dentro do raio da cidade.</Text>
          </View>
        )}

        <View style={[styles.sideToolbar, { zIndex: 20 }]}>
          <TouchableOpacity style={styles.sideToolbarBtn} onPress={toggleTheme}>
            <Ionicons name={theme === 'dark' ? 'sunny' : 'moon'} size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.sideToolbarBtn} onPress={() => showAlert('search', 'Buscar', 'Funcionalidade de busca em breve.')}>
            <Ionicons name="search" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.sideToolbarBtn} onPress={() => {
            Share.share({
              message: '🐾 iFujão — ajude a encontrar pets perdidos!\nCadastre e veja alertas de pets perto de você.\nhttps://ifujao.app',
              title: 'iFujão - Pets Perdidos',
            }).then((r) => {
              if (r.action === Share.dismissedAction) {
                showAlert('share', 'Compartilhar', 'A janela foi fechada sem compartilhar.');
              }
            }).catch((e) => {
              showAlert('error', 'Erro ao compartilhar', String(e?.message ?? e));
            });
          }}>
            <Ionicons name="share-social" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.sideToolbarBtn} onPress={() => {
            if (Platform.OS === 'android') {
              showAlert('exit', 'Sair', 'Deseja realmente sair do app?', [
                { text: 'Cancelar', style: 'cancel' },
                { text: 'Sair', style: 'destructive', onPress: () => BackHandler.exitApp() },
              ]);
            } else {
              showAlert('exit', 'Sair', 'Não é possível fechar o app no iOS. Encerre-o manualmente.');
            }
          }}>
            <Ionicons name="log-out" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <SafeAreaView style={[styles.floatingButtonContainer, { bottom: insets.bottom + 4 }]}>
          <Animated.View style={[styles.speechBubble, { opacity: bubbleOpacity }]}>
            <Text style={styles.speechBubbleText}>Toque para{'\n'}reportar um pet perdido</Text>
            <View style={styles.speechBubbleArrow} />
          </Animated.View>
          <TouchableOpacity
            style={[styles.floatingButton, !canReport && styles.floatingButtonDisabled]}
            disabled={!canReport}
            activeOpacity={0.8}
            onPress={() => openReport()}
          >
            <MaterialCommunityIcons name="paw" size={42} color="#FFFFFF" />
          </TouchableOpacity>
        </SafeAreaView>

        <SafeAreaView style={[styles.cityBox, { bottom: insets.bottom + 16, left: 16 }]}>
          <View style={styles.cityButton}>
            <Ionicons name="location" size={14} color="#FFFFFF" />
            <Text style={styles.cityButtonText}>{selectedCity.name}</Text>
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
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
          >

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
                    <Text style={styles.cameraCounter}>{images.length}/{MAX_IMAGES}</Text>
                  </View>
                  <View style={styles.cameraHeaderRight}>
                    <TouchableOpacity style={styles.cameraActionBtn} onPress={toggleFlash}>
                      <Ionicons
                        name={flash === 'off' ? 'flash-off' : flash === 'on' ? 'flash' : 'flash-outline'}
                        size={22}
                        color="#FFFFFF"
                      />
                    </TouchableOpacity>
                    <View style={styles.cameraCloseWrap}>
                      <TouchableOpacity style={styles.cameraClose} onPress={() => setIsCameraOpen(false)}>
                        <Ionicons name="close" size={22} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
                <View style={styles.cameraControls}>
                  <View style={styles.cameraFlip}>
                    <TouchableOpacity onPress={() => setFacing(f => (f === 'back' ? 'front' : 'back'))}>
                      <Ionicons name="camera-reverse" size={28} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity style={styles.captureButton} onPress={tirarFoto} disabled={!cameraReady} />
                  <View style={styles.cameraZoomGroup}>
                    <TouchableOpacity style={styles.cameraZoomBtn} onPress={zoomOut} disabled={zoom <= 0}>
                      <Ionicons name="remove" size={24} color={zoom <= 0 ? 'rgba(255,255,255,0.4)' : '#FFFFFF'} />
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.cameraZoomBtn} onPress={zoomIn} disabled={zoom >= 1}>
                      <Ionicons name="add" size={24} color={zoom >= 1 ? 'rgba(255,255,255,0.4)' : '#FFFFFF'} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.photoBlock}>
                <View style={styles.photoRow}>
                  {images.map((uri, idx) => (
                    <View key={uri} style={styles.photoThumb}>
                      <Image source={{ uri }} style={styles.photoThumbImage} />
                      <TouchableOpacity style={styles.photoRemove} onPress={() => removerFoto(uri)}>
                        <Ionicons name="close" size={16} color="#FFFFFF" />
                      </TouchableOpacity>
                      {idx === 0 && <View style={styles.photoPrimaryBadge}><Text style={styles.photoPrimaryText}>Principal</Text></View>}
                    </View>
                  ))}
                  {images.length < MAX_IMAGES && (
                    <TouchableOpacity style={styles.photoAdd} onPress={escolherFonte}>
                      <Ionicons name="camera" size={40} color={themeColors.primaryButton} />
                      <Text style={styles.bigCameraButtonText}>Adicionar</Text>
                    </TouchableOpacity>
                  )}
                </View>
                <Text style={styles.photoHint}>Até {MAX_IMAGES} fotos (máx. {formatBytes(MAX_IMAGE_BYTES)} cada). A primeira será a foto principal do alerta.</Text>
              </View>
            )}

            <Text style={styles.fieldLabel}>Quando o pet sumiu? (opcional)</Text>
            <TouchableOpacity style={styles.dateField} onPress={() => setShowDatePicker(true)} activeOpacity={0.7}>
              <Ionicons name="calendar" size={18} color={themeColors.primaryButton} />
              <Text style={[styles.dateFieldText, !lostDate && { color: themeColors.icon }]}>
                {lostDate ? lostDate.toLocaleDateString('pt-BR') : 'Toque para selecionar a data'}
              </Text>
            </TouchableOpacity>

            <Text style={styles.pickLabel}>Onde o pet foi visto?</Text>
            <View
              style={styles.pickMapWrap}
              onStartShouldSetResponder={() => true}
              onMoveShouldSetResponder={() => true}
              onResponderTerminationRequest={() => false}
            >
              <MapPicker
                initial={petLocation ?? { latitude: mapRegion.latitude, longitude: mapRegion.longitude }}
                value={petLocation}
                theme={theme}
                city={selectedCity}
                onPick={handlePickLocation}
              />
            </View>
            <TouchableOpacity style={styles.useGpsBtn} onPress={usarMeuGps}>
              <Ionicons name="locate" size={18} color="#0A84FF" />
              <Text style={styles.useGpsText}>Usar meu GPS (onde estou)</Text>
            </TouchableOpacity>

            <TextInput ref={speciesRef} style={styles.input} placeholder="Espécie / Raça" placeholderTextColor="#8E8E93" value={species} onChangeText={setSpecies} returnKeyType="next" onSubmitEditing={() => locationRef.current?.focus()} />
            <TextInput ref={locationRef} style={styles.input} placeholder="Última Localização Vista" placeholderTextColor="#8E8E93" value={location} onChangeText={setLocation} returnKeyType="next" onSubmitEditing={() => descriptionRef.current?.focus()} />
            <TextInput ref={descriptionRef} style={[styles.input, styles.textArea]} placeholder="Descrição Adicional (opcional)" placeholderTextColor="#8E8E93" value={description} onChangeText={setDescription} multiline returnKeyType="next" onSubmitEditing={() => contactRef.current?.focus()} />
            <TextInput ref={contactRef} style={[styles.input, contactError ? styles.inputError : null]} placeholder="Contato (WhatsApp)" placeholderTextColor="#8E8E93" value={contact} onChangeText={(t) => { const f = formatPhone(t); setContact(f); setContactError(f && !isValidPhone(f) ? 'Número de WhatsApp inválido (use DDD + 9 dígitos).' : ''); }} keyboardType="phone-pad" returnKeyType="done" maxLength={16} />
            {contactError ? <Text style={styles.fieldError}>{contactError}</Text> : null}

            <TouchableOpacity style={styles.submitButton} onPress={handleAddPet}>
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
        <TouchableOpacity style={styles.actionSheetOverlay} activeOpacity={1} onPress={fecharFonte}>
          <View style={[styles.actionSheet, { paddingBottom: 24 + insets.bottom }]}>
            <Text style={styles.actionSheetTitle}>Adicionar foto</Text>
            <TouchableOpacity style={styles.actionSheetOption} onPress={abrirCamera}>
              <Ionicons name="camera" size={22} color={themeColors.text} />
              <Text style={styles.actionSheetOptionText}>Câmera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionSheetOption} onPress={abrirGaleria}>
              <Ionicons name="images" size={22} color={themeColors.text} />
              <Text style={styles.actionSheetOptionText}>Galeria</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.actionSheetOption, styles.actionSheetCancel]} onPress={fecharFonte}>
              <Text style={[styles.actionSheetOptionText, styles.actionSheetCancelText]}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <Modal
        animationType="fade"
        transparent={true}
        visible={isAboutVisible}
        onRequestClose={() => setIsAboutVisible(false)}
      >
        <TouchableOpacity style={styles.aboutOverlay} activeOpacity={1} onPress={() => setIsAboutVisible(false)}>
          <View style={styles.aboutCard}>
            <Image source={require('../../assets/images/logo.png')} style={{ width: 120, height: 120, marginBottom: 16, resizeMode: 'contain' }} />
            <Text style={styles.aboutText}>
              App para ajudar a encontrar pets perdidos. Registre um pet, informe a localização e o seu número para quem encontrá-lo entrar em contato pelo WhatsApp.
            </Text>
            <Text style={styles.aboutVersion}>Versão 1.0.0</Text>
            <TouchableOpacity style={styles.aboutClose} onPress={() => setIsAboutVisible(false)}>
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
            <ScrollView style={styles.privacyScroll} nestedScrollEnabled keyboardShouldPersistTaps="handled">
              <Text style={styles.privacyText}>
                <Text style={{ fontWeight: 'bold' }}>Política de Privacidade e Tratamento de Dados Pessoais{'\n'}</Text>
                Esta Política de Privacidade descreve como o iFujão ("aplicativo", "nós") coleta, utiliza, armazena, compartilha e protege as informações dos usuários, em conformidade com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018 - LGPD), com o Marco Civil da Internet (Lei nº 12.965/2014) e com boas práticas inspiradas em políticas de grandes plataformas como WhatsApp, Instagram e Facebook.{'\n\n'}

                <Text style={{ fontWeight: 'bold' }}>1. Quem somos{'\n'}</Text>
                O iFujão é um aplicativo cujo propósito é ajudar pessoas a encontrarem pets perdidos, permitindo o registro de alertas com localização e contato para reencontro. Esta política aplica-se a todos os usuários do app, independentemente da plataforma (Android ou iOS).{'\n\n'}

                <Text style={{ fontWeight: 'bold' }}>2. Dados que coletamos{'\n'}</Text>
                Coletamos apenas os dados estritamente necessários ao funcionamento:{'\n'}
                • Dados do pet: espécie/raça, localização informada, descrição e fotografias.{'\n'}
                • Dados de contato: número de WhatsApp informado como forma de contato pelo responsável.{'\n'}
                • Identificador de dispositivo: utilizamos um identificador local para reconhecer os alertas criados por você neste aparelho.{'\n'}
                • Dados de localização: obtidos com sua permissão, apenas para posicionar o alerta no mapa e verificar a área de cobertura da cidade.{'\n'}
                Não coletamos dados sensíveis (origem racial, religião, opinião política, dados de saúde ou biometricos) nem lemos sua agenda ou mensagens de outros aplicativos.{'\n\n'}

                <Text style={{ fontWeight: 'bold' }}>3. Como usamos seus dados{'\n'}</Text>
                Utilizamos os dados exclusivamente para: (a) exibir os alertas de pets perdidos no mapa; (b) permitir o contato entre quem encontrou o pet e o responsável via WhatsApp; (c) identificar e permitir a exclusão dos seus próprios alertas; e (d) melhorar a experiência e a segurança do app. Não utilizamos seus dados para publicidade comportamental ou venda a anunciantes.{'\n\n'}

                <Text style={{ fontWeight: 'bold' }}>4. Armazenamento e criptografia{'\n'}</Text>
                No estado atual, os alertas e o seu identificador de dispositivo são armazenados localmente neste aparelho por meio do SecureStore, um cofre criptografado nativo do sistema operacional (Keychain no iOS e Keystore/SharedPreferences criptografado no Android). Os dados sensíveis permanecem protegidos em repouso pela criptografia do próprio dispositivo.{'\n'}
                Quando os dados passarem a ser sincronizados com servidores, eles serão transmitidos exclusivamente por canais seguros (TLS 1.2 ou superior) e armazenados em bases criptografadas, seguindo os mesmos padrões de proteção adotados por grandes plataformas de mensageria. O número de WhatsApp é tratado como dado de contato e não é exposto publicamente além do necessário para o reencontro.{'\n\n'}

                <Text style={{ fontWeight: 'bold' }}>5. Compartilhamento e terceiros{'\n'}</Text>
                Não vendemos, alugamos ou comercializamos seus dados pessoais. O número de contato é exibido apenas dentro do alerta, para que terceiros possam entrar em contato pelo WhatsApp e ajudar no reencontro. Poderemos compartilhar dados somente: (a) com seu consentimento; (b) para cumprimento de obrigação legal ou decisão judicial; ou (c) com prestadores de serviço essenciais (como hospedagem e infraestrutura), sob obrigações de confidencialidade. Ao utilizar o WhatsApp para contato, aplica-se também a Política de Privacidade da Meta/WhatsApp.{'\n\n'}

                <Text style={{ fontWeight: 'bold' }}>6. Retenção{'\n'}</Text>
                Mantemos seus dados apenas pelo tempo necessário às finalidades descritas ou conforme exigido por lei. Você pode remover seus próprios alertas a qualquer momento; ao desinstalar o app, os dados locais são apagados junto com o armazenamento do dispositivo.{'\n\n'}

                <Text style={{ fontWeight: 'bold' }}>7. Segurança{'\n'}</Text>
                Adotamos medidas técnicas e organizacionais razoáveis para proteger seus dados contra acesso não autorizado, perda ou alteração, incluindo criptografia em repouso (SecureStore), transmissão segura e princípio de minimização de dados. Contudo, nenhum sistema é infalível, e recomendamos cautela ao divulgar informações de contato em espaços públicos.{'\n\n'}

                <Text style={{ fontWeight: 'bold' }}>8. Seus direitos (LGPD){'\n'}</Text>
                Nos termos da LGPD, você pode, a qualquer momento, solicitar: confirmação da existência de tratamento; acesso; correção; anonimização, bloqueio ou eliminação de dados desnecessários; portabilidade; revogação do consentimento; e eliminação dos dados tratados com base no seu consentimento. No app, você exerce parte desses direitos diretamente: apagando seus alertas e desinstalando o aplicativo para remover dados locais. Para demais solicitações, use nossos canais oficiais.{'\n\n'}

                <Text style={{ fontWeight: 'bold' }}>9. Menores de idade{'\n'}</Text>
                O app pode ser utilizado por menores com autorização dos pais ou responsáveis. Não coletamos conscientemente dados de crianças sem o consentimento dos responsáveis.{'\n\n'}

                <Text style={{ fontWeight: 'bold' }}>10. Alterações nesta política{'\n'}</Text>
                Poderemos atualizar esta Política de tempos em tempos. A versão vigente estará sempre disponível no app, e alterações relevantes serão comunicadas antes de entrarem em vigor.{'\n\n'}

                <Text style={{ fontWeight: 'bold' }}>11. Contato{'\n'}</Text>
                Em caso de dúvidas, solicitações relativas aos seus dados ou questões sobre privacidade, entre em contato pelos canais oficiais do iFujão. Última atualização: 2026.
              </Text>
            </ScrollView>
            <TouchableOpacity style={styles.aboutClose} onPress={() => setIsPrivacyVisible(false)}>
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
          <View style={styles.demoOverlay} onStartShouldSetResponder={() => true} onTouchStart={() => setSelectedPet(null)}>
            <View
              style={styles.demoCard}
              onStartShouldSetResponder={() => true}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <TouchableOpacity style={styles.demoClose} onPress={() => setSelectedPet(null)}>
                <Ionicons name="close" size={22} color="#FFFFFF" />
              </TouchableOpacity>
              <View style={styles.reportImageWrap}>
                <ImageCarousel images={selectedPet.images} blurRadius={selectedPet.reported ? 18 : 0} onPressImage={(imgs, idx) => { if (!selectedPet.reported) openInViewer(imgs, idx); }} />
                {selectedPet.reported ? (
                  <View style={styles.reportedBanner}>
                    <Text style={styles.reportedBannerText}>DENÚNCIA</Text>
                  </View>
                ) : null}
              </View>
              <Text style={styles.demoName}>{selectedPet.species}</Text>
              <View style={styles.demoRow}>
                <Ionicons name="location" size={16} color={themeColors.primaryButton} />
                <Text style={styles.demoLocation}>{selectedPet.location}</Text>
              </View>
              {formatLostDate(selectedPet.lostDate) ? (
                <View style={styles.demoRow}>
                  <Ionicons name="calendar" size={16} color={themeColors.primaryButton} />
                  <Text style={styles.demoDate}>Sumiu em {formatLostDate(selectedPet.lostDate)}</Text>
                </View>
              ) : null}
              {selectedPet.description ? (
                <TouchableOpacity style={styles.demoDescBtn} onPress={() => setShowDescriptionModal(true)} activeOpacity={0.7}>
                  <Ionicons name="document-text" size={16} color={themeColors.primaryButton} />
                  <Text style={styles.demoDescBtnText}>Ver descrição</Text>
                </TouchableOpacity>
              ) : null}
              <View style={styles.circularMenu}>
                <View style={styles.circularCenter}>
                  <Text style={styles.circularCenterText}>Ações</Text>
                </View>
                {(() => {
                  type MenuAction = { key: string; icon: string; label: string; color: string; reportedDisabled?: boolean; onPress: () => void };
                  const alreadyReportedByMe = selectedPet.reported && normalizePhone(selectedPet.reportedBy ?? '') === myPhone && myPhone !== '';
                  const actions: MenuAction[] = [
                    {
                      key: 'contact',
                      icon: 'logo-whatsapp',
                      label: 'Contato',
                      color: '#25D366',
                      reportedDisabled: true,
                      onPress: () => {
                        const contact = selectedPet.contact;
                        setSelectedPet(null);
                        openWhatsApp(contact);
                      },
                    },
                    ...(alreadyReportedByMe ? [] : [{
                      key: 'report',
                      icon: 'flag',
                      label: 'Denunciar',
                      color: '#FF9500',
                      onPress: () => reportPet(selectedPet),
                    } as MenuAction]),
                    {
                      key: 'share',
                      icon: 'share-social',
                      label: 'Compartilhar',
                      color: '#25D366',
                      reportedDisabled: true,
                      onPress: () => sharePetCard(selectedPet),
                    },
                  ];
                  if (normalizePhone(selectedPet.ownerPhone) === myPhone && myPhone !== '') {
                    actions.push({
                      key: 'delete',
                      icon: 'trash',
                      label: 'Apagar',
                      color: '#FF3B30',
                      onPress: () => deletePet(selectedPet.id),
                    });
                  }
                  if (selectedPet.reported && (normalizePhone(selectedPet.ownerPhone) === myPhone || normalizePhone(selectedPet.reportedBy ?? '') === myPhone) && myPhone !== '') {
                    actions.push({
                      key: 'undoReport',
                      icon: 'flag',
                      label: 'Apagar denúncia',
                      color: '#0A84FF',
                      onPress: () => {
                        commitPets(
                          pets.map((p) =>
                            p.id === selectedPet.id ? { ...p, reported: false, reportReason: undefined, reportedBy: undefined } : p
                          )
                        );
                        setSelectedPet(null);
                      },
                    });
                  }
                  const RADIUS = 85;
                  const BUTTON_W = 60;
                  return actions.map((item, index) => {
                    const angle = (index * 2 * Math.PI) / actions.length - Math.PI / 2;
                    const x = RADIUS * Math.cos(angle);
                    const y = RADIUS * Math.sin(angle);
                    const disabled = item.reportedDisabled && selectedPet.reported;
                    return (
                      <CircularActionButton
                        key={item.key}
                        index={index}
                        progress={menuProgress}
                        x={x}
                        y={y}
                        size={BUTTON_W}
                        color={item.color}
                        icon={item.icon}
                        label={item.label}
                        disabled={disabled}
                        onPress={item.onPress}
                        styles={styles}
                      />
                    );
                  });
                })()}
              </View>
            </View>
          </View>
        </Modal>
          <ViewShot
            ref={shareCardRef}
            options={{ format: 'png', quality: 1 }}
            style={styles.shareCardOffscreen}
          >
            <View style={styles.shareCard} collapsable={false}>
                <View style={styles.shareCardHeader}>
                  <Image source={require('../../assets/images/logo.png')} style={styles.shareCardLogo} />
                  <Text style={styles.shareCardApp}>iFujão</Text>
                  <Text style={styles.shareCardTag}>Pet perdido</Text>
                </View>
                <Image source={{ uri: selectedPet.images[0] }} style={styles.shareCardPhoto} resizeMode="cover" blurRadius={selectedPet.reported ? 18 : 0} />
                {selectedPet.reported && (
                  <View style={styles.shareCardReported}>
                    <Text style={styles.shareCardReportedText}>DENÚNCIA</Text>
                  </View>
                )}
                <View style={styles.shareCardMap}>
                  <Ionicons name="location" size={28} color="#FF3B30" />
                  <Text style={styles.shareCardLocation}>{selectedPet.location || 'Local não informado'}</Text>
                  <Text style={styles.shareCardCoords}>{selectedPet.latitude.toFixed(4)}, {selectedPet.longitude.toFixed(4)}</Text>
                </View>
                <View style={styles.shareCardFooter}>
                  <View style={styles.shareCardFooterText}>
                    <Text style={styles.shareCardHelp}>Ajude a encontrar!{'\n'}Compartilhe com seus contatos{'\n'}para aumentar as chances. 🐾</Text>
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
        <View style={styles.descOverlay} onStartShouldSetResponder={() => true} onTouchStart={() => setShowDescriptionModal(false)}>
          <View
            style={styles.descCard}
            onStartShouldSetResponder={() => true}
            onTouchStart={(e) => e.stopPropagation()}
          >
            <Text style={styles.descTitle}>Descrição</Text>
            <ScrollView style={styles.descScroll} nestedScrollEnabled showsVerticalScrollIndicator={true}>
              <Text style={styles.descText}>{selectedPet?.description}</Text>
            </ScrollView>
            <TouchableOpacity style={styles.descCloseBtn} onPress={() => setShowDescriptionModal(false)} activeOpacity={0.6}>
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
            <TouchableOpacity style={styles.reportClose} onPress={() => setReportTarget(null)}>
              <Ionicons name="close" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <Ionicons name="flag" size={40} color="#FF9500" style={styles.reportIcon} />
            <Text style={styles.reportTitle}>Denunciar alerta</Text>
            <Text style={styles.reportSubtitle}>Selecione o motivo da denúncia:</Text>
            {['Conteúdo impróprio ou ofensivo', 'Foto inadequada', 'Informação falsa/engano', 'Spam', 'Outro'].map((m) => (
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
        title={selectedPet ? selectedPet.species : undefined}
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

const MapPicker = ({ initial, value, theme, city, onPick }: { initial: { latitude: number; longitude: number }; value?: { latitude: number; longitude: number } | null; theme: 'light' | 'dark'; city: import('@/constants/cities').City; onPick: (lat: number, lng: number) => void }) => {
  const isDark = theme === 'dark';
  const [start] = useState(initial);
  const webRef = useRef<WebView>(null);
  const html = useMemo(() => {
    const mapFilter = isDark ? 'filter: invert(1) hue-rotate(180deg) brightness(0.95);' : '';
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
        L.circle([${city.latitude}, ${city.longitude}], { radius: ${city.radiusMeters}, color: '#0A84FF', weight: 2, fillColor: '#0A84FF', fillOpacity: 0.12 }).addTo(map);
        var marker = L.marker([${start.latitude}, ${start.longitude}], { draggable: true }).addTo(map);
        map.on('click', function(e){ marker.setLatLng(e.latlng); window.ReactNativeWebView.postMessage(JSON.stringify({ lat: e.latlng.lat, lng: e.latlng.lng })); });
        marker.on('dragend', function(){ var p = marker.getLatLng(); window.ReactNativeWebView.postMessage(JSON.stringify({ lat: p.lat, lng: p.lng })); });
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
  }, [isDark, start.latitude, start.longitude, city.latitude, city.longitude, city.radiusMeters]);

  useEffect(() => {
    if (value && webRef.current) {
      webRef.current.postMessage(JSON.stringify({ move: { lat: value.latitude, lng: value.longitude } }));
    }
  }, [value?.latitude, value?.longitude]);

  return (
    <View
      style={{ width: '100%', height: '100%' }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onStartShouldSetResponderCapture={() => true}
      onMoveShouldSetResponderCapture={() => true}
    >
      <WebView
        ref={webRef}
        style={{ width: '100%', height: '100%', borderRadius: 12 }}
        originWhitelist={['*']}
        source={{ html }}
        setSupportMultipleWindows={false}
        overScrollMode="never"
        nestedScrollEnabled={true}
        javaScriptEnabled={true}
        onMessage={(e) => {
          try {
            const d = JSON.parse(e.nativeEvent.data);
            if (typeof d.lat === 'number' && typeof d.lng === 'number') onPick(d.lat, d.lng);
          } catch {}
        }}
      />
    </View>
  );
};

const CircularActionButton = ({ index, progress, x, y, size, color, icon, label, disabled, onPress, styles }: {
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
      pointerEvents={disabled ? 'none' : 'auto'}
      style={[
        styles.circularBtn,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: disabled ? '#8E8E93' : color },
        animatedStyle,
      ]}
    >
      <TouchableOpacity
        style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
        disabled={disabled}
        onPress={onPress}
      >
        <Ionicons name={icon as any} size={26} color="#FFFFFF" />
        <Text style={styles.circularBtnLabel}>{label}</Text>
      </TouchableOpacity>
    </Reanimated.View>
  );
};

const MapLeaflet = ({ initialCenter, region, userLocation, pets, onMarkerPress, theme, city }: { initialCenter: { latitude: number; longitude: number } | null; region: Region; userLocation: { latitude: number; longitude: number } | null; pets: PetPost[]; onMarkerPress: (petId: string) => void; theme: 'light' | 'dark'; city: import('@/constants/cities').City }) => {
  const insets = useSafeAreaInsets();
  const webRef = useRef<WebView>(null);
  const [mapReady, setMapReady] = useState(false);
  const center = initialCenter ?? { latitude: city.latitude, longitude: city.longitude };
  const isDark = theme === 'dark';
  const mapFilter = isDark ? 'filter: invert(1) hue-rotate(180deg) brightness(0.95);' : '';
  const html = useMemo(() => `
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
        var city_lat = ${city.latitude};
        var city_lng = ${city.longitude};
        var map = L.map('map', { attributionControl: false }).setView([${center.latitude}, ${center.longitude}], ${initialCenter ? 17 : 13});
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19
        }).addTo(map);
        L.circle([${city.latitude}, ${city.longitude}], { radius: ${city.radiusMeters}, color: '#0A84FF', weight: 2, fillColor: '#0A84FF', fillOpacity: 0.12 }).addTo(map);
        ${userLocation ? `L.circleMarker([${userLocation.latitude}, ${userLocation.longitude}], { radius: 8, color: '#1a73e8', fillColor: '#1a73e8', fillOpacity: 1 }).addTo(map);` : ''}

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

        window.__petMarkers = [];
        window.__renderPets = function(pets){
          window.__petMarkers.forEach(function(m){ map.removeLayer(m); });
          window.__petMarkers = [];
          pets.forEach(function(p){
            var m = L.marker([p.latitude, p.longitude], { icon: p.reported ? reportedIcon : pawIcon }).addTo(map);
            m.on('click', function(){ window.ReactNativeWebView.postMessage(JSON.stringify({petId:p.id, contact:p.contact})); });
            window.__petMarkers.push(m);
          });
        };
      </script>
    </body>
  </html>`, [initialCenter, city, center.latitude, center.longitude, mapFilter, userLocation]);

  const renderPetsJs = (list: PetPost[]) =>
    `(function(){ var tryRender = function(){ if (window.__renderPets) { window.__renderPets(${JSON.stringify(list)}); } else { setTimeout(tryRender, 200); } }; tryRender(); })();`;

  useEffect(() => {
    if (!mapReady || !webRef.current) return;
    webRef.current.injectJavaScript(renderPetsJs(pets));
  }, [mapReady, pets]);

  const source = useMemo(() => ({ html }), [html]);

  return (
    <WebView
      ref={webRef}
      style={[StyleSheet.absoluteFillObject, { zIndex: 0 }]}
      originWhitelist={['*']}
      source={source}
      setSupportMultipleWindows={false}
      overScrollMode="never"
      nestedScrollEnabled={false}
      javaScriptEnabled={true}
      injectedJavaScript={renderPetsJs(pets)}
      onLoad={() => setMapReady(true)}
      onMessage={(e) => {
        try {
          const data = JSON.parse(e.nativeEvent.data);
          if (data.petId) onMarkerPress(data.petId);
        } catch {}
      }}
    />
  );
};

const ImageCarousel = ({ images, blurRadius = 0, onPressImage }: { images: string[]; blurRadius?: number; onPressImage?: (images: string[], index: number) => void }) => {
  const [index, setIndex] = useState(0);
  const clamped = Math.max(0, Math.min(index, images.length - 1));
  const btn = (disabled: boolean): any => ({
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    opacity: disabled ? 0.3 : 1,
  });
  return (
    <View style={{ width: '100%', height: 180, marginBottom: 14, position: 'relative' }}>
      <Image source={{ uri: images[clamped] }} style={{ width: '100%', height: 180, borderRadius: 12, backgroundColor: '#000000' }} resizeMode="contain" blurRadius={blurRadius} />
      <TouchableOpacity
        style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: images.length > 1 ? 40 : 0 }}
        activeOpacity={1}
        onPress={() => onPressImage?.(images, clamped)}
      />
      {images.length > 1 && (
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 8, paddingBottom: 8 }}>
          <TouchableOpacity
            style={btn(clamped === 0)}
            disabled={clamped === 0}
            onPress={() => setIndex(clamped - 1)}
          >
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: 'bold', backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 }}>
            {clamped + 1} / {images.length}
          </Text>
          <TouchableOpacity
            style={btn(clamped === images.length - 1)}
            disabled={clamped === images.length - 1}
            onPress={() => setIndex(clamped + 1)}
          >
            <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};

const makeStyles = (c: typeof Colors.light) => StyleSheet.create({
  container: { flex: 1, flexDirection: 'column', backgroundColor: c.background },
  mapArea: { flex: 1, position: 'relative' },
  map: { ...StyleSheet.absoluteFillObject },
  floatingButtonContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 40,
    alignItems: 'center',
    zIndex: 10,
    pointerEvents: 'box-none',
  },
  floatingButton: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: c.primaryButton,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 6,
  },
  floatingButtonDisabled: {
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  speechBubble: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 14,
    marginBottom: 14,
    borderWidth: 2,
    borderColor: '#000000',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
    pointerEvents: 'none',
  },
  speechBubbleText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '800',
    textAlign: 'center',
    lineHeight: 17,
  },
  speechBubbleArrow: {
    position: 'absolute',
    bottom: -10,
    alignSelf: 'center',
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderTopWidth: 10,
    borderStyle: 'solid',
    backgroundColor: 'transparent',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: '#FFFFFF',
  },
  locationWarning: {
    position: 'absolute',
    top: 16,
    left: 16,
    right: 16,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(200,30,30,0.85)',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 12,
  },
  locationWarningText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
  },
  modalContainer: {
    flex: 1,
    backgroundColor: c.background,
  },
  modalScrollView: { padding: 20 },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: c.text,
  },
  roundClose: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 14,
  },
  roundCloseText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
    lineHeight: 13,
    includeFontPadding: false,
    textAlign: 'center',
  },
  bigCameraButtonText: {
    color: c.primaryButton,
    fontWeight: 'bold',
    fontSize: 16,
  },
  photoBlock: {
    marginBottom: 20,
  },
  photoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  photoThumb: {
    width: 100,
    height: 100,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: c.secondaryButton,
  },
  photoThumbImage: {
    width: '100%',
    height: '100%',
  },
  photoRemove: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  photoPrimaryBadge: {
    position: 'absolute',
    bottom: 4,
    left: 4,
    backgroundColor: c.primaryButton,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  photoPrimaryText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  photoAdd: {
    width: 100,
    height: 100,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: c.primaryButton,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: c.secondaryButton,
  },
  photoHint: {
    marginTop: 10,
    fontSize: 13,
    color: '#8E8E93',
  },
  pickMapWrap: {
    width: '100%',
    height: 260,
    borderRadius: 12,
    overflow: 'hidden',
  },
  pickLabel: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '600',
    color: c.text,
  },
  fieldLabel: {
    marginTop: 18,
    marginBottom: 8,
    fontSize: 14,
    fontWeight: '600',
    color: c.text,
  },
  dateField: {
    flexDirection: 'row',
    alignItems: 'center',
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#0A84FF',
    backgroundColor: 'rgba(10,132,255,0.08)',
  },
  useGpsText: {
    marginLeft: 6,
    color: '#0A84FF',
    fontSize: 14,
    fontWeight: '600',
  },
  cameraBox: {
    position: 'relative',
    height: 440,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 20,
    backgroundColor: '#000000',
  },
  camera: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  cameraLoading: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    zIndex: 2,
  },
  cameraPill: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 14,
  },
  cameraHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  cameraActionBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraCounter: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },
  cameraControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 30,
    paddingBottom: 24,
    zIndex: 2,
  },
  cameraCloseWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
  },
  cameraClose: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  cameraFlip: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  captureButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FFFFFF',
    borderWidth: 5,
    borderColor: 'rgba(0,0,0,0.3)',
  },
  cameraZoomGroup: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  cameraZoomBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
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
    borderColor: '#FF3B30',
  },
  fieldError: {
    color: '#FF3B30',
    fontSize: 13,
    marginBottom: 12,
    marginTop: -8,
  },
  textArea: {
    height: 100,
    textAlignVertical: 'top',
  },
  submitButton: {
    backgroundColor: c.primaryButton,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 10,
  },
  submitButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  titleBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
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
    alignItems: 'flex-start',
  },
  clockTime: {
    color: c.text,
    fontSize: 18,
    fontWeight: 'bold',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
  clockDate: {
    color: c.text,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'capitalize',
    marginTop: 2,
  },
  titleInfoBtn: {
    marginLeft: 'auto',
    padding: 4,
  },
  counterFloat: {
    position: 'absolute',
    top: 8,
    zIndex: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10,132,255,0.92)',
    paddingVertical: 4,
    paddingHorizontal: 9,
    borderRadius: 14,
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
  counterFloatText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
    marginLeft: 5,
  },
  counterFloatBadge: {
    marginLeft: 6,
    backgroundColor: '#FF3B30',
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 5,
  },
  counterFloatBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: 'bold',
  },
  cityBox: {
    position: 'absolute',
    left: 16,
    bottom: 16,
    zIndex: 10,
  },
  cityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cityButtonText: {
    color: c.text,
    fontSize: 12,
    fontWeight: 'bold',
  },
  aboutButtonContainer: {
    position: 'absolute',
    top: 50,
    right: 16,
    zIndex: 10,
  },
  sideToolbar: {
    position: 'absolute',
    top: '38%',
    right: 16,
    gap: 18,
    zIndex: 20,
    elevation: 20,
  },
  sideToolbarBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  aboutButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  aboutOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  actionSheetOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  actionSheet: {
    backgroundColor: c.card,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    paddingHorizontal: 16,
  },
  actionSheetTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#8E8E93',
    textAlign: 'center',
    paddingVertical: 14,
    textTransform: 'uppercase',
  },
  actionSheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  actionSheetSelected: {
    backgroundColor: 'rgba(10,132,255,0.12)',
  },
  actionSheetCheck: {
    marginLeft: 'auto',
  },
  actionSheetOptionText: {
    fontSize: 17,
    fontWeight: '500',
    color: c.text,
  },
  actionSheetCancel: {
    justifyContent: 'center',
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: c.cardStroke,
  },
  actionSheetCancelText: {
    color: c.primaryButton,
    fontWeight: '600',
  },
  aboutCard: {
    width: '100%',
    backgroundColor: c.card,
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
  },
  aboutTitle: {
    fontSize: 26,
    fontWeight: 'bold',
    color: c.text,
    marginBottom: 12,
  },
  aboutText: {
    fontSize: 15,
    color: c.text,
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 16,
  },
  aboutVersion: {
    fontSize: 13,
    color: '#8E8E93',
    marginBottom: 20,
  },
  aboutClose: {
    backgroundColor: c.primaryButton,
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 32,
  },
  aboutCloseText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  privacyScroll: {
    width: '100%',
    maxHeight: '70%',
    marginBottom: 16,
  },
  privacyText: {
    fontSize: 14,
    color: c.text,
    textAlign: 'justify',
    lineHeight: 20,
  },
  demoOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  demoCard: {
    width: '100%',
    maxHeight: '90%',
    backgroundColor: c.card,
    borderRadius: 18,
    padding: 18,
    position: 'relative',
  },
  demoCardScroll: {
    maxHeight: '100%',
  },
  demoClose: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  demoImages: {
    height: 160,
    width: '100%',
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
    width: '100%',
    height: 180,
    marginBottom: 14,
    position: 'relative',
  },
  carouselImage: {
    width: '100%',
    height: 180,
    borderRadius: 12,
    backgroundColor: c.secondaryButton,
  },
  carouselControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingBottom: 8,
  },
  carouselBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  carouselBtnDisabled: {
    opacity: 0.3,
  },
  carouselCount: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  demoName: {
    fontSize: 22,
    fontWeight: 'bold',
    color: c.text,
    marginBottom: 2,
  },
  demoRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
  demoDescription: {
    fontSize: 14,
    color: c.text,
    lineHeight: 20,
    marginBottom: 16,
  },
  demoDescBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
  },
  demoDescBtnText: {
    fontSize: 14,
    color: c.primaryButton,
    fontWeight: '600',
  },
  descOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  descCard: {
    width: '100%',
    maxWidth: 320,
    maxHeight: '80%',
    backgroundColor: c.card,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    position: 'relative',
  },
  descTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: c.text,
    textAlign: 'center',
    marginBottom: 12,
  },
  descScroll: {
    maxHeight: 360,
    width: '100%',
  },
  descText: {
    fontSize: 15,
    color: c.text,
    lineHeight: 22,
    textAlign: 'left',
  },
  descCloseBtn: {
    width: '100%',
    borderTopWidth: 1,
    borderColor: c.cardStroke,
    marginTop: 16,
    paddingTop: 12,
    alignItems: 'center',
  },
  descCloseText: {
    fontSize: 16,
    fontWeight: '500',
    color: c.primaryButton,
  },
  disabledBtn: {
    opacity: 0.4,
  },
  shareCardOffscreen: {
    position: 'absolute',
    left: -10000,
    top: 0,
    width: 360,
  },
  shareCard: {
    width: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 0,
    overflow: 'hidden',
  },
  shareCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FF9500',
    paddingVertical: 14,
    paddingHorizontal: 16,
  },
  shareCardLogo: {
    width: 32,
    height: 32,
    borderRadius: 8,
  },
  shareCardApp: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: 'bold',
    marginLeft: 10,
  },
  shareCardTag: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 'auto',
    opacity: 0.9,
  },
  shareCardPhoto: {
    width: 360,
    height: 360,
    backgroundColor: '#E5E5EA',
  },
  shareCardReported: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,59,48,0.25)',
  },
  shareCardReportedText: {
    color: '#FF3B30',
    fontSize: 34,
    fontWeight: 'bold',
    letterSpacing: 2,
  },
  shareCardMap: {
    alignItems: 'center',
    backgroundColor: '#F2F2F7',
    paddingVertical: 18,
    paddingHorizontal: 16,
  },
  shareCardLocation: {
    color: '#1C1C1E',
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 6,
    textAlign: 'center',
  },
  shareCardCoords: {
    color: '#8E8E93',
    fontSize: 12,
    marginTop: 2,
  },
  shareCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 18,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
  },
  shareCardFooterText: {
    flex: 1,
    marginLeft: 0,
  },
  shareCardHelp: {
    color: '#1C1C1E',
    fontSize: 15,
    fontWeight: 'bold',
    lineHeight: 20,
  },
  demoUndoReportBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#0A84FF',
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 10,
  },
  circularMenu: {
    position: 'relative',
    width: '100%',
    height: 260,
    alignSelf: 'center',
    marginTop: 16,
  },
  circularCenter: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: c.primaryButton,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
    transform: [{ translateX: -30 }, { translateY: -30 }],
  },
  circularCenterText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },
  circularBtn: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  circularBtnLabel: {
    position: 'absolute',
    top: 64,
    fontSize: 11,
    fontWeight: 'bold',
    color: c.text,
    width: 90,
    textAlign: 'center',
  },
  reportImageWrap: {
    width: '100%',
    position: 'relative',
  },
  reportedBanner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reportedBannerText: {
    color: '#FF3B30',
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: 1,
  },
  reportOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  reportCard: {
    width: '100%',
    backgroundColor: c.card,
    borderRadius: 18,
    padding: 24,
    alignItems: 'stretch',
    position: 'relative',
  },
  reportClose: {
    position: 'absolute',
    top: 14,
    right: 14,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  reportTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: c.text,
    marginBottom: 6,
    textAlign: 'center',
  },
  reportIcon: {
    alignSelf: 'center',
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
    fontWeight: '600',
  },
});
