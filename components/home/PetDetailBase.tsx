import { Modal, ScrollView, Text, TouchableOpacity, View, Image, Animated, PanResponder, useWindowDimensions } from "react-native";
import ViewShot from "react-native-view-shot";
import { Ionicons } from "@expo/vector-icons";
import { type RefObject, type ReactNode, useRef, useState, useEffect } from "react";
import { type EdgeInsets } from "react-native-safe-area-context";
import { CloseCircle } from "@/components/CloseCircle";
import type { HomeStyles } from "@/app/(tabs)/index";
import { Colors } from "@/constants/theme";
import { type PetRecord } from "@/lib/storage";

export interface BarAction {
  key: string;
  icon: string;
  label: string;
  color: string;
  primary?: boolean;
  iconColor?: string;
  textColor?: string;
  bgColor?: string;
  reportedDisabled?: boolean;
  onPress: () => void;
}

export interface PetModalProps {
  selectedPet: PetRecord | null;
  setSelectedPet: (p: PetRecord | null) => void;
  insets: EdgeInsets;
  styles: HomeStyles;
  themeColors: typeof Colors.light;
  openInViewer: (images: string[], index: number) => void;
  formatLostDate: (iso?: string) => string | null;
  isOwner: (pet: PetRecord, myDeviceId: string, myPhone: string) => boolean;
  myDeviceId: string;
  myPhone: string;
  handleContact: (p: PetRecord) => void;
  reportPet: (p: PetRecord) => void;
  sharePetCard: (p: PetRecord) => void;
  commitPets: (pets: PetRecord[]) => void;
  pets: PetRecord[];
  deletePet: (id: string) => void;
  godMode: boolean;
  setShowDescriptionModal: (v: boolean) => void;
  showDescriptionModal: boolean;
  shareCardRef: RefObject<ViewShot>;
}

export interface PetDetailBaseProps {
  selectedPet: PetRecord | null;
  setSelectedPet: (p: PetRecord | null) => void;
  insets: EdgeInsets;
  styles: HomeStyles;
  themeColors: typeof Colors.light;
  openInViewer: (images: string[], index: number) => void;
  formatLostDate: (iso?: string) => string | null;
  showDescriptionModal: boolean;
  setShowDescriptionModal: (v: boolean) => void;
  shareCardRef: RefObject<ViewShot>;
  godMode: boolean;
  // Slots preenchidos por PetLostModal / PetFoundModal
  headerExtra?: ReactNode;
  dateNode?: ReactNode;
  topActions?: BarAction[];
  secondaryActions?: BarAction[];
  extraSections?: ReactNode;
}

