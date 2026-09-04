import { useEffect, useRef } from "react";
import { Animated, Dimensions, StyleSheet, View } from "react-native";
import { useAudioPlayer } from "expo-audio";

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const PARTICLE_COUNT = 40;
const DURATION = 3200;

type Particle = {
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
  color: string;
  size: number;
  delay: number;
};

const COLORS = ["#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA", "#AF52DE", "#FF2D55"];

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export function FireworksOverlay({ visible }: { visible: boolean }) {
  const particlesRef = useRef<Particle[]>([]);
  const animatingRef = useRef(false);
  const player = useAudioPlayer({ uri: "https://assets.mixkit.co/active_storage/sfx/2571/2571-preview.mp3" });

  useEffect(() => {
    if (!visible) return;
    if (animatingRef.current) return;
    animatingRef.current = true;

    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }).map(() => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(1),
      scale: new Animated.Value(0),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: randomBetween(4, 8),
      delay: randomBetween(0, 600),
    }));
    particlesRef.current = particles;

    const animations = particles.map((p) => {
      const angle = randomBetween(0, Math.PI * 2);
      const distance = randomBetween(60, 140);
      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance - randomBetween(40, 100);

      return Animated.sequence([
        Animated.delay(p.delay),
        Animated.parallel([
          Animated.timing(p.x, { toValue: tx, duration: DURATION, useNativeDriver: true }),
          Animated.timing(p.y, { toValue: ty, duration: DURATION, useNativeDriver: true }),
          Animated.timing(p.opacity, { toValue: 0, duration: DURATION, useNativeDriver: true }),
          Animated.spring(p.scale, { toValue: 1, tension: 40, friction: 6, useNativeDriver: true }),
        ]),
      ]);
    });

    player.play();

    Animated.stagger(120, animations).start(() => {
      animatingRef.current = false;
    });
  }, [visible, player]);

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      {particlesRef.current.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            styles.particle,
            {
              backgroundColor: p.color,
              width: p.size,
              height: p.size,
              borderRadius: p.size / 2,
              left: SCREEN_W / 2,
              top: SCREEN_H / 2 - 40,
              transform: [{ translateX: p.x }, { translateY: p.y }, { scale: p.scale }],
              opacity: p.opacity,
            },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    alignItems: "center",
    justifyContent: "center",
  },
  particle: {
    position: "absolute",
  },
});
