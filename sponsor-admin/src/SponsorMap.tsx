import { MapContainer, TileLayer, CircleMarker, useMapEvents } from "react-leaflet";

function ClickHandler({ onPick }: { onPick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng);
    },
  });
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
      {hasPoint ? (
        <CircleMarker
          center={[lat, lng]}
          radius={10}
          pathOptions={{ color: "#FF9500", fillColor: "#FF9500", fillOpacity: 1 }}
        />
      ) : null}
    </MapContainer>
  );
}
