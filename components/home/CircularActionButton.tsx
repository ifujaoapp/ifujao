import { Text, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Reanimated, { useAnimatedStyle, type SharedValue } from "react-native-reanimated";
import type { HomeStyles } from "@/app/(tabs)/index";
export const CircularActionButton = ({
  index,
  progress,
  x,
  y,
  size,
  color,
  icon,
  label,
  disabled,
  onPress,
  styles,
}: {
  index: number;
  progress: SharedValue<number>;
  x: number;
  y: number;
  size: number;
  color: string;
  icon: string;
  label: string;
  disabled?: boolean;
  onPress: () => void;
  styles: HomeStyles;
}) => {
  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const delay = index * 60;
    const local = Math.max(0, Math.min(1, p * (1 + delay / 420) - delay / 420));
    const eased = local * local * (3 - 2 * local);
    return {
      transform: [
        { translateX: -size / 2 + x * eased },
        { translateY: -size / 2 + y * eased },
        { scale: 0.2 + 0.8 * eased },
      ],
      opacity: eased,
    };
  });

  return (
    <Reanimated.View
      pointerEvents={disabled ? "none" : "auto"}
      style={[
        styles.circularBtn,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: disabled ? "#8E8E93" : color,
        },
        animatedStyle,
      ]}
    >
      <TouchableOpacity
        style={{
          width: "100%",
          height: "100%",
          justifyContent: "center",
          alignItems: "center",
        }}
        disabled={disabled}
        onPress={onPress}
      >
        <Ionicons name={icon as any} size={26} color="#FFFFFF" />
        <Text style={styles.circularBtnLabel}>{label}</Text>
      </TouchableOpacity>
    </Reanimated.View>
  );
};
