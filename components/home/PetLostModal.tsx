import { View, Text, useWindowDimensions } from "react-native";
import { useMemo } from "react";
import { Ionicons } from "@expo/vector-icons";
import { PetDetailModalBase, type BarAction, type PetModalProps } from "./PetDetailBase";
import { HelpFindBanner } from "./HelpFindBanner";
import {
  buildShareAction,
  buildReportAction,
  buildDeleteAction,
  buildUndoReportAction,
  buildFoundMarkAction,
  buildContactAction,
  buildUnfoundAction,
  type PetActionCtx,
} from "./petModalActions";

export function PetLostModal(props: PetModalProps) {
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

  const { height: windowHeight } = useWindowDimensions();
  const isSmall = windowHeight < 720;

  const isOwn = !!selectedPet && isOwner(selectedPet, myDeviceId, myPhone);
  const isFound = !!selectedPet?.foundAt;

  // Calcula se o pet foi confirmado como devolvido ao dono
  const confirmedPet = useMemo(() => {
    if (!selectedPet) return selectedPet;
    if (selectedPet.postType !== 'found') return selectedPet;
    const isConfirmed = pets.some(
      (p) => p.postType !== 'found' && p.matchedPetId === selectedPet.id && p.matchStatus === 'confirmed',
    );
    return { ...selectedPet, confirmed: isConfirmed };
  }, [selectedPet, pets]);

  if (!selectedPet) return null;

  const ctx: PetActionCtx = {
    selectedPet: confirmedPet!,
    setSelectedPet,
    pets,
    commitPets,
    isOwn,
    godMode,
    myDeviceId,
    reportPet,
    sharePetCard,
    deletePet,
    handleContact,
  };

  const contact = buildContactAction(ctx, "Contatar tutor", false);

  const topActions: BarAction[] = [];
  const secondary: BarAction[] = [];
  if (isFound) {
    if (isOwn || godMode) {
      topActions.push(buildUnfoundAction(ctx));
      const d = buildDeleteAction(ctx);
      if (d) secondary.push(d);
    }
  } else {
    if (contact) topActions.push(contact);
    const fm = buildFoundMarkAction(ctx);
    if (fm.top) topActions.push(fm.top);
    const r = buildReportAction(ctx);
    if (r) secondary.push(r);
    secondary.push(buildShareAction(ctx));
    const d = buildDeleteAction(ctx);
    if (d) secondary.push(d);
    const u = buildUndoReportAction(ctx);
    if (u) secondary.push(u);
    const fm2 = buildFoundMarkAction(ctx);
    if (fm2.secondary) secondary.push(fm2.secondary);
  }

  const headerExtra =
    selectedPet.postType === "lost" && !selectedPet.foundAt ? (
      <HelpFindBanner styles={styles} />
    ) : null;

  const dateNode = formatLostDate(selectedPet.lostDate) ? (
    <View style={[styles.demoRow, isSmall && { marginBottom: 4 }]}>
      <Ionicons name="calendar" size={16} color={themeColors.primaryButton} />
      <Text style={styles.demoDate}>Sumiu em {formatLostDate(selectedPet.lostDate)}</Text>
    </View>
  ) : null;

  return (
    <PetDetailModalBase
      selectedPet={confirmedPet!}
      setSelectedPet={setSelectedPet}
      insets={insets}
      styles={styles}
      themeColors={themeColors}
      openInViewer={openInViewer}
      formatLostDate={formatLostDate}
      showDescriptionModal={showDescriptionModal}
      setShowDescriptionModal={setShowDescriptionModal}
      shareCardRef={shareCardRef}
      godMode={godMode}
      headerExtra={headerExtra}
      dateNode={dateNode}
      topActions={topActions}
      secondaryActions={secondary}
    />
  );
}
