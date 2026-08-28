import { useEffect, useRef } from "react";
import { Animated, Easing, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import type { HomeStyles } from "@/app/(tabs)/index";
export function HelpFindBanner({ styles }: { styles: HomeStyles }) {
  const helpPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(helpPulse, {
        toValue: 1,
        duration: 1400,
        easing: Easing.linear,
        useNativeDriver: false,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [helpPulse]);

  const helpScale = helpPulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1.25, 1],
  });

  return (
    <View style={styles.helpFindRow}>
      <View style={styles.heartWrap}>
        <Animated.View
          style={[styles.heartBig, { transform: [{ scale: helpScale }] }]}
        >
          <Ionicons name="heart" size={26} color="#FF3B30" />
        </Animated.View>
        <Animated.View
          style={[styles.heartSmall, { transform: [{ scale: helpScale }] }]}
        >
          <Ionicons name="heart" size={13} color="#FF3B30" />
        </Animated.View>
      </View>
      <Text style={[styles.helpFind, { color: '#FF3B30', fontWeight: 'bold', fontSize: 13 }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
        ME AJUDE A VOLTAR PARA CASA!
      </Text>
    </View>
  );
}
