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
  visibleFrom: string | null;
};

// Lê os patrocinadores ativos (leitura pública via anon key). O app só
// exibe os pins; a escrita fica na interface web (admin autenticado).
// `visible_from` é a DATA-LIMITE (expiração): o pin fica visível ATÉ essa
// data (incluindo o dia todo). Mostra se `visible_from` é nulo (sem
// expiração) ou cai em hoje/antes de expirar.
//
// O filtro de expiração é feito AQUI em JS (e não via `.or()` no PostgREST)
// para evitar dois problemas: (1) o `.or()` com timestamp ISO falhava
// silenciosamente em alguns casos e retornava ZERO patrocinadores; (2) a
// comparação por timestamp estrito escondia o pin no mesmo dia da data
// limite (pois a data era gravada às 00:00). Aqui comparamos pelo DIA.
export const fetchSponsors = async (): Promise<SponsorPin[]> => {
  const sb = getSupabase();
  if (!sb) return [];
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const { data, error } = await sb
    .from("sponsors")
    .select("id, name, latitude, longitude, address, link, phone, instagram, facebook, visible_from")
    .eq("active", true);
  if (error) {
    console.warn("[sponsors] fetch falhou:", error.message);
    return [];
  }
  return ((data as Array<Record<string, unknown>>) ?? [])
    .filter((s) => {
      const vf = s.visible_from as string | null;
      if (!vf) return true;
      const exp = new Date(vf);
      return !Number.isNaN(exp.getTime()) && exp >= startOfToday;
    })
    .map((s) => ({
    id: String(s.id),
    name: String(s.name ?? ""),
    latitude: Number(s.latitude),
    longitude: Number(s.longitude),
    address: (s.address as string | null) ?? null,
    link: (s.link as string | null) ?? null,
    phone: (s.phone as string | null) ?? null,
    instagram: (s.instagram as string | null) ?? null,
    facebook: (s.facebook as string | null) ?? null,
    visibleFrom: (s.visible_from as string | null) ?? null,
  }));
};
