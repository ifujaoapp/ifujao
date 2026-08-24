import { TouchableOpacity, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";

type CloseCircleProps = {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  hitSlop?: { top: number; bottom: number; left: number; right: number };
};

// Botão circular de fechar (X) usado em TODOS os modais do projeto.
// Tamanho fixo: 24x24 (raio 12), ícone 18 — para nunca variar entre telas.
export function CloseCircle({ onPress, style, hitSlop }: CloseCircleProps) {
  return (
    <TouchableOpacity
      style={[styles.roundClose, style]}
      onPress={onPress}
      hitSlop={hitSlop ?? { top: 8, bottom: 8, left: 8, right: 8 }}
      activeOpacity={0.7}
      accessibilityLabel="Fechar"
    >
      <Ionicons name="close" size={18} color="#FFFFFF" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  roundClose: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
});
