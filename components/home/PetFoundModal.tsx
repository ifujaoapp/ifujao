import { View, Text, TextInput, TouchableOpacity, useWindowDimensions, Image } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { useState, useEffect } from "react";
import { showAlert } from "@/src/components/AppAlert";
import { PetDetailModalBase, type BarAction, type PetModalProps } from "./PetDetailBase";
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

  if (!selectedPet) return null;

  const myLinkedClaim = pets.find(
    (p) =>
      p.postType === "lost" &&
      p.matchedPetId === selectedPet.id &&
      isOwner(p, myDeviceId, myPhone),
  );
  const myClaimConfirmed = myLinkedClaim?.matchStatus === "confirmed";

  // claimants / match proofs (finder)
  const claimantsOf = (pet: PetRecord): PetRecord[] =>
    pets.filter((p) => p.id !== pet.id && p.matchedPetId === pet.id);
  const resolveMatch = (claimant: PetRecord) => {
    commitPets(
      pets.map((p) =>
        p.id === claimant.id || p.id === selectedPet.id
          ? { ...p, matchStatus: "confirmed", dirty: true }
          : p,
      ),
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
  const claimants = isOwn && selectedPet.postType === "found" ? claimantsOf(selectedPet) : [];
  const claimantsSection =
    claimants.length > 0 ? (
      <View style={styles.claimantsBox}>
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
          return (
            <View key={c.id} style={[styles.claimantRow, { flexDirection: "column", alignItems: "stretch" }]}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                {proofImg ? (
                  <Image source={{ uri: proofImg }} style={{ width: 44, height: 44, borderRadius: 8, marginRight: 10 }} />
                ) : (
                  <View style={{ width: 44, height: 44, borderRadius: 8, marginRight: 10, backgroundColor: themeColors.card, alignItems: "center", justifyContent: "center" }}>
                    <Ionicons name="image-outline" size={20} color={themeColors.icon} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.claimantName}>
                    {c.name || c.species}
                    {c.breed ? ` (${c.breed})` : ""}
                  </Text>
                  {proof?.microchip ? (
                    <Text style={styles.claimantProof}>Microchip: {proof.microchip}</Text>
                  ) : null}
                  {proof?.proof ? (
                    <Text style={styles.claimantProof}>Obs: {proof.proof}</Text>
                  ) : null}
                  {proof?.disputed ? (
                    <Text style={styles.claimantDisputed}>Em disputa</Text>
                  ) : null}
                </View>
              </View>
              <View style={{ marginTop: 8, padding: 8, borderRadius: 8, backgroundColor: themeColors.card, borderLeftWidth: 4, borderLeftColor: levelColor }}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                  <Text style={{ color: themeColors.text, fontWeight: "700" }}>Compatibilidade</Text>
                  <Text style={{ color: levelColor, fontWeight: "700" }}>{compat.score}% · {compat.level.toUpperCase()}</Text>
                </View>
                {compat.notes.map((n, i) => (
                  <Text key={i} style={{ color: themeColors.icon, fontSize: 12, marginTop: 2 }}>• {n}</Text>
                ))}
              </View>
              <View style={{ flexDirection: "row", marginTop: 8, justifyContent: "flex-end" }}>
                <TouchableOpacity style={styles.claimantDispute} onPress={() => disputeClaimant(c)}>
                  <Ionicons name="alert-circle" size={18} color="#FF9500" />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.claimantConfirm, { marginLeft: 8 }]} onPress={() => confirmClaimant(c)}>
                  <Text style={styles.claimantConfirmText}>Confirmar</Text>
                </TouchableOpacity>
              </View>
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
    setOwnerClaimStep(null);
    setOwnerClaimLostId(null);
    setOwnerClaimProof("");
    setOwnerClaimMicrochip("");
    setOwnerClaimImage(null);
    setSelectedPet(null);
  };
  const ownerClaimSection =
    !isFound &&
    selectedPet.postType === "found" &&
    !isOwn
      ? myLostPets.length > 0
        ? (
            <View style={styles.claimantsBox}>
              <Text style={styles.claimantsTitle}>Este pode ser o seu pet?</Text>
              {                ownerClaimStep === "proof" ? (
                <View>
                  <TouchableOpacity
                    style={{ flexDirection: "row", alignItems: "center", borderWidth: 1, borderColor: themeColors.cardStroke, borderRadius: 10, padding: 10, backgroundColor: themeColors.card }}
                    onPress={pickProofImage}
                  >
                    {ownerClaimImage ? (
                      <Image source={{ uri: ownerClaimImage }} style={{ width: 48, height: 48, borderRadius: 8, marginRight: 10 }} />
                    ) : (
                      <Ionicons name="camera" size={22} color={themeColors.icon} style={{ marginRight: 10 }} />
                    )}
                    <Text style={{ color: themeColors.text, flex: 1 }}>Foto de comprovação (opcional)</Text>
                  </TouchableOpacity>
                  <View style={{ borderWidth: 1, borderColor: themeColors.cardStroke, borderRadius: 10, padding: 10, backgroundColor: themeColors.card, marginTop: 8 }}>
                    <TextInput
                      style={{ color: themeColors.text, minHeight: 40 }}
                      placeholder="Nº de microchip (9 a 15 dígitos)"
                      placeholderTextColor={themeColors.icon}
                      keyboardType="numeric"
                      value={ownerClaimMicrochip}
                      onChangeText={setOwnerClaimMicrochip}
                    />
                  </View>
                  <View style={{ borderWidth: 1, borderColor: themeColors.cardStroke, borderRadius: 10, padding: 10, backgroundColor: themeColors.card, marginTop: 8 }}>
                    <TextInput
                      style={{ color: themeColors.text, minHeight: 44, textAlignVertical: "top" }}
                      placeholder="Observações (marca única, cor, etc.)"
                      placeholderTextColor={themeColors.icon}
                      value={ownerClaimProof}
                      onChangeText={setOwnerClaimProof}
                      multiline
                    />
                  </View>
                  <TouchableOpacity
                    style={{ backgroundColor: themeColors.primaryButton, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, alignItems: "center", marginTop: 8 }}
                    disabled={ownerClaimUploading}
                    onPress={submitOwnerClaim}
                  >
                    <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>
                      {ownerClaimUploading ? "Enviando..." : "Enviar comprovante"}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ alignItems: "center", paddingVertical: 8 }}
                    onPress={() => {
                      setOwnerClaimStep(null);
                      setOwnerClaimLostId(null);
                      setOwnerClaimProof("");
                      setOwnerClaimMicrochip("");
                      setOwnerClaimImage(null);
                    }}
                  >
                    <Text style={{ color: themeColors.icon }}>Voltar</Text>
                  </TouchableOpacity>
                </View>
              ) : ownerClaimStep === "pick" ? (
                myLostPets.map((lp) => (
                  <TouchableOpacity
                    key={lp.id}
                    style={styles.claimantRow}
                    onPress={() => {
                      setOwnerClaimLostId(lp.id);
                      setOwnerClaimStep("proof");
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.claimantName}>
                        {lp.name || lp.species}
                        {lp.breed ? ` (${lp.breed})` : ""}
                      </Text>
                    </View>
                    <Text style={styles.claimantConfirmText}>Este</Text>
                  </TouchableOpacity>
                ))
              ) : (
                <TouchableOpacity
                  style={{ backgroundColor: themeColors.primaryButton, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, alignItems: "center" }}
                  onPress={() => {
                    if (myLostPets.length === 1) {
                      setOwnerClaimLostId(myLostPets[0].id);
                      setOwnerClaimStep("proof");
                    } else {
                      setOwnerClaimStep("pick");
                    }
                  }}
                >
                  <Text style={{ color: "#FFFFFF", fontWeight: "700" }}>É o seu pet?</Text>
                </TouchableOpacity>
              )}
            </View>
          )
        : (
              <View style={{ backgroundColor: themeColors.card, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', borderLeftWidth: 4, borderLeftColor: '#FFCC00' }}>
                <Ionicons name="alert-circle" size={20} color="#FFCC00" />
                <Text style={{ color: themeColors.text, fontWeight: '700', marginLeft: 8, fontSize: 13 }}>Registre um pet perdido para reivindicar este pet encontrado</Text>
              </View>
          )
      : null;

  const ownerClaimStatusSection =
    !isFound &&
    selectedPet.postType === "found" &&
    !isOwn &&
    !!myLinkedClaim
      ? (
        <View style={styles.claimantsBox}>
          <Text style={styles.claimantsTitle}>
            {myClaimConfirmed
              ? "Reivindicação confirmada pelo finder"
              : "Reivindicação enviada — aguarde confirmação do finder"}
          </Text>
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

  const dateNode = formatLostDate(selectedPet.foundDate) ? (
    <View style={[styles.demoRow, isSmall && { marginBottom: 4 }]}>
      <Ionicons name="calendar" size={16} color={themeColors.primaryButton} />
      <Text style={styles.demoDate}>Encontrado em {formatLostDate(selectedPet.foundDate)}</Text>
    </View>
  ) : null;

  return (
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
          {ownerClaimSection}
          {claimantsSection}
        </>
      }
    />
  );
}
