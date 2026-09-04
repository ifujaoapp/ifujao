import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";
import type { Sponsor } from "./types";

const sponsorIcon = L.divIcon({
  className: "sponsor-pin-wrap",
  html: '<div class="sponsor-star">★</div>',
  iconSize: [48, 48],
  iconAnchor: [24, 24],
});

const editingIcon = L.divIcon({
  className: "sponsor-pin-wrap",
  html: '<div class="sponsor-star sponsor-star-editing">★</div>',
  iconSize: [48, 48],
  iconAnchor: [24, 24],
});

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

function ResizeFix() {
  const map = useMap();
  useEffect(() => {
    const fix = () => map.invalidateSize();
    const t = setTimeout(fix, 0);
    window.addEventListener("resize", fix);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", fix);
    };
  }, [map]);
  return null;
}

function Recenter({
  lat,
  lng,
  focus,
}: {
  lat: number;
  lng: number;
  focus?: { lat: number; lng: number } | null;
}) {
  const map = useMap();
  useEffect(() => {
    const f = focus ?? { lat, lng };
    if (typeof f.lat === "number" && typeof f.lng === "number") {
      map.setView([f.lat, f.lng], map.getZoom());
    }
  }, [focus?.lat, focus?.lng, lat, lng, map]);
  return null;
}

export default function SponsorMap({
  lat,
  lng,
  onPick,
  sponsors = [],
  currentId = null,
  focus = null,
}: {
  lat: number;
  lng: number;
  onPick: (lat: number, lng: number) => void;
  sponsors?: Sponsor[];
  currentId?: string | null;
  focus?: { lat: number; lng: number; id: string } | null;
}) {
  const center: [number, number] =
    typeof lat === "number" && typeof lng === "number"
      ? [lat, lng]
      : [-23.5015, -47.4582];
  const hasPoint = typeof lat === "number" && typeof lng === "number";

  return (
    <MapContainer
      center={center}
      zoom={13}
      style={{ height: 180, width: "100%", borderRadius: 12, display: "block" }}
    >
      <TileLayer
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        attribution="&copy; OpenStreetMap contributors"
      />
      <ResizeFix />
      <ClickHandler onPick={onPick} />
      <Recenter lat={lat} lng={lng} focus={focus ? { lat: focus.lat, lng: focus.lng } : null} />
      {sponsors
        .filter((s) => s.id !== currentId)
        .map((s) => (
          <Marker
            key={s.id}
            position={[s.latitude, s.longitude]}
            icon={s.id === focus?.id ? editingIcon : sponsorIcon}
          >
            <Tooltip>{s.name}</Tooltip>
          </Marker>
        ))}
      {hasPoint ? (
        <Marker position={[lat, lng]} icon={editingIcon} />
      ) : null}
    </MapContainer>
  );
}
