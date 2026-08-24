import { useRef, useState } from "react";
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
export const ImageCarousel = ({
  images,
  blurRadius = 0,
  onPressImage,
}: {
  images: string[];
  blurRadius?: number;
  onPressImage?: (images: string[], index: number) => void;
}) => {
  const [index, setIndex] = useState(0);
  const [width, setWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const clamped = Math.max(0, Math.min(index, images.length - 1));
  const btn = (disabled: boolean): any => ({
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
    opacity: disabled ? 0.3 : 1,
  });
  const goTo = (next: number) => {
    const target = Math.max(0, Math.min(next, images.length - 1));
    setIndex(target);
    if (width > 0 && scrollRef.current) {
      scrollRef.current.scrollTo({ x: target * width, animated: true });
    }
  };
  return (
    <View
      style={{
        width: "100%",
        height: 180,
        marginBottom: 14,
        position: "relative",
        borderRadius: 12,
        overflow: "hidden",
      }}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      <ScrollView
        ref={scrollRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEnabled={images.length > 1}
        onMomentumScrollEnd={(e) => {
          const w = e.nativeEvent.layoutMeasurement.width;
          if (w > 0) setIndex(Math.round(e.nativeEvent.contentOffset.x / w));
        }}
        style={StyleSheet.absoluteFill}
      >
        {images.map((uri, i) => (
          <View
            key={i}
            style={{
              width: width || "100%",
              height: 180,
              overflow: "hidden",
              position: "relative",
              backgroundColor: "#000",
            }}
          >
            {/* Fundo: mesma imagem distorcida (stretch) e BORRADA para preencher */}
            <Image
              source={{ uri }}
              style={[StyleSheet.absoluteFill, { resizeMode: "stretch" }]}
              blurRadius={20}
            />
            {/* Escurece o fundo para a foto da frente destacar */}
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: "rgba(0,0,0,0.55)" },
              ]}
            />
            {/* Frente: foto inteira, centralizada, sem distorcer */}
            <Image
              source={{ uri }}
              style={[StyleSheet.absoluteFill, { resizeMode: "contain" }]}
              blurRadius={blurRadius}
            />
            <BlurView
              intensity={blurRadius > 0 ? 70 : 0}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            <View
              style={[
                StyleSheet.absoluteFill,
                { backgroundColor: "rgba(0,0,0,0.15)" },
              ]}
            />
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => onPressImage?.(images, i)}
            />
          </View>
        ))}
      </ScrollView>
      {images.length > 1 && (
        <View
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "center",
            paddingHorizontal: 8,
            paddingBottom: 8,
          }}
        >
          <TouchableOpacity
            style={btn(clamped === 0)}
            disabled={clamped === 0}
            onPress={() => goTo(clamped - 1)}
          >
            <Ionicons name="chevron-back" size={22} color="#FFFFFF" />
          </TouchableOpacity>
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: 13,
              fontWeight: "bold",
              backgroundColor: "rgba(0,0,0,0.5)",
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 12,
            }}
          >
            {clamped + 1} / {images.length}
          </Text>
          <TouchableOpacity
            style={btn(clamped === images.length - 1)}
            disabled={clamped === images.length - 1}
            onPress={() => goTo(clamped + 1)}
          >
            <Ionicons name="chevron-forward" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
};
