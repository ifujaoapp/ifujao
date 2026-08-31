import { Animated, BackHandler, PanResponder, Platform, Text, TouchableOpacity, View } from "react-native";
import { useRef, useState, type Dispatch, type SetStateAction } from "react";
import { Ionicons } from "@expo/vector-icons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import { showAlert } from "@/src/components/AppAlert";
import { MapLeaflet } from "./MapLeaflet";
import { SponsorInfoModal } from "./Modals";
import { CloseCircle } from "@/components/CloseCircle";
import type { HomeStyles } from "@/app/(tabs)/index";
import { type City } from "@/constants/cities";
import { Colors } from "@/constants/theme";
import { type SponsorPin } from "@/lib/sponsors";
import { type PetRecord } from "@/lib/storage";
import { type Region } from "react-native-maps";
import { SafeAreaView, type EdgeInsets } from "react-native-safe-area-context";
import { type SearchResult } from "@/lib/search";

export interface MapAreaProps {
  insets: EdgeInsets;
  styles: HomeStyles;
  totalPetsNoMapa: number;
  petsDenunciados: PetRecord[];
  initialCenterRef: { current: { latitude: number; longitude: number } | null };
  mapRegion: Region;
  userLocation: { latitude: number; longitude: number } | null;
  recenterNonce: number;
  visiblePets: PetRecord[];
  postTypeFilter: 'all' | 'lost' | 'found';
  setPostTypeFilter: Dispatch<SetStateAction<'all' | 'lost' | 'found'>>;
  pendingMatches: number;
  sponsors: SponsorPin[];
  handleSponsorPress: (s: SponsorPin) => void;
  aiResults: unknown;
  showSponsorText: boolean;
  setShowSponsorText: Dispatch<SetStateAction<boolean>>;
  onMarkerPress: (petId: string) => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  selectedCity: City;
  sponsorInfo: SponsorPin | null;
  setSponsorInfo: (s: SponsorPin | null) => void;
  locationEnabled: boolean | null;
  centerOnUserGps: () => void;
  gpsCity: string;
  showOnlyMine: boolean;
  setShowOnlyMine: Dispatch<SetStateAction<boolean>>;
  triggerSync: () => void;
  refreshSponsors: () => void;
  aiSearchVisible: boolean;
  setAiSearchVisible: Dispatch<SetStateAction<boolean>>;
  setAiResults: Dispatch<SetStateAction<SearchResult[] | null>>;
  setAiBarXY: (v: { x: number; y: number }) => void;
  titleBarH: number | null;
  canReport: boolean;
  pawPulse: Animated.Value;
  bubbleOpacity: Animated.Value;
  openReport: (type?: 'lost' | 'found') => void;
}

