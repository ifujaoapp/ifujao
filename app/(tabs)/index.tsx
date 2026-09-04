import { GodLoginModal } from "@/components/home/GodLoginModal";
import { MapArea } from "@/components/home/MapArea";
import { ModerationDetailModal } from "@/components/home/ModerationDetailModal";
import { HomeHeader } from "@/components/home/HomeHeader";
import { AiSearchBar } from "@/components/home/AiSearchBar";
import {
  AboutModal,
  PhotoSourceModal,
  PrivacyModal,
  ReportReasonModal,
} from "@/components/home/Modals";
import { PetFoundModal } from "@/components/home/PetFoundModal";
import { PetLostModal } from "@/components/home/PetLostModal";
import { ReportModal } from "@/components/home/ReportModal";
import { formatLostDate, isOwner } from "@/constants/breeds";
import { Colors } from "@/constants/theme";
import { useThemeMode } from "@/hooks/use-theme-mode";
import { useAiSearch } from "@/hooks/useAiSearch";
import { useImageViewer } from "@/hooks/useImageViewer";
import { useMapLocation } from "@/hooks/useMapLocation";
import { usePetCamera } from "@/hooks/usePetCamera";
import { usePets } from "@/hooks/usePets";
import { useReportForm } from "@/hooks/useReportForm";
import { resolveContact, revealContact } from "@/lib/contacts";
import { type PetRecord } from "@/lib/storage";
import { setTermsAccepted } from "@/lib/terms";
import { showAlert } from "@/src/components/AppAlert";
import { DatePickerCalendar } from "@/src/components/DatePickerCalendar";
import { ImageViewerModal } from "@/src/components/ImageViewerModal";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState, useMemo } from "react";
import {
  ActivityIndicator,
  Animated,
  Linking,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import {
  Easing,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

export default function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { theme, toggleTheme } = useThemeMode();
  const themeColors = Colors[theme];
  const styles = makeStyles(themeColors);

  // "Aa": liga/desliga o rótulo de texto do patrocinador no mapa (evita poluir).
  const [showSponsorText, setShowSponsorText] = useState(false);
  const [isReportModalVisible, setReportModalVisible] = useState(false);
  const [isAboutVisible, setIsAboutVisible] = useState(false);
  const [isPrivacyVisible, setIsPrivacyVisible] = useState(false);
  const [isTermsAcceptVisible, setIsTermsVisible] = useState(false);
  const [isGodLoginVisible, setIsGodLoginVisible] = useState(false);
  const godTapCount = useRef(0);
  const godTapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleClockTap = () => {
    godTapCount.current += 1;
    if (godTapTimer.current) clearTimeout(godTapTimer.current);
    godTapTimer.current = setTimeout(() => {
      godTapCount.current = 0;
    }, 3000);
    if (godTapCount.current >= 10) {
      godTapCount.current = 0;
      if (godMode) {
        logoutModerator();
        showAlert("info", "Modo deus", "Modo deus desativado.");
      } else {
        setIsGodLoginVisible(true);
      }
    }
  };
  const camera = usePetCamera();
  const {
    isPhotoSourceVisible,
    abrirCamera,
    abrirGaleria,
    fecharFonte,
    setIsCameraOpen,
  } = camera;

  const {
    viewerImages,
    viewerIndex,
    setViewerIndex,
    viewerVisible,
    setViewerVisible,
    openInViewer,
  } = useImageViewer();

  const {
    aiQuery,
    setAiQuery,
    aiResults,
    setAiResults,
    aiSearching,
    aiSearchVisible,
    setAiSearchVisible,
    titleBarH,
    setTitleBarH,
    aiBarXY,
    setAiBarXY,
    aiPan,
    runAiSearch,
    clearAiSearch,
  } = useAiSearch();

  const {
    pets,
    sponsors,
    myPhone,
    setMyPhone,
    myDeviceId,
    selectedPet,
    setSelectedPet,
    showOnlyMine,
    setShowOnlyMine,
    showDescriptionModal,
    setShowDescriptionModal,
    reportTarget,
    setReportTarget,
    sponsorInfo,
    setSponsorInfo,
    shareCardRef,
    commitPets,
    triggerSync,
    refreshSponsors,
    handleSponsorPress,
    sharePetCard,
    onMarkerPress,
    reportPet,
    submitReport,
    deletePet,
    godMode,
    loginModerator,
    logoutModerator,
  } = usePets();

  const mapLocation = useMapLocation(triggerSync);
  const [modPet, setModPet] = useState<PetRecord | null>(null);
  const {
    mapRegion,
    userLocation,
    gpsCity,
    recenterNonce,
    initialCenterRef,
    locationEnabled,
    now,
    setNow,
    isDay,
    selectedCity,
    canReport,
    centerOnUserGps,
  } = useMapLocation(triggerSync);

  const form = useReportForm({
    images: camera.images,
    setImages: camera.setImages,
    commitPets,
    deletePet,
    myDeviceId,
    myPhone,
    setMyPhone,
    pets,
    petLocation: mapLocation.petLocation,
    getCityForLocation: mapLocation.getCityForLocation,
    userLocation: mapLocation.userLocation,
    mapRegion: mapLocation.mapRegion,
    selectedCity: mapLocation.selectedCity,
    setPetLocation: mapLocation.setPetLocation,
    setGpsNonce: mapLocation.setGpsNonce,
    setUserLocation: mapLocation.setUserLocation,
    checkPermissionAndServices: mapLocation.checkPermissionAndServices,
    canReport: mapLocation.canReport,
    setReportModalVisible,
    setIsCameraOpen: camera.setIsCameraOpen,
    godMode,
    onNeedAcceptTerms: () => setIsTermsVisible(true),
  });
  const {
    openReport,
    isValidPhone,
    setCityName,
    showDatePicker,
    setShowDatePicker,
    lostDate,
    setLostDate,
    postType,
    foundDate,
    setFoundDate,
  } = form;

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

  // Pulso do botão de patinha (igual aos pins do mapa): um anel que expande e
  // some em loop, chamando a atenção para o FAB de "reportar pet".
  const pawPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(pawPulse, {
        toValue: 1,
        duration: 1800,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [pawPulse]);

  const menuProgress = useSharedValue(0);
  useEffect(() => {
    if (selectedPet !== null) {
      menuProgress.value = 0;
      menuProgress.value = withDelay(
        120,
        withTiming(1, { duration: 420, easing: Easing.out(Easing.cubic) }),
      );
    }
  }, [selectedPet, menuProgress]);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [setNow]);

  const fecharModal = () => {
    setIsCameraOpen(false);
    setReportModalVisible(false);
    setCityName("");
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
      ? pet.name
        ? pet.name
        : `${pet.species}${pet.breed ? ` - ${pet.breed}` : ""}`
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
  const [postTypeFilter, setPostTypeFilter] = useState<
    "all" | "lost" | "found"
  >("all");
  // Calcula confirmed ANTES de filtrar para não perder o estado ao alternar
  // entre "meus/todos" (o pet confirmado pode pertencer a outro usuário).
  const enrichedPets = useMemo(() => {
    return pets.map((p) => {
      if (p.postType !== 'found') return p;
      const isConfirmed = pets.some(
        (x) => x.postType !== 'found' && x.matchedPetId === p.id && x.matchStatus === 'confirmed',
      );
      return { ...p, confirmed: isConfirmed };
    });
  }, [pets]);
  const visiblePets = useMemo(() => {
    let base = showOnlyMine
      ? enrichedPets.filter((p) => isOwner(p, myDeviceId, myPhone))
      : enrichedPets;
    if (aiResults) {
      const ids = new Set(aiResults.map((r) => r.id));
      base = base.filter((p) => ids.has(p.id));
    }
    // Filtro perdido/achado (manual matching): 'all' mostra tudo; 'loss' só
    // posts de perda; 'found' só posts de quem encontrou um pet.
    if (postTypeFilter !== "all") {
      base = base.filter((p) => (p.postType ?? "lost") === postTypeFilter);
    }
    // Achados NÃO são ocultados ao confirmar um match: um "reencontro" falso não
    // pode esconder o post (anti-fraude). O pin permanece visível (marcado como
    // resolvido) até moderação/disputa.
    return base;
  }, [showOnlyMine, enrichedPets, myDeviceId, myPhone, aiResults, postTypeFilter]);
  // Pets reencontrados fora da janela somem do mapa (alinhamento com o filtro
  // withinFoundWindow do MapLeaflet) e portanto não devem contar no total do mapa.
  const visiblePetsOnMap = visiblePets.filter(
    (p) => !p.foundAt || Date.now() - new Date(p.foundAt).getTime() <= 48 * 3600 * 1000,
  );
  const petsDenunciados = visiblePetsOnMap.filter((p) => p.reported);
  const totalPetsNoMapa = visiblePetsOnMap.length;
  // Matches pendentes que envolvem este device (aguardando sua confirmação ou
  // a do outro lado) — usado no indicador in-app. Conta tanto o pet que eu
  // iniciei quanto o pet alheio que aponta para um meu pet como pendente.
  const pendingMatches = visiblePets.filter((p) => {
    if (p.matchStatus === "pending" && isOwner(p, myDeviceId, myPhone))
      return true;
    if (p.matchedPetId) {
      const mine = pets.find((x) => x.id === p.matchedPetId);
      if (
        mine &&
        isOwner(mine, myDeviceId, myPhone) &&
        p.matchStatus === "pending"
      )
        return true;
    }
    return false;
  }).length;

  return (
      <View style={styles.container}>
        <View style={{ paddingTop: insets.top }}>
          <HomeHeader
            now={now}
            isDay={isDay}
            godMode={godMode}
            themeColors={themeColors}
            onClockTap={handleClockTap}
            onAboutPress={() => setIsAboutVisible(true)}
            onPrivacyPress={() => setIsPrivacyVisible(true)}
            onLayout={(e) => setTitleBarH(e.nativeEvent.layout.height)}
          />
        </View>

      <AiSearchBar
        visible={aiSearchVisible}
        top={aiBarXY.y}
        query={aiQuery}
        onChangeQuery={setAiQuery}
        onSubmit={runAiSearch}
        searching={aiSearching}
        hasResults={!!aiResults}
        onClear={clearAiSearch}
        dragHandleProps={aiPan.panHandlers}
        themeColors={themeColors}
      />

      <MapArea
        insets={insets}
        styles={styles}
        totalPetsNoMapa={totalPetsNoMapa}
        petsDenunciados={petsDenunciados}
        initialCenterRef={initialCenterRef}
        mapRegion={mapRegion}
        userLocation={userLocation}
        recenterNonce={recenterNonce}
        visiblePets={visiblePets}
        postTypeFilter={postTypeFilter}
        setPostTypeFilter={setPostTypeFilter}
        pendingMatches={pendingMatches}
        sponsors={sponsors}
        handleSponsorPress={handleSponsorPress}
        aiResults={aiResults}
        showSponsorText={showSponsorText}
        setShowSponsorText={setShowSponsorText}
        onMarkerPress={(petId) => {
          if (godMode) {
            // Em godMode, toque no pin abre menu: o moderador escolhe
            // entre ver o post normalmente ou abrir o modal de moderacao.
            // Sem godMode, vai direto para onMarkerPress (comportamento padrao).
            const p = pets.find((x) => x.id === petId);
            if (!p) return;
            showAlert("info", "Ações do moderador", "O que você quer fazer com este alerta?", [
              { text: "Ver detalhes", onPress: () => onMarkerPress(petId) },
              { text: "Moderar", onPress: () => setModPet(p) },
              { text: "Cancelar", style: "cancel" },
            ]);
          } else {
            onMarkerPress(petId);
          }
        }}
        theme={theme}
        toggleTheme={toggleTheme}
        selectedCity={selectedCity}
        sponsorInfo={sponsorInfo}
        setSponsorInfo={setSponsorInfo}
        locationEnabled={locationEnabled}
        centerOnUserGps={centerOnUserGps}
        gpsCity={gpsCity}
        showOnlyMine={showOnlyMine}
        setShowOnlyMine={setShowOnlyMine}
        triggerSync={triggerSync}
        refreshSponsors={refreshSponsors}
        aiSearchVisible={aiSearchVisible}
        setAiSearchVisible={setAiSearchVisible}
        setAiResults={setAiResults}
        setAiBarXY={setAiBarXY}
        titleBarH={titleBarH}
        canReport={canReport}
        pawPulse={pawPulse}
        bubbleOpacity={bubbleOpacity}
        openReport={openReport}
      />

      {isReportModalVisible && (
        <ReportModal
          form={form}
          camera={camera}
          map={mapLocation}
          themeColors={themeColors}
          theme={theme}
          insets={insets}
          styles={styles}
          onClose={fecharModal}
          onNeedAcceptTerms={() => setIsTermsVisible(true)}
        />
      )}

      <PhotoSourceModal
        visible={isPhotoSourceVisible}
        onClose={fecharFonte}
        onCamera={abrirCamera}
        onGallery={abrirGaleria}
        styles={styles}
        themeColors={themeColors}
      />

      <AboutModal
        visible={isAboutVisible}
        onClose={() => setIsAboutVisible(false)}
        styles={styles}
      />

      <PrivacyModal
        visible={isPrivacyVisible}
        onClose={() => setIsPrivacyVisible(false)}
        styles={styles}
      />

      <PrivacyModal
        visible={isTermsAcceptVisible}
        onClose={() => setIsTermsVisible(false)}
        onAccept={async () => {
          await setTermsAccepted(true);
          setIsTermsVisible(false);
        }}
        styles={styles}
      />

      <ModerationDetailModal
        visible={!!modPet}
        pet={modPet}
        allPets={pets}
        onClose={() => setModPet(null)}
        onNeedReauth={() => setIsGodLoginVisible(true)}
      />

      <GodLoginModal
        visible={isGodLoginVisible}
        onClose={() => setIsGodLoginVisible(false)}
        onSuccess={() => {
          setIsGodLoginVisible(false);
          showAlert(
            "info",
            "Modo deus",
            "Modo deus ativado. Você pode moderar posts de outros usuários.",
          );
        }}
        loginModerator={loginModerator}
      />

      {selectedPet?.postType === "found" ? (
        <PetFoundModal
          selectedPet={selectedPet}
          setSelectedPet={setSelectedPet}
          insets={insets}
          styles={styles}
          themeColors={themeColors}
          openInViewer={openInViewer}
          formatLostDate={formatLostDate}
          isOwner={isOwner}
          myDeviceId={myDeviceId}
          myPhone={myPhone}
          handleContact={handleContact}
          reportPet={reportPet}
          sharePetCard={sharePetCard}
          commitPets={commitPets}
          pets={pets}
          deletePet={deletePet}
          godMode={godMode}
          setShowDescriptionModal={setShowDescriptionModal}
          showDescriptionModal={showDescriptionModal}
          shareCardRef={shareCardRef}
        />
      ) : selectedPet?.postType === "lost" ? (
        <PetLostModal
          selectedPet={selectedPet}
          setSelectedPet={setSelectedPet}
          insets={insets}
          styles={styles}
          themeColors={themeColors}
          openInViewer={openInViewer}
          formatLostDate={formatLostDate}
          isOwner={isOwner}
          myDeviceId={myDeviceId}
          myPhone={myPhone}
          handleContact={handleContact}
          reportPet={reportPet}
          sharePetCard={sharePetCard}
          commitPets={commitPets}
          pets={pets}
          deletePet={deletePet}
          godMode={godMode}
          setShowDescriptionModal={setShowDescriptionModal}
          showDescriptionModal={showDescriptionModal}
          shareCardRef={shareCardRef}
        />
      ) : null}

      <ReportReasonModal
        target={reportTarget}
        onClose={() => setReportTarget(null)}
        onSubmit={(m) => reportTarget && submitReport(reportTarget, m)}
        styles={styles}
      />

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
        initialDate={
          (postType === "found" ? foundDate : lostDate) ?? new Date()
        }
        maximumDate={new Date()}
        onCancel={() => setShowDatePicker(false)}
        onConfirm={(selected) => {
          setShowDatePicker(false);
          if (postType === "found") setFoundDate(selected);
          else setLostDate(selected);
        }}
      />
    </View>
  );
}

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
    pawButtonWrap: {
      width: 84,
      height: 84,
      position: "relative",
      justifyContent: "center",
      alignItems: "center",
    },
    pawPulseRing: {
      position: "absolute",
      top: 0,
      left: 0,
      width: 84,
      height: 84,
      borderRadius: 42,
      backgroundColor: c.primaryButton,
      zIndex: -1,
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
      alignItems: "flex-start",
      paddingHorizontal: 20,
      marginBottom: 20,
    },
    modalTitle: {
      fontSize: 28,
      fontWeight: "bold",
      color: c.text,
      flexShrink: 1,
      flexWrap: "wrap",
      marginRight: 12,
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
      width: "100%",
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
    submitButtonDisabled: {
      opacity: 0.7,
    },
    submitButtonLoadingRow: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
    counterFloat: {
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
    counterFloatRow: {
      position: "absolute",
      right: 12,
      left: undefined,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      zIndex: 20,
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
    counterFloatDivider: {
      width: 1,
      height: 16,
      backgroundColor: "rgba(255,255,255,0.35)",
      marginHorizontal: 6,
    },
    counterFloatPending: {
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: "#FF9F0A",
      borderRadius: 12,
      paddingHorizontal: 7,
      paddingVertical: 2,
      marginLeft: 2,
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
      maxHeight: "85%",
      backgroundColor: c.card,
      borderRadius: 18,
      padding: 16,
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
      alignSelf: "center",
      alignItems: "center",
      justifyContent: "center",
    },
    aboutCloseText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "bold",
    },
    privacyScroll: {
      width: "100%",
      maxHeight: "65%",
      marginBottom: 16,
    },
    privacyText: {
      fontSize: 12,
      color: c.text,
      lineHeight: 18,
    },
    demoOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "flex-end",
      alignItems: "stretch",
    },
    demoSheet: {
      width: "100%",
      maxHeight: "88%",
      backgroundColor: c.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingTop: 4,
      paddingHorizontal: 18,
      elevation: 10,
      shadowColor: "#000",
      shadowOpacity: 0.3,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: -3 },
    },
    demoSheetHandle: {
      width: "100%",
      alignItems: "center",
      paddingVertical: 8,
      marginBottom: 2,
    },
    demoSheetHandleBar: {
      width: 40,
      height: 5,
      borderRadius: 3,
      backgroundColor: c.cardStroke,
    },
    demoCardScroll: {
      maxHeight: "100%",
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
    helpFind: {
      textAlign: "left",
    },
    helpFindRow: {
      flexDirection: "row",
      alignItems: "center",
      marginBottom: 10,
    },
    heartWrap: {
      position: "relative",
      width: 30,
      height: 30,
      marginRight: 8,
      justifyContent: "center",
      alignItems: "center",
    },
    heartBig: {
      position: "absolute",
    },
    heartSmall: {
      position: "absolute",
    },
    helpFindBold: {
      color: "#FF3B30",
      fontWeight: "bold",
      fontSize: 22,
    },
    helpFindSmall: {
      color: c.text,
      fontSize: 13,
      fontWeight: "bold",
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
    demoRewardBadge: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "flex-start",
      marginTop: 4,
      marginBottom: 8,
      paddingVertical: 6,
      paddingHorizontal: 12,
      backgroundColor: "#FFF3C4",
      borderRadius: 999,
      borderWidth: 1,
      borderColor: "#F4D03F",
    },
    demoRewardBadgeText: {
      fontSize: 14,
      color: "#8A6D00",
      fontWeight: "bold",
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
      overflow: "hidden",
    },
    descCover: {
      width: "100%",
      height: 150,
      borderRadius: 12,
      marginBottom: 16,
      backgroundColor: c.cardStroke,
    },
    descHeader: {
      width: "100%",
      alignItems: "center",
      paddingBottom: 12,
      marginBottom: 12,
      borderBottomWidth: 1,
      borderColor: c.cardStroke,
    },
    descTitle: {
      fontSize: 17,
      fontWeight: "600",
      color: c.text,
      textAlign: "center",
      marginTop: 6,
    },
    descSubtitle: {
      fontSize: 13,
      color: c.icon,
      textAlign: "center",
      marginTop: 4,
    },
    descScroll: {
      maxHeight: 300,
      width: "100%",
    },
    descText: {
      fontSize: 16,
      color: c.text,
      lineHeight: 24,
    },
    descFooter: {
      width: "100%",
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "center",
      alignItems: "center",
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderColor: c.cardStroke,
      gap: 16,
    },
    descFooterItem: {
      flexDirection: "row",
      alignItems: "center",
      gap: 4,
    },
    descFooterText: {
      fontSize: 13,
      color: c.icon,
    },
    descCloseBtn: {
      width: "100%",
      marginTop: 12,
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
      width: "100%",
      marginTop: 14,
      backgroundColor: c.card,
      borderRadius: 16,
      paddingVertical: 12,
      paddingHorizontal: 8,
      flexDirection: "row",
      justifyContent: "space-around",
      alignItems: "center",
      borderTopWidth: 1,
      borderColor: c.cardStroke,
    },
    demoActionRow: {
      flexDirection: "row",
      flexWrap: "wrap",
      justifyContent: "space-evenly",
      alignItems: "center",
      gap: 8,
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
    demoActionBtnPrimary: {
      alignSelf: "stretch",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 8,
      paddingVertical: 14,
      borderRadius: 12,
      backgroundColor: "#128C7E",
      elevation: 3,
      shadowColor: "#0E6B60",
      shadowOpacity: 0.35,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
    },
    demoActionBtnNeutral: {
      flexBasis: "48%",
      flexGrow: 0,
      flexShrink: 1,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      gap: 4,
      paddingVertical: 12,
      paddingHorizontal: 8,
      borderRadius: 12,
      backgroundColor: "#FAFAFA",
      borderWidth: 1,
      borderColor: "#E0E0E0",
    },
    demoActionRowTop: {
      width: "100%",
      marginBottom: 10,
    },
    demoActionBtnDisabled: {
      borderColor: "#636366",
      opacity: 0.7,
    },
    demoActionLabel: {
      fontSize: 12.5,
      fontWeight: "600",
      textAlign: "center",
      flexShrink: 1,
    },
    demoActionGroupLabel: {
      fontSize: 11,
      fontWeight: "700",
      color: "#8E8E93",
      textTransform: "uppercase",
      letterSpacing: 0.5,
      marginBottom: 4,
      paddingHorizontal: 2,
    },
    demoMoreToggle: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      paddingVertical: 10,
      marginTop: 10,
      borderRadius: 12,
      backgroundColor: "#F2F2F7",
    },
    demoMoreToggleText: {
      fontSize: 13,
      fontWeight: "600",
      color: "#8E8E93",
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
    demoReportTopBtn: {
      position: "absolute",
      top: 12,
      left: 12,
      zIndex: 2,
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: "rgba(0,0,0,0.55)",
      justifyContent: "center",
      alignItems: "center",
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
    reportedBannerReason: {
      color: "#FF3B30",
      fontSize: 12,
      fontWeight: "600",
      letterSpacing: 0.5,
    },
    foundBanner: {
      position: "absolute",
      top: 10,
      alignSelf: "center",
      zIndex: 2,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor: "#34C759",
      paddingVertical: 5,
      paddingHorizontal: 12,
      borderRadius: 999,
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 4,
      shadowOffset: { width: 0, height: 1 },
      elevation: 4,
    },
    foundBannerText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "bold",
      letterSpacing: 0.5,
    },
    foundBannerInline: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      alignSelf: "center",
      marginTop: 4,
      marginBottom: 6,
      backgroundColor: "#34C759",
      paddingVertical: 5,
      paddingHorizontal: 12,
      borderRadius: 999,
    },
    pendingBanner: {
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      marginTop: 8,
      marginBottom: 4,
      backgroundColor: "#FFF3E0",
      borderWidth: 1,
      borderColor: "#FFE0B2",
      paddingVertical: 6,
      paddingHorizontal: 12,
      borderRadius: 10,
    },
    pendingBannerText: {
      flex: 1,
      color: "#9A6A00",
      fontSize: 12.5,
      fontWeight: "600",
      lineHeight: 16,
    },
    claimantsBox: {
      marginTop: 10,
      padding: 12,
      backgroundColor: c.background,
      borderRadius: 12,
    },
    claimantsTitle: {
      fontSize: 13,
      fontWeight: "700",
      color: c.text,
      marginBottom: 8,
    },
    claimantRow: {
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
      paddingVertical: 8,
      borderTopWidth: 1,
      borderTopColor: c.cardStroke,
    },
    claimantName: {
      fontSize: 13,
      fontWeight: "600",
      color: c.text,
    },
    claimantProof: {
      fontSize: 12,
      color: c.icon,
      marginTop: 2,
    },
    claimantDisputed: {
      fontSize: 12,
      color: "#FF9500",
      fontWeight: "600",
      marginTop: 2,
    },
    claimantConfirm: {
      backgroundColor: "#34C759",
      paddingVertical: 8,
      paddingHorizontal: 14,
      borderRadius: 10,
    },
    claimantConfirmText: {
      color: "#FFFFFF",
      fontSize: 13,
      fontWeight: "700",
    },
    claimantDispute: {
      padding: 6,
    },
    claimProofInput: {
      marginTop: 10,
      backgroundColor: "#F2F2F7",
      borderRadius: 10,
      borderWidth: 1,
      borderColor: "#E0E0E0",
      paddingVertical: 10,
      paddingHorizontal: 12,
      fontSize: 14,
      color: "#1C1C1E",
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
    siOverlay: {
      flex: 1,
      backgroundColor: "rgba(0,0,0,0.5)",
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
    },
    siCard: {
      width: "100%",
      maxWidth: 360,
      backgroundColor: c.card,
      borderRadius: 16,
      padding: 20,
      shadowColor: "#000",
      shadowOpacity: 0.25,
      shadowRadius: 10,
      elevation: 6,
    },
    siLogo: {
      width: 96,
      height: 96,
      borderRadius: 12,
      alignSelf: "center",
      marginBottom: 12,
      backgroundColor: c.background,
    },
    siTitle: {
      fontSize: 20,
      fontWeight: "bold",
      color: c.text,
      marginBottom: 6,
      textAlign: "center",
    },
    siBadge: {
      alignSelf: "center",
      backgroundColor: c.primaryButton,
      borderRadius: 6,
      paddingVertical: 3,
      paddingHorizontal: 10,
      marginBottom: 12,
    },
    siBadgeText: {
      fontSize: 11,
      fontWeight: "700",
      color: "#FFFFFF",
      letterSpacing: 1,
    },
    siLine: {
      fontSize: 14,
      color: c.text,
      opacity: 0.75,
      textAlign: "center",
      marginBottom: 12,
    },
    siBtn: {
      backgroundColor: c.background,
      borderRadius: 12,
      paddingVertical: 13,
      paddingHorizontal: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: c.cardStroke,
    },
    siBtnText: {
      fontSize: 15,
      color: c.text,
      fontWeight: "600",
      textAlign: "center",
    },
    siLabel: {
      fontSize: 13,
      color: c.text,
      fontWeight: "600",
      textAlign: "center",
    },
    siBtnPrimary: {
      backgroundColor: "#FF9500",
      borderRadius: 12,
      paddingVertical: 13,
      paddingHorizontal: 16,
      marginBottom: 10,
    },
    siBtnPrimaryText: {
      fontSize: 15,
      color: "#fff",
      fontWeight: "700",
      textAlign: "center",
    },
    siClose: {
      marginTop: 4,
      paddingVertical: 10,
    },
    siCloseText: {
      fontSize: 15,
      color: "#FF3B30",
      fontWeight: "600",
      textAlign: "center",
    },
  });

export type HomeStyles = ReturnType<typeof makeStyles>;
