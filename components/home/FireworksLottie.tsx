import { useState, useEffect, useRef } from "react";
import { View, Dimensions, StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { useAudioPlayer } from "expo-audio";

const fireworksSound = require("../../assets/sounds/fireworks.mp3");

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get("window");

export function FireworksLottie({
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
  const webViewRef = useRef<WebView>(null);
  const onFinishRef = useRef(onFinish);
  onFinishRef.current = onFinish;

  const player = useAudioPlayer(fireworksSound);

  let originX = SCREEN_W / 2;
  let originY = SCREEN_H / 2 - 40;

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
    originX = ((petLng - cLng) / dLng) * SCREEN_W + SCREEN_W / 2;
    originY = ((cLat - petLat) / dLat) * SCREEN_H + SCREEN_H / 2;
  }

  const [playCount, setPlayCount] = useState(0);

  useEffect(() => {
    if (!visible) return;
    webViewRef.current?.injectJavaScript(`
      if (window.__fireworksAnim) {
        window.__fireworksAnim.goToAndPlay(0);
      }
    `);
  }, [visible, playCount]);

  useEffect(() => {
    if (!visible) return;
    const timeout = setTimeout(() => {
      if (playCount < 1) {
        setPlayCount((c) => c + 1);
      }
    }, 3000);
    return () => clearTimeout(timeout);
  }, [visible, playCount]);

  if (!visible) return null;

  return (
    <View style={styles.overlay} pointerEvents="none">
      <WebView
        ref={webViewRef}
        source={{ html: HTML }}
        style={[
          styles.webview,
          { left: originX, top: originY },
        ]}
        scrollEnabled={false}
        onMessage={(e) => {
          const message = e.nativeEvent.data;

          if (message === "start") {
            player.seekTo(0);
            player.play();
          }

          if (message === "finish") {
            onFinishRef.current?.();
          }
        }}
      />
    </View>
  );
}

const HTML = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">
  <script src="https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js"></script>
  <style>
    body { margin: 0; padding: 0; background: transparent; overflow: hidden; }
    #lottie { width: 100%; height: 100%; }
  </style>
</head>
<body>
  <div id="lottie"></div>
  <script>
    var animationData = ${JSON.stringify(require("../../assets/fireworks.json"))};
    window.__fireworksAnim = lottie.loadAnimation({
      container: document.getElementById('lottie'),
      renderer: 'svg',
      loop: false,
      autoplay: true,
      animationData: animationData
    });

    window.__fireworksAnim.addEventListener('DOMLoaded', function() {
      window.ReactNativeWebView.postMessage('start');
    });

    window.__fireworksAnim.addEventListener('complete', function() {
      window.ReactNativeWebView.postMessage('finish');
    });
  </script>
</body>
</html>
`;

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    pointerEvents: "none",
  },
  webview: {
    position: "absolute",
    width: 300,
    height: 300,
    marginLeft: -150,
    marginTop: -150,
    backgroundColor: "transparent",
  },
});
