import { useCallback, useRef, useState } from "react";
import { PanResponder, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { showAlert } from "@/src/components/AppAlert";
import { searchPets, type SearchResult } from "@/lib/search";

export function useAiSearch() {
  const insets = useSafeAreaInsets();
  const { height: screenH } = useWindowDimensions();
  const [aiQuery, setAiQuery] = useState("");
  const [aiResults, setAiResults] = useState<SearchResult[] | null>(null);
  const [aiSearching, setAiSearching] = useState(false);
  // Barra de busca: visível só ao clicar em "Pesquisar"; posição arrastável.
  const [aiSearchVisible, setAiSearchVisible] = useState(false);
  const [titleBarH, setTitleBarH] = useState(0);
  const [aiBarXY, setAiBarXY] = useState({ x: 12, y: insets.top + 72 });
  const aiBarXYRef = useRef(aiBarXY);
  const aiDragStart = useRef({ x: 0, y: 0 });
  const aiPan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        aiDragStart.current = { ...aiBarXYRef.current };
      },
      onPanResponderMove: (_, g) => {
        const ny = aiDragStart.current.y + g.dy;
        const next = {
          x: 12,
          y: Math.max(8, Math.min(ny, screenH - 120)),
        };
        aiBarXYRef.current = next;
        setAiBarXY(next);
      },
    }),
  ).current;

  const runAiSearch = useCallback(async () => {
    const q = aiQuery.trim();
    if (!q) return;
    setAiSearching(true);
    const { results, rateLimited } = await searchPets(q);
    setAiSearching(false);
    if (rateLimited) {
      showAlert(
        "warning",
        "Limite de buscas atingido",
        "Você fez 20 buscas hoje. Tente novamente amanhã.",
      );
      return;
    }
    if (results.length === 0) {
      showAlert(
        "info",
        "Sem resultados",
        "Nenhum pet encontrado para essa busca.",
      );
      return;
    }
    setAiResults(results);
  }, [aiQuery]);

  const clearAiSearch = useCallback(() => {
    setAiResults(null);
    setAiQuery("");
  }, []);

  return {
    aiQuery,
    setAiQuery,
    aiResults,
    setAiResults,
    aiSearching,
    setAiSearching,
    aiSearchVisible,
    setAiSearchVisible,
    titleBarH,
    setTitleBarH,
    aiBarXY,
    setAiBarXY,
    aiBarXYRef,
    aiPan,
    runAiSearch,
    clearAiSearch,
  };
}
