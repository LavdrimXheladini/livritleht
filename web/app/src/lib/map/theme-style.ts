import type { MapOptions } from 'maplibre-gl';

import { colors } from '@ranktrip/ui';

// Recolours OpenFreeMap's "dark" style with the design's night palette (Tracking.dc.html):
// dark green land, darker water, quiet roads, sage labels. Colours come only from tokens.json.

export type StyleSpecification = Exclude<MapOptions['style'], string | undefined>;
type Layer = StyleSpecification['layers'][number];

const MAJOR_ROAD = /motorway|trunk|primary/;

function themeLayer(layer: Layer): Layer | null {
  const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined;
  switch (layer.type) {
    case 'background':
      return { ...layer, paint: { 'background-color': colors.night[700] } };
    case 'raster':
    case 'hillshade':
      return null; // shaded relief adds noise under the route
    case 'fill': {
      const fill =
        sourceLayer === 'water'
          ? { 'fill-color': colors.night[800] }
          : sourceLayer === 'building'
            ? { 'fill-color': colors.night[600], 'fill-opacity': 0.35 }
            : sourceLayer === 'landcover' || sourceLayer === 'landuse' || sourceLayer === 'park'
              ? { 'fill-color': colors.night[800], 'fill-opacity': 0.25 }
              : { 'fill-color': colors.night[600], 'fill-opacity': 0.5 };
      return { ...layer, paint: fill };
    }
    case 'line': {
      const paint = { ...(layer.paint ?? {}) };
      if (sourceLayer === 'waterway') Object.assign(paint, { 'line-color': colors.night[800] });
      else if (sourceLayer === 'boundary') Object.assign(paint, { 'line-color': colors.night[400], 'line-opacity': 0.6 });
      else if (layer.id.includes('casing')) Object.assign(paint, { 'line-color': colors.night[700] });
      else if (MAJOR_ROAD.test(layer.id)) Object.assign(paint, { 'line-color': colors.night[600], 'line-opacity': 1 });
      else Object.assign(paint, { 'line-color': colors.night[600], 'line-opacity': 0.55 });
      return { ...layer, paint } as Layer;
    }
    case 'symbol': {
      const roadLabel = sourceLayer === 'transportation_name';
      const paint = {
        ...(layer.paint ?? {}),
        'text-color': roadLabel ? colors.night[300] : colors.sage[400],
        'text-halo-color': colors.night[800],
        'text-halo-width': 1,
        'icon-opacity': 0.4,
      };
      return { ...layer, paint } as Layer;
    }
    default:
      return layer;
  }
}

export function themeMapStyle(style: StyleSpecification): StyleSpecification {
  const layers = style.layers.map(themeLayer).filter((l): l is Layer => l !== null);
  const usedSources = new Set(layers.map((l) => ('source' in l ? l.source : undefined)).filter(Boolean));
  const sources = Object.fromEntries(Object.entries(style.sources).filter(([id]) => usedSources.has(id)));
  return { ...style, sources, layers };
}
