// Geocodificação reversa usando o geocoder NATIVO do aparelho
// (Expo Location → Geocoder do Android/iOS). É gratuito, funciona offline e
// não expõe nenhuma chave de API — o padrão de produção para RN.
//
// Extrai o município da forma mais específica possível. NÃO usamos `region`
// (estado) como fallback, pois em várias regiões do Brasil o campo `city`
// (locality) vem nulo e `region` guarda o ESTADO, o que falsamente fixaria a
// cidade no nome do estado (ex.: "São Paulo").

import * as Location from "expo-location";

export async function reverseGeocodeCity(
  latitude: number,
  longitude: number,
): Promise<string> {
  try {
    const geo = await Location.reverseGeocodeAsync({
      latitude,
      longitude,
    });
    if (!geo.length) return "";
    const g = geo[0];
    return g.city || g.subregion || g.district || "";
  } catch {
    return "";
  }
}
