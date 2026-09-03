import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import { WebView } from "react-native-webview";
import { type Region } from "react-native-maps";
import { distanceMeters, type City } from "@/constants/cities";
import { type SponsorPin, pickNearestSponsors } from "@/lib/sponsors";
import { type PetRecord } from "@/lib/storage";
import { FOUND_WINDOW_HOURS } from "@/constants/breeds";
import birdAnimationData from "../../assets/sponsor-bird.json";
export const MapLeaflet = ({
  initialCenter,
  region,
  userLocation,
  recenterNonce,
  pets,
  onMarkerPress,
  onPetLongPress,
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
  onPetLongPress?: (info: { petId: string; deviceId: string | null; phone: string | null; contact: string | null }) => void;
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
  const userLocationRef = useRef(userLocation);
  userLocationRef.current = userLocation;
  const center = useMemo(
    () =>
      initialCenter ?? {
        latitude: city.latitude,
        longitude: city.longitude,
      },
    [initialCenter, city.latitude, city.longitude],
  );
  // Pega os 8 sponsors mais proximos do usuario (ou do centro do mapa) para
  // limitar quantos o passarinho anuncia. Recalcula quando o usuario se move
  // significativamente ou a lista muda.
  const nearestSponsors = useMemo(
    () => pickNearestSponsors(sponsors, userLocation ?? center, 8),
    [sponsors, userLocation, center],
  );
  const nearestSponsorsRef = useRef(nearestSponsors);
  nearestSponsorsRef.current = nearestSponsors;
  const isDark = theme === "dark";
  const mapFilter = isDark
    ? "filter: invert(1) hue-rotate(180deg) brightness(0.95);"
    : "";
  // Serializa a animação Lottie do pássaro uma vez (no mount) para injetar
  // no HTML do mapa e carregar via lottie-web.
  const birdDataJson = useMemo(
    () => JSON.stringify(birdAnimationData),
    [],
  );
  const html = useMemo(
    () => `
  <!DOCTYPE html>
  <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <script src="https://cdnjs.cloudflare.com/ajax/libs/bodymovin/5.12.2/lottie.min.js"></script>
      <style>html,body,#map{height:100%;margin:0;padding:0;touch-action:none;} .leaflet-control-attribution{display:none !important;} .leaflet-control-zoom{margin-bottom:calc(env(safe-area-inset-bottom,0px) + 16px) !important;margin-right:4px !important;} #map{${mapFilter}} .paw-pin{filter:drop-shadow(0 2px 3px rgba(0,0,0,0.5));} .paw-pin svg{display:block;} .paw-pin .paw-emoji{position:absolute;top:6px;left:0;right:0;text-align:center;font-size:16px;line-height:1;z-index:2;} .sponsor-pin-wrap{background:transparent;border:none;overflow:visible;} .sponsor-star{box-sizing:border-box;width:38px;height:38px;margin:0 auto;position:relative;display:flex;align-items:center;justify-content:center;font-size:20px;line-height:1;background:radial-gradient(circle at 50% 35%, #ffb347 0%, #ff9500 70%);border:3px solid #fff;border-radius:50%;box-shadow:0 0 0 5px rgba(255,149,0,0.35),0 6px 14px rgba(0,0,0,0.45);} .sponsor-label{display:block;text-align:center;margin-top:3px;max-width:150px;margin-left:auto;margin-right:auto;} .sponsor-label span{display:inline-block;font-size:11px;font-weight:700;color:#fff;background:rgba(0,0,0,0.6);padding:2px 7px;border-radius:8px;white-space:normal;word-break:break-word;line-height:1.2;} .sponsor-ad-badge{position:absolute;top:-5px;right:-5px;font-size:7px;font-weight:700;line-height:1;color:#fff;background:#007AFF;border-radius:4px;padding:1px 3px;box-shadow:0 1px 2px rgba(0,0,0,0.4);z-index:3;} .pet-pin-label{position:absolute;top:42px;left:0;right:0;text-align:center;pointer-events:none;z-index:3;} .pet-pin-label .pet-text{display:block;font-size:9px;font-weight:700;color:#fff;text-shadow:0 1px 2px rgba(0,0,0,0.85),0 0 2px rgba(0,0,0,0.85);white-space:nowrap;} .pet-pin-label .pet-text-status{font-size:7px;opacity:0.95;} .leaflet-container.hide-pet-labels .pet-pin-label{display:none;} .map-legend{position:absolute;right:10px;bottom:10px;z-index:1000;pointer-events:none;display:flex;align-items:center;gap:6px;background:rgba(255,255,255,0.92);padding:6px 10px;border-radius:10px;font-size:12px;font-weight:700;color:#333;box-shadow:0 2px 6px rgba(0,0,0,0.3);} .map-legend .legend-dot{width:22px;height:22px;display:flex;align-items:center;justify-content:center;font-size:13px;background:radial-gradient(circle at 50% 35%, #ffb347 0%, #ff9500 70%);border:2px solid #fff;border-radius:50%;}</style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        // tap:true (padrao) mantem o click normal em markers funcionando apos
        // gestos de pinch-zoom. O long-press nao depende disso: usamos
        // contextmenu:true (DOM event, independente do tap handler) +
        // timer manual no DOM do icon como fallback. tap:false quebrava o
        // click em pins especificamente apos zoom por pinca no Android
        // WebView, porque desabilita o processamento de click sintetico que
        // o Leaflet faz apos gestos multi-touch.
        var map = L.map('map', { attributionControl: false, zoomControl: false, tap: true, contextmenu: true, worldCopyJump: true }).setView([${center.latitude}, ${center.longitude}], 13);
        L.control.zoom({ position: 'bottomright' }).addTo(map);
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

        // Marcador do pet vira um CHIP retangular: dentro do mesmo elemento
        // ficam a imagem da patinha, a espécie e o status (PERDIDO/DENÚNCIA).
        // A cor do chip diferencia perdido (#FF3B30) de denúncia (#B00020).
        var __esc = function (s) {
          return (s == null ? '' : String(s))
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
        };
        // Distancia em km entre duas coordenadas (haversine).
        function __haversine(lat1, lng1, lat2, lng2) {
          if (typeof lat1 !== 'number' || typeof lng1 !== 'number' ||
              typeof lat2 !== 'number' || typeof lng2 !== 'number') return null;
          var toRad = function(d) { return (d * Math.PI) / 180; };
          var dLat = toRad(lat2 - lat1);
          var dLng = toRad(lng2 - lng1);
          var s = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                  Math.sin(dLng/2) * Math.sin(dLng/2);
          return 6371 * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
        }
        function speciesEmoji(s) {
          var n = (s || '').toString().toLowerCase();
          var map = {
            'cachorro':'🐶','cão':'🐶','cao':'🐶','dog':'🐶',
            'gato':'🐱','cat':'🐱',
            'passaro':'🐦','pássaro':'🐦','tucano':'🐦','bird':'🐦',
            'papagaio':'🦜','periquito':'🦜','calopsita':'🦜','cacatua':'🦜','arara':'🦜','parrot':'🦜',
            'canario':'🐤','peru':'🦃','turkey':'🦃',
            'coelho':'🐰','rabbit':'🐰','bunny':'🐰',
            'hamster':'🐹','chinchila':'🐹','porquinho da india':'🐹','porquinho-da-índia':'🐹',
            'rato':'🐭','camundongo':'🐭','mouse':'🐭',
            'cavalo':'🐴','pônei':'🐴','pontei':'🐴','horse':'🐴',
            'lagarto':'🦎','iguana':'🦎','axolote':'🦎','salamandra':'🦎','lizard':'🦎',
            'serpente':'🐍','cobra':'🐍','snake':'🐍',
            'tartaruga':'🐢','turtle':'🐢','tartaruga da terra':'🐢',
            'peixe':'🐠','peixe beta':'🐟','betta':'🐟','goldfish':'🐠','fish':'🐠',
            'porco':'🐷','ovelha':'🐑','cabra':'🐐','pig':'🐷',
            'galinha':'🐔','pato':'🦆','ganso':'🦢','chicken':'🐔','duck':'🦆',
            'sapo':'🐸','rã':'🐸','ra':'🐸','frog':'🐸',
            'furão':'🦡','furao':'🦡','ferret':'🦡',
            'camelo':'🐫','elefante':'🐘','macaco':'🐵','urso':'🐻','leão':'🦁','tigre':'🐯','vaca':'🐮','bode':'🐐'
          };
          return map[n] || '🐾';
        }
        function formatRelDays(iso) {
          if (!iso) return '';
          var d = new Date(iso);
          if (isNaN(d.getTime())) return '';
          var a = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
          var now = new Date();
          var b = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
          var diff = Math.round((b - a) / 86400000);
          if (diff <= 0) return 'Hoje';
          if (diff === 1) return 'Ontem';
          if (diff <= 7) return 'Há ' + diff + 'd';
          var dd = (d.getUTCDate() < 10 ? '0' : '') + d.getUTCDate();
          var mm = (d.getUTCMonth() + 1 < 10 ? '0' : '') + (d.getUTCMonth() + 1);
          return 'Desde ' + dd + '/' + mm;
        }
        // Dias desde o desaparecimento (null se sem data) — base para a cor da borda.
        function relDays(iso) {
          if (!iso) return null;
          var d = new Date(iso);
          if (isNaN(d.getTime())) return null;
          var a = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
          var now = new Date();
          var b = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
          return Math.round((b - a) / 86400000);
        }
        // Cor da BORDA por recência: vermelho (hoje/ontem = urgente), laranja
        // (2-3 dias) e cinza (mais de 3 dias ou sem data). O preenchimento
        // permanece branco.
        function recencyColor(days) {
          if (days === null || days > 3) return '#8E8E93';
          if (days <= 1) return '#FF3B30';
          return '#FF9500';
        }
        var FOUND_WINDOW_HOURS = ${FOUND_WINDOW_HOURS};
        function withinFoundWindow(fa) {
          if (!fa) return false;
          var t = new Date(fa).getTime();
          if (isNaN(t)) return false;
          return (_serverNow - t) <= FOUND_WINDOW_HOURS * 3600 * 1000;
        }
        function buildPetIcon(reported, label, lostDate, foundAt, postType, foundDate, claims, confirmed) {
          // Pet DENUNCIADO: sempre mostra ícone vermelho, independente do status
          if (reported) {
            return L.divIcon({
              className: 'paw-pin',
              html: '<div style="position:relative;width:64px;height:58px;">' +
                '<div style="position:absolute;left:17px;top:0;width:30px;height:40px;">' +
                '<div></div>' +
                '<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg" style="position:relative;z-index:2;">' +
                '<path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 13.2 22.6 13.9 23.3.5.5 1.3.5 1.8 0C16.4 37.6 30 25.5 30 15 30 6.7 23.3 0 15 0z" fill="#FF3B30" stroke="#FFFFFF" stroke-width="2"/>' +
                '</svg>' +
                '<div class="paw-emoji" style="color:#FF3B30;">⚠️</div>' +
                '</div>' +
                '</div>',
              iconSize: [64, 58],
              iconAnchor: [32, 40],
              popupAnchor: [0, -44],
            });
          }
          // Pet REENCONTRADO (dono marcou o próprio caso): gota verde + ✓.
          if (foundAt && withinFoundWindow(foundAt)) {
            var fEmoji = speciesEmoji(__esc(label)) || '🐾';
            var badge = confirmed
              ? '<div style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:9px;background:#34C759;border:2px solid #FFFFFF;display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-size:11px;font-weight:bold;box-shadow:0 1px 3px rgba(0,0,0,0.4);z-index:4;">✓</div>'
              : '<div style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:9px;background:#34C759;border:2px solid #FFFFFF;display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-size:11px;font-weight:bold;box-shadow:0 1px 3px rgba(0,0,0,0.4);z-index:4;">✓</div>';
            return L.divIcon({
              className: 'paw-pin',
              html: '<div style="position:relative;width:64px;height:58px;">' +
                '<div style="position:absolute;left:17px;top:0;width:30px;height:40px;">' +
                '<div></div>' +
                '<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg" style="position:relative;z-index:2;">' +
                '<path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 13.2 22.6 13.9 23.3.5.5 1.3.5 1.8 0C16.4 37.6 30 25.5 30 15 30 6.7 23.3 0 15 0z" fill="#34C759" stroke="#FFFFFF" stroke-width="2"/>' +
                '</svg>' +
                '<div class="paw-emoji" style="color:#FFFFFF;">' + fEmoji + '</div>' +
                badge +
                '</div>' +
                (confirmed ? '<div style="position:absolute;bottom:12px;left:50%;transform:translateX(-50%);background:#34C759;color:#FFFFFF;font-size:9px;font-weight:700;padding:2px 6px;border-radius:6px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.3);z-index:6;">🏠</div>' : '') +
                '</div>',
              iconSize: [64, 58],
              iconAnchor: [32, 40],
              popupAnchor: [0, -44],
            });
          }
          // Post de ACHADO (terceiro encontrou um pet): espelha o pino de
          // reencontro (gota verde + emoji da espécie), mas usa selo azul 🔍
          // (em vez do ✓) para diferenciar "achado ativo" de "reencontrado".
          // Sem rótulo de texto embaixo (mantém consistência com os pins perdidos).
          if (postType === 'found') {
            var fEmoji = speciesEmoji(__esc(label)) || '🐾';
            var relText = __esc(formatRelDays(foundDate));
            // Pet achado E confirmado como devolvido ao dono: mostra badge ✓ + label REUNIDO
            if (confirmed) {
              return L.divIcon({
                className: 'paw-pin',
                html: '<div style="position:relative;width:64px;height:58px;">' +
                  '<div style="position:absolute;left:17px;top:0;width:30px;height:40px;">' +
                '<div></div>' +
                '<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg" style="position:relative;z-index:2;">' +
                '<path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 13.2 22.6 13.9 23.3.5.5 1.3.5 1.8 0C16.4 37.6 30 25.5 30 15 30 6.7 23.3 0 15 0z" fill="#34C759" stroke="#FFFFFF" stroke-width="2"/>' +
                  '</svg>' +
                  '<div class="paw-emoji" style="color:#FFFFFF;">' + fEmoji + '</div>' +
                  '<div style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:9px;background:#34C759;border:2px solid #FFFFFF;display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-size:11px;font-weight:bold;box-shadow:0 1px 3px rgba(0,0,0,0.4);z-index:4;">✓</div>' +
                  '</div>' +
                  '<div style="position:absolute;bottom:12px;left:50%;transform:translateX(-50%);background:#34C759;color:#FFFFFF;font-size:9px;font-weight:700;padding:2px 6px;border-radius:6px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,0.3);z-index:6;">🏠</div>' +
                  '</div>',
                iconSize: [64, 58],
                iconAnchor: [32, 40],
                popupAnchor: [0, -44],
              });
            }
            return L.divIcon({
              className: 'paw-pin',
              html: '<div style="position:relative;width:64px;height:58px;">' +
                '<div style="position:absolute;left:17px;top:0;width:30px;height:40px;">' +
                '<div></div>' +
                '<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg" style="position:relative;z-index:2;">' +
                '<path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 13.2 22.6 13.9 23.3.5.5 1.3.5 1.8 0C16.4 37.6 30 25.5 30 15 30 6.7 23.3 0 15 0z" fill="#34C759" stroke="#FFFFFF" stroke-width="2"/>' +
                '</svg>' +
                 '<div class="paw-emoji" style="color:#FFFFFF;">' + fEmoji + '</div>' +
                 '<div style="position:absolute;top:-4px;right:-4px;width:18px;height:18px;border-radius:9px;background:#0A84FF;border:2px solid #FFFFFF;display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-size:11px;font-weight:bold;box-shadow:0 1px 3px rgba(0,0,0,0.4);z-index:4;">🔍</div>' +
                 (claims > 0 ? '<div style="position:absolute;top:40px;left:6px;width:18px;height:18px;border-radius:9px;background:#FF9500;border:2px solid #FFFFFF;display:flex;align-items:center;justify-content:center;color:#FFFFFF;font-size:11px;font-weight:bold;box-shadow:0 1px 3px rgba(0,0,0,0.4);z-index:5;">' + claims + '</div>' : '') +
                 '</div>' +
                (relText ? '<div class="pet-pin-label"><span class="pet-text">' + relText + '</span></div>' : '') +
                '</div>',
              iconSize: [64, 58],
              iconAnchor: [32, 40],
              popupAnchor: [0, -44],
            });
          }
          var species = __esc(label) || 'Pet';
          var relText = __esc(formatRelDays(lostDate));
          var stroke = recencyColor(relDays(lostDate));
          var emoji = '<div class="paw-emoji">' + speciesEmoji(species) + '</div>';
          return L.divIcon({
            className: 'paw-pin',
            html: '<div style="position:relative;width:64px;height:58px;">' +
              '<div style="position:absolute;left:17px;top:0;width:30px;height:40px;">' +
              '<div></div>' +
              '<svg width="30" height="40" viewBox="0 0 30 40" xmlns="http://www.w3.org/2000/svg" style="position:relative;z-index:2;">' +
              '<path d="M15 0C6.7 0 0 6.7 0 15c0 10.5 13.2 22.6 13.9 23.3.5.5 1.3.5 1.8 0C16.4 37.6 30 25.5 30 15 30 6.7 23.3 0 15 0z" fill="#ffffff" stroke="' + stroke + '" stroke-width="2"/>' +
              '</svg>' +
              emoji +
              '</div>' +
              '<div class="pet-pin-label"><span class="pet-text">' + relText + '</span></div>' +
              '</div>',
            iconSize: [64, 58],
            iconAnchor: [32, 40],
            popupAnchor: [0, -44],
          });
        }

        // Helper: anexa "long press" ao L.marker. Estratégia tripla para
        // cobrir as inconsistências de eventos entre Android WebView / iOS
        // WebView / Web desktop:
        //
        //  1) marker.on('contextmenu', ...) - Leaflet já tem suporte
        //     oficial: em mobile, tocar e segurar ~500ms dispara
        //     'contextmenu' no marker, com originalEvent.preventDefault()
        //     para suprimir o menu de contexto do navegador. É a forma
        //     mais confiável em Android WebView (problema documentado em
        //     gh#3929, gh#5556 do Leaflet).
        //  2) Fallback manual com 'touchstart' no DOM do icon - se
        //     contextmenu oscilar (algumas versões iOS não disparam),
        //     contamos 500ms manualmente e cancelamos com touchend/
        //     touchmove.
        //  3) Bypass via 'addEventListener' direto no icon com
        //     capture:true - garante que chegamos antes de qualquer
        //     handler do Leaflet que possa parar propagação.
        //
        // O postMessage tem fired=true para suprimir o click subsequente
        // (abriria o detalhe do pet em paralelo).
        function __attachLongPress(marker, p) {
          var send = function() {
            // Marca o marker para que o handler de click subsequente saiba
            // que veio de um long-press e NAO abra o detalhe do pet. O
            // handler de click do Leaflet (m.on('click', ...)) verifica
            // marker.__longPressFired antes de chamar onMarkerPress.
            //
            // IMPORTANTE: a flag tem validade curta (~1.2s). Em Android
            // WebView, o Leaflet nem sempre dispara o click sintetico apos
            // o contextmenu do long-press (depende da versao). Se a flag
            // ficasse presa em true, o PROXIMO tap curto seria consumido
            // sem abrir o detalhe do pet (teria que clicar 2x). Com TTL,
            // a flag expira sozinha se o click sintetico nao chegar.
            try { marker.__longPressFired = true; } catch (e) {}
            setTimeout(function() {
              try { marker.__longPressFired = false; } catch (e) {}
            }, 1200);
            try {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'petLongPress',
                petId: p.id,
                deviceId: p.ownerDeviceId || null,
                phone: p.ownerPhone || null,
                contact: p.contact || null,
              }));
            } catch (e) {}
          };
          // (1) Contextmenu via Leaflet — caminho primário.
          marker.on('contextmenu', function(ev) {
            try {
              if (ev && ev.originalEvent && ev.originalEvent.preventDefault) {
                ev.originalEvent.preventDefault();
              }
              if (ev && ev.originalEvent && ev.originalEvent.stopPropagation) {
                ev.originalEvent.stopPropagation();
              }
            } catch (e) {}
            // BUG: em Android WebView, o contextmenu do Leaflet pode disparar
            // "fantasma" durante pinch-zoom (2 dedos saindo eh tratado como
            // long-press em algumas versoes). Sem essa checagem, send() seta
            // __longPressFired=true por 1.2s e o click seguinte no pin eh
            // consumido sem abrir o detalhe.
            if (marker.__pinchActive) { marker.__pinchActive = false; return; }
            send();
          });
          // (2) + (3) Fallback: timer manual no DOM do icon.
          var el = null;
          try { el = marker.getElement() || marker._icon; } catch (e) {}
          if (el) {
            var timer = null;
            var pinchActive = false;
            var cancel = function() {
              if (timer) { clearTimeout(timer); timer = null; }
            };
            var start = function(ev) {
              // Ignora pinch-zoom (2+ dedos). Caso contrario o timer dispara
              // long-press no meio do gesto de pinca e o proximo tap no pin
              // eh consumido pela flag __longPressFired sem abrir o detalhe.
              try {
                var touches = (ev && ev.touches) || null;
                if (touches && touches.length > 1) { pinchActive = true; marker.__pinchActive = true; cancel(); return; }
                if (ev && typeof ev.pointerType === 'touch' && ev.isPrimary === false) { pinchActive = true; marker.__pinchActive = true; cancel(); return; }
              } catch (e) {}
              try {
                if (ev && ev.stopPropagation) ev.stopPropagation();
              } catch (e) {}
              cancel();
              timer = setTimeout(function() {
                timer = null;
                // Se um pinch foi detectado entre o touchstart e o timeout,
                // descarta. Garante que o long-press nao dispara apos o zoom.
                if (pinchActive) { pinchActive = false; marker.__pinchActive = false; return; }
                send();
              }, 500);
            };
            ['touchstart', 'pointerdown', 'mousedown'].forEach(function(evt) {
              el.addEventListener(evt, start, { capture: true, passive: true });
            });
            // touchmove com 2+ dedos durante o gesto = pinch. Marca e cancela.
            var onTouchMove = function(ev) {
              try {
                if (ev && ev.touches && ev.touches.length > 1) {
                  pinchActive = true;
                  marker.__pinchActive = true;
                  cancel();
                }
              } catch (e) {}
            };
            el.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
            ['touchend', 'touchcancel',
             'pointerup', 'pointercancel', 'pointermove',
             'mouseup', 'mouseleave'].forEach(function(evt) {
              el.addEventListener(evt, function(){ pinchActive = false; marker.__pinchActive = false; cancel(); }, { capture: true, passive: true });
            });
            el.addEventListener('contextmenu', function(ev) {
              try { ev.preventDefault(); } catch (e) {}
            }, { capture: true });
          }
        }

        window.__map = map;
        // Pane dedicado aos pinos de PET, com z-index maior que o markerPane
        // (600) padrão dos patrocinadores, garantindo que os pets fiquem SEMPRE
        // acima de anúncios/pontos comerciais, mesmo sobrepostos no mesmo ponto.
        try { map.createPane('petPane'); map.getPane('petPane').style.zIndex = 650; } catch (e) {}
        // O chip do pet (pata + espécie + status) só aparece quando o usuário
        // aproxima (zoom >= 14), evitando poluir o mapa em visão geral.
        var __applyPetLabels = function(){
          var el = map.getContainer();
          if (map.getZoom() >= 14) el.classList.remove('hide-pet-labels');
          else el.classList.add('hide-pet-labels');
        };
        map.on('zoomend', __applyPetLabels);
        __applyPetLabels();

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
            var m = L.marker([s.latitude, s.longitude], { icon: icon, zIndexOffset: 1 }).addTo(window.__map);
            m.on('click', function(){ window.ReactNativeWebView.postMessage(JSON.stringify({ sponsorId: s.id, name: s.name, link: s.link, address: s.address, phone: s.phone, instagram: s.instagram, facebook: s.facebook, logo: s.logo, latitude: s.latitude, longitude: s.longitude })); });
            window.__sponsorMarkers.push(m);
          });
        };
        window.__renderPets = function(pets){
          if (!window.__petMarkers) window.__petMarkers = [];
          window.__petMarkers.forEach(function(m){ window.__map.removeLayer(m); });
          window.__petMarkers = [];
           function addMarker(p, lat, lng){
             // Pet reencontrado fora da janela: não aparece mais no mapa.
             if (p.foundAt && !window.withinFoundWindow(p.foundAt)) return;
             // Achado já resolvido (match confirmado): some do mapa.
             // achados confirmados permanecem visíveis (anti-fraude)
              var m = L.marker([lat, lng], { icon: buildPetIcon(p.reported, p.species, p.lostDate, p.foundAt, p.postType, p.foundDate, (function(){var c=0;for(var i=0;i<pets.length;i++){var x=pets[i];if(x.postType!=='found'&&x.matchedPetId===p.id&&x.matchStatus==='pending')c++;}return c;})(), !!p.confirmed), zIndexOffset: 1000, pane: 'petPane' }).addTo(window.__map);
              m.on('click', function(){ if (m.__longPressFired) { m.__longPressFired = false; return; } window.ReactNativeWebView.postMessage(JSON.stringify({petId:p.id, contact:p.contact})); });
             if (typeof __attachLongPress === 'function') __attachLongPress(m, p);
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
        // ===== Pássaro Lottie (sponsor animado) =====
        // Renderiza o Lottie DENTRO do Leaflet para que o evento de clique seja
        // capturado pelo DOM do navegador (sem conflito de zIndex/elevation
        // nativo do RN sobre o WebView). Move-se pelo mapa em loop.
        // A lista de sponsors é injetada depois via setSponsorsBird.
        var __birdAnimData = ${birdDataJson};
        var __sponsors = [];
        window.__birdMarker = null;
        window.__birdAnim = null;
        window.__birdFlyRaf = null;
        // Posição do usuário para cálculo de distância no banner. Inicia null;
        // o RN atualiza via window.__setUserLatLng.
        window.__userLatLng = null;
        function __pickSponsor() {
          if (!__sponsors || __sponsors.length === 0) return null;
          return __sponsors[Math.floor(Math.random() * __sponsors.length)];
        }
        function __setupBird() {
          if (window.__birdMarker) return;
          if (!__sponsors || __sponsors.length === 0) return;
          var sp = __pickSponsor();
          if (!sp) return;
          // Card do patrocinador compacto. Estrutura:
          // [pássaro 56px][corda 14px][card 200px] = 270px total.
          var safeName = __esc(sp.name || 'Patrocinador');
          var distStr = '';
          if (window.__userLatLng && typeof sp.latitude === 'number' && typeof sp.longitude === 'number') {
            var dKm = __haversine(window.__userLatLng.lat, window.__userLatLng.lng, sp.latitude, sp.longitude);
            if (dKm != null) {
              distStr = dKm < 1
                ? Math.round(dKm * 1000) + ' m'
                : dKm.toFixed(1).replace('.', ',') + ' km';
            }
          }
          var logoHtml = (sp.logo && typeof sp.logo === 'string' && sp.logo.length > 4)
            ? '<img src="' + __esc(sp.logo) + '" ' +
                'style="width:26px; height:26px; border-radius:5px; object-fit:cover; ' +
                'background:#fff; flex-shrink:0;" ' +
                'onerror="this.style.display=' + "'none'" + ';this.nextElementSibling.style.display=' + "'flex'" + ';" />' +
              '<span style="display:none; width:26px; height:26px; align-items:center; ' +
                'justify-content:center; background:#fff; border-radius:5px; font-size:15px; flex-shrink:0;">🛍️</span>'
            : '<span style="display:flex; width:26px; height:26px; align-items:center; ' +
                'justify-content:center; background:#fff; border-radius:5px; font-size:15px; flex-shrink:0;">🛍️</span>';
          // Linha 2: "X km" à esquerda + badge Ad à direita (space-between).
          var distHtml = (function() {
            var ad = '<span style="background:rgba(255,255,255,0.25); padding:0 4px; ' +
              'border-radius:3px; font:800 8px sans-serif; line-height:1.3; flex-shrink:0;">Ad</span>';
            var txt = distStr
              ? '<span style="font:600 9px sans-serif; color:rgba(255,255,255,0.85); ' +
                  'white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1; flex:1; min-width:0;">' + distStr + '</span>'
              : '<span style="flex:1;"></span>';
            return '<div style="display:flex; align-items:center; justify-content:space-between; ' +
              'gap:4px; min-height:11px; margin-top:1px;">' + txt + ad + '</div>';
          })();
          var iconHtml =
            '<div style="display:flex; align-items:center; pointer-events:auto; cursor:pointer;">' +
              '<div id="lottie-bird" style="width:56px; height:56px; flex-shrink:0;"></div>' +
              '<div style="width:14px; height:1.5px; background:rgba(0,0,0,0.55); flex-shrink:0;"></div>' +
              '<div style="display:flex; flex-direction:row; align-items:center; ' +
                'width:200px; height:40px; padding:4px 8px; ' +
                'background:#FF9500; color:#fff; border-radius:8px; ' +
                'box-shadow:0 3px 6px rgba(0,0,0,0.35); flex-shrink:0;">' +
                logoHtml +
                '<div style="display:flex; flex-direction:column; flex:1; min-width:0; margin-left:6px;">' +
                  '<div style="font:700 9px sans-serif; min-width:0; ' +
                    'white-space:nowrap; overflow:hidden; text-overflow:ellipsis; line-height:1.2;">' + safeName + '</div>' +
                  distHtml +
                '</div>' +
              '</div>' +
            '</div>';
          var icon = L.divIcon({
            className: 'bird-marker',
            html: iconHtml,
            iconSize: [280, 56],
            iconAnchor: [16, 28], // ancora no canto esquerdo do pássaro
          });
          // Posicao inicial: começa FORA da borda direita (com folga) para o
          // pássaro entrar voando da direita. Altura aleatoria entre 5% e 85%
          // da altura visivel (margens maiores para o pássaro poder passar
          // mais em cima ou mais em baixo do mapa).
          var b = map.getBounds();
          var totalLngInit = b.getEast() - b.getWest();
          var startLng = b.getEast() + totalLngInit * 0.15;
          var endLng = b.getWest();
          var latRange = b.getNorth() - b.getSouth();
          // Puxa o range de Y para o canto superior (5%) e ainda permite quase
          // tocar a borda inferior (85%), evitando os 15% mais altos/baixos
          // (limites onde o banner pode ser cortado pela UI do mapa).
          var startLat = b.getSouth() + (0.05 + Math.random() * 0.8) * latRange;
          var m = L.marker([startLat, startLng], { icon: icon, zIndexOffset: 500 }).addTo(map);
          // Click em QUALQUER parte do banner/pássaro.
          m.on('click', function() {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              sponsorId: sp.id, name: sp.name, latitude: sp.latitude, longitude: sp.longitude,
              address: sp.address, link: sp.link, phone: sp.phone, instagram: sp.instagram,
              facebook: sp.facebook, logo: sp.logo, visibleFrom: sp.visibleFrom, updatedAt: sp.updatedAt,
            }));
          });
          try {
            window.__birdAnim = lottie.loadAnimation({
              container: document.getElementById('lottie-bird'),
              renderer: 'svg',
              loop: true,
              autoplay: true,
              animationData: __birdAnimData,
            });
        } catch {}
          // Vôo linear: anima o pássaro da borda direita até muito além da
          // borda esquerda em ~16s usando requestAnimationFrame (suave).
          // Quando sai, troca o sponsor e recria.
          var totalLng = startLng - endLng; // positivo (largura visivel em graus)
          // Folga extra calculada em PIXELS (não em graus) para garantir que
          // o banner inteiro (270px) saia completamente da tela independente
          // do zoom. Converte px -> graus usando a largura atual do mapa.
          var mapSize = map.getSize();
          var pxPerDeg = mapSize.x / totalLng; // px por grau na latitude atual
          // 280px de banner + 40px de folga alem da borda esquerda
          var extraLng = (280 + 40) / pxPerDeg;
          var fullLng = totalLng + extraLng;
          // Duração aleatória entre 16s e 30s para não ficar cansativo.
          var duration = 16000 + Math.floor(Math.random() * 14000); // 16000-29999ms
          var startTime = null;
          function step(ts) {
            if (!window.__birdMarker) return;
            if (startTime === null) startTime = ts;
            var elapsed = ts - startTime;
            var t = Math.min(elapsed / duration, 1);
            var lng = startLng - fullLng * t;
            m.setLatLng([startLat, lng]);
            if (t < 1) {
              window.__birdFlyRaf = requestAnimationFrame(step);
            } else {
              try { m.remove(); } catch (e) {}
              try { if (window.__birdAnim) window.__birdAnim.destroy(); } catch (e) {}
              window.__birdMarker = null;
              // Pausa curta antes do próximo voo (1-3s aleatório).
              var pause = 1000 + Math.floor(Math.random() * 2000);
              setTimeout(__setupBird, pause);
            }
          }
          window.__birdFlyRaf = requestAnimationFrame(step);
          window.__birdMarker = m;
        }
        // API exposta para o RN controlar a lista de sponsors e a posição
        // do usuário (para exibir distância no banner).
        window.__setSponsorsBird = function(list) {
          __sponsors = list || [];
          if (!window.__birdMarker && __sponsors.length > 0) {
            __setupBird();
          }
        };
        window.__setUserLatLng = function(lat, lng) {
          window.__userLatLng = (typeof lat === 'number' && typeof lng === 'number')
            ? { lat: lat, lng: lng } : null;
        };
        window.__renderPets([]);
      </script>
    </body>
  </html>`,
    [center.latitude, center.longitude, mapFilter, birdDataJson],
  );

  // Delta de separação (graus) para pets na mesma coordenada (~33m). Como esta
  // string é re-injetada a cada mudança de `pets` (e no onLoad), o valor novo
  // entra em vigor SEM precisar recarregar o WebView.
  const SPIDER_DELTA = 0.0003;
  const renderPetsJs = (list: PetRecord[]) =>
    `(function(){
      var _serverNow = ${Date.now()};
      var FOUND_WINDOW_HOURS = ${FOUND_WINDOW_HOURS};
      // O withinFoundWindow do <script> inicial referencia um _serverNow que
      // nunca é definido no escopo global, então SEMPRE retorna false — o que
      // faz pets com foundAt (marcados como encontrados) sumirem do mapa.
      // Sobrescrevemos a função com a versão que usa o _serverNow desta IIFE
      // e atualizamos a referência global para que buildPetIcon também use.
      window.withinFoundWindow = function(fa){
        if (!fa) return false;
        var t = new Date(fa).getTime();
        if (isNaN(t)) return false;
        return (_serverNow - t) <= FOUND_WINDOW_HOURS * 3600 * 1000;
      };
      window.__renderPets = function(pets){
        if (!window.__petMarkers) window.__petMarkers = [];
        window.__petMarkers.forEach(function(m){ window.__map.removeLayer(m); });
        window.__petMarkers = [];
        // Long press -> postMessage {type:'petLongPress', petId, ...}.
        // Mesma estratégia tripla do __attachLongPress (contextmenu via
        // Leaflet + fallback manual no DOM do icon com capture:true).
        function attachLongPress(marker, p) {
          var send = function() {
            // Marca o marker com TTL de 1.2s. Mesmo motivo do __attachLongPress:
            // se o click sintetico do Leaflet nao chegar apos o contextmenu do
            // long-press, a flag expira sozinha em vez de ficar presa em true
            // (o que faria o proximo tap ser consumido sem abrir o detalhe).
            try { marker.__longPressFired = true; } catch (e) {}
            setTimeout(function() {
              try { marker.__longPressFired = false; } catch (e) {}
            }, 1200);
            try {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'petLongPress',
                petId: p.id,
                deviceId: p.ownerDeviceId || null,
                phone: p.ownerPhone || null,
                contact: p.contact || null,
              }));
            } catch (e) {}
          };
          marker.on('contextmenu', function(ev) {
            try {
              if (ev && ev.originalEvent && ev.originalEvent.preventDefault) {
                ev.originalEvent.preventDefault();
              }
              if (ev && ev.originalEvent && ev.originalEvent.stopPropagation) {
                ev.originalEvent.stopPropagation();
              }
            } catch (e) {}
            // BUG: contextmenu fantasma durante pinch-zoom no Android WebView.
            // Sem essa checagem, __longPressFired fica preso em true por 1.2s
            // e o click seguinte no pin eh consumido sem abrir o detalhe.
            if (marker.__pinchActive) { marker.__pinchActive = false; return; }
            send();
          });
          var el = null;
          try { el = marker.getElement() || marker._icon; } catch (e) {}
          if (el) {
            var timer = null;
            var pinchActive = false;
            var cancel = function() {
              if (timer) { clearTimeout(timer); timer = null; }
            };
            var start = function(ev) {
              // Ignora pinch-zoom (2+ dedos). Sem isso, o timer dispara
              // long-press no meio do gesto de pinca e o click subsequente
              // no pin eh consumido pela flag __longPressFired, fazendo o
              // detalhe do pet nao abrir ao tocar logo apos dar zoom.
              try {
                var touches = (ev && ev.touches) || null;
                if (touches && touches.length > 1) { pinchActive = true; marker.__pinchActive = true; cancel(); return; }
                if (ev && typeof ev.pointerType === 'touch' && ev.isPrimary === false) { pinchActive = true; marker.__pinchActive = true; cancel(); return; }
              } catch (e) {}
              try {
                if (ev && ev.stopPropagation) ev.stopPropagation();
              } catch (e) {}
              cancel();
              timer = setTimeout(function() {
                timer = null;
                if (pinchActive) { pinchActive = false; marker.__pinchActive = false; return; }
                send();
              }, 500);
            };
            ['touchstart', 'pointerdown', 'mousedown'].forEach(function(evt) {
              el.addEventListener(evt, start, { capture: true, passive: true });
            });
            var onTouchMove = function(ev) {
              try {
                if (ev && ev.touches && ev.touches.length > 1) {
                  pinchActive = true;
                  marker.__pinchActive = true;
                  cancel();
                }
              } catch (e) {}
            };
            el.addEventListener('touchmove', onTouchMove, { capture: true, passive: true });
            ['touchend', 'touchcancel',
             'pointerup', 'pointercancel', 'pointermove',
             'mouseup', 'mouseleave'].forEach(function(evt) {
              el.addEventListener(evt, function(){ pinchActive = false; marker.__pinchActive = false; cancel(); }, { capture: true, passive: true });
            });
            el.addEventListener('contextmenu', function(ev) {
              try { ev.preventDefault(); } catch (e) {}
            }, { capture: true });
          }
        }
        function addMarker(p, lat, lng){
           // Pet reencontrado fora da janela: não aparece mais no mapa.
           if (p.foundAt && !window.withinFoundWindow(p.foundAt)) return;
           // Achado já resolvido (match confirmado): some do mapa.
           // achados confirmados permanecem visíveis (anti-fraude)
              var m = L.marker([lat, lng], { icon: buildPetIcon(p.reported, p.species, p.lostDate, p.foundAt, p.postType, p.foundDate, (function(){var c=0;for(var i=0;i<pets.length;i++){var x=pets[i];if(x.postType!=='found'&&x.matchedPetId===p.id&&x.matchStatus==='pending')c++;}return c;})(), !!p.confirmed), zIndexOffset: 1000, pane: 'petPane' }).addTo(window.__map);
           m.on('click', function(){ if (m.__longPressFired) { m.__longPressFired = false; return; } window.ReactNativeWebView.postMessage(JSON.stringify({petId:p.id, contact:p.contact})); });
           attachLongPress(m, p);
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
  }, [mapReady, sponsors, showSponsorText]); // eslint-disable-line react-hooks/exhaustive-deps

  // Injeta a lista de sponsors para o pássaro Lottie. O pássaro só aparece
  // se houver ao menos 1 sponsor e a WebView estiver pronta. Usamos a lista
  // de sponsors mais próximos (limitada por pickNearestSponsors) para evitar
  // exagero de banners quando o usuário está longe dos patrocinadores.
  useEffect(() => {
    if (!mapReady || !webRef.current) return;
    const js = `(function(){
      if (typeof window.__setSponsorsBird === 'function') {
        window.__setSponsorsBird(${JSON.stringify(nearestSponsors)});
      }
    })();`;
    webRef.current.injectJavaScript(js);
  }, [mapReady, nearestSponsors]);

  // Injeta a posição do usuário para o cálculo de distância no banner do
  // pássaro (mostra "X km" abaixo do nome do patrocinador).
  useEffect(() => {
    if (!mapReady || !webRef.current) return;
    const lat = userLocation?.latitude ?? null;
    const lng = userLocation?.longitude ?? null;
    const js = `(function(){
      if (typeof window.__setUserLatLng === 'function') {
        window.__setUserLatLng(${lat}, ${lng});
      }
    })();`;
    webRef.current.injectJavaScript(js);
  }, [mapReady, userLocation?.latitude, userLocation?.longitude]);

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
  }, [mapReady, userLocation]); // eslint-disable-line react-hooks/exhaustive-deps

  // Força o recentramento quando o botão "Centralizar no meu GPS" é clicado
  // (recenterNonce muda), ignorando o limiar de ruído de GPS — o botão deve
  // centralizar sempre, mesmo já estando próximo.
  useEffect(() => {
    if (!mapReady || !webRef.current || !userLocation) return;
    const js = `(function(){ if (window.__map) { window.__map.setView([${userLocation.latitude}, ${userLocation.longitude}], Math.max(window.__map.getZoom(), 13)); } })();`;
    webRef.current.injectJavaScript(js);
  }, [recenterNonce]); // eslint-disable-line react-hooks/exhaustive-deps

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
        // Re-injeta a lista de sponsors (já filtrada pelos mais próximos) e a
        // posição do usuário para o pássaro Lottie. Necessário porque o
        // WebView recarrega quando o `center` muda (e mapReady não volta a
        // false, então os useEffect não re-rodam).
        try {
          const sList = JSON.stringify(nearestSponsorsRef.current);
          const uLoc = userLocationRef.current;
          const uLat = uLoc?.latitude ?? null;
          const uLng = uLoc?.longitude ?? null;
          webRef.current?.injectJavaScript(
            `(function(){ if (typeof window.__setSponsorsBird === 'function') { window.__setSponsorsBird(${sList}); } })();`,
          );
          webRef.current?.injectJavaScript(
            `(function(){ if (typeof window.__setUserLatLng === 'function') { window.__setUserLatLng(${uLat}, ${uLng}); } })();`,
          );
        } catch {}
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
          } else if (data.type === 'petLongPress' && onPetLongPress) {
            onPetLongPress({
              petId: data.petId,
              deviceId: data.deviceId ?? null,
              phone: data.phone ?? null,
              contact: data.contact ?? null,
            });
          } else if (data.petId) {
            onMarkerPress(data.petId);
          }
        } catch {}
      }}
    />
  );
};
