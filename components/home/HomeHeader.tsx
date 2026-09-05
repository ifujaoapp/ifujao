import React, { useEffect, useState } from "react";
import { AppState, StyleSheet, Text, TouchableOpacity, View, type LayoutChangeEvent } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";

export type HomeHeaderProps = {
  godMode: boolean;
  themeColors: typeof Colors.light;
  onClockTap: () => void;
  onAboutPress: () => void;
  onPrivacyPress: () => void;
  onLayout?: (e: LayoutChangeEvent) => void;
};

function HomeHeaderImpl({
  godMode,
  themeColors,
  onClockTap,
  onAboutPress,
  onPrivacyPress,
  onLayout,
}: HomeHeaderProps) {
  const [now, setNow] = useState(() => new Date());
  const isDay = now.getHours() >= 6 && now.getHours() < 18;
  const [appState, setAppState] = useState(AppState.currentState);

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      setAppState(nextState);
    });
    return () => subscription.remove();
  }, []);

  useEffect(() => {
    if (appState === "active") {
      setNow(new Date());
    }
  }, [appState]);

  const styles = React.useMemo(() => makeStyles(themeColors), [themeColors]);
  return (
    <View style={styles.titleBar} onLayout={onLayout}>
      <TouchableOpacity
        style={styles.clockWrap}
        activeOpacity={0.7}
        onPress={onClockTap}
      >
        <Ionicons
          style={styles.clockIcon}
          name={isDay ? "sunny" : "moon"}
          size={22}
          color={isDay ? "#FFD60A" : "#E6E6FA"}
        />
        <View style={styles.clockText}>
          <Text style={styles.clockTime}>
            {now.toLocaleTimeString("pt-BR", {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            })}
          </Text>
          <Text style={styles.clockDate}>
            {now.toLocaleDateString("pt-BR", {
              weekday: "short",
              day: "2-digit",
              month: "short",
            })}
          </Text>
        </View>
      </TouchableOpacity>
      {godMode ? (
        <View style={styles.godBadge}>
          <Text style={styles.godBadgeText}>⚡ DEUS</Text>
        </View>
      ) : null}
      <TouchableOpacity style={styles.titleInfoBtn} onPress={onAboutPress}>
        <Ionicons
          name="information-circle"
          size={24}
          color={themeColors.text}
        />
      </TouchableOpacity>
      <TouchableOpacity style={styles.titleInfoBtn} onPress={onPrivacyPress}>
        <Ionicons
          name="shield-checkmark"
          size={24}
          color={themeColors.text}
        />
      </TouchableOpacity>
    </View>
  );
}

export const HomeHeader = HomeHeaderImpl;

const makeStyles = (c: typeof Colors.light) =>
  StyleSheet.create({
    titleBar: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-start",
      backgroundColor: c.card,
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: c.cardStroke,
    },
    clockIcon: {
      marginRight: 8,
    },
    clockWrap: {
      flexDirection: "row",
      alignItems: "center",
    },
    godBadge: {
      marginLeft: 8,
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      backgroundColor: "#FFD60A",
    },
    godBadgeText: {
      color: "#111",
      fontSize: 11,
      fontWeight: "800",
    },
    clockText: {
      alignItems: "flex-start",
    },
    clockTime: {
      color: c.text,
      fontSize: 18,
      fontWeight: "bold",
      letterSpacing: 1,
      fontVariant: ["tabular-nums"],
    },
    clockDate: {
      color: c.text,
      fontSize: 11,
      fontWeight: "600",
      textTransform: "capitalize",
      marginTop: 2,
    },
    titleInfoBtn: {
      marginLeft: "auto",
      padding: 4,
    },
  });