export function MapArea(props: MapAreaProps) {
  const {
    insets,
    styles,
    totalPetsNoMapa,
    petsDenunciados,
    initialCenterRef,
    mapRegion,
    userLocation,
    recenterNonce,
    visiblePets,
    postTypeFilter,
    setPostTypeFilter,
    pendingMatches,
    sponsors,
    handleSponsorPress,
    aiResults,
    showSponsorText,
    setShowSponsorText,
    onMarkerPress,
    theme,
    toggleTheme,
    selectedCity,
    sponsorInfo,
    setSponsorInfo,
    locationEnabled,
    centerOnUserGps,
    gpsCity,
    showOnlyMine,
    setShowOnlyMine,
    triggerSync,
    refreshSponsors,
    aiSearchVisible,
    setAiSearchVisible,
    setAiResults,
    setAiBarXY,
    titleBarH,
    canReport,
    pawPulse,
    bubbleOpacity,
    openReport,
  } = props;
  const themeColors = Colors[theme];
  const [typeChooserVisible, setTypeChooserVisible] = useState(false);
  const sheetY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_evt, g) => {
        if (g.dy > 0) sheetY.setValue(g.dy);
      },
      onPanResponderRelease: (_evt, g) => {
        if (g.dy > 100) {
          setTypeChooserVisible(false);
        } else {
          Animated.spring(sheetY, { toValue: 0, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;
  return (
      <View style={styles.mapArea}>
        <View
          style={[styles.counterFloatRow, { top: 46 }]}
        >
          <View style={styles.counterFloat}>
            <Ionicons name="paw" size={13} color="#FFFFFF" />
            <Text style={styles.counterFloatText}>{totalPetsNoMapa}</Text>
            {petsDenunciados.length > 0 && (
              <View style={styles.counterFloatBadge}>
                <Text style={styles.counterFloatBadgeText}>
                  {petsDenunciados.length}
                </Text>
              </View>
            )}
            {pendingMatches > 0 && (
              <>
                <View style={styles.counterFloatDivider} />
                <View style={styles.counterFloatPending}>
                  <Ionicons name="link" size={13} color="#FFFFFF" />
                  <Text style={styles.counterFloatText}>{pendingMatches}</Text>
                </View>
              </>
            )}
          </View>
        </View>

        <View
          style={{
            position: "absolute",
            top: 8,
            left: 0,
            right: 0,
            zIndex: 20,
            alignItems: "center",
          }}
        >
          <View
            style={{
              flexDirection: "row",
              backgroundColor: "rgba(0,0,0,0.62)",
              borderRadius: 16,
              padding: 2,
            }}
          >
            {(["all", "lost", "found"] as const).map((opt) => (
              <TouchableOpacity
                key={opt}
                onPress={() => setPostTypeFilter(opt)}
                style={{
                  paddingVertical: 4,
                  paddingHorizontal: 10,
                  borderRadius: 14,
                  backgroundColor:
                    postTypeFilter === opt ? "#FFFFFF" : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: postTypeFilter === opt ? "#000000" : "#FFFFFF",
                  }}
                >
                  {opt === "all" ? "Todos" : opt === "lost" ? "Perdidos" : "Achados"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {initialCenterRef.current && (
          <MapLeaflet
            key={`${theme}-${selectedCity.id}`}
            initialCenter={initialCenterRef.current}
            region={mapRegion}
            userLocation={userLocation}
            recenterNonce={recenterNonce}
            pets={visiblePets}
            sponsors={sponsors}
            onSponsorPress={handleSponsorPress}
            fitToResults={!!aiResults}
            showSponsorText={showSponsorText}
            onMarkerPress={onMarkerPress}
            theme={theme}
            city={selectedCity}
          />
        )}

        <SponsorInfoModal
          sponsor={sponsorInfo}
          onClose={() => setSponsorInfo(null)}
          styles={styles}
        />

        {locationEnabled === false && (
          <View style={styles.locationWarning}>
            <Ionicons name="location-outline" size={18} color="#FFFFFF" />
            <Text style={styles.locationWarningText}>
              Ative a localização para reportar um pet perdido.
            </Text>
          </View>
        )}

        <View style={[styles.sideToolbar, { zIndex: 20 }]}>
          <TouchableOpacity
            style={styles.sideToolbarBtn}
            onPress={centerOnUserGps}
          >
            <Ionicons name="locate" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.sideToolbarBtn}
            onPress={() => {
              setShowOnlyMine((v) => !v);
              triggerSync();
              refreshSponsors();
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
              if (nv)
                setAiBarXY({ x: 12, y: insets.top + (titleBarH || 64) + 8 });
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
            onPress={() => setShowSponsorText((v) => !v)}
          >
            <Text
              style={{
                color: showSponsorText ? "#FFD60A" : "#FFFFFF",
                fontSize: 18,
                fontWeight: "bold",
              }}
            >
              Aa
            </Text>
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
              Toque para{"\n"}reportar um pet{"\n"}perdido/encontrado
            </Text>
            <View style={styles.speechBubbleArrow} />
          </Animated.View>
          <View style={styles.pawButtonWrap}>
            {canReport && (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.pawPulseRing,
                  {
                    opacity: pawPulse.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.9, 0],
                    }),
                    transform: [
                      {
                        scale: pawPulse.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.6, 1.8],
                        }),
                      },
                    ],
                  },
                ]}
              />
            )}
            <TouchableOpacity
              style={[
                styles.floatingButton,
                !canReport && styles.floatingButtonDisabled,
              ]}
              disabled={!canReport}
              activeOpacity={0.8}
              onPress={() => setTypeChooserVisible(true)}
            >
              <MaterialCommunityIcons name="paw" size={42} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </SafeAreaView>

        <SafeAreaView
          style={[styles.cityBox, { bottom: insets.bottom + 16, left: 16 }]}
        >
          <View style={styles.cityButton}>
            <Ionicons name="location" size={14} color="#FFFFFF" />
            <Text style={styles.cityButtonText}>{gpsCity}</Text>
          </View>
        </SafeAreaView>

        {typeChooserVisible && (
          <TouchableOpacity
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)", zIndex: 50, justifyContent: "flex-end" }}
            activeOpacity={1}
            onPress={() => setTypeChooserVisible(false)}
          >
            <Animated.View
              style={{
                backgroundColor: themeColors.card,
                padding: 16,
                paddingBottom: insets.bottom + 16,
                borderTopLeftRadius: 16,
                borderTopRightRadius: 16,
                transform: [{ translateY: sheetY }],
              }}
              onStartShouldSetResponder={() => true}
              onTouchStart={(e) => e.stopPropagation()}
            >
              <View {...panResponder.panHandlers} style={{ width: "100%", alignItems: "center", paddingVertical: 6 }}>
                <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: themeColors.icon }} />
              </View>
              <CloseCircle
                style={{ position: "absolute", top: 14, right: 14, zIndex: 2, backgroundColor: theme === "dark" ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.5)" }}
                onPress={() => setTypeChooserVisible(false)}
              />
              <Text style={{ fontSize: 16, fontWeight: "700", color: themeColors.text, marginBottom: 12, marginTop: 4, textAlign: "center" }}>
                O que você quer reportar?
              </Text>
              <TouchableOpacity
                style={{ backgroundColor: themeColors.primaryButton, borderRadius: 10, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 10 }}
                onPress={() => {
                  openReport("lost");
                  setTypeChooserVisible(false);
                }}
              >
                <Text style={{ fontSize: 18, marginRight: 8 }}>😢</Text>
                <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 15 }}>Perdi um pet</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ backgroundColor: themeColors.primaryButton, borderRadius: 10, paddingVertical: 14, flexDirection: "row", alignItems: "center", justifyContent: "center" }}
                onPress={() => {
                  openReport("found");
                  setTypeChooserVisible(false);
                }}
              >
                <Text style={{ fontSize: 18, marginRight: 8 }}>😊</Text>
                <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 15 }}>Encontrei um pet</Text>
              </TouchableOpacity>
            </Animated.View>
          </TouchableOpacity>
        )}
      </View>
  );
}
