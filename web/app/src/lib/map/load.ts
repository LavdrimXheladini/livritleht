import { themeMapStyle, type StyleSpecification } from './theme-style';

// Free vector tiles (OpenStreetMap data via OpenFreeMap — no key). Attribution is shown on the map
// as their licence requires. Swap for Google Maps once billing is set up.
const STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';
/** MapLibre's worker, copied to public/ by scripts/dev-prep.mjs (the bundler doesn't emit it). */
const WORKER_URL = '/vendor/maplibre-gl-worker.mjs';

export const VAN_SVG =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 7h11v9H3z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="7" cy="17.5" r="1.8"/><circle cx="17" cy="17.5" r="1.8"/></svg>';

/** Loads MapLibre (code-split) and the token-coloured dark style. Throws if either fails. */
export async function loadMapLibre() {
  const [lib, style] = await Promise.all([
    import('maplibre-gl'),
    fetch(STYLE_URL).then((r) => {
      if (!r.ok) throw new Error(`style ${r.status}`);
      return r.json() as Promise<StyleSpecification>;
    }),
  ]);
  lib.setWorkerUrl(`${WORKER_URL}?v=${lib.getVersion()}`);
  return { lib, style: themeMapStyle(style) };
}

export const lineFeature = (coords: [number, number][]) => ({
  type: 'Feature' as const,
  properties: {},
  geometry: { type: 'LineString' as const, coordinates: coords },
});

export const lineCollection = (coords: [number, number][]) => ({
  type: 'FeatureCollection' as const,
  features: [lineFeature(coords)],
});

export function markerElement(className: string, html = '', tag: 'div' | 'button' = 'div'): HTMLElement {
  const node = document.createElement(tag);
  node.className = className;
  node.innerHTML = html;
  return node;
}
