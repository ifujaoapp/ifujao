export interface City {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

export const CITIES: City[] = [
  {
    id: 'sorocaba',
    name: 'Sorocaba',
    latitude: -23.5019,
    longitude: -47.4581,
    radiusMeters: 12000,
  },
  {
    id: 'votorantim',
    name: 'Votorantim',
    latitude: -23.5475,
    longitude: -47.4406,
    radiusMeters: 9000,
  },
];

export const DEFAULT_CITY_ID = 'sorocaba';

export function getCityById(id: string): City {
  return CITIES.find((c) => c.id === id) ?? CITIES[0];
}

export function distanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
