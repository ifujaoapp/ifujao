import { View, Text, TextInput, TouchableOpacity, useWindowDimensions, Image, Modal, KeyboardAvoidingView, Platform } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useState, useEffect, useRef, useMemo } from "react";
import { showAlert } from "@/src/components/AppAlert";
import { PetDetailModalBase, type BarAction, type PetModalProps } from "./PetDetailBase";
import { CloseCircle } from "@/components/CloseCircle";
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
import {
  getMatchProof,
  setMatchProofDisputed,
  upsertMatchProof,
  uploadMatchProofImage,
  getProofImageSignedUrl,
  type MatchProof,
} from "@/lib/matchProofs";
import { computeMatchCompat } from "@/lib/matchScore";
import { confirmMatch } from "@/lib/confirmMatch";
import { type PetRecord } from "@/lib/storage";

export function PetFoundModal(props: PetModalProps) {
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

  const [ownerClaimStep, setOwnerClaimStep] = useState<null | "pick" | "proof">(null);
  const [ownerClaimLostId, setOwnerClaimLostId] = useState<string | null>(null);
  const [ownerClaimProof, setOwnerClaimProof] = useState("");
  const [ownerClaimMicrochip, setOwnerClaimMicrochip] = useState("");
  const [ownerClaimImage, setOwnerClaimImage] = useState<string | null>(null);
  const [ownerClaimUploading, setOwnerClaimUploading] = useState(false);
  const [claimantProofs, setClaimantProofs] = useState<Record<string, MatchProof>>({});
  const [claimantProofImages, setClaimantProofImages] = useState<Record<string, string>>({});
  const [expandedClaimantId, setExpandedClaimantId] = useState<string | null>(null);
  const [claimSheetVisible, setClaimSheetVisible] = useState(false);

  const isOwn = !!selectedPet && isOwner(selectedPet, myDeviceId, myPhone);
  const isFound = !!selectedPet?.foundAt;

  useEffect(() => {
    if (!selectedPet || selectedPet.postType !== "found") return;
    if (!isOwn) return;
    let cancelled = false;
    (async () => {
      const cs = pets.filter(
        (p) => p.id !== selectedPet.id && p.matchedPetId === selectedPet.id,
      );
      const loaded = await Promise.all(
        cs.map(async (c) => [c.id, await getMatchProof(c.id)] as const),
      );
      if (cancelled) return;
      const proofs = Object.fromEntries(
        loaded.filter(([, v]) => v !== null) as [string, MatchProof][],
      );
      setClaimantProofs(proofs);
      const urls = await Promise.all(
        Object.entries(proofs).map(
          async ([id, p]) =>
            [id, p.proof_image ? await getProofImageSignedUrl(p.proof_image) : null] as const,
        ),
      );
      if (!cancelled) {
        setClaimantProofImages(
          Object.fromEntries(urls.filter(([, v]) => v !== null) as [string, string][]),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPet, isOwn, myDeviceId, myPhone, pets]);

  // claimants / match proofs (finder)
  const claimantsOf = (pet: PetRecord): PetRecord[] =>
    pets.filter((p) => p.id !== pet.id && p.matchedPetId === pet.id);

  const claimants = useMemo(
    () => (isOwn && selectedPet?.postType === "found" ? pets.filter((p) => p.id !== selectedPet.id && p.matchedPetId === selectedPet.id && p.matchStatus === "pending") : []),
    [isOwn, selectedPet, pets],
  );

  const hasAutoExpanded = useRef(false);

  useEffect(() => {
    if (!hasAutoExpanded.current && claimants.length > 0) {
      hasAutoExpanded.current = true;
      setExpandedClaimantId(claimants[0].id);
    }
  }, [claimants]);

  if (!selectedPet) return null;

  const myLinkedClaim = pets.find(
    (p) =>
      p.postType === "lost" &&
      p.matchedPetId === selectedPet.id &&
      isOwner(p, myDeviceId, myPhone),
  );
  const myClaimConfirmed = myLinkedClaim?.matchStatus === "confirmed";

  const resolveMatch = (claimant: PetRecord) => {
    // Atualiza localmente (UI imediata)
    // O pet encontrado (selectedPet) é do finder → marca dirty para o sync pushar
    // O pet perdido (claimant) é do dono → dirty=false (o sync não pode pushar,
    // a Edge Function cuida do servidor)
    commitPets(
      pets.map((p) =>
        p.id === selectedPet.id
          ? { ...p, matchStatus: "confirmed", dirty: true }
          : p.id === claimant.id
            ? { ...p, matchStatus: "confirmed", dirty: false }
            : p,
      ),
    );
    // Chama Edge Function para confirmar ambos os pets no servidor
    // (bypassa RLS com service_role)
    confirmMatch(selectedPet.id, claimant.id).catch((e) =>
      console.warn("[confirmMatch] falhou:", e),
    );
  };
  const disputeClaimant = (claimant: PetRecord) => {
    setMatchProofDisputed(claimant.id, true);
    setClaimantProofs((prev) => ({
      ...prev,
      [claimant.id]: {
        ...(prev[claimant.id] ?? ({ pet_id: claimant.id } as MatchProof)),
        disputed: true,
      },
    }));
  };
  const confirmClaimant = (claimant: PetRecord) => {
    resolveMatch(claimant);
    claimantsOf(selectedPet)
      .filter((c) => c.id !== claimant.id)
      .forEach((c) => disputeClaimant(c));
    setSelectedPet(null);
  };

  const claimantsSection =
    claimants.length > 0 ? (
      <View style={styles.claimantsBox}>
        <View style={{ backgroundColor: themeColors.primaryButton, borderRadius: 12, padding: 16, marginBottom: 16, flexDirection: "row", alignItems: "center", gap: 12 }}>
          <Ionicons name="alert-circle" size={24} color="#FFFFFF" />
          <Text style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 15, flex: 1 }}>
            🔔 Você tem {claimants.length === 1 ? "1 reivindicação pendente" : `${claimants.length} reivindicações pendentes`}. Confirme se é o pet correto.
          </Text>
        </View>
        <Text style={styles.claimantsTitle}>
          {claimants.length === 1
            ? "1 tutor reconheceu este pet"
            : `${claimants.length} tutores reconheceram este pet`}
        </Text>
        {claimants.map((c) => {
          const proof = claimantProofs[c.id];
          const proofImg = claimantProofImages[c.id];
          const compat = computeMatchCompat(c, selectedPet);
          const levelColor =
            compat.level === "alta" ? "#34C759" : compat.level === "media" ? "#FF9500" : "#FF3B30";
          const expanded = expandedClaimantId === c.id;
          return (
            <View key={c.id} style={[styles.claimantRow, { flexDirection: "column", alignItems: "stretch" }]}>
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "center" }}
                onPress={() => setExpandedClaimantId(expanded ? null : c.id)}
              >
                {proofImg ? (
                  <Image source={{ uri: proofImg }} style={{ width: 36, height: 36, borderRadius: 8, marginRight: 10 }} />
                ) : (
                  <View style={{ width: 36, height: 36, borderRadius: 8, marginRight: 10, backgroundColor: themeColors.card, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="image-outline" size={18} color={themeColors.icon} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.claimantName}>
                    {c.name || c.species}
                    {c.breed ? ` (${c.breed})` : ""}
                  </Text>
                  <View style={{ marginTop: 3 }}>
                    <View style={{ backgroundColor: levelColor, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, alignSelf: "flex-start" }}>
                      <Text style={{ color: "#FFFFFF", fontSize: 11, fontWeight: "700" }}>
                        {compat.score}% {compat.level.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </View>
                <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={themeColors.icon} />
              </TouchableOpacity>
              {expanded ? (
                <View style={{ marginTop: 8 }}>
                  {proofImg ? (
                    <Image source={{ uri: proofImg }} style={{ width: 120, height: 120, borderRadius: 10, marginBottom: 8 }} />
                  ) : null}
                  {proof?.microchip ? (
                    <Text style={styles.claimantProof}>Microchip: {proof.microchip}</Text>
                  ) : null}
                  {proof?.proof ? (
                    <Text style={styles.claimantProof}>Obs: {proof.proof}</Text>
                  ) : null}
                  {proof?.disputed ? (
                    <Text style={styles.claimantDisputed}>Em disputa</Text>
                  ) : null}
                  {compat.notes.map((n, i) => (
                    <Text key={i} style={{ color: themeColors.icon, fontSize: 12, marginTop: 2 }}>
                      • {n}
                    </Text>
                  ))}
                  <View style={{ flexDirection: "row", marginTop: 8, justifyContent: "flex-end" }}>
                    <TouchableOpacity style={styles.claimantDispute} onPress={() => disputeClaimant(c)}>
                      <Ionicons name="alert-circle" size={18} color="#FF9500" />
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.claimantConfirm, { marginLeft: 8 }]} onPress={() => confirmClaimant(c)}>
                      <Text style={styles.claimantConfirmText}>Confirmar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    ) : null;

  // reivindicação verificada (não-finder)
  const myLostPets = pets.filter(
    (p) =>
      p.postType === "lost" &&
      isOwner(p, myDeviceId, myPhone),
  );

  const pickProofImage = async () => {
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
      allowsMultipleSelection: false,
    });
    if (!result.canceled && result.assets.length) {
      setOwnerClaimImage(result.assets[0].uri);
    }
  };

  const submitOwnerClaim = async () => {
    const lostId = ownerClaimLostId;
    const notes = ownerClaimProof.trim();
    const micro = ownerClaimMicrochip.replace(/\D/g, "");
    if (!lostId) return;
    if (!ownerClaimImage && !micro && !notes) {
      showAlert(
        "warning",
        "Atenção",
        "Anexe uma foto de comprovação ou informe o microchip/observações.",
      );
      return;
    }
    if (micro && (micro.length < 9 || micro.length > 15)) {
      showAlert(
        "warning",
        "Atenção",
        "O nº de microchip deve ter entre 9 e 15 dígitos.",
      );
      return;
    }
    const lostPet = pets.find((p) => p.id === lostId);
    if (!lostPet) return;
    setOwnerClaimUploading(true);
    let proofImage: string | null = null;
    if (ownerClaimImage) {
      proofImage = await uploadMatchProofImage(ownerClaimImage, myDeviceId ?? "");
    }
    commitPets(
      pets.map((p) =>
        p.id === lostId
          ? {
              ...p,
              matchedPetId: selectedPet.id,
              matchStatus: "pending",
              matchRequestedBy: "owner",
              dirty: true,
            }
          : p,
      ),
    );
    await upsertMatchProof(
      lostPet,
      selectedPet,
      { microchip: micro, proofImage, notes },
      myDeviceId ?? "",
    );
    setOwnerClaimUploading(false);
    closeClaimSheet();
    setSelectedPet(null);
  };
  const closeClaimSheet = () => {
    setClaimSheetVisible(false);
    setOwnerClaimStep(null);
    setOwnerClaimLostId(null);
    setOwnerClaimProof("");
    setOwnerClaimMicrochip("");
    setOwnerClaimImage(null);
  };
  const openClaimSheet = () => {
    if (myLostPets.length === 1) {
      setOwnerClaimLostId(myLostPets[0].id);
      setOwnerClaimStep("proof");
    } else {
      setOwnerClaimStep("pick");
    }
    setClaimSheetVisible(true);
  };

  const speciesEmoji: Record<string, string> = {
  Cachorro: "🐶",
  Gato: "🐱",
  Calopsita: "🐦",
  Passaro: "🐦",
  Coelho: "🐰",
  Hamster: "🐹",
  Peixe: "🐠",
  Tartaruga: "🐢",
  Cobra: "🐍",
  Lagarto: "🦎",
  Cavalo: "🐴",
  Cabra: "🐐",
  Ovelha: "🐑",
  Porco: "🐷",
  Galinha: "🐔",
  Pato: "🦆",
  Coala: "🐨",
  Panda: "🐼",
  Urso: "🐻",
  Leão: "🦁",
  Tigre: "🐯",
  Elefante: "🐘",
  Macaco: "🐵",
  Sapo: "🐸",
};

const getSpeciesEmoji = (species: string): string => {
  return speciesEmoji[species] || "🐾";
};

const isDateInconsistent = (lostDate?: string, foundDate?: string): boolean => {
  if (!lostDate || !foundDate) return false;
  const lost = new Date(lostDate).getTime();
  const found = new Date(foundDate).getTime();
  if (isNaN(lost) || isNaN(found)) return false;
  return lost > found;
};

const formatDisappearedWhen = (date?: string): string => {
  if (!date) return "";
  const d = new Date(date);
  if (isNaN(d.getTime())) return "";
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear();
  return ` • ${day}/${month}/${year}`;
};

  const showClaimUI = !isFound && selectedPet.postType === "found" && !isOwn;

  // Gatilho compacto dentro do card de pet (abre a sheet dedicada).
  const ownerClaimTrigger =
    showClaimUI && !myLinkedClaim
      ? myLostPets.length > 0
        ? (
          <TouchableOpacity
            style={{ backgroundColor: themeColors.primaryButton, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, alignItems: "center" }}
            onPress={openClaimSheet}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>É o seu pet?</Text>
          </TouchableOpacity>
        )
        : (
          <View style={{ backgroundColor: themeColors.card, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", borderLeftWidth: 4, borderLeftColor: "#FFCC00" }}>
            <Ionicons name="alert-circle" size={20} color="#FFCC00" />
            <Text style={{ color: themeColors.text, fontWeight: "700", marginLeft: 8, fontSize: 13 }}>
              Registre um pet perdido para reivindicar este pet encontrado
            </Text>
          </View>
        )
      : null;

  // Fluxo pesado de reclamação — exibido numa sheet própria (fora do card).
  const claimSheetInner = showClaimUI ? (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
        <Ionicons name="paw" size={18} color={themeColors.primaryButton} style={{ marginRight: 8 }} />
        <Text style={[styles.sectionTitle, { textAlign: "center" }]}>Este pode ser o seu pet?</Text>
      </View>
      {ownerClaimStep === "proof" ? (
        <View>
          <Text style={styles.fieldLabel}>Foto de comprovação (opcional)</Text>
          <TouchableOpacity
            style={[styles.input, { flexDirection: "row", alignItems: "center", marginBottom: 15 }]}
            onPress={pickProofImage}
          >
            {ownerClaimImage ? (
              <Image source={{ uri: ownerClaimImage }} style={{ width: 48, height: 48, borderRadius: 8, marginRight: 10 }} />
            ) : (
              <Ionicons name="camera" size={22} color={themeColors.icon} style={{ marginRight: 10 }} />
            )}
            <Text style={{ color: themeColors.text, flex: 1 }}>Anexar foto</Text>
          </TouchableOpacity>
          <Text style={styles.fieldLabel}>Microchip (opcional, 9 a 15 dígitos)</Text>
          <TextInput
            style={styles.input}
            placeholder="Ex.: 123456789012345"
            placeholderTextColor={themeColors.icon}
            keyboardType="numeric"
            value={ownerClaimMicrochip}
            onChangeText={setOwnerClaimMicrochip}
          />
          <Text style={styles.fieldLabel}>Observações</Text>
          <TextInput
            style={[styles.input, { height: 90, textAlignVertical: "top" }]}
            placeholder="Marca única, cor, local, etc."
            placeholderTextColor={themeColors.icon}
            value={ownerClaimProof}
            onChangeText={setOwnerClaimProof}
            multiline
          />
          <TouchableOpacity
            style={{ backgroundColor: themeColors.primaryButton, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 4 }}
            disabled={ownerClaimUploading}
            onPress={submitOwnerClaim}
          >
            <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
              {ownerClaimUploading ? "Enviando..." : "Enviar comprovante"}
            </Text>
          </TouchableOpacity>
        </View>
        ) : ownerClaimStep === "pick" ? (
        myLostPets.map((lp) => {
          const dateConflict = isDateInconsistent(lp.lostDate, selectedPet.foundDate);
          const speciesMismatch = lp.species && selectedPet.species && lp.species !== selectedPet.species;
          return (
            <TouchableOpacity
              key={lp.id}
              style={[styles.claimantRow, { marginBottom: 8 }]}
              onPress={() => {
                setOwnerClaimLostId(lp.id);
                setOwnerClaimStep("proof");
              }}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.claimantName}>
                  {getSpeciesEmoji(lp.species)} {lp.name || lp.species}{lp.breed ? ` (${lp.breed})` : ""}
                </Text>
                <Text style={{ color: themeColors.icon, fontSize: 12, marginTop: 2 }}>
                  Desapareceu em{formatDisappearedWhen(lp.lostDate)}
                </Text>
                {speciesMismatch && (
                  <Text style={{ color: "#FF9500", fontSize: 11, marginTop: 4, fontWeight: "600" }}>
                    ⚠️ Espécie diferente: seu pet é {lp.species} e o pet encontrado é {selectedPet.species}.
                  </Text>
                )}
                {dateConflict && (
                  <Text style={{ color: "#FF9500", fontSize: 11, marginTop: 4, fontWeight: "600" }}>
                    ⚠️ A data que este pet sumiu é posterior à data que o pet encontrado foi visto.
                  </Text>
                )}
              </View>
              <Text style={styles.claimantConfirmText}>Este</Text>
            </TouchableOpacity>
          );
        })
      ) : (
        <TouchableOpacity
          style={{ backgroundColor: themeColors.primaryButton, borderRadius: 12, paddingVertical: 14, alignItems: "center" }}
          onPress={openClaimSheet}
        >
          <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>É o seu pet?</Text>
        </TouchableOpacity>
      )}
    </View>
  ) : null;

  const ownerClaimStatusSection =
    !isFound &&
    selectedPet.postType === "found" &&
    !isOwn &&
    !!myLinkedClaim
      ? (
          <View style={styles.claimantsBox}>
            <View
              style={{
                backgroundColor: myClaimConfirmed ? "#34C759" : "#FF9500",
                borderRadius: 12,
                paddingVertical: 10,
                paddingHorizontal: 14,
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
              }}
            >
              <Ionicons
                name={myClaimConfirmed ? "checkmark-circle" : "time-outline"}
                size={20}
                color="#FFFFFF"
              />
              <Text
                style={{ color: "#FFFFFF", fontWeight: "700", fontSize: 13, flex: 1 }}
                numberOfLines={2}
              >
                {myClaimConfirmed
                  ? "✓ Reivindicação confirmada por quem encontrou!"
                  : "Reivindicação enviada — aguarde confirmação de quem encontrou"}
              </Text>
            </View>
          </View>
        )
      : null;

  const ctx: PetActionCtx = {
    selectedPet,
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

  const contact = buildContactAction(
    ctx,
    "Entrar em contato com quem encontrou",
    isFound || !myClaimConfirmed,
  );

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
    if (claimants.length > 0) {
      topActions.push({
        key: "pendingClaims",
        icon: "alert-circle",
        label: "Confirme as reivindicações pendentes",
        color: "#FF9500",
        iconColor: "#FF9500",
        textColor: "#FF9500",
        reportedDisabled: true,
        onPress: () => {},
        disabled: true,
      });
    } else {
      const fm = buildFoundMarkAction(ctx);
      if (fm.top) topActions.push(fm.top);
    }
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

  const dateNode = formatLostDate(selectedPet.foundDate) ? (
    <View style={[styles.demoRow, isSmall && { marginBottom: 4 }]}>
      <Ionicons name="calendar" size={16} color={themeColors.primaryButton} />
      <Text style={styles.demoDate}>Encontrado em {formatLostDate(selectedPet.foundDate)}</Text>
    </View>
  ) : null;

  return (
    <>
      <PetDetailModalBase
      selectedPet={selectedPet}
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
      headerExtra={null}
      dateNode={dateNode}
      topActions={topActions}
      secondaryActions={secondary}
      extraSections={
        <>
          {ownerClaimStatusSection}
          {ownerClaimTrigger}
          {claimantsSection}
        </>
      }
      claimSheet={
        claimSheetVisible && showClaimUI ? (
          <Modal
            visible={true}
            transparent
            animationType="slide"
            onRequestClose={closeClaimSheet}
            statusBarTranslucent
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={{ flex: 1, justifyContent: "flex-end" }}
            >
              <TouchableOpacity
                style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.45)" }}
                activeOpacity={1}
                onPress={closeClaimSheet}
              />
              <View
                style={{
                  backgroundColor: themeColors.card,
                  padding: 16,
                  borderTopLeftRadius: 16,
                  borderTopRightRadius: 16,
                  borderTopWidth: 1,
                  borderColor: themeColors.cardStroke,
                  maxHeight: "80%",
                }}
              >
                <CloseCircle
                  style={{ position: "absolute", top: 14, right: 14, zIndex: 2, backgroundColor: themeColors.text === "#FFFFFF" ? "rgba(255,255,255,0.22)" : "rgba(0,0,0,0.5)" }}
                  onPress={closeClaimSheet}
                />
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  nestedScrollEnabled={true}
                  automaticallyAdjustContentInsets={false}
                  contentContainerStyle={{ paddingBottom: Platform.OS === "ios" ? 80 : 64 }}
                >
                  {claimSheetInner}
                </ScrollView>
              </View>
            </KeyboardAvoidingView>
          </Modal>
        ) : null
      }
     />
     </>
   );
 }
