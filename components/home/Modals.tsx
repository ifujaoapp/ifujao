import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import MaterialCommunityIcons from "@expo/vector-icons/MaterialCommunityIcons";
import {
  Image,
  Linking,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { type SponsorPin } from "@/lib/sponsors";
import { type PetPost } from "@/constants/breeds";
import type { HomeStyles } from "@/app/(tabs)/index";
import { CloseCircle } from "@/components/CloseCircle";
import { TermsContent } from "@/components/home/TermsContent";

type ThemeColors = { text: string; [k: string]: string };

export function AboutModal({
  visible,
  onClose,
  styles,
}: {
  visible: boolean;
  onClose: () => void;
  styles: HomeStyles;
}) {
  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.aboutOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <View style={styles.aboutCard}>
          <Image
            source={require("../../assets/images/logo.png")}
            style={{
              width: 120,
              height: 120,
              marginBottom: 16,
              resizeMode: "contain",
            }}
          />
          <Text style={styles.aboutText}>
            App para ajudar a encontrar pets perdidos. Registre um pet, informe a
            localização e o seu número para quem encontrá-lo entrar em contato
            pelo WhatsApp.
          </Text>
          <Text style={styles.aboutVersion}>Versão 1.0.0</Text>
          <TouchableOpacity style={styles.aboutClose} onPress={onClose}>
            <Text style={styles.aboutCloseText}>Fechar</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );
}

export function PrivacyModal({
  visible,
  onClose,
  onAccept,
  styles,
}: {
  visible: boolean;
  onClose: () => void;
  onAccept?: () => void;
  styles: HomeStyles;
}) {
  const [checked, setChecked] = useState(false);

  const handleAccept = () => {
    if (!checked) return;
    onAccept?.();
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.aboutOverlay}>
        <View style={styles.aboutCard}>
          <Text style={styles.aboutTitle}>Termo de Uso e Política de Privacidade</Text>
          <ScrollView
            style={styles.privacyScroll}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            <TermsContent styles={styles} />
          </ScrollView>
          {onAccept ? (
            <View style={{ width: "100%", marginTop: 12 }}>
              <TouchableOpacity
                style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 12, paddingHorizontal: 4 }}
                onPress={() => setChecked(!checked)}
                activeOpacity={0.7}
              >
                <View style={{
                  width: 22,
                  height: 22,
                  borderRadius: 4,
                  borderWidth: 2,
                  borderColor: checked ? "#007AFF" : "#8E8E93",
                  backgroundColor: checked ? "#007AFF" : "transparent",
                  marginRight: 10,
                  marginTop: 2,
                  alignItems: "center",
                  justifyContent: "center",
                }}>
                  {checked && (
                    <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                  )}
                </View>
                <Text style={{ flex: 1, fontSize: 11, color: "#333", lineHeight: 16 }}>
                  Li e concordo com os Termos de Uso e Política de Privacidade (especialmente ciente quanto à segurança em encontros presenciais e alertas de golpes de recompensa).
                </Text>
              </TouchableOpacity>
              <View style={{ flexDirection: "row", gap: 8 }}>
                <TouchableOpacity
                  style={[styles.aboutClose, { flex: 1, paddingHorizontal: 12 }]}
                  onPress={onClose}
                >
                  <Text style={styles.aboutCloseText}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.aboutClose, { flex: 1, paddingHorizontal: 12, backgroundColor: checked ? "#007AFF" : "#C7C7CC" }]}
                  onPress={handleAccept}
                  disabled={!checked}
                >
                  <Text style={styles.aboutCloseText}>Continuar</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={{ marginTop: 12 }}>
              <TouchableOpacity style={styles.aboutClose} onPress={onClose}>
                <Text style={styles.aboutCloseText}>Fechar</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

export function PhotoSourceModal({
  visible,
  onClose,
  onCamera,
  onGallery,
  styles,
  themeColors,
}: {
  visible: boolean;
  onClose: () => void;
  onCamera: () => void;
  onGallery: () => void;
  styles: HomeStyles;
  themeColors: ThemeColors;
}) {
  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <SafeAreaView edges={["bottom"]} style={styles.actionSheetOverlay}>
        <TouchableOpacity
          style={{ flex: 1, justifyContent: "flex-end" }}
          activeOpacity={1}
          onPress={onClose}
        >
          <View style={styles.actionSheet}>
            <Text style={styles.actionSheetTitle}>Adicionar foto</Text>
            <TouchableOpacity style={styles.actionSheetOption} onPress={onCamera}>
              <Ionicons name="camera" size={22} color={themeColors.text} />
              <Text style={styles.actionSheetOptionText}>Câmera</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionSheetOption} onPress={onGallery}>
              <Ionicons name="images" size={22} color={themeColors.text} />
              <Text style={styles.actionSheetOptionText}>Galeria</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionSheetOption, styles.actionSheetCancel]}
              onPress={onClose}
            >
              <Text
                style={[
                  styles.actionSheetOptionText,
                  styles.actionSheetCancelText,
                ]}
              >
                Cancelar
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </SafeAreaView>
    </Modal>
  );
}

