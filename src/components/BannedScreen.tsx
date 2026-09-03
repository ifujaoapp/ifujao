import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";
import { useThemeMode } from "@/hooks/use-theme-mode";

export function BannedScreen() {
  const { theme } = useThemeMode();
  const isDark = theme === "dark";
  const c = isDark ? Colors.dark : Colors.light;

  return (
    <View
      style={[
        styles.root,
        { backgroundColor: c.background },
      ]}
    >
      <View style={[styles.card, { backgroundColor: c.card, borderColor: c.cardStroke }]}>
        <View style={[styles.iconWrap, { backgroundColor: "rgba(10,132,255,0.12)" }]}>
          <Ionicons name="time-outline" size={48} color="#0A84FF" />
        </View>
        <Text style={[styles.title, { color: c.text }]}>
          Conta em análise
        </Text>
        <Text style={[styles.body, { color: c.text }]}>
          Sua conta está em análise. Estamos verificando alguns detalhes.
          Por favor, tente novamente mais tarde.
        </Text>
        <Text style={[styles.subtle, { color: c.icon }]}>
          Isso pode levar algumas horas. Não é necessário criar uma nova conta.
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  card: {
    width: "100%",
    maxWidth: 360,
    borderRadius: 18,
    borderWidth: 1,
    padding: 24,
    alignItems: "center",
  },
  iconWrap: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: 8,
    textAlign: "center",
  },
  body: {
    fontSize: 15,
    lineHeight: 22,
    textAlign: "center",
    marginBottom: 12,
    opacity: 0.9,
  },
  subtle: {
    fontSize: 12,
    textAlign: "center",
    opacity: 0.7,
  },
});
