import { Modal, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { showAlert } from "@/src/components/AppAlert";
import { Colors } from "@/constants/theme";

export interface GodLoginModalProps {
  visible: boolean;
  onClose: () => void;
  onSuccess: () => void;
  loginModerator: (username: string, password: string) => Promise<boolean>;
}

export function GodLoginModal({
  visible,
  onClose,
  onSuccess,
  loginModerator,
}: GodLoginModalProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!username || !password) {
      showAlert("error", "Atenção", "Preencha usuário e senha.");
      return;
    }
    setLoading(true);
    try {
      const ok = await loginModerator(username.trim(), password);
      if (ok) {
        setUsername("");
        setPassword("");
        onSuccess();
      } else {
        showAlert("error", "Acesso negado", "Usuário ou senha inválidos.");
      }
    } catch {
      showAlert("error", "Erro", "Não foi possível conectar ao servidor.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      animationType="fade"
      transparent={true}
      visible={visible}
      onRequestClose={onClose}
    >
      <View style={styles.overlay} onTouchStart={onClose}>
        <View style={styles.card} onTouchStart={(e) => e.stopPropagation()}>
          <Ionicons
            name="shield"
            size={28}
            color={Colors.light.primaryButton}
            style={styles.icon}
          />
          <Text style={styles.title}>Modo Deus</Text>
          <Text style={styles.subtitle}>Acesso de moderação</Text>
          <TextInput
            style={styles.input}
            placeholder="Usuário"
            autoCapitalize="none"
            autoCorrect={false}
            value={username}
            onChangeText={setUsername}
          />
          <TextInput
            style={styles.input}
            placeholder="Senha"
            secureTextEntry
            autoCapitalize="none"
            autoCorrect={false}
            value={password}
            onChangeText={setPassword}
          />
          <TouchableOpacity
            style={[styles.btn, loading && styles.btnDisabled]}
            disabled={loading}
            activeOpacity={0.7}
            onPress={handleLogin}
          >
            <Text style={styles.btnText}>
              {loading ? "Validando..." : "Entrar"}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.cancel}
            activeOpacity={0.7}
            onPress={onClose}
          >
            <Text style={styles.cancelText}>Cancelar</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 22,
    alignItems: "center",
  },
  icon: { marginBottom: 6 },
  title: { fontSize: 20, fontWeight: "800", color: "#111" },
  subtitle: { fontSize: 13, color: "#666", marginBottom: 16 },
  input: {
    width: "100%",
    height: 44,
    borderWidth: 1,
    borderColor: "#D1D1D6",
    borderRadius: 10,
    paddingHorizontal: 12,
    fontSize: 15,
    marginBottom: 12,
    color: "#111",
  },
  btn: {
    width: "100%",
    height: 46,
    backgroundColor: "#0A84FF",
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 4,
  },
  btnDisabled: { opacity: 0.6 },
  btnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  cancel: { marginTop: 12 },
  cancelText: { color: "#8E8E93", fontSize: 14 },
});
