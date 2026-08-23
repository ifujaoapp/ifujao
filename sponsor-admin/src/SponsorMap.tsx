import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from "react-leaflet";
import L from "leaflet";

const sponsorIcon = L.divIcon({
  className: "sponsor-pin-wrap",
  html: '<div class="sponsor-star">★</div>',
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

function Recenter({ lat, lng }: { lat: number; lng: number }) {
  const map = useMap();
  useEffect(() => {
    if (typeof lat === "number" && typeof lng === "number") {
      map.setView([lat, lng], map.getZoom());
    }
  }, [lat, lng, map]);
  return null;
}

export default function SponsorMap({
  lat,
  lng,
  onPick,
}: {
  lat: number;
  lng: number;
  onPick: (lat: number, lng: number) => void;
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
      style={{ height: 320, width: "100%", borderRadius: 12, marginTop: 4 }}
    >
      <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
      <ClickHandler onPick={onPick} />
      <Recenter lat={lat} lng={lng} />
      {hasPoint ? (
        <Marker position={[lat, lng]} icon={sponsorIcon} />
      ) : null}
    </MapContainer>
  );
}
