import * as SecureStore from "expo-secure-store";

const TERMS_KEY = "ifujao_terms_accepted";
const TERMS_VERSION = "08/2026";

export interface TermsStatus {
  accepted: boolean;
  acceptedAt?: string;
  version: string;
}

export const getTermsAccepted = async (): Promise<TermsStatus> => {
  try {
    const stored = await SecureStore.getItemAsync(TERMS_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      return {
        accepted: parsed.accepted === true,
        acceptedAt: parsed.acceptedAt,
        version: parsed.version || TERMS_VERSION,
      };
    }
    return { accepted: false, version: TERMS_VERSION };
  } catch (e) {
    console.error("Erro ao ler termos do SecureStore", e);
    return { accepted: false, version: TERMS_VERSION };
  }
};

export const setTermsAccepted = async (accepted: boolean, version: string = TERMS_VERSION): Promise<void> => {
  try {
    await SecureStore.setItemAsync(TERMS_KEY, JSON.stringify({
      accepted,
      acceptedAt: new Date().toISOString(),
      version,
    }));
  } catch (e) {
    console.error("Erro ao salvar termos do SecureStore", e);
  }
};