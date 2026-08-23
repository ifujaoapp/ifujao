export type Sponsor = {
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
  active: boolean;
  visible_from: string | null;
  created_at: string;
  updated_at: string;
};

export type SponsorInput = {
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  link: string | null;
  phone: string | null;
  instagram: string | null;
  facebook: string | null;
  logo: string | null;
  active: boolean;
  visibleFrom: string;
};
