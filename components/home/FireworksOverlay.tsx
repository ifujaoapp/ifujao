import { useEffect, useRef } from "react";
import { Animated, Dimensions, Easing, StyleSheet, View } from "react-native";
import { useAudioPlayer } from "expo-audio";

const fireworksSound = require("../../assets/sounds/fireworks.mp3");

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");
const PARTICLE_COUNT = 100;
const DURATION = 4000;

type Particle = {
  x: Animated.Value;
  y: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
  color: string;
  size: number;
};

const COLORS = ["#FF3B30", "#FF9500", "#FFCC00", "#34C759", "#5AC8FA", "#AF52DE", "#FF2D55"];

function randomBetween(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

export function FireworksOverlay({
  visible,
  onFinish,
  petLat,
  petLng,
  mapCenter,
  mapDelta,
}: {
  visible: boolean;
  onFinish?: () => void;
  petLat?: number;
  petLng?: number;
  mapCenter?: { latitude: number; longitude: number };
  mapDelta?: { latitudeDelta: number; longitudeDelta: number };
}) {
  const particlesRef = useRef<Particle[]>([]);
  const animatingRef = useRef(false);
  const playedRef = useRef(false);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const originX = useRef(SCREEN_W / 2);
  const originY = useRef(SCREEN_H / 2 - 40);

  if (
    typeof petLat === "number" &&
    typeof petLng === "number" &&
    mapCenter &&
    mapDelta &&
    mapDelta.longitudeDelta > 0 &&
    mapDelta.latitudeDelta > 0
  ) {
    const dLng = mapDelta.longitudeDelta;
    const dLat = mapDelta.latitudeDelta;
    const cLng = mapCenter.longitude;
    const cLat = mapCenter.latitude;
    const rawX = ((petLng - cLng) / dLng) * SCREEN_W + SCREEN_W / 2;
    const rawY = ((cLat - petLat) / dLat) * SCREEN_H + SCREEN_H / 2;
    originX.current = rawX;
    originY.current = rawY;
  }

  const player = useAudioPlayer(fireworksSound);

  useEffect(() => {
    if (!visible) return;
    if (animatingRef.current) return;
    animatingRef.current = true;
    playedRef.current = false;

    const particles: Particle[] = Array.from({ length: PARTICLE_COUNT }).map(() => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      opacity: new Animated.Value(1),
      scale: new Animated.Value(0),
      color: COLORS[Math.floor(Math.random() * COLORS.length)],
      size: randomBetween(2, 5),
    }));
    particlesRef.current = particles;

    if (!playedRef.current) {
      playedRef.current = true;
      try {
        player.seekTo(0);
      } catch (e) {
        console.warn("[Fireworks] audio seek failed", e);
      }
      setTimeout(() => {
        try {
          player.play();
        } catch (e) {
          console.warn("[Fireworks] audio play failed", e);
        }
      }, 100);
    }

    const timeouts: ReturnType<typeof setTimeout>[] = [];

    particles.forEach((p, index) => {
      const angle = randomBetween(0, Math.PI * 2);
      const distance = randomBetween(100, 240);
      const tx = Math.cos(angle) * distance;
      const ty = Math.sin(angle) * distance - randomBetween(90, 160);

      const delay = index * 40;

      const anim = Animated.sequence([
        Animated.parallel([
          Animated.timing(p.x, {
            toValue: tx,
            duration: DURATION,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(p.y, {
            toValue: ty,
            duration: DURATION,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(p.opacity, {
            toValue: 0,
            duration: DURATION * 0.85,
            easing: Easing.in(Easing.quad),
            useNativeDriver: true,
            delay: DURATION * 0.15,
          }),
          Animated.sequence([
            Animated.timing(p.scale, {
              toValue: 1,
              duration: 180,
              easing: Easing.out(Easing.back(1.2)),
              useNativeDriver: true,
            }),
            Animated.timing(p.scale, {
              toValue: 0,
              duration: 500,
              easing: Easing.in(Easing.quad),
              useNativeDriver: true,
              delay: 80,
            }),
          ]),
        ]),
      ]);

      const timeout = setTimeout(() => {
        anim.start();
      }, delay);
      timeouts.push(timeout);
    });

    const maxDuration = (PARTICLE_COUNT - 1) * 40 + DURATION + 500;
    const finishTimeout = setTimeout(() => {
      particlesRef.current = [];
      animatingRef.current = false;
      playedRef.current = false;
      onFinishRef.current?.();
    }, maxDuration);

    timeouts.push(finishTimeout);

    return () => {
      timeouts.forEach(clearTimeout);
    };
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
              left: originX.current,
              top: originY.current,
              transform: [
                { translateX: p.x },
                { translateY: p.y },
                { scale: p.scale },
              ],
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
