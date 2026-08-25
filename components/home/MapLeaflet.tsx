import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { type Region } from "react-native-maps";
import { distanceMeters, type City } from "@/constants/cities";
import { type SponsorPin } from "@/lib/sponsors";
import { type PetRecord } from "@/lib/storage";
export const MapLeaflet = ({
  initialCenter,
  region,
  userLocation,
  recenterNonce,
  pets,
  onMarkerPress,
  sponsors,
  onSponsorPress,
  theme,
  city,
  fitToResults,
  showSponsorText,
}: {
  initialCenter: { latitude: number; longitude: number } | null;
  region: Region;
  userLocation: { latitude: number; longitude: number } | null;
  recenterNonce: number;
  pets: PetRecord[];
  onMarkerPress: (petId: string) => void;
  sponsors: SponsorPin[];
  onSponsorPress: (s: SponsorPin) => void;
  theme: "light" | "dark";
  city: City;
  fitToResults?: boolean;
  showSponsorText: boolean;
}) => {
  const webRef = useRef<WebView>(null);
  const [mapReady, setMapReady] = useState(false);
  const petsRef = useRef(pets);
  petsRef.current = pets;
  const sponsorsRef = useRef(sponsors);
  sponsorsRef.current = sponsors;
  const center = initialCenter ?? {
    latitude: city.latitude,
    longitude: city.longitude,
  };
  const isDark = theme === "dark";
  const mapFilter = isDark
    ? "filter: invert(1) hue-rotate(180deg) brightness(0.95);"
    : "";
  const html = useMemo(
    () => `
  <!DOCTYPE html>
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>html,body,#map{height:100%;margin:0;padding:0;touch-action:none;} .leaflet-control-attribution{display:none !important;} #map{${mapFilter}} .paw-pin{filter:drop-shadow(0 2px 3px rgba(0,0,0,0.5));} .paw-pin svg{display:block;} .paw-pin .paw-emoji{position:absolute;top:6px;left:0;right:0;text-align:center;font-size:16px;line-height:1;z-index:2;} .paw-pulse{position:absolute;left:50%;top:16px;width:24px;height:24px;margin:-12px 0 0 -12px;border-radius:50%;background:rgba(10,132,255,0.30);box-shadow:0 0 0 2px rgba(10,132,255,0.25);animation:pawPulse 3s ease-out infinite;pointer-events:none;z-index:0;} .paw-pulse.paw-pulse-reported{background:rgba(255,59,48,0.30);box-shadow:0 0 0 2px rgba(255,59,48,0.25);} @keyframes pawPulse{0%{transform:scale(0.5);opacity:0.9;}70%{transform:scale(2);opacity:0;}100%{transform:scale(0.5);opacity:0;}} .sponsor-pin-wrap{background:transparent;border:none;overflow:visible;} .sponsor-star{box-sizing:border-box;width:38px;height:38px;margin:0 auto;position:relative;display:flex;align-items:center;justify-content:center;font-size:20px;line-height:1;background:radial-gradient(circle at 50% 35%, #ffb347 0%, #ff9500 70%);border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 5px rgba(255,149,0,0.35),0 6px 14px rgba(0,0,0,0.45);animation:sponsorPulse 2.8s ease-out infinite;} .sponsor-label{display:block;text-align:center;margin-top:3px;max-width:150px;margin-left:auto;margin-right:auto;} .sponsor-label span{display:inline-block;font-size:11px;font-weight:700;color:#fff;background:rgba(0,0,0,0.6);padding:2px 7px;border-radius:8px;white-space:normal;word-break:break-word;line-height:1.2;} .sponsor-ad-badge{position:absolute;top:-5px;right:-5px;font-size:7px;font-weight:700;line-height:1;color:#fff;background:#007AFF;border-radius:4px;padding:1px 3px;box-shadow:0 1px 2px rgba(0,0,0,0.4);z-index:3;} .pet-pin-label{position:absolute;top:42px;left:0;right:0;text-align:center;pointer-events:none;} .pet-pin-label span{display:inline-block;font-size:8px;font-weight:700;letter-spacing:0;color:#fff;background:#FF3B30;border-radius:6px;padding:1px 5px;white-space:nowrap;box-shadow:0 1px 2px rgba(0,0,0,0.4);} .pet-pin-label.pet-pin-reported span{background:#B00020;} .leaflet-container.hide-pet-labels .pet-pin-label{display:none;} @keyframes sponsorPulse{0%{box-shadow:0 0 0 4px rgba(255,149,0,0.45),0 6px 14px rgba(0,0,0,0.45);}70%{box-shadow:0 0 0 16px rgba(255,149,0,0),0 6px 14px rgba(0,0,0,0.45);}100%{box-shadow:0 0 0 4px rgba(255,149,0,0),0 6px 14px rgba(0,0,0,0.45);}} .map-legend{position:absolute;right:10px;bottom:10px;z-index:1000;pointer-events:none;display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.92);padding:6px 10px;border-radius:10px;font-size:12px;font-weight:700;color:#333;box-shadow:0 2px 6px rgba(0,0,0,0.3);} .map-legend .legend-dot{width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:13px;background:radial-gradient(circle at 50% 35%, #ffb347 0%, #ff9500 70%);border:2px solid #fff;border-radius:50%;}</style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        var map = L.map('map', { attributionControl: false }).setView([${center.latitude}, ${center.longitude}], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19
        }).addTo(map);

        // Corrige mapa preto/cinza quando o container ainda está com tamanho 0
        // na inicialização (Leaflet calcula tiles com tamanho 0). Recalcula o
        // tamanho em vários momentos e quando os tiles terminam de carregar.
        var __invalidate = function(){ try { if (window.__map) window.__map.invalidateSize(); } catch (e) {} };
        setTimeout(__invalidate, 200);
        setTimeout(__invalidate, 500);
        setTimeout(__invalidate, 1000);
        map.on('load', __invalidate);

        var pawIcon = L.divIcon({
          className: 'paw-pin',
          html: '<div style="position:relative;width:64px;height:58px;">' +
            '<div style="position:absolute;left:17px;top:0;width:30px;height:40px;">' +
            '<div class="paw-pulse"></div>' +
            '<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg" style="position:relative;z-index:2;">' +
            '<path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 13.2 22.6 13.9 23.3.5.5 1.3.5 1.8 0C16.4 37.6 30 25.5 30 15 30 6.7 23.3 0 15 0z" fill="#ffffff" stroke="#0A84FF" stroke-width="2"/>' +
            '</svg>' +
            '<div class="paw-emoji">🐾</div>' +
            '</div>' +
            '<div class="pet-pin-label"><span>PERDIDO</span></div>' +
            '</div>',
          iconSize: [64, 58],
          iconAnchor: [32, 40],
          popupAnchor: [0, -44],
        });

        var reportedIcon = L.divIcon({
          className: 'paw-pin',
          html: '<div style="position:relative;width:64px;height:58px;">' +
            '<div style="position:absolute;left:17px;top:0;width:30px;height:40px;">' +
            '<div class="paw-pulse paw-pulse-reported"></div>' +
            '<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg" style="position:relative;z-index:2;">' +
            '<path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 13.2 22.6 13.9 23.3.5.5 1.3.5 1.8 0C16.4 37.6 30 25.5 30 15 30 6.7 23.3 0 15 0z" fill="#ffffff" stroke="#FF3B30" stroke-width="2"/>' +
            '</svg>' +
            '<div class="paw-emoji" style="color:#FF3B30;">⚑</div>' +
            '</div>' +
            '<div class="pet-pin-label pet-pin-reported"><span>DENÚNCIA</span></div>' +
            '</div>',
          iconSize: [64, 58],
          iconAnchor: [32, 40],
          popupAnchor: [0, -44],
        });

        window.__map = map;
        // Rótulos PERDIDO/DENÚNCIA só aparecem quando o usuário aproxima
        // (zoom >= 14), evitando poluir o mapa em visão geral.
        var __applyPetLabels = function(){
          var el = map.getContainer();
          if (map.getZoom() >= 14) el.classList.remove('hide-pet-labels');
          else el.classList.add('hide-pet-labels');
        };
        map.on('zoomend', __applyPetLabels);
        __applyPetLabels();
        window.__pawIcon = pawIcon;
        window.__reportedIcon = reportedIcon;

        window.__petMarkers = [];
        window.__sponsorMarkers = [];
        window.__renderSponsors = function(list){
          if (!window.__sponsorMarkers) window.__sponsorMarkers = [];
          window.__sponsorMarkers.forEach(function(m){ window.__map.removeLayer(m); });
          window.__sponsorMarkers = [];
          (list || []).forEach(function(s){
            if (typeof s.latitude !== 'number' || typeof s.longitude !== 'number') return;
            var name = (s.name || '').toString().replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
             var showLabel = window.__showSponsorLabels !== false;
             var icon = L.divIcon({
              className: 'sponsor-pin-wrap',
              html: '<div style="position:relative;width:38px;height:38px;margin:0 auto;">' +
                '<div class="sponsor-star">🛍️</div>' +
                '<div class="sponsor-ad-badge">Ad</div>' +
                '</div>' +
                (showLabel ? '<div class="sponsor-label"><span>' + name + '</span></div>' : ''),
              iconSize: showLabel ? [150, 58] : [50, 44],
              // Anchor segue o tamanho do ícone: com o rótulo o ponto fica no
              // centro da estrela (75,19); sem rótulo (38x38 centralizada em 50)
              // o centro é (25,19). Anchor fixo causava o pin fora da posição GPS.
              iconAnchor: showLabel ? [75, 19] : [25, 19],
              popupAnchor: [0, -30],
            });
            var m = L.marker([s.latitude, s.longitude], { icon: icon }).addTo(window.__map);
            m.on('click', function(){ window.ReactNativeWebView.postMessage(JSON.stringify({ sponsorId: s.id, name: s.name, link: s.link, address: s.address, phone: s.phone, instagram: s.instagram, facebook: s.facebook, logo: s.logo, latitude: s.latitude, longitude: s.longitude })); });
            window.__sponsorMarkers.push(m);
          });
        };
        window.__renderPets = function(pets){
          if (!window.__petMarkers) window.__petMarkers = [];
          window.__petMarkers.forEach(function(m){ window.__map.removeLayer(m); });
          window.__petMarkers = [];
          function addMarker(p, lat, lng){
            var m = L.marker([lat, lng], { icon: p.reported ? window.__reportedIcon : window.__pawIcon }).addTo(window.__map);
            m.on('click', function(){ window.ReactNativeWebView.postMessage(JSON.stringify({petId:p.id, contact:p.contact})); });
            window.__petMarkers.push(m);
          }
          var groups = {};
          pets.forEach(function(p){
            if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') return;
            var key = p.latitude.toFixed(5) + ',' + p.longitude.toFixed(5);
            (groups[key] = groups[key] || []).push(p);
          });
          var delta = 0.0003;
          Object.keys(groups).forEach(function(key){
            groups[key].forEach(function(p, i){ addMarker(p, p.latitude, p.longitude + delta * i); });
          });
        };
        window.__renderPets([]);
      </script>
    </body>
  </html>`,
    [initialCenter, city, center.latitude, center.longitude, mapFilter],
  );

  // Delta de separação (graus) para pets na mesma coordenada (~33m). Como esta
  // string é re-injetada a cada mudança de `pets` (e no onLoad), o valor novo
  // entra em vigor SEM precisar recarregar o WebView.
  const SPIDER_DELTA = 0.0003;
  const renderPetsJs = (list: PetRecord[]) =>
    `(function(){
      window.__renderPets = function(pets){
        if (!window.__petMarkers) window.__petMarkers = [];
        window.__petMarkers.forEach(function(m){ window.__map.removeLayer(m); });
        window.__petMarkers = [];
        function addMarker(p, lat, lng){
          var m = L.marker([lat, lng], { icon: p.reported ? window.__reportedIcon : window.__pawIcon }).addTo(window.__map);
          m.on('click', function(){ window.ReactNativeWebView.postMessage(JSON.stringify({petId:p.id, contact:p.contact})); });
          window.__petMarkers.push(m);
        }
        var groups = {};
        pets.forEach(function(p){
          if (typeof p.latitude !== 'number' || typeof p.longitude !== 'number') return;
          var key = p.latitude.toFixed(5) + ',' + p.longitude.toFixed(5);
          (groups[key] = groups[key] || []).push(p);
        });
        var delta = ${SPIDER_DELTA};
        Object.keys(groups).forEach(function(key){
          groups[key].forEach(function(p, i){ addMarker(p, p.latitude, p.longitude + delta * i); });
        });
      };
      var tryRender = function(){ if (window.__renderPets && window.__map) { window.__renderPets(${JSON.stringify(list)}); } else { setTimeout(tryRender, 200); } };
      tryRender();
    })();`;

  useEffect(() => {
    if (!mapReady || !webRef.current) return;
    webRef.current.injectJavaScript(renderPetsJs(pets));
  }, [mapReady, pets, SPIDER_DELTA]);

  const renderSponsorsJs = (list: SponsorPin[]) =>
    `(function(){
      window.__showSponsorLabels = ${showSponsorText ? "true" : "false"};
      if (!window.__renderSponsors) {
        setTimeout(function(){ if (window.__renderSponsors) window.__renderSponsors(${JSON.stringify(list)}); }, 200);
        return;
      }
      window.__renderSponsors(${JSON.stringify(list)});
    })();`;

  useEffect(() => {
    if (!mapReady || !webRef.current) return;
    webRef.current.injectJavaScript(renderSponsorsJs(sponsors));
  }, [mapReady, sponsors, showSponsorText]);

  // Centraliza o mapa na posição real do usuário quando ela chega/atualiza
  // (incluindo quando definida tarde). Usa um limiar para não "pular" o mapa a
  // cada pequeno ruído de GPS. Válido em qualquer lugar do mundo.
  const lastPanRef = useRef<{ latitude: number; longitude: number } | null>(
    null,
  );
  useEffect(() => {
    if (!mapReady || !webRef.current || !userLocation) return;
    // Em modo busca (fitToResults) não roubamos o enquadramento dos resultados
    // com o auto-pan do GPS a cada poll de 5s.
    if (fitToResults) return;
    const last = lastPanRef.current;
    if (
      last &&
      distanceMeters(
        last.latitude,
        last.longitude,
        userLocation.latitude,
        userLocation.longitude,
      ) < 80
    ) {
      return;
    }
    lastPanRef.current = userLocation;
    const js = `(function(){ if (window.__map) { window.__map.setView([${userLocation.latitude}, ${userLocation.longitude}], Math.max(window.__map.getZoom(), 13)); } })();`;
    webRef.current.injectJavaScript(js);
  }, [mapReady, userLocation]);

  // Força o recentramento quando o botão "Centralizar no meu GPS" é clicado
  // (recenterNonce muda), ignorando o limiar de ruído de GPS — o botão deve
  // centralizar sempre, mesmo já estando próximo.
  useEffect(() => {
    if (!mapReady || !webRef.current || !userLocation) return;
    const js = `(function(){ if (window.__map) { window.__map.setView([${userLocation.latitude}, ${userLocation.longitude}], Math.max(window.__map.getZoom(), 13)); } })();`;
    webRef.current.injectJavaScript(js);
  }, [recenterNonce]);

  // Desenha/atualiza o círculo do usuário via JS (sem recarregar o WebView a
  // cada mudança de GPS — antes o userLocation estava no html e forcava reload +
  // recentralizacao na cidade a cada 5s).
  useEffect(() => {
    if (!mapReady || !webRef.current || !userLocation) return;
    const js = `(function(){
      if (window.__userCircle) { window.__map.removeLayer(window.__userCircle); }
      window.__userCircle = L.circleMarker([${userLocation.latitude}, ${userLocation.longitude}], { radius: 8, color: '#1a73e8', fillColor: '#1a73e8', fillOpacity: 1 }).addTo(window.__map);
    })();`;
    webRef.current.injectJavaScript(js);
  }, [mapReady, userLocation]);

  // Quando a busca por IA está ativa (fitToResults), enquadra o mapa em todos
  // (fix) so re-enquadra quando o CONJUNTO de resultados muda (ids), nao a
  // cada poll de GPS de 5s (que recria o array visiblePets e reativava o
  // fitBounds, redefinindo o zoom que o usuario deu). Veja aiFitKey abaixo.
  const aiFitKey = (pets || [])
    .map((p) => String(p.id))
    .sort()
    .join("|");

  // os pets resultantes. Sem isso, o pin do pet aparece fora da tela (ex.: gato
  // preto em Aracoiaba da Serra fica a dezenas de km do centro padrão/Sorocaba)
  // e a busca "não traz nada" no mapa. Só re-enquadra quando o conjunto de resultados muda (aiFitKey), nao a cada poll de GPS.
  useEffect(() => {
    if (!mapReady || !webRef.current || !fitToResults) return;
    if (!pets || pets.length === 0) return;
    const pts = pets
      .filter(
        (p) =>
          typeof p.latitude === "number" && typeof p.longitude === "number",
      )
      .map((p) => ({ latitude: p.latitude, longitude: p.longitude }));
    if (pts.length === 0) return;
    const js = `(function(){
      if (!window.__map) return;
      var pts = ${JSON.stringify(pts)};
      if (!pts.length) return;
      var bounds = L.latLngBounds(pts.map(function(p){ return [p.latitude, p.longitude]; }));
      window.__map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 });
    })();`;
    webRef.current.injectJavaScript(js);
  }, [mapReady, aiFitKey, fitToResults]); // eslint-disable-line react-hooks/exhaustive-deps

  const source = useMemo(() => ({ html }), [html]);

  return (
    <WebView
      ref={webRef}
      style={[StyleSheet.absoluteFillObject, { zIndex: 0 }]}
      originWhitelist={["*"]}
      source={source}
      setSupportMultipleWindows={false}
      overScrollMode="never"
      nestedScrollEnabled={false}
      javaScriptEnabled={true}
      onLoad={() => {
        setMapReady(true);
        webRef.current?.injectJavaScript(renderPetsJs(petsRef.current));
        webRef.current?.injectJavaScript(renderSponsorsJs(sponsorsRef.current));
        // Garante que o Leaflet recalcule o tamanho do container após o WebView
        // ter dimensões reais (evita mapa preto/cinza por tamanho 0).
        webRef.current?.injectJavaScript(
          "setTimeout(function(){ if (window.__map) window.__map.invalidateSize(); }, 300);",
        );
      }}
      onMessage={(e) => {
        try {
          const data = JSON.parse(e.nativeEvent.data);
          if (data.sponsorId) {
            onSponsorPress({
              id: data.sponsorId,
              name: data.name ?? "",
              latitude: Number(data.latitude),
              longitude: Number(data.longitude),
              address: data.address ?? null,
              link: data.link ?? null,
              phone: data.phone ?? null,
              instagram: data.instagram ?? null,
              facebook: data.facebook ?? null,
              logo: data.logo ?? null,
              visibleFrom: data.visibleFrom ?? null,
              updatedAt: data.updatedAt ?? null,
            });
          } else if (data.petId) {
            onMarkerPress(data.petId);
          }
        } catch {}
      }}
    />
  );
};
