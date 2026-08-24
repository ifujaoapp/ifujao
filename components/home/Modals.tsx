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
      <View style={styles.aboutOverlay}>
        <View style={styles.aboutCard}>
          <Text style={styles.aboutTitle}>Política de Privacidade</Text>
          <ScrollView
            style={styles.privacyScroll}
            nestedScrollEnabled
            keyboardShouldPersistTaps="handled"
          >
            <Text style={styles.privacyText}>
              <Text style={{ fontWeight: "bold" }}>
                Política de Privacidade e Tratamento de Dados Pessoais{"\n"}
              </Text>
              Esta Política de Privacidade descreve como o iFujão
              (&quot;aplicativo&quot;, &quot;nós&quot;) coleta, utiliza, armazena, compartilha e
              protege as informações dos usuários, em conformidade com a Lei
              Geral de Proteção de Dados (Lei nº 13.709/2018 - LGPD), com o
              Marco Civil da Internet (Lei nº 12.965/2014) e com boas práticas
              inspiradas em políticas de grandes plataformas como WhatsApp,
              Instagram e Facebook.{"\n\n"}
              <Text style={{ fontWeight: "bold" }}>1. Quem somos{"\n"}</Text>O
              iFujão é um aplicativo cujo propósito é ajudar pessoas a
              encontrarem pets perdidos, permitindo o registro de alertas com
              localização e contato para reencontro. Esta política aplica-se a
              todos os usuários do app, independentemente da plataforma
              (Android ou iOS).{"\n\n"}
              <Text style={{ fontWeight: "bold" }}>
                2. Dados que coletamos{"\n"}
              </Text>
              Coletamos apenas os dados estritamente necessários ao
              funcionamento:{"\n"}• Dados do pet: espécie/raça, localização
              informada, descrição e fotografias.{"\n"}• Dados de contato:
              número de WhatsApp informado como forma de contato pelo
              responsável.{"\n"}• Identificador de dispositivo: utilizamos um
              identificador local para reconhecer os alertas criados por você
              neste aparelho.{"\n"}• Dados de localização: obtidos com sua
              permissão, apenas para posicionar o alerta no mapa e verificar a
              área de cobertura da cidade.{"\n"}
              Não coletamos dados sensíveis (origem racial, religião, opinião
              política, dados de saúde ou biometricos) nem lemos sua agenda ou
              mensagens de outros aplicativos.{"\n\n"}
              <Text style={{ fontWeight: "bold" }}>
                3. Como usamos seus dados{"\n"}
              </Text>
              Utilizamos os dados exclusivamente para: (a) exibir os alertas de
              pets perdidos no mapa; (b) permitir o contato entre quem encontrou
              o pet e o responsável via WhatsApp; (c) identificar e permitir a
              exclusão dos seus próprios alertas; e (d) melhorar a experiência e
              a segurança do app. Não utilizamos seus dados para publicidade
              comportamental ou venda a anunciantes.{"\n\n"}
              <Text style={{ fontWeight: "bold" }}>
                4. Armazenamento e criptografia{"\n"}
              </Text>
              No estado atual, os alertas e o seu identificador de dispositivo
              são armazenados localmente neste aparelho por meio do SecureStore,
              um cofre criptografado nativo do sistema operacional (Keychain no
              iOS e Keystore/SharedPreferences criptografado no Android). Os
              dados sensíveis permanecem protegidos em repouso pela criptografia
              do próprio dispositivo.{"\n"}
              Quando os dados passarem a ser sincronizados com servidores, eles
              serão transmitidos exclusivamente por canais seguros (TLS 1.2 ou
              superior) e armazenados em bases criptografadas, seguindo os
              mesmos padrões de proteção adotados por grandes plataformas de
              mensageria. O número de WhatsApp é tratado como dado de contato e
              não é exposto publicamente além do necessário para o reencontro.
              {"\n\n"}
              <Text style={{ fontWeight: "bold" }}>
                5. Compartilhamento e terceiros{"\n"}
              </Text>
              Não vendemos, alugamos ou comercializamos seus dados pessoais. O
              número de contato é exibido apenas dentro do alerta, para que
              terceiros possam entrar em contato pelo WhatsApp e ajudar no
              reencontro. Poderemos compartilhar dados somente: (a) com seu
              consentimento; (b) para cumprimento de obrigação legal ou decisão
              judicial; ou (c) com prestadores de serviço essenciais (como
              hospedagem e infraestrutura), sob obrigações de confidencialidade.
              Ao utilizar o WhatsApp para contato, aplica-se também a Política de
              Privacidade da Meta/WhatsApp.{"\n\n"}
              <Text style={{ fontWeight: "bold" }}>6. Retenção{"\n"}</Text>
              Mantemos seus dados apenas pelo tempo necessário às finalidades
              descritas ou conforme exigido por lei. Você pode remover seus
              próprios alertas a qualquer momento; ao desinstalar o app, os dados
              locais são apagados junto com o armazenamento do dispositivo.
              {"\n\n"}
              <Text style={{ fontWeight: "bold" }}>7. Segurança{"\n"}</Text>
              Adotamos medidas técnicas e organizacionais razoáveis para proteger
              seus dados contra acesso não autorizado, perda ou alteração,
              incluindo criptografia em repouso (SecureStore), transmissão segura
              e princípio de minimização de dados. Contudo, nenhum sistema é
              infalível, e recomendamos cautela ao divulgar informações de
              contato em espaços públicos.{"\n\n"}
              <Text style={{ fontWeight: "bold" }}>
                8. Seus direitos (LGPD){"\n"}
              </Text>
              Nos termos da LGPD, você pode, a qualquer momento, solicitar:
              confirmação da existência de tratamento; acesso; correção;
              anonimização, bloqueio ou eliminação de dados desnecessários;
              portabilidade; revogação do consentimento; e eliminação dos dados
              tratados com base no seu consentimento. No app, você exerce parte
              desses direitos diretamente: apagando seus alertas e desinstalando
              o aplicativo para remover dados locais. Para demais solicitações,
              use nossos canais oficiais.{"\n\n"}
              <Text style={{ fontWeight: "bold" }}>
                9. Menores de idade{"\n"}
              </Text>
              O app pode ser utilizado por menores com autorização dos pais ou
              responsáveis. Não coletamos conscientemente dados de crianças sem o
              consentimento dos responsáveis.{"\n\n"}
              <Text style={{ fontWeight: "bold" }}>
                10. Alterações nesta política{"\n"}
              </Text>
              Poderemos atualizar esta Política de tempos em tempos. A versão
              vigente estará sempre disponível no app, e alterações relevantes
              serão comunicadas antes de entrarem em vigor.{"\n\n"}
              <Text style={{ fontWeight: "bold" }}>11. Contato{"\n"}</Text>
              Em caso de dúvidas, solicitações relativas aos seus dados ou
              questões sobre privacidade, entre em contato pelos canais oficiais
              do iFujão. Última atualização: 2026.
            </Text>
          </ScrollView>
          <TouchableOpacity style={styles.aboutClose} onPress={onClose}>
            <Text style={styles.aboutCloseText}>Fechar</Text>
          </TouchableOpacity>
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
          ) : (
            <TouchableOpacity
              style={styles.siBtnPrimary}
              onPress={() =>
                Linking.openURL(
                  "https://maps.google.com/?q=" +
                    s.latitude +
                    "," +
                    s.longitude,
                )
              }
            >
              <Text style={styles.siBtnPrimaryText}>📍 Ver no mapa</Text>
            </TouchableOpacity>
          )}
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
          <TouchableOpacity style={styles.reportClose} onPress={onClose}>
            <Ionicons name="close" size={22} color="#FFFFFF" />
          </TouchableOpacity>
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
