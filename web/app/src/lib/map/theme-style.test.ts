import { describe, expect, it } from 'vitest';

import { colors } from '@movershub/ui';

import { themeMapStyle, type StyleSpecification } from './theme-style';

const style = {
  version: 8,
  sources: {
    openmaptiles: { type: 'vector', url: 'https://example.test/planet' },
    ne2_shaded: { type: 'raster', url: 'https://example.test/shaded' },
  },
  layers: [
    { id: 'background', type: 'background', paint: { 'background-color': '#000' } },
    { id: 'shade', type: 'raster', source: 'ne2_shaded' },
    { id: 'water', type: 'fill', source: 'openmaptiles', 'source-layer': 'water', paint: { 'fill-color': '#00f' } },
    { id: 'highway-motorway', type: 'line', source: 'openmaptiles', 'source-layer': 'transportation', paint: { 'line-color': '#fff' } },
    { id: 'place-city', type: 'symbol', source: 'openmaptiles', 'source-layer': 'place', paint: { 'text-color': '#fff' } },
  ],
} as unknown as StyleSpecification;

describe('themeMapStyle', () => {
  const themed = themeMapStyle(style);
  const layer = (id: string) => themed.layers.find((l) => l.id === id) as { paint?: Record<string, unknown> } | undefined;

  it('uses token colours (night palette)', () => {
    expect(layer('background')?.paint?.['background-color']).toBe(colors.night[700]);
    expect(layer('water')?.paint?.['fill-color']).toBe(colors.night[800]);
    expect(layer('highway-motorway')?.paint?.['line-color']).toBe(colors.night[600]);
    expect(layer('place-city')?.paint?.['text-color']).toBe(colors.sage[400]);
  });

  it('drops the shaded-relief layer and its unused source', () => {
    expect(layer('shade')).toBeUndefined();
    expect(Object.keys(themed.sources)).toEqual(['openmaptiles']);
  });
});
