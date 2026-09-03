// Wrapper seguro sobre expo-secure-store.
// Em ambientes sem o módulo nativo (web/Expo Go sem dev-client), os métodos
// viram `undefined`; qualquer chamada direta joga "Cannot read property
// 'getItemAsync' of undefined". Estes helpers detectam isso e fazem
// fallback para localStorage no web; em outros ambientes sem SecureStore
// retornam null / no-op silencioso.

import { Platform } from "react-native";

type SecureStoreLike = {
  getItemAsync: (k: string) => Promise<string | null>;
  setItemAsync: (k: string, v: string) => Promise<void>;
  deleteItemAsync: (k: string) => Promise<void>;
};

let cached: SecureStoreLike | null | undefined;

function getBackend(): SecureStoreLike | null {
  if (cached !== undefined) return cached;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("expo-secure-store");
    const ss: any = mod?.default ?? mod;
    if (
      ss &&
      typeof ss.getItemAsync === "function" &&
      typeof ss.setItemAsync === "function"
    ) {
      cached = ss as SecureStoreLike;
      return cached;
    }
  } catch {
    // módulo ausente
  }
  cached = null;
  return null;
}

function isWeb(): boolean {
  return Platform.OS === "web" && typeof localStorage !== "undefined";
}

export async function ssGet(key: string): Promise<string | null> {
  const backend = getBackend();
  if (backend) {
    try {
      return await backend.getItemAsync(key);
    } catch {
      return null;
    }
  }
  if (isWeb()) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }
  return null;
}

export async function ssSet(key: string, value: string): Promise<void> {
  const backend = getBackend();
  if (backend) {
    try {
      await backend.setItemAsync(key, value);
      return;
    } catch {
      // cai no fallback
    }
  }
  if (isWeb()) {
    try {
      localStorage.setItem(key, value);
    } catch {
      // ignore
    }
  }
}

export async function ssDel(key: string): Promise<void> {
  const backend = getBackend();
  if (backend) {
    try {
      await backend.deleteItemAsync(key);
      return;
    } catch {
      // cai no fallback
    }
  }
  if (isWeb()) {
    try {
      localStorage.removeItem(key);
    } catch {
      // ignore
    }
  }
}
