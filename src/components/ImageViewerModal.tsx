import React, { useState, useEffect, useRef } from 'react';
import { Modal, View, Text, TouchableOpacity, ActivityIndicator, StyleSheet, Image, Dimensions } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { showAlert } from '@/src/components/AppAlert';
import { Paths, File as FSFile } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as MediaLibrary from 'expo-media-library';
import { useColorScheme } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';

const SCREEN = Dimensions.get('window');
const SPRING = { damping: 20, stiffness: 200 } as const;

type Props = {
  visible: boolean;
  images: string[];
  index: number;
  title?: string;
  onClose: () => void;
  onIndexChange: (i: number) => void;
};

const MAX_ZOOM = 4;

export function ImageViewerModal({ visible, images, index, title, onClose, onIndexChange }: Props) {
  const scheme = useColorScheme();
  const isDark = scheme === 'dark';
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [areaH, setAreaH] = useState(SCREEN.height);

  const clamped = Math.max(0, Math.min(index, images.length - 1));
  const current = images[clamped];

  const goPrev = () => onIndexChange(clamped - 1);
  const goNext = () => onIndexChange(clamped + 1);

  const handleSave = async () => {
    if (!current || saving) return;
    setSaving(true);
    try {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        setSaving(false);
        return;
      }
      await MediaLibrary.saveToLibraryAsync(current);
      showAlert(
        'success',
        'Imagem salva',
        'A foto foi salva na galeria do seu dispositivo (pasta de fotos).'
      );
    } catch {
    } finally {
      setSaving(false);
    }
  };

  const handleShare = async () => {
    if (!current || sharing) return;
    setSharing(true);
    try {
      const ext = current.includes('.') ? current.split('.').pop()!.split('?')[0] : 'jpg';
      const dest = new FSFile(Paths.cache, `share_${Date.now()}.${ext}`);
      const src = new FSFile(current);
      await (src.copy(dest) as unknown as Promise<void>);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(dest.uri);
      }
    } catch {
    } finally {
      setSharing(false);
    }
  };

  return (
    <Modal visible={visible} transparent={false} onRequestClose={onClose}>
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaView style={[styles.container, { backgroundColor: isDark ? '#000000' : '#101010' }]}>
          <TouchableOpacity style={[styles.closeBtn, { top: insets.top + 8 }]} onPress={onClose} activeOpacity={0.7} hitSlop={12}>
            <Ionicons name="close" size={28} color="#FFFFFF" />
          </TouchableOpacity>

          {title ? (
            <View style={[styles.titleBar, { top: insets.top + 8 }]}>
              <Text style={styles.titleText} numberOfLines={1}>{title}</Text>
              <Text style={styles.counterText}>{clamped + 1} / {images.length}</Text>
            </View>
          ) : null}

          <View
            style={[styles.imageArea, { paddingBottom: insets.bottom + 72 }]}
            onLayout={(e) => setAreaH(e.nativeEvent.layout.height)}
          >
            {current ? (
              <ZoomableImage
                uri={current}
                areaH={areaH}
                onTap={onClose}
                onSwipeLeft={goNext}
                onSwipeRight={goPrev}
                canSwipeLeft={clamped < images.length - 1}
                canSwipeRight={clamped > 0}
              />
            ) : null}
          </View>

          {images.length > 1 && (
            <>
              <TouchableOpacity
                style={[styles.navBtn, styles.navLeft]}
                onPress={goPrev}
                disabled={clamped === 0}
              >
                <Ionicons name="chevron-back" size={32} color={clamped === 0 ? '#555' : '#FFFFFF'} />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.navBtn, styles.navRight]}
                onPress={goNext}
                disabled={clamped === images.length - 1}
              >
                <Ionicons name="chevron-forward" size={32} color={clamped === images.length - 1 ? '#555' : '#FFFFFF'} />
              </TouchableOpacity>
            </>
          )}

          <View style={[styles.actionBar, { bottom: insets.bottom + 12 }]}>
            <TouchableOpacity style={styles.actionBtn} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="download" size={24} color="#FFFFFF" />}
              <Text style={styles.actionLabel}>Salvar</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionBtn} onPress={handleShare} disabled={sharing}>
              {sharing ? <ActivityIndicator color="#FFFFFF" /> : <Ionicons name="share-social" size={24} color="#FFFFFF" />}
              <Text style={styles.actionLabel}>Compartilhar</Text>
            </TouchableOpacity>
          </View>
        </SafeAreaView>
      </GestureHandlerRootView>
    </Modal>
  );
}

