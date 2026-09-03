import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useThemeMode } from "@/hooks/use-theme-mode";
import { Colors } from "@/constants/theme";
import { type PetRecord } from "@/lib/storage";
import { banUser, unbanUser } from "@/lib/bans";

export type ModerationDetailModalProps = {
  visible: boolean;
  pet: PetRecord | null;
  // Lista de pets do mesmo device/phone (para mostrar o historico).
  allPets: PetRecord[];
  onClose: () => void;
};

const formatDate = (iso?: string | null) => {
  if (!iso) return "—";
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "—";
    return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
};

const Field = ({ label, value, mono }: { label: string; value: string; mono?: boolean }) => (
  <View style={styles.field}>
    <Text style={styles.fieldLabel}>{label}</Text>
    <Text style={[styles.fieldValue, mono && styles.fieldValueMono]} numberOfLines={2}>
      {value || "—"}
    </Text>
  </View>
);

export function ModerationDetailModal({
  visible,
  pet,
  allPets,
  onClose,
}: ModerationDetailModalProps) {
  const { theme } = useThemeMode();
  const isDark = theme === "dark";
  const c = isDark ? Colors.dark : Colors.light;
  const [busy, setBusy] = useState(false);
  const [banned, setBanned] = useState(false);

  // Reset ao trocar de pet.
  useEffect(() => {
    setBanned(false);
    setBusy(false);
  }, [pet?.id]);

  if (!pet) return null;

  // Pets do mesmo device/phone (mesmo dono).
  const sameDevicePets = allPets.filter(
    (p) =>
      (pet.ownerDeviceId && p.ownerDeviceId === pet.ownerDeviceId) ||
      (pet.ownerPhone && p.ownerPhone && p.ownerPhone === pet.ownerPhone),
  );
  const reportedCount = sameDevicePets.filter((p) => p.reported).length;
  const foundCount = sameDevicePets.filter((p) => p.foundAt).length;

  const doBan = () => {
    Alert.alert(
      "Banir usuário?",
      "Esta ação vai impedir o usuário de usar o app até que o banimento seja liberado. Tem certeza?",
      [
        { text: "Cancelar", style: "cancel" },
        {
          text: "Banir",
          style: "destructive",
          onPress: async () => {
            setBusy(true);
            try {
              const res = await banUser({
                deviceId: pet.ownerDeviceId,
                phone: pet.ownerPhone,
                reason: "Conteúdo impróprio",
              });
              if (!res.ok) {
                Alert.alert("Erro", res.error ?? "Falha ao banir.");
                return;
              }
              setBanned(true);
              Alert.alert("Banido", "Usuário banido com sucesso.");
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  };

  const doUnban = () => {
    Alert.alert("Liberar banimento?", "O usuário voltará a poder usar o app normalmente.", [
      { text: "Cancelar", style: "cancel" },
      {
        text: "Liberar",
        onPress: async () => {
          setBusy(true);
          try {
            const res = await unbanUser({
              deviceId: pet.ownerDeviceId,
              phone: pet.ownerPhone,
            });
            if (!res.ok) {
              Alert.alert("Erro", res.error ?? "Falha ao liberar.");
              return;
            }
            setBanned(false);
            Alert.alert("Liberado", "Banimento liberado.");
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.55)" }]}>
        <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardStroke }]}>
          <View style={styles.header}>
            <View style={styles.headerTitle}>
              <Ionicons name="shield-checkmark" size={20} color="#0A84FF" />
              <Text style={[styles.title, { color: c.text }]}>Moderação</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
              <Ionicons name="close" size={22} color={c.text} />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 24 }}>
            <Text style={[styles.section, { color: c.icon }]}>DADOS DO DISPOSITIVO</Text>
            <Field label="Device ID" value={pet.ownerDeviceId ?? ""} mono />
            <Field label="Telefone" value={pet.ownerPhone ?? ""} mono />
            <Field label="Contato (do post)" value={pet.contact ?? ""} mono />
            <Field label="Postado em" value={formatDate(pet.createdAt)} />
            <Field label="Atualizado em" value={formatDate(pet.updatedAt)} />

            <Text style={[styles.section, { color: c.icon, marginTop: 16 }]}>
              DADOS DO PET
            </Text>
            {pet.images && pet.images[0] ? (
              <Image source={{ uri: pet.images[0] }} style={styles.thumb} />
            ) : null}
            <Field label="ID do pet" value={pet.id} mono />
            <Field label="Espécie" value={pet.species ?? ""} />
            <Field label="Raça" value={pet.breed ?? ""} />
            <Field label="Nome" value={pet.name ?? ""} />
            <Field label="Tipo" value={pet.postType ?? "lost"} />
            <Field label="Local" value={pet.location ?? ""} />
            <Field
              label="Coordenadas"
              value={`${pet.latitude?.toFixed(5)}, ${pet.longitude?.toFixed(5)}`}
              mono
            />
            <Field
              label="Reportado"
              value={pet.reported ? `Sim${pet.reportReason ? ` (${pet.reportReason})` : ""}` : "Não"}
            />

            <Text style={[styles.section, { color: c.icon, marginTop: 16 }]}>
              HISTÓRICO DO DISPOSITIVO
            </Text>
            <Field label="Total de posts" value={String(sameDevicePets.length)} />
            <Field label="Denunciados" value={String(reportedCount)} />
            <Field label="Encontrados" value={String(foundCount)} />

            <View style={styles.actionsRow}>
              {!banned ? (
                <TouchableOpacity
                  style={[styles.btnDanger, busy && { opacity: 0.6 }]}
                  disabled={busy}
                  onPress={doBan}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="ban" size={16} color="#fff" />
                      <Text style={styles.btnDangerText}>Banir usuário</Text>
                    </>
                  )}
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  style={[styles.btnOk, busy && { opacity: 0.6 }]}
                  disabled={busy}
                  onPress={doUnban}
                >
                  {busy ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <>
                      <Ionicons name="checkmark-circle" size={16} color="#fff" />
                      <Text style={styles.btnOkText}>Liberar banimento</Text>
                    </>
                  )}
                </TouchableOpacity>
              )}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: "flex-end",
  },
  card: {
    width: "100%",
    maxHeight: "88%",
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(127,127,127,0.3)",
  },
  headerTitle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "700",
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    padding: 16,
  },
  section: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 8,
  },
  field: {
    marginBottom: 10,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: "#8E8E93",
    marginBottom: 2,
  },
  fieldValue: {
    fontSize: 14,
    color: "#1C1C1E",
  },
  fieldValueMono: {
    fontFamily: "monospace",
    fontSize: 13,
  },
  thumb: {
    width: "100%",
    height: 160,
    borderRadius: 10,
    marginBottom: 10,
    backgroundColor: "#eee",
  },
  actionsRow: {
    flexDirection: "row",
    marginTop: 18,
    gap: 8,
  },
  btnDanger: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#FF3B30",
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnDangerText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
  btnOk: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: "#34C759",
    paddingVertical: 14,
    borderRadius: 12,
  },
  btnOkText: {
    color: "#fff",
    fontWeight: "700",
    fontSize: 15,
  },
});
