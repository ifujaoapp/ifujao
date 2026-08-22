export type Sponsor = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  link: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

export type SponsorInput = {
  name: string;
  latitude: number;
  longitude: number;
  address: string | null;
  link: string | null;
  active: boolean;
};