export function PetDetailModalBase(props: PetDetailBaseProps) {
  const {
    selectedPet,
    setSelectedPet,
    insets,
    styles,
    themeColors,
    openInViewer,
    formatLostDate,
    showDescriptionModal,
    setShowDescriptionModal,
    shareCardRef,
    godMode,
    headerExtra,
    dateNode,
    topActions,
    secondaryActions,
    extraSections,
  } = props;

  const { height: windowHeight } = useWindowDimensions();
  const isSmall = windowHeight < 720;
  const [showMore, setShowMore] = useState(false);
  const sheetY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    setShowMore(false);
  }, [selectedPet]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_evt, g) => Math.abs(g.dy) > 4,
      onPanResponderMove: (_evt, g) => {
        if (g.dy > 0) sheetY.setValue(g.dy);
      },
      onPanResponderRelease: (_evt, g) => {
        if (g.dy > 100) {
          setSelectedPet(null);
        } else {
          Animated.spring(sheetY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  const renderBtn = (item: BarAction) => {
    const disabled = item.reportedDisabled && !!selectedPet?.reported;
    const base = item.primary ? styles.demoActionBtnPrimary : styles.demoActionBtnNeutral;
    return (
      <TouchableOpacity
        key={item.key}
        style={[
          base,
          item.bgColor ? { backgroundColor: item.bgColor, borderWidth: 0 } : null,
          disabled && styles.demoActionBtnDisabled,
        ]}
        disabled={disabled}
        activeOpacity={0.7}
        onPress={item.onPress}
      >
        <Ionicons
          name={item.icon as any}
          size={item.primary ? 26 : 16}
          color={disabled ? "#C7C7CC" : item.primary ? "#FFFFFF" : item.iconColor ?? item.color}
        />
        <Text
          numberOfLines={1}
          adjustsFontSizeToFit={true}
          minimumFontScale={0.8}
          style={[
            styles.demoActionLabel,
            {
              color: disabled ? "#C7C7CC" : item.primary ? "#FFFFFF" : item.textColor ?? item.color,
              fontSize: item.primary ? 15 : 11,
              fontWeight: "600",
            },
          ]}
        >
          {item.label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <>
      {selectedPet !== null && (
        <>
          <Modal
            animationType="fade"
            transparent={true}
            visible={true}
            onRequestClose={() => setSelectedPet(null)}
          >
            <View
              style={[styles.demoOverlay, { justifyContent: isSmall ? "flex-start" : "flex-end" }]}
              onStartShouldSetResponder={() => true}
              onTouchStart={() => setSelectedPet(null)}
            >
              <Animated.View
                style={[
                  styles.demoSheet,
                  {
                    transform: [{ translateY: sheetY }],
                    paddingBottom: insets.bottom + (isSmall ? 6 : 16),
                    ...(isSmall ? { marginTop: insets.top + 6, maxHeight: "96%" } : {}),
                  },
                ]}
                onStartShouldSetResponder={() => true}
                onTouchStart={(e) => e.stopPropagation()}
              >
                <View {...panResponder.panHandlers} style={styles.demoSheetHandle}>
                  <View style={styles.demoSheetHandleBar} />
                </View>
                <CloseCircle
                  style={{ position: "absolute", top: 14, right: 14, zIndex: 2 }}
                  onPress={() => setSelectedPet(null)}
                />
                {headerExtra}
                <View style={styles.reportImageWrap}>
                  <View style={{ alignItems: 'center' }}>
                     <View style={{ backgroundColor: themeColors.card, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: themeColors.cardStroke, shadowColor: themeColors.text, shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, alignSelf: 'center' }}>
                      <View style={{ flexDirection: "row", gap: 8 }}>
                        {selectedPet.images.map((img, idx) => (
                          <TouchableOpacity
                            key={idx}
                            activeOpacity={0.8}
                            disabled={selectedPet.reported && !godMode}
                            onPress={() => {
                              if (!selectedPet.reported || godMode) openInViewer(selectedPet.images, idx);
                            }}
                          >
                            <Image
                              source={{ uri: img }}
                              style={{ width: 80, height: 80, borderRadius: 10, backgroundColor: themeColors.card }}
                              resizeMode="cover"
                              blurRadius={selectedPet.reported && !godMode ? 18 : 0}
                            />
                          </TouchableOpacity>
                        ))}
                      </View>
                     </View>
                   </View>
                   {selectedPet.reported && !godMode ? (
                    <View style={styles.reportedBanner}>
                      <Text style={styles.reportedBannerText}>DENÚNCIA</Text>
                    </View>
                  ) : null}
                  {selectedPet.foundAt ? (
                    <View style={styles.foundBanner}>
                      <Ionicons name="checkmark-circle" size={14} color="#FFFFFF" />
                      <Text style={styles.foundBannerText}>
                        Encontrado!
                        {formatLostDate(selectedPet.foundAt)
                          ? ` · ${formatLostDate(selectedPet.foundAt)}`
                          : ""}
                      </Text>
                    </View>
                  ) : null}
                </View>
                <Text style={[styles.demoName, isSmall && { marginTop: -8, marginBottom: 0 }]}>
                  {selectedPet.name ? selectedPet.name : selectedPet.species}
                  {!selectedPet.name && selectedPet.breed ? ` - ${selectedPet.breed}` : ""}
                </Text>
                <View style={styles.demoRow}>
                  <Ionicons name="location" size={16} color={themeColors.primaryButton} />
                  <Text style={styles.demoLocation}>
                    {selectedPet.location}
                    {selectedPet.city ? ` — ${selectedPet.city}` : ""}
                  </Text>
                </View>
                {dateNode}
                {typeof selectedPet.reward === "number" && Number.isFinite(selectedPet.reward) ? (
                  <View style={[styles.demoRewardBadge, isSmall && { marginTop: 2, marginBottom: 4 }]}>
                    <Ionicons name="cash" size={16} color="#B8860B" />
                    <Text style={styles.demoRewardBadgeText}>
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
                    style={[styles.demoDescBtn, isSmall && { marginBottom: 4 }]}
                    onPress={() => setShowDescriptionModal(true)}
                    activeOpacity={0.7}
                  >
                    <Ionicons
                      name="document-text"
                      size={16}
                      color={themeColors.primaryButton}
                    />
                    <Text style={styles.demoDescBtnText} numberOfLines={1}>
                      Ver descrição
                    </Text>
                  </TouchableOpacity>
                ) : null}
                <View style={[styles.demoActionBar, isSmall && { marginTop: 8 }]}>
                  <View style={{ width: "100%" }}>
                    {extraSections}
                    {topActions && topActions.length > 0
                      ? topActions.map((a) => (
                          <View key={a.key} style={styles.demoActionRowTop}>
                            {renderBtn(a)}
                          </View>
                        ))
                      : null}
                    {secondaryActions && secondaryActions.length > 0 ? (
                      <>
                        <TouchableOpacity
                          style={styles.demoMoreToggle}
                          onPress={() => setShowMore((v) => !v)}
                          activeOpacity={0.7}
                        >
                          <Text style={styles.demoMoreToggleText}>Mais opções</Text>
                          <Ionicons
                            name={showMore ? "chevron-up" : "chevron-down"}
                            size={16}
                            color="#8E8E93"
                          />
                        </TouchableOpacity>
                        {showMore ? (
                          <View style={[styles.demoActionRow, { marginTop: 8 }]}>
                            {secondaryActions.map((item) => renderBtn(item))}
                          </View>
                        ) : null}
                      </>
                    ) : null}
                  </View>
                </View>
              </Animated.View>
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
                <Text style={styles.shareCardTag}>
                  {selectedPet.name ? `Pet perdido · ${selectedPet.name}` : "Pet perdido"}
                </Text>
              </View>
              <Image
                source={{ uri: selectedPet.images[0] }}
                style={styles.shareCardPhoto}
                resizeMode="cover"
                blurRadius={selectedPet.reported && !godMode ? 18 : 0}
              />
              {selectedPet.reported && !godMode && (
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
                  {selectedPet.latitude.toFixed(4)}, {selectedPet.longitude.toFixed(4)}
                </Text>
              </View>
              <View style={styles.shareCardFooter}>
                <View style={styles.shareCardFooterText}>
                  <Text style={styles.shareCardHelp}>
                    Ajude a encontrar!{"\n"}Compartilhe com seus contatos{"\n"}para aumentar as
                    chances. 🐾
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
            {selectedPet?.images && selectedPet.images.length > 0 ? (
              <Image
                source={{ uri: selectedPet.images[0] }}
                style={styles.descCover}
                resizeMode="cover"
              />
            ) : null}
            <View style={styles.descHeader}>
              <Ionicons
                name="document-text-outline"
                size={22}
                color={themeColors.primaryButton}
              />
              <Text style={styles.descTitle}>Descrição</Text>
              {selectedPet?.species ? (
                <Text style={styles.descSubtitle}>
                  {selectedPet.species}
                  {selectedPet.breed ? ` (${selectedPet.breed})` : ""}
                </Text>
              ) : null}
            </View>
            <ScrollView
              style={styles.descScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator={true}
            >
              <Text style={styles.descText}>{selectedPet?.description}</Text>
            </ScrollView>
            <View style={styles.descFooter}>
              {selectedPet?.city || selectedPet?.location ? (
                <View style={styles.descFooterItem}>
                  <Ionicons name="location" size={14} color="#FF3B30" />
                  <Text style={styles.descFooterText}>
                    {selectedPet.city || selectedPet.location}
                  </Text>
                </View>
              ) : null}
              {formatLostDate(selectedPet?.lostDate) ? (
                <View style={styles.descFooterItem}>
                  <Ionicons
                    name="calendar-outline"
                    size={14}
                    color={themeColors.primaryButton}
                  />
                  <Text style={styles.descFooterText}>
                    {formatLostDate(selectedPet?.lostDate)}
                  </Text>
                </View>
              ) : null}
            </View>
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
    </>
  );
}
