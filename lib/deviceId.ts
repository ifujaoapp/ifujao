import * as Application from "expo-application";
import { Platform } from "react-native";
import { ssGet, ssSet } from "./secureStoreSafe";

const DEVICE_ID_KEY = "ifujao_device_id";

function generateId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function webSafeGet(key: string): string | null {
  if (Platform.OS === "web" && typeof localStorage !== "undefined") {
    return localStorage.getItem(key);
  }
  return null;
}

function webSafeSet(key: string, value: string): void {
  if (Platform.OS === "web" && typeof localStorage !== "undefined") {
    localStorage.setItem(key, value);
  }
}

/**
 * Retorna um device id estável por instalação/dispositivo.
 * - Android: getAndroidId()
 * - iOS: getIosIdForVendorAsync()
 * - Fallback (web, emuladores, falhas): UUID persistido em SecureStore
 *   (ou localStorage no web, onde SecureStore não está disponível).
 */
export async function getOrCreateDeviceId(): Promise<string> {
  try {
    if (Platform.OS === "android") {
      const id = await Application.getAndroidId();
      if (id) return id;
    } else if (Platform.OS === "ios") {
      const id = await Application.getIosIdForVendorAsync();
      if (id) return id;
    }
  } catch {
    // platform API indisponível -> cai no fallback abaixo
  }

  try {
    const stored = await ssGet(DEVICE_ID_KEY);
    if (stored) return stored;
    const id = generateId();
    await ssSet(DEVICE_ID_KEY, id);
    return id;
  } catch {
    try {
      const stored = webSafeGet(DEVICE_ID_KEY);
      if (stored) return stored;
      const id = generateId();
      webSafeSet(DEVICE_ID_KEY, id);
      return id;
    } catch {
      return generateId();
    }
  }
}