const ZoomableImage = ({
  uri,
  areaH,
  onTap,
  onSwipeLeft,
  onSwipeRight,
  canSwipeLeft,
  canSwipeRight,
}: {
  uri: string;
  areaH: number;
  onTap: () => void;
  onSwipeLeft: () => void;
  onSwipeRight: () => void;
  canSwipeLeft: boolean;
  canSwipeRight: boolean;
}) => {
  const screenW = SCREEN.width;
  const [zoomed, setZoomed] = useState(false);

  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  const baseScale = useSharedValue(1);
  const baseX = useSharedValue(0);
  const baseY = useSharedValue(0);
  const isZoomed = useSharedValue(false);

  useEffect(() => {
    scale.value = withTiming(1);
    translateX.value = withTiming(0);
    translateY.value = withTiming(0);
    baseScale.value = 1;
    baseX.value = 0;
    baseY.value = 0;
    isZoomed.value = false;
    setZoomed(false);
  }, [uri, scale, translateX, translateY, baseScale, baseX, baseY, isZoomed]);

  const maxX = (s: number) => {
    'worklet';
    return Math.max(0, (screenW * (s - 1)) / 2);
  };
  const maxY = (s: number) => {
    'worklet';
    return Math.max(0, (areaH * (s - 1)) / 2);
  };
  const clamp = (s: number, x: number, y: number) => {
    'worklet';
    return {
      x: Math.max(-maxX(s), Math.min(maxX(s), x)),
      y: Math.max(-maxY(s), Math.min(maxY(s), y)),
    };
  };

  // 1) Zoom por pinça (focal) — sempre ativo
  const pinch = Gesture.Pinch()
    .onStart((e) => {
      baseScale.value = scale.value;
      baseX.value = translateX.value;
      baseY.value = translateY.value;
      focalX.value = e.focalX;
      focalY.value = e.focalY;
    })
    .onUpdate((e) => {
      const next = Math.min(MAX_ZOOM, Math.max(1, baseScale.value * e.scale));
      const fx = focalX.value - screenW / 2;
      const fy = focalY.value - areaH / 2;
      const r = next / baseScale.value;
      scale.value = next;
      translateX.value = baseX.value * r + fx * (1 - r);
      translateY.value = baseY.value * r + fy * (1 - r);
    })
    .onEnd(() => {
      const s = Math.min(MAX_ZOOM, Math.max(1, scale.value));
      scale.value = withSpring(s, SPRING);
      translateX.value = withSpring(clamp(s, translateX.value, translateY.value).x, SPRING);
      translateY.value = withSpring(clamp(s, translateX.value, translateY.value).y, SPRING);
      isZoomed.value = s > 1.02;
      runOnJS(setZoomed)(s > 1.02);
      baseScale.value = s;
      baseX.value = clamp(s, translateX.value, translateY.value).x;
      baseY.value = clamp(s, translateX.value, translateY.value).y;
    });

  // 2) Pan da IMAGEM — só quando zoomado (move a foto ampliada)
  const imagePan = Gesture.Pan()
    .enabled(zoomed)
    .onStart(() => {
      baseX.value = translateX.value;
      baseY.value = translateY.value;
    })
    .onUpdate((e) => {
      const c = clamp(scale.value, baseX.value + e.translationX, baseY.value + e.translationY);
      translateX.value = c.x;
      translateY.value = c.y;
    })
    .onEnd(() => {
      const c = clamp(scale.value, translateX.value, translateY.value);
      translateX.value = withSpring(c.x, SPRING);
      translateY.value = withSpring(c.y, SPRING);
      baseX.value = c.x;
      baseY.value = c.y;
    });

  // 3) Swipe horizontal — navega entre imagens quando NÃO zoomado
  const swipe = Gesture.Pan()
    .enabled(!zoomed)
    .activeOffsetX([-10, 10])
    .failOffsetY([-10, 10])
    .onEnd((e) => {
      if (e.translationX < -60 && canSwipeLeft) runOnJS(onSwipeLeft)();
      else if (e.translationX > 60 && canSwipeRight) runOnJS(onSwipeRight)();
    });

  // 4) Toque simples — fecha só quando não zoomado e sem swipe
  const tap = Gesture.Tap()
    .numberOfTaps(1)
    .requireExternalGestureToFail(imagePan, swipe, pinch)
    .onEnd(() => {
      if (!isZoomed.value) runOnJS(onTap)();
    });

  const composed = Gesture.Simultaneous(pinch, imagePan, swipe, tap);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <View style={{ width: screenW, height: areaH, overflow: 'hidden' }}>
      <GestureDetector gesture={composed}>
        <Reanimated.View style={[{ width: screenW, height: areaH }, animatedStyle]}>
          <Image
            source={{ uri }}
            style={{ width: screenW, height: areaH, resizeMode: 'contain' }}
          />
        </Reanimated.View>
      </GestureDetector>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1 },
  closeBtn: {
    position: 'absolute',
    right: 16,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.5)',
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  titleBar: {
    position: 'absolute',
    left: 16,
    right: 72,
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleText: { color: '#FFFFFF', fontSize: 17, fontWeight: '700', flex: 1 },
  counterText: { color: '#FFFFFF', fontSize: 13, opacity: 0.8, marginLeft: 8 },
  imageArea: { flex: 1, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },
  navBtn: {
    position: 'absolute',
    top: '50%',
    marginTop: -28,
    zIndex: 10,
    backgroundColor: 'rgba(0,0,0,0.4)',
    width: 48,
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  navLeft: { left: 8 },
  navRight: { right: 8 },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 40,
    zIndex: 10,
  },
  actionBtn: { alignItems: 'center', minWidth: 70 },
  actionLabel: { color: '#FFFFFF', fontSize: 12, marginTop: 4 },
});
