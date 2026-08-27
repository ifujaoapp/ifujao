import * as SecureStore from "expo-secure-store";
import { getSupabase, isSupabaseConfigured } from "./supabase";

const GOD_TOKEN_KEY = "ifujao_god_token";
const MOD_URL = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const MOD_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

export const getGodToken = (): Promise<string | null> =>
  SecureStore.getItemAsync(GOD_TOKEN_KEY);

const clearGodToken = (): Promise<void> =>
  SecureStore.deleteItemAsync(GOD_TOKEN_KEY);

export const loginModerator = async (
  username: string,
  password: string,
): Promise<boolean> => {
  const sb = getSupabase();
  if (!sb || !isSupabaseConfigured) return false;
  const { data, error } = await sb.functions.invoke("god-login", {
    body: { username, password },
  });
  if (error || !data?.token) return false;
  await SecureStore.setItemAsync(GOD_TOKEN_KEY, data.token as string);
  return true;
};

export const logoutModerator = async (): Promise<void> => {
  await clearGodToken();
};

// Soft-delete de qualquer pet (moderação). PATCH direto na PostgREST usando o
// JWT de moderador no header Authorization — não depende da sessão do client
// (evita problemas de refresh token e garante que a claim is_moderator chega).
//
// Os campos de match (matchedPetId/matchStatus/matchRequestedBy) ficam DENTRO
// do jsonb `payload` (não são colunas). Por isso:
//  - buscamos o payload atual antes de sobrescrever (PATCH de jsonb substitui
//    o objeto inteiro, não faz merge);
//  - limpamos o vínculo no próprio pet e em toda contraparte que apontava para
//    ele (filtro no índice GIN do payload);
//  - bump de `updated_at` garante que a limpeza do match seja puxada por TODOS
//    os usuários no próximo sync incremental (o delete em si vai pelo cursor de
//    deleted_at). Assim o backend fica 100% consistente para todos.
export const moderatorSoftDelete = async (petId: string): Promise<boolean> => {
  const token = await getGodToken();
  if (!token || !MOD_URL || !MOD_ANON) return false;
  const headers = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    apikey: MOD_ANON,
    Prefer: "return=minimal",
  };
  const now = new Date().toISOString();
  const clearMatch = {
    matchedPetId: null,
    matchStatus: null,
    matchRequestedBy: null,
  };
  try {
    // 1) Payload atual do pet alvo (para não perder o restante do jsonb).
    const getRes = await fetch(
      `${MOD_URL}/rest/v1/pets?id=eq.${encodeURIComponent(petId)}&select=id,payload`,
      { method: "GET", headers },
    );
    const rows = ((await getRes.json().catch(() => [])) as any[]) ?? [];
    const payload = rows?.[0]?.payload ?? {};

    // 2) Soft-delete do pet + limpa o próprio vínculo de match.
    const delRes = await fetch(
      `${MOD_URL}/rest/v1/pets?id=eq.${encodeURIComponent(petId)}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          deleted_at: now,
          updated_at: now,
          payload: { ...payload, ...clearMatch },
        }),
      },
    );
    if (!delRes.ok) {
      const txt = await delRes.text().catch(() => "");
      console.warn("[moderation] delete falhou:", delRes.status, txt);
      return false;
    }

    // 3) Contrapartes: pets que apontavam para este via matchedPetId.
    const cRes = await fetch(
      `${MOD_URL}/rest/v1/pets?payload->>matchedPetId=eq.${encodeURIComponent(
        petId,
      )}&deleted_at=is.null&select=id,payload`,
      { method: "GET", headers },
    );
    const counterparts = ((await cRes.json().catch(() => [])) as any[]) ?? [];
    for (const c of counterparts) {
      const cp = { ...(c.payload ?? {}), ...clearMatch };
      const up = await fetch(
        `${MOD_URL}/rest/v1/pets?id=eq.${encodeURIComponent(c.id)}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ updated_at: now, payload: cp }),
        },
      );
      if (!up.ok) {
        const txt = await up.text().catch(() => "");
        console.warn("[moderation] limpeza de match falhou:", up.status, txt);
      }
    }
    return true;
  } catch (e) {
    console.warn("[moderation] delete erro:", e);
    return false;
  }
};