export function SponsorInfoModal({
  sponsor,
  onClose,
  styles,
}: {
  sponsor: SponsorPin | null;
  onClose: () => void;
  styles: HomeStyles;
}) {
  if (!sponsor) return null;
  const s = sponsor;
  const phone = s.phone;
  const waDigits = (phone || "").replace(/\D/g, "");
  const waUrl = waDigits
    ? "https://wa.me/" + (waDigits.startsWith("55") ? waDigits : "55" + waDigits)
    : null;
  const instagram = s.instagram;
  const facebook = s.facebook;
  const link = s.link;
  const logo = s.logo;
  const mapUrl = s.mapUrl;
  const toUrl = (v: string) =>
    /^https?:\/\//i.test(v) ? v : "https://" + v;
  const igUrl = instagram
    ? instagram.startsWith("@")
      ? "https://instagram.com/" + instagram.slice(1)
      : toUrl(instagram)
    : null;
  const fbUrl = facebook
    ? facebook.startsWith("@")
      ? "https://facebook.com/" + facebook.slice(1)
      : toUrl(facebook)
    : null;
  const igLabel = instagram
    ? instagram
        .replace(/^https?:\/\/(www\.)?instagram\.com\//i, "")
        .replace(/^\//, "")
    : "";
  const fbLabel = facebook
    ? facebook
        .replace(/^https?:\/\/(www\.)?facebook\.com\//i, "")
        .replace(/^\//, "")
    : "";
  return (
    <Modal
      visible={!!s}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.siOverlay}>
        <View style={styles.siCard}>
          <View style={styles.siBadge}>
            <Text style={styles.siBadgeText}>ANÚNCIO</Text>
          </View>
          {logo ? (
            <Image
              source={{ uri: logo }}
              style={styles.siLogo}
              resizeMode="contain"
            />
          ) : null}
          <Text style={styles.siTitle}>{s.name || "Patrocinador"}</Text>
          {s.address ? <Text style={styles.siLine}>{s.address}</Text> : null}
          {waUrl ? (
            <TouchableOpacity
              style={styles.siBtn}
              onPress={() => Linking.openURL(waUrl)}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <MaterialCommunityIcons
                  name="whatsapp"
                  size={18}
                  color="#25D366"
                />
                <Text style={styles.siBtnText}>{phone}</Text>
              </View>
            </TouchableOpacity>
          ) : null}
          {igUrl ? (
            <TouchableOpacity
              style={styles.siBtn}
              onPress={() => Linking.openURL(igUrl)}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <MaterialCommunityIcons
                  name="instagram"
                  size={18}
                  color="#E4405F"
                />
                <Text style={styles.siLabel}>{igLabel}</Text>
              </View>
            </TouchableOpacity>
          ) : null}
          {fbUrl ? (
            <TouchableOpacity
              style={styles.siBtn}
              onPress={() => Linking.openURL(fbUrl)}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                <MaterialCommunityIcons
                  name="facebook"
                  size={18}
                  color="#1877F2"
                />
                <Text style={styles.siLabel}>{fbLabel}</Text>
              </View>
            </TouchableOpacity>
          ) : null}
          {link ? (
            <TouchableOpacity
              style={styles.siBtnPrimary}
              onPress={() => Linking.openURL(toUrl(link))}
            >
              <Text style={styles.siBtnPrimaryText}>🔗 Abrir link</Text>
            </TouchableOpacity>
          ) : null}
          <TouchableOpacity
            style={styles.siBtnPrimary}
            onPress={() =>
              Linking.openURL(
                mapUrl ||
                  "https://maps.google.com/?q=" +
                    s.latitude +
                    "," +
                    s.longitude,
              )
            }
          >
            <Text style={styles.siBtnPrimaryText}>📍 Ver no mapa</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.siClose} onPress={onClose}>
            <Text style={styles.siCloseText}>Fechar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

export function ReportReasonModal({
  target,
  onClose,
  onSubmit,
  styles,
}: {
  target: PetPost | null;
  onClose: () => void;
  onSubmit: (reason: string) => void;
  styles: HomeStyles;
}) {
  if (!target) return null;
  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={target !== null}
      onRequestClose={onClose}
    >
      <View style={styles.reportOverlay}>
        <View style={styles.reportCard}>
          <CloseCircle
            style={{ position: "absolute", top: 14, right: 14, zIndex: 2 }}
            onPress={onClose}
          />
          <Ionicons
            name="flag"
            size={40}
            color="#FF9500"
            style={styles.reportIcon}
          />
          <Text style={styles.reportTitle}>Denunciar alerta</Text>
          <Text style={styles.reportSubtitle}>
            Selecione o motivo da denúncia:
          </Text>
          {[
            "Conteúdo impróprio ou ofensivo",
            "Foto inadequada",
            "Informação falsa/engano",
            "Spam",
            "Outro",
          ].map((m) => (
            <TouchableOpacity
              key={m}
              style={styles.reportOption}
              onPress={() => onSubmit(m)}
            >
              <Text style={styles.reportOptionText}>{m}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    </Modal>
  );
}
