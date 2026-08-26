import { Modal, ScrollView, Text, TouchableOpacity, View, Image, Animated, PanResponder, useWindowDimensions } from "react-native";
import ViewShot from "react-native-view-shot";
import { Ionicons } from "@expo/vector-icons";
import { type RefObject, useRef } from "react";
import { type EdgeInsets } from "react-native-safe-area-context";
import { HelpFindBanner } from "./HelpFindBanner";
import { ImageCarousel } from "./ImageCarousel";
import type { HomeStyles } from "@/app/(tabs)/index";
import { CloseCircle } from "@/components/CloseCircle";
import { Colors } from "@/constants/theme";
import { formatLostDate, isOwner } from "@/constants/breeds";
import { type PetRecord } from "@/lib/storage";

export interface PetDetailModalProps {
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
  handleContact: (pet: PetRecord) => void | Promise<void>;
  reportPet: (pet: PetRecord) => void;
  sharePetCard: (pet: PetRecord) => void;
  commitPets: (pets: PetRecord[]) => void;
  pets: PetRecord[];
  deletePet: (id: string) => void;
  godMode: boolean;
  setShowDescriptionModal: (v: boolean) => void;
  showDescriptionModal: boolean;
  shareCardRef: RefObject<ViewShot>;
}

export function PetDetailModal(props: PetDetailModalProps) {
  const {
    selectedPet,
    setSelectedPet,
    insets,
    styles,
    themeColors,
    openInViewer,
    formatLostDate,
    isOwner,
    myDeviceId,
    myPhone,
    handleContact,
    reportPet,
    sharePetCard,
    commitPets,
    pets,
    deletePet,
    godMode,
    setShowDescriptionModal,
    showDescriptionModal,
      shareCardRef,
    } = props;

  // BottomSheet: anima o painel para cima/baixo e permite dispensá-lo arrastando
  // o "pegador" (handle) para baixo.
  const sheetY = useRef(new Animated.Value(0)).current;
  const { height: windowHeight } = useWindowDimensions();
  const isSmall = windowHeight < 720;
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
                      ...(isSmall
                        ? { marginTop: insets.top + 6, maxHeight: "96%" }
                        : {}),
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
                {selectedPet.foundAt ? null : <HelpFindBanner styles={styles} />}
                <View style={styles.reportImageWrap}>
                  <ImageCarousel
                    images={selectedPet.images}
                    blurRadius={selectedPet.reported && !godMode ? 18 : 0}
                    onPressImage={(imgs, idx) => {
                      if (!selectedPet.reported || godMode) openInViewer(imgs, idx);
                    }}
                  />
                  {selectedPet.reported && !godMode ? (
                    <View style={styles.reportedBanner}>
                      <Text style={styles.reportedBannerText}>DENÚNCIA</Text>
                    </View>
                  ) : null}
                  {selectedPet.foundAt ? (
                    <View style={styles.foundBanner}>
                      <Ionicons
                        name="checkmark-circle"
                        size={14}
                        color="#FFFFFF"
                      />
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
                  {selectedPet.name
                    ? selectedPet.name
                    : selectedPet.species}
                  {!selectedPet.name && selectedPet.breed
                    ? ` - ${selectedPet.breed}`
                    : ""}
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
                  <View style={[styles.demoRow, isSmall && { marginBottom: 4 }]}>
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
                    <Text style={styles.demoDescBtnText}>Ver descrição</Text>
                  </TouchableOpacity>
                ) : null}
                <View style={[styles.demoActionBar, isSmall && { marginTop: 8 }]}>
                  {(() => {
                    type BarAction = {
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
                    };
                    const isOwn = isOwner(selectedPet, myDeviceId, myPhone);
                    const isFound = !!selectedPet.foundAt;
                    let contact: BarAction | null = null;
                    let topFound: BarAction | null = null;
                    const secondary: BarAction[] = [];

                    if (isFound) {
                      // Pet REENCONTRADO: nenhuma ação de busca faz sentido.
                      // Dono/modo deus podem desfazer (desmarcar) ou apagar de vez.
                      if (isOwn || godMode) {
                        topFound = {
                          key: "unfound",
                          icon: "close-circle",
                          label: "Desmarcar encontrado",
                          color: "#8E8E93",
                          iconColor: "#FFFFFF",
                          textColor: "#FFFFFF",
                          bgColor: "#8E8E93",
                          primary: true,
                          onPress: () => {
                            const id = selectedPet.id;
                            commitPets(
                              pets.map((p) =>
                                p.id === id
                                  ? { ...p, foundAt: undefined, dirty: true }
                                  : p,
                              ),
                            );
                            setSelectedPet(null);
                          },
                        };
                        secondary.push({
                          key: "delete",
                          icon: "trash",
                          label: godMode && !isOwn ? "Apagar (mod)" : "Apagar",
                          color: "#FF3B30",
                          iconColor: "#FF3B30",
                          textColor: "#FF3B30",
                          onPress: () => deletePet(selectedPet.id),
                        } as BarAction);
                      }
                      // Finder (não dono, não deus): nenhum botão.
                    } else {
                      // Pet ainda perdido: ações normais.
                      contact = isOwn
                        ? null
                        : {
                            key: "contact",
                            icon: "logo-whatsapp",
                            label: "Contatar tutor",
                            color: "#128C7E",
                            primary: true,
                            reportedDisabled: true,
                            onPress: () => {
                              const pet = selectedPet;
                              setSelectedPet(null);
                              handleContact(pet);
                            },
                          };
                      if (!selectedPet.reported && !isOwn) {
                        secondary.push({
                          key: "report",
                          icon: "flag",
                          label: "Denunciar",
                          color: "#FF9500",
                          iconColor: "#FF9500",
                          textColor: "#48484A",
                          onPress: () => reportPet(selectedPet),
                        } as BarAction);
                      }
                      secondary.push({
                        key: "share",
                        icon: "share-social",
                        label: "Compartilhar",
                        color: "#6E6E73",
                        iconColor: "#6E6E73",
                        textColor: "#48484A",
                        reportedDisabled: true,
                        onPress: () => sharePetCard(selectedPet),
                      });
                      if (isOwn || godMode) {
                        secondary.push({
                          key: "delete",
                          icon: "trash",
                          label: godMode && !isOwn ? "Apagar (mod)" : "Apagar",
                          color: "#FF3B30",
                          iconColor: "#FF3B30",
                          textColor: "#FF3B30",
                          onPress: () => deletePet(selectedPet.id),
                        } as BarAction);
                      }
                      if (
                        selectedPet.reported &&
                        !!myDeviceId &&
                        selectedPet.reporterDeviceId === myDeviceId
                      ) {
                        secondary.push({
                          key: "undoReport",
                          icon: "flag",
                          label: "Apagar denúncia",
                          color: "#0A84FF",
                          iconColor: "#0A84FF",
                          textColor: "#0A84FF",
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
                        } as BarAction);
                      }
                      // Marcar como encontrado: dono/modo deus.
                      if (isOwn || godMode) {
                        const foundAction: BarAction = {
                          key: "found",
                          icon: "checkmark-circle",
                          label: "Marcar como encontrado",
                          color: "#34C759",
                          iconColor: "#FFFFFF",
                          textColor: "#FFFFFF",
                          bgColor: "#34C759",
                          primary: isOwn,
                          onPress: () => {
                            const id = selectedPet.id;
                            commitPets(
                              pets.map((p) =>
                                p.id === id
                                  ? {
                                      ...p,
                                      foundAt: new Date().toISOString(),
                                      dirty: true,
                                    }
                                  : p,
                              ),
                            );
                            setSelectedPet(null);
                          },
                        };
                        if (isOwn) topFound = foundAction;
                        else secondary.push(foundAction);
                      }
                    }
                    const renderBtn = (item: BarAction) => {
                      const disabled =
                        item.reportedDisabled && selectedPet.reported;
                      const base = item.primary
                        ? styles.demoActionBtnPrimary
                        : styles.demoActionBtnNeutral;
                      return (
                        <TouchableOpacity
                          key={item.key}
                          style={[
                            base,
                            item.bgColor
                              ? { backgroundColor: item.bgColor, borderWidth: 0 }
                              : null,
                            disabled && styles.demoActionBtnDisabled,
                          ]}
                          disabled={disabled}
                          activeOpacity={0.7}
                          onPress={item.onPress}
                        >
                          <Ionicons
                            name={item.icon as any}
                            size={item.primary ? 26 : 16}
                            color={
                              disabled
                                ? "#C7C7CC"
                                : item.primary
                                ? "#FFFFFF"
                                : item.iconColor ?? item.color
                            }
                          />
                          <Text
                            numberOfLines={1}
                            adjustsFontSizeToFit={true}
                            minimumFontScale={0.8}
                            style={[
                              styles.demoActionLabel,
                              {
                                color: disabled
                                  ? "#C7C7CC"
                                  : item.primary
                                  ? "#FFFFFF"
                                  : item.textColor ?? item.color,
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
                      <View>
                        {contact ? (
                          <View style={styles.demoActionRowTop}>{renderBtn(contact)}</View>
                        ) : null}
                        {topFound ? (
                          <View style={styles.demoActionRowTop}>{renderBtn(topFound)}</View>
                        ) : null}
                        {secondary.length > 0 ? (
                          <View style={styles.demoActionRow}>
                            {secondary.map((item) => renderBtn(item))}
                          </View>
                        ) : null}
                      </View>
                    );
                  })()}
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
                  {selectedPet.name
                    ? `Pet perdido · ${selectedPet.name}`
                    : "Pet perdido"}
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
