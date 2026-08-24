import { getSupabase } from "./supabase";

export type SponsorPin = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  link: string | null;
  phone: string | null;
  instagram: string | null;
  facebook: string | null;
  logo: string | null;
  visibleFrom: string | null;
  updatedAt: string | null;
};

// Lê os patrocinadores ativos (leitura pública via anon key). O app só
// exibe os pins; a escrita fica na interface web (admin autenticado).
// `visible_from` é a DATA-LIMITE (expiração) e é um `date` (sem fuso): o
// pin fica visível ATÉ esse dia (inclusive o dia todo), sumindo à meia-noite
// LOCAL do dia seguinte, em qualquer fuso. Nulo = sem expiração.
//
// O filtro de expiração é feito AQUI em JS (e não via `.or()` no PostgREST)
// para evitar que o `.or()` com data falhasse silenciosamente. Como é `date`
// (sem hora), comparamos o dia de calendário local via string "AAAA-MM-DD",
// que é ordenável lexicograficamente = cronológico.

export const isSponsorVisible = (s: Pick<SponsorPin, "visibleFrom">): boolean => {
  const vf = s.visibleFrom;
  if (!vf) return true;
  const now = new Date();
  const today =
    now.getFullYear() +
    "-" +
    String(now.getMonth() + 1).padStart(2, "0") +
    "-" +
    String(now.getDate()).padStart(2, "0");
  return vf >= today;
};

const mapRow = (s: Record<string, unknown>): SponsorPin => ({
  id: String(s.id),
  name: String(s.name ?? ""),
  latitude: Number(s.latitude),
  longitude: Number(s.longitude),
  address: (s.address as string | null) ?? null,
  link: (s.link as string | null) ?? null,
  phone: (s.phone as string | null) ?? null,
  instagram: (s.instagram as string | null) ?? null,
  facebook: (s.facebook as string | null) ?? null,
  logo: (s.logo as string | null) ?? null,
  visibleFrom: (s.visible_from as string | null) ?? null,
  updatedAt: (s.updated_at as string | null) ?? null,
});

export const fetchSponsors = async (): Promise<SponsorPin[]> => {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("sponsors")
    .select(
      "id, name, latitude, longitude, address, link, phone, instagram, facebook, logo, visible_from, updated_at",
    )
    .eq("active", true);
  if (error) {
    console.warn("[sponsors] fetch falhou:", error.message);
    return [];
  }
  return ((data as Array<Record<string, unknown>>) ?? [])
    .map(mapRow)
    .filter((s) => isSponsorVisible(s));
};

export type SponsorDelta = {
  changed: SponsorPin[];
  // null => sem backend / erro: o chamador deve manter o cache atual.
  activeIds: string[] | null;
};

// Delta desde `since`: só os registros ativos modificados/inseridos
// (updated_at > since) + a lista COMPLETA de ids ativos, para detectar
// remoções (patrocinador apagado ou desativado no backend — não há
// `deleted_at`, então comparamos contra os ids ainda ativos).
export const fetchSponsorsDelta = async (since: string): Promise<SponsorDelta> => {
  const sb = getSupabase();
  if (!sb) return { changed: [], activeIds: null };
  try {
    const [changedRes, idsRes] = await Promise.all([
      sb
        .from("sponsors")
        .select(
          "id, name, latitude, longitude, address, link, phone, instagram, facebook, logo, visible_from, updated_at",
        )
        .eq("active", true)
        .gt("updated_at", since),
      sb.from("sponsors").select("id").eq("active", true),
    ]);
    if (changedRes.error || idsRes.error) {
      console.warn(
        "[sponsors] delta falhou:",
        (changedRes.error ?? idsRes.error)?.message,
      );
      return { changed: [], activeIds: null };
    }
    // Traz TODOS os ativos alterados desde `since`, independente de expiração.
    // A visibilidade (isSponsorVisible) é aplicada só no merge final
    // (refreshSponsors), para que um patrocinador que passou a expirar seja
    // atualizado no cache e então removido — se filtrássemos aqui, o registro
    // antigo (ainda visível) sobraria no cache.
    const changed = ((changedRes.data as Array<Record<string, unknown>>) ?? [])
      .map(mapRow);
    const activeIds = ((idsRes.data as Array<Record<string, unknown>>) ?? []).map(
      (r) => String(r.id),
    );
    return { changed, activeIds };
  } catch (e) {
    console.warn("[sponsors] delta erro:", e);
    return { changed: [], activeIds: null };
  }
};
