import { getSupabase } from "./supabase";

/**
 * Confirma um match chamando a Edge Function `confirm-match`.
 * A Edge Function roda com service_role e atualiza ambos os pets
 * (perdido e encontrado) para matchStatus='confirmed', bypassando RLS.
 */
export async function confirmMatch(
  foundPetId: string,
  claimantPetId: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const sb = getSupabase();
    if (!sb) return { ok: false, error: "no supabase" };

    const { data } = await sb.auth.getSession();
    const token = data.session?.access_token;
    if (!token) return { ok: false, error: "no session" };

    const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
    if (!url) return { ok: false, error: "no supabase url" };

    const res = await fetch(`${url}/functions/v1/confirm-match`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        found_pet_id: foundPetId,
        claimant_pet_id: claimantPetId,
      }),
    });

    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text };
    }

    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
