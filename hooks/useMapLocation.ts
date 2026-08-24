import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import * as Location from "expo-location";
import { CITIES, distanceMeters } from "@/constants/cities";
import { reverseGeocodeCity } from "@/lib/geocode";
import { showAlert } from "@/src/components/AppAlert";

type Coords = { latitude: number; longitude: number };

export function useMapLocation(triggerSync: () => void) {
  const [mapRegion, setMapRegion] = useState<import("react-native-maps").Region>({
    latitude: CITIES[0].latitude,
    longitude: CITIES[0].longitude,
    latitudeDelta: 0.08,
    longitudeDelta: 0.08,
  });
  const [userLocation, setUserLocation] = useState<Coords | null>(null);
  // Cidade exibida no mapa (canto inferior esquerdo). Obtida por geocoding
  // reverso da posição REAL do GPS (não mais a lista fixa de CITIES). Começa em
  // Sorocaba como fallback e só troca quando o GPS devolve um município válido.
  const [gpsCity, setGpsCity] = useState<string>(CITIES[0].name);
  const lastGeocodeRef = useRef<Coords | null>(null);
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
  const [petLocation, setPetLocation] = useState<Coords | null>(null);
  const [gpsNonce, setGpsNonce] = useState(0);
  const initialCenterRef = useRef<Coords | null>(null);
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

  const getCityForLocation = (
    loc: Coords | null,
  ): import("@/constants/cities").City => {
    if (!loc) return CITIES[0];
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
  };

  const selectedCity = getCityForLocation(userLocation);
  const canReport = locationEnabled === true;

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
  const applyCenter = (coords: Coords) => {
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
  ): Promise<Coords | null> => {
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
      const last = await Location.getLastKnownPositionAsync().catch(() => null);
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
        triggerSync();
      }
    });

    return () => {
      cancelled = true;
      appStateSub.remove();
      clearInterval(poll);
    };
  }, [checkPermissionAndServices]);

  return {
    mapRegion,
    setMapRegion,
    userLocation,
    setUserLocation,
    gpsCity,
    recenterNonce,
    setRecenterNonce,
    petLocation,
    setPetLocation,
    gpsNonce,
    setGpsNonce,
    initialCenterRef,
    locationEnabled,
    setLocationEnabled,
    now,
    setNow,
    isDay,
    getCityForLocation,
    selectedCity,
    canReport,
    applyCenter,
    fetchGps,
    checkPermissionAndServices,
    centerOnUserGps,
  };
}
