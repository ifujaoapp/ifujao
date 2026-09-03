import React, { memo, useMemo } from "react";
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/theme";

export type AiSearchBarProps = {
  visible: boolean;
  // Posicionamento vertical (a barra e arrastada verticalmente pelo pegador).
  top: number;
  // Texto e mutator.
  query: string;
  onChangeQuery: (q: string) => void;
  // Submit.
  onSubmit: () => void;
  // Estado: searching, hasResults, otherwise shows "Buscar".
  searching: boolean;
  hasResults: boolean;
  onClear: () => void;
  // Drag handler do pegador (Reanimated pan).
  dragHandleProps: any;
  // Cores do tema.
  themeColors: typeof Colors.light;
};

function AiSearchBarImpl({
  visible,
  top,
  query,
  onChangeQuery,
  onSubmit,
  searching,
  hasResults,
  onClear,
  dragHandleProps,
  themeColors,
}: AiSearchBarProps) {
  const styles = useMemo(() => makeStyles(themeColors), [themeColors]);
  if (!visible) return null;
  return (
    <View style={[styles.aiSearchBar, { top }]}>
      <View style={styles.aiSearchRow}>
        <View {...dragHandleProps} style={styles.aiDragHandle}>
          <Ionicons name="reorder-two" size={18} color="#8E8E93" />
        </View>
        <Ionicons name="search" size={16} color="#8E8E93" />
        <TextInput
          style={styles.aiSearchInput}
          placeholder="Buscar pet com IA"
          placeholderTextColor="#8E8E93"
          value={query}
          onChangeText={onChangeQuery}
          onSubmitEditing={onSubmit}
          returnKeyType="search"
        />
        {searching ? (
          <ActivityIndicator
            size="small"
            color={themeColors.primaryButton}
            style={{ marginRight: 8 }}
          />
        ) : hasResults ? (
          <TouchableOpacity style={styles.aiSearchClear} onPress={onClear}>
            <Ionicons name="close-circle" size={18} color="#8E8E93" />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.aiSearchBtn}
            onPress={onSubmit}
            disabled={!query.trim()}
          >
            <Text style={styles.aiSearchBtnText}>Buscar</Text>
          </TouchableOpacity>
        )}
      </View>
      <Text style={styles.aiSearchHint}>
        Descreva a aparência do pet: espécie, cor e marcações. Ex.: gato
        cinza com manchas brancas
      </Text>
    </View>
  );
}

export const AiSearchBar = memo(AiSearchBarImpl);

const makeStyles = (c: typeof Colors.light) =>
  StyleSheet.create({
    aiSearchBar: {
      position: "absolute",
      left: 12,
      right: 12,
      zIndex: 30,
      flexDirection: "column",
      backgroundColor: c.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.cardStroke,
      paddingVertical: 6,
      paddingHorizontal: 8,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.15,
      shadowRadius: 4,
      elevation: 4,
    },
    aiSearchRow: {
      flexDirection: "row",
      alignItems: "center",
      width: "100%",
    },
    aiDragHandle: {
      paddingHorizontal: 10,
      paddingVertical: 8,
      marginRight: 2,
    },
    aiSearchInput: {
      flex: 1,
      color: c.text,
      fontSize: 14,
      paddingHorizontal: 8,
      paddingVertical: 6,
    },
    aiSearchHint: {
      fontSize: 11,
      color: "#8E8E93",
      paddingHorizontal: 4,
      paddingTop: 4,
      paddingBottom: 2,
    },
    aiSearchBtn: {
      backgroundColor: c.primaryButton,
      borderRadius: 8,
      paddingHorizontal: 12,
      paddingVertical: 6,
    },
    aiSearchBtnText: {
      color: "#FFFFFF",
      fontSize: 14,
      fontWeight: "600",
    },
    aiSearchClear: {
      padding: 4,
    },
  });
