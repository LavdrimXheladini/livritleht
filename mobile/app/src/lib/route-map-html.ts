import { colors } from '@movershub/ui';

export type LonLat = readonly [number, number];

/**
 * The page a move's map runs in (a web view on the phone, a frame in the browser version): a light
 * street map (MapLibre + OpenFreeMap, like the website) with the road in brand green, a ring at the
 * pickup and a pin at the drop-off. Not interactive — the sheet below scrolls over it. While the map
 * can't load (offline), the page stays the app's stone colour.
 */
export function routeMapHtml(line: readonly LonLat[], bottomPadding: number): string {
  const data = JSON.stringify({ line, pad: bottomPadding, green: colors.brand[500], paper: colors.stone[50], copper: colors.accent[500] });
  return `<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.css">
<style>html,body,#map{margin:0;height:100%;background:${colors.stone[200]}}
.pickup{width:14px;height:14px;border-radius:50%;background:${colors.stone[50]};border:5px solid ${colors.brand[500]};box-shadow:0 2px 6px rgba(0,0,0,.3)}
.dropoff{width:30px;height:30px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:${colors.accent[500]};border:3px solid ${colors.stone[50]};box-shadow:0 2px 6px rgba(0,0,0,.3)}
.dropoff i{position:absolute;inset:7px;border-radius:50%;background:${colors.stone[50]}}</style></head>
<body><div id="map"></div>
<script src="https://unpkg.com/maplibre-gl@4.7.1/dist/maplibre-gl.js"></script>
<script>
(function () {
  var d = ${data};
  if (!window.maplibregl || d.line.length < 2) return;
  var bounds = d.line.reduce(function (b, c) { return b.extend(c); }, new maplibregl.LngLatBounds(d.line[0], d.line[0]));
  var map = new maplibregl.Map({
    container: 'map', style: 'https://tiles.openfreemap.org/styles/liberty', interactive: false,
    bounds: bounds, fitBoundsOptions: { padding: { top: 90, left: 48, right: 48, bottom: d.pad } },
    attributionControl: { compact: true }
  });
  map.on('load', function () {
    map.addSource('route', { type: 'geojson', data: { type: 'Feature', properties: {}, geometry: { type: 'LineString', coordinates: d.line } } });
    var round = { 'line-cap': 'round', 'line-join': 'round' };
    map.addLayer({ id: 'route-edge', type: 'line', source: 'route', layout: round, paint: { 'line-color': d.paper, 'line-width': 8 } });
    map.addLayer({ id: 'route', type: 'line', source: 'route', layout: round, paint: { 'line-color': d.green, 'line-width': 4.5 } });
    var a = document.createElement('div'); a.className = 'pickup';
    new maplibregl.Marker({ element: a }).setLngLat(d.line[0]).addTo(map);
    var b = document.createElement('div'); b.className = 'dropoff'; b.appendChild(document.createElement('i'));
    new maplibregl.Marker({ element: b, anchor: 'bottom' }).setLngLat(d.line[d.line.length - 1]).addTo(map);
  });
})();
</script></body></html>`;
}
