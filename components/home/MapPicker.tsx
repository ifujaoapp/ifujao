import { useEffect, useMemo, useRef, useState } from "react";
import { View } from "react-native";
import { WebView } from "react-native-webview";
import type { City } from "@/constants/cities";

export function MapPicker({
  initial,
  value,
  userLocation,
  gpsNonce,
  theme,
  city,
  onPick,
}: {
  initial: { latitude: number; longitude: number };
  value?: { latitude: number; longitude: number } | null;
  userLocation: { latitude: number; longitude: number } | null;
  gpsNonce: number;
  theme: "light" | "dark";
  city: City;
  onPick: (lat: number, lng: number) => void;
}) {
  const isDark = theme === "dark";
  const [start] = useState(initial);
  const webRef = useRef<WebView>(null);
  const html = useMemo(() => {
    const mapFilter = isDark
      ? "filter: invert(1) hue-rotate(180deg) brightness(0.95);"
      : "";
    return `
  <!DOCTYPE html>
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>html,body,#map{height:100%;margin:0;padding:0;touch-action:manipulation;} .leaflet-control-attribution{display:none !important;} #map{${mapFilter}}</style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', { attributionControl: false, tap: true, dragging: true, scrollWheelZoom: true, doubleClickZoom: true, zoomControl: true, inertia: true }).setView([${start.latitude}, ${start.longitude}], 15);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(map);
        var marker = L.marker([${start.latitude}, ${start.longitude}], { draggable: true }).addTo(map);
        map.on('click', function(e){ marker.setLatLng(e.latlng); window.ReactNativeWebView.postMessage(JSON.stringify({ lat: e.latlng.lat, lng: e.latlng.lng })); });
        marker.on('dragend', function(){ var p = marker.getLatLng(); window.ReactNativeWebView.postMessage(''+JSON.stringify({ lat: p.lat, lng: p.lng })); });
        document.addEventListener('message', function(e){
          try {
            var d = JSON.parse(e.data);
            if (d && d.move && typeof d.move.lat === 'number' && typeof d.move.lng === 'number') {
              marker.setLatLng([d.move.lat, d.move.lng]);
              map.setView([d.move.lat, d.move.lng]);
            }
          } catch (err) {}
        });
      </script>
    </body>
  </html>`;
  }, [isDark, start.latitude, start.longitude, city.latitude, city.longitude]);

  useEffect(() => {
    if (value && webRef.current) {
      webRef.current.postMessage(
        JSON.stringify({ move: { lat: value.latitude, lng: value.longitude } }),
      );
    }
  }, [value?.latitude, value?.longitude]);

  // Força o recentramento no GPS a cada toque no botão, mesmo quando o
  // petLocation já é igual ao GPS (ex.: usuário só panorâmico o mapa).
  useEffect(() => {
    if (gpsNonce > 0 && userLocation && webRef.current) {
      webRef.current.postMessage(
        JSON.stringify({
          move: { lat: userLocation.latitude, lng: userLocation.longitude },
        }),
      );
    }
  }, [gpsNonce]);

  return (
    <View
      style={{ width: "100%", height: "100%" }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderTerminationRequest={() => false}
      onStartShouldSetResponderCapture={() => true}
      onMoveShouldSetResponderCapture={() => true}
    >
      <WebView
        ref={webRef}
        style={{ width: "100%", height: "100%", borderRadius: 12 }}
        originWhitelist={["*"]}
        source={{ html }}
        setSupportMultipleWindows={false}
        overScrollMode="never"
        nestedScrollEnabled={true}
        javaScriptEnabled={true}
        onMessage={(e) => {
          try {
            const d = JSON.parse(e.nativeEvent.data);
            if (typeof d.lat === "number" && typeof d.lng === "number")
              onPick(d.lat, d.lng);
          } catch {}
        }}
      />
    </View>
  );
}
