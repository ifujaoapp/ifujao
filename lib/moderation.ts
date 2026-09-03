import { ssGet, ssSet, ssDel } from "./secureStoreSafe";
import { getSupabase, isSupabaseConfigured } from "./supabase";

const GOD_TOKEN_KEY = "ifujao_god_token";
const MOD_URL = process.env.EXPO_PUBLIC_SUPABASE_URL as string;
const MOD_ANON = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY as string;

// Cache das credenciais para re-autenticar automaticamente quando o
// token expirar (1h). Guardado em SecureStore (criptografado no
// dispositivo). Apenas o app de moderacao usa isso; nao vai para
// o codigo do usuario comum.
const MOD_USER_KEY = "ifujao_mod_user";
const MOD_PASS_KEY = "ifujao_mod_pass";

export const getGodToken = (): Promise<string | null> => ssGet(GOD_TOKEN_KEY);

const clearGodToken = (): Promise<void> => ssDel(GOD_TOKEN_KEY);

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
  await ssSet(GOD_TOKEN_KEY, data.token as string);
  // Salva as credenciais para re-autenticar quando o token expirar.
  await ssSet(MOD_USER_KEY, username);
  await ssSet(MOD_PASS_KEY, password);
  return true;
};

// Retorna o token de moderador. Se o token atual falhar (expirado,
// secret mudou), re-autentica automaticamente usando as credenciais
// guardadas no login. Retorna null se nao houver credenciais.
//
// Se `forceRefresh` for true, ignora o token em cache e tenta re-
// autenticar do zero (usado quando o servidor retornou 401).
let refreshInFlight: Promise<string | null> | null = null;
export const getFreshGodToken = async (
  forceRefresh = false,
): Promise<string | null> => {
  if (!forceRefresh) {
    const current = await getGodToken();
    if (current) return current;
  }
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const user = await ssGet(MOD_USER_KEY);
      const pass = await ssGet(MOD_PASS_KEY);
      if (!user || !pass) {
        refreshInFlight = null;
        return null;
      }
      // Limpa o token expirado/invalido antes de re-autenticar.
      await clearGodToken();
      const ok = await loginModerator(user, pass);
      refreshInFlight = null;
      if (!ok) {
        // Credenciais podem ter mudado. Limpa tudo para forcar novo login.
        await clearGodToken();
        await ssDel(MOD_USER_KEY);
        await ssDel(MOD_PASS_KEY);
        return null;
      }
      return await getGodToken();
    } catch {
      refreshInFlight = null;
      return null;
    }
  })();
  return refreshInFlight;
};

export const logoutModerator = async (): Promise<void> => {
  await clearGodToken();
  await ssDel(MOD_USER_KEY);
  await ssDel(MOD_PASS_KEY);
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
  const fetchPetPayload = async (
    id: string,
    select = "id,payload",
  ): Promise<Record<string, unknown>> => {
    const res = await fetch(
      `${MOD_URL}/rest/v1/pets?id=eq.${encodeURIComponent(id)}&select=${select}`,
      { method: "GET", headers },
    );
    const rows = ((await res.json().catch(() => [])) as any[]) ?? [];
    return rows?.[0]?.payload ?? {};
  };
  const patchPet = async (
    id: string,
    body: Record<string, unknown>,
  ): Promise<boolean> => {
    const res = await fetch(
      `${MOD_URL}/rest/v1/pets?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers,
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      console.warn("[moderation] PATCH falhou:", id, res.status, txt);
      return false;
    }
    return true;
  };
  try {
    // 1) Payload atual do pet alvo (para não perder o restante do jsonb).
    const payload = await fetchPetPayload(petId);

    // 2) Soft-delete do pet + limpa o próprio vínculo de match.
    const delOk = await patchPet(petId, {
      deleted_at: now,
      updated_at: now,
      payload: { ...payload, ...clearMatch },
    });
    if (!delOk) return false;

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
      await patchPet(c.id, { updated_at: now, payload: cp });
    }
    return true;
  } catch (e) {
    console.warn("[moderation] delete erro:", e);
    return false;
  }
};
