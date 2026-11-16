import { colors } from '@movershub/ui';

export type MapPoint = { lat: number; lon: number };

/** The map's answer each time it stops moving: its centre, as JSON. `null` = not a centre. */
export function parseMapCentre(data: unknown): MapPoint | null {
  if (typeof data !== 'string') return null;
  try {
    const value = JSON.parse(data) as { lat?: unknown; lon?: unknown };
    return typeof value.lat === 'number' && typeof value.lon === 'number' && Math.abs(value.lat) <= 90 && Math.abs(value.lon) <= 180
      ? { lat: value.lat, lon: value.lon }
      : null;
  } catch {
    return null;
  }
}

/**
 * The page of the map a place is pinned on (a web view on the phone, a frame in the browser version):
 * a street map that can be moved and zoomed (MapLibre + OpenFreeMap), opened on `start`. The pin itself
 * is the app's, fixed over the middle; the page reports its centre whenever it stops moving.
 */
export function pinMapHtml(start: MapPoint): string {
  const data = JSON.stringify(start);
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">
<style>html,body,#map{margin:0;height:100%;background:${colors.stone[200]}}</style></head>
<body><div id="map"></div>
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<script>
(function () {
  var d = ${data};
  if (!window.maplibregl) return;
  var map = new maplibregl.Map({
    container: 'map', style: 'https://tiles.openfreemap.org/styles/liberty',
    center: [d.lon, d.lat], zoom: 17, dragRotate: false, pitchWithRotate: false, touchPitch: false,
    attributionControl: { compact: true }
  });
  map.touchZoomRotate.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
  map.on('moveend', function () {
    var c = map.getCenter();
    var message = JSON.stringify({ lat: c.lat, lon: c.lng });
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(message);
    else window.parent.postMessage(message, '*');
  });
})();
</script></body></html>`;
}
