import { View, Text, TextInput, TouchableOpacity, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useState, useEffect } from "react";
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
import { getMatchProof, setMatchProofDisputed, upsertMatchProof, type MatchProof } from "@/lib/matchProofs";
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
  const [claimantProofs, setClaimantProofs] = useState<Record<string, MatchProof>>({});

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
      if (!cancelled) {
        setClaimantProofs(
          Object.fromEntries(
            loaded.filter(([, v]) => v !== null) as [string, MatchProof][],
          ),
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
          return (
            <View key={c.id} style={styles.claimantRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.claimantName}>
                  {c.name || c.species}
                  {c.breed ? ` (${c.breed})` : ""}
                </Text>
                {proof?.proof ? (
                  <Text style={styles.claimantProof}>Prova: {proof.proof}</Text>
                ) : null}
                {proof?.disputed ? (
                  <Text style={styles.claimantDisputed}>Em disputa</Text>
                ) : null}
              </View>
              <TouchableOpacity
                style={styles.claimantConfirm}
                onPress={() => confirmClaimant(c)}
              >
                <Text style={styles.claimantConfirmText}>Confirmar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.claimantDispute}
                onPress={() => disputeClaimant(c)}
              >
                <Ionicons name="alert-circle" size={18} color="#FF9500" />
              </TouchableOpacity>
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

  const submitOwnerClaim = async () => {
    const lostId = ownerClaimLostId;
    if (!lostId || !ownerClaimProof.trim()) return;
    const lostPet = pets.find((p) => p.id === lostId);
    if (!lostPet) return;
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
    await upsertMatchProof(lostPet, selectedPet, ownerClaimProof.trim(), myDeviceId ?? "");
    setOwnerClaimStep(null);
    setOwnerClaimLostId(null);
    setOwnerClaimProof("");
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
              {ownerClaimStep === "proof" ? (
                <View>
                  <TextInput
                    style={{ borderWidth: 1, borderColor: "#C7C7CC", borderRadius: 10, padding: 10, minHeight: 44, textAlignVertical: "top", backgroundColor: "#fff" }}
                    placeholder="Nº de microchip, foto com o pet ou marca única"
                    placeholderTextColor="#8E8E93"
                    value={ownerClaimProof}
                    onChangeText={setOwnerClaimProof}
                    multiline
                  />
                  <TouchableOpacity
                    style={{ backgroundColor: "#34C759", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, alignItems: "center", marginTop: 8 }}
                    disabled={!ownerClaimProof.trim()}
                    onPress={submitOwnerClaim}
                  >
                    <Text style={{ color: "#fff", fontWeight: "700" }}>Enviar comprovante</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ alignItems: "center", paddingVertical: 8 }}
                    onPress={() => {
                      setOwnerClaimStep(null);
                      setOwnerClaimLostId(null);
                      setOwnerClaimProof("");
                    }}
                  >
                    <Text style={{ color: "#8E8E93" }}>Voltar</Text>
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
                  style={{ backgroundColor: "#0A84FF", borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, alignItems: "center" }}
                  onPress={() => {
                    if (myLostPets.length === 1) {
                      setOwnerClaimLostId(myLostPets[0].id);
                      setOwnerClaimStep("proof");
                    } else {
                      setOwnerClaimStep("pick");
                    }
                  }}
                >
                  <Text style={{ color: "#fff", fontWeight: "700" }}>É o seu pet?</Text>
                </TouchableOpacity>
              )}
            </View>
          )
        : (
            <View style={{ backgroundColor: '#FFCC00', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, flexDirection: 'row', alignItems: 'center' }}>
              <Ionicons name="alert-circle" size={20} color="#000" />
              <Text style={{ color: '#000', fontWeight: '700', marginLeft: 8, fontSize: 13 }}>Registre um pet perdido para reivindicar este pet encontrado</Text>
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
