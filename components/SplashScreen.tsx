import React, { useEffect, useState } from 'react';
import { StyleSheet, View, Image } from 'react-native';
import { WebView } from 'react-native-webview';

export default function SplashScreenComponent({ onFinish }: { onFinish: () => void }) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      onFinish();
    }, 3000);
    return () => clearTimeout(timer);
  }, [onFinish]);

  if (!visible) return null;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
        <style>
          html, body {
            margin: 0;
            padding: 0;
            width: 100%;
            height: 100%;
            background: transparent;
            display: flex;
            align-items: center;
            justify-content: center;
            overflow: hidden;
          }
          #lottie {
            width: 200px;
            height: 200px;
          }
        </style>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js"></script>
      </head>
      <body>
        <div id="lottie"></div>
        <script>
          var animData = ${JSON.stringify(require('../assets/heart.json'))};
          var anim = lottie.loadAnimation({
            container: document.getElementById('lottie'),
            renderer: 'svg',
            loop: true,
            autoplay: true,
            animationData: animData
          });
        </script>
      </body>
    </html>
  `;

return (
    <View style={styles.container}>
      <View style={styles.logoWrapper}>
        <Image
          source={require('../assets/images/logo_bg.png')}
          style={styles.logo}
          resizeMode="contain"
        />
        <View style={styles.lottieOverlay}>
          <WebView
            originWhitelist={['*']}
            source={{ html }}
            style={styles.webview}
            scrollEnabled={false}
            onError={() => {}}
            onHttpError={() => {}}
          />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
  },
  logoWrapper: {
    width: 280,
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    position: 'absolute',
    width: 280,
    height: 280,
  },
  lottieOverlay: {
    position: 'absolute',
    width: 280,
    height: 280,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webview: {
    width: 280,
    height: 280,
    backgroundColor: 'transparent',
  },
});