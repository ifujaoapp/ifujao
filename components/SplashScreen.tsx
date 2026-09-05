import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Image } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  Easing,
} from 'react-native-reanimated';
import * as SplashScreen from 'expo-splash-screen';

SplashScreen.preventAutoHideAsync();

export default function SplashScreenComponent({ onFinish }: { onFinish: () => void }) {
  const [isAppReady, setIsAppReady] = useState(false);
  const [isAnimationFinished, setIsAnimationFinished] = useState(false);

  const scale = useSharedValue(1);
  const opacity = useSharedValue(1);

  useEffect(() => {
    async function prepare() {
      try {
        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (e) {
        console.warn(e);
      } finally {
        setIsAppReady(true);
        await SplashScreen.hideAsync();
      }
    }

    prepare();
  }, []);

  useEffect(() => {
    if (isAppReady) {
      scale.value = withTiming(1.2, { duration: 400, easing: Easing.inOut(Easing.ease) }, () => {
        scale.value = withTiming(25, { duration: 600, easing: Easing.bezier(0.25, 1, 0.5, 1) }, (finished) => {
          if (finished) {
            runOnJS(setIsAnimationFinished)(true);
            runOnJS(onFinish)();
          }
        });
      });

      opacity.value = withTiming(0, { duration: 800 });
    }
  }, [isAppReady, onFinish, scale, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  if (isAnimationFinished) {
    return null;
  }

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.logoContainer, animatedStyle]}>
        <Image
          source={require('../../assets/images/logo_bg.png')}
          style={styles.logo}
          contentFit="contain"
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 200,
    height: 200,
  },
});
