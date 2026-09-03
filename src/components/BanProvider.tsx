import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, type AppStateStatus } from "react-native";
import { getOrCreateDeviceId } from "@/lib/deviceId";
import { checkBan, readBanCache, writeBanCache, type BanRow } from "@/lib/bans";

type BanContextValue = {
  isBanned: boolean;
  ban: BanRow | null;
  deviceId: string;
  phone: string;
  recheck: () => Promise<void>;
};

const BanContext = createContext<BanContextValue | null>(null);

const REFRESH_INTERVAL_MS = 60_000; // 60s
const CACHE_TTL_MS = 5_60_000; // 5min (cache ainda valido se nao passou)

export function BanProvider({ children }: { children: React.ReactNode }) {
  const [deviceId, setDeviceId] = useState("");
  const [phone, setPhone] = useState("");
  const [ban, setBan] = useState<BanRow | null>(null);
  const [ready, setReady] = useState(false);
  const lastCheckRef = useRef(0);
  const inFlightRef = useRef(false);

  const runCheck = useCallback(async () => {
    if (inFlightRef.current) return;
    if (!deviceId && !phone) return;
    inFlightRef.current = true;
    try {
      const fresh = await checkBan(deviceId, phone);
      setBan(fresh);
      await writeBanCache(deviceId, phone, fresh);
    } catch (e) {
      console.warn("[BanProvider] check falhou:", e);
    } finally {
      inFlightRef.current = false;
      lastCheckRef.current = Date.now();
    }
  }, [deviceId, phone]);

  // Inicializa: deviceId, phone (de SecureStore), checagem inicial.
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const id = await getOrCreateDeviceId();
        const ph = (await import("expo-secure-store"))
          .default.getItemAsync("ifujao_my_phone")
          .catch(() => null);
        if (!mounted) return;
        setDeviceId(id);
        setPhone((ph as unknown as string) ?? "");
        // Tenta usar cache para a primeira renderização (rapido).
        const cached = await readBanCache(id, (ph as unknown as string) ?? "");
        if (cached && mounted) {
          const age = Date.now() - cached.ts;
          if (age < CACHE_TTL_MS) {
            setBan(cached.ban);
          }
        }
        setReady(true);
        await runCheck();
      } catch (e) {
        console.warn("[BanProvider] init falhou:", e);
        if (mounted) setReady(true);
      }
    })();
    return () => {
      mounted = false;
    };
    // runCheck depende de deviceId/phone — só roda apos setDeviceId.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-checagem quando deviceId/phone mudam (apos login/cadastro).
  useEffect(() => {
    if (ready) runCheck();
  }, [ready, runCheck]);

  // Polling + checagem ao voltar do background.
  useEffect(() => {
    const t = setInterval(() => {
      runCheck();
    }, REFRESH_INTERVAL_MS);
    const sub = AppState.addEventListener("change", (s: AppStateStatus) => {
      if (s === "active") runCheck();
    });
    return () => {
      clearInterval(t);
      sub.remove();
    };
  }, [runCheck]);

  const recheck = useCallback(async () => {
    await runCheck();
  }, [runCheck]);

  const value = useMemo<BanContextValue>(
    () => ({ isBanned: !!ban, ban, deviceId, phone, recheck }),
    [ban, deviceId, phone, recheck],
  );

  // Enquanto nao estiver pronto, deixa passar (nao bloqueia o app
  // prematuramente).
  if (!ready) {
    return (
      <BanContext.Provider
        value={{ isBanned: false, ban: null, deviceId: "", phone: "", recheck }}
      >
        {children}
      </BanContext.Provider>
    );
  }

  return <BanContext.Provider value={value}>{children}</BanContext.Provider>;
}

export function useBanContext(): BanContextValue {
  const ctx = useContext(BanContext);
  if (!ctx) {
    return {
      isBanned: false,
      ban: null,
      deviceId: "",
      phone: "",
      recheck: async () => {},
    };
  }
  return ctx;
}
