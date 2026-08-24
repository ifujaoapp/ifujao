import { Modal, ScrollView, Text, TouchableOpacity, View, Image } from "react-native";
import ViewShot from "react-native-view-shot";
import { Ionicons } from "@expo/vector-icons";
import { type RefObject } from "react";
import { type EdgeInsets } from "react-native-safe-area-context";
import { HelpFindBanner } from "./HelpFindBanner";
import { ImageCarousel } from "./ImageCarousel";
import type { HomeStyles } from "@/app/(tabs)/index";
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
    setShowDescriptionModal,
    showDescriptionModal,
    shareCardRef,
  } = props;
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
                <HelpFindBanner styles={styles} />
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
                    ...(jaDenunciado ||
                    isOwner(selectedPet, myDeviceId, myPhone)
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
