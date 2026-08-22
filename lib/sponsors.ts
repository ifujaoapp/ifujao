import { getSupabase } from "./supabase";

export type SponsorPin = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  link: string | null;
};

// Lê os patrocinadores ativos (leitura pública via anon key). O app só
// exibe os pins; a escrita fica na interface web (admin autenticado).
export const fetchSponsors = async (): Promise<SponsorPin[]> => {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from("sponsors")
    .select("id, name, latitude, longitude, address, link")
    .eq("active", true);
  if (error) {
    console.warn("[sponsors] fetch falhou:", error.message);
    return [];
  }
  return (data as SponsorPin[]) ?? [];
};
