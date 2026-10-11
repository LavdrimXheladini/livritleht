import { describe, expect, it } from 'vitest';

import { alongLine, compassPoint } from './line';
import { formatPhotonFeature, type PhotonFeature } from './photon';

const feature = (properties: PhotonFeature['properties'], coords: [number, number] = [21.16, 42.66]): PhotonFeature => ({
  geometry: { type: 'Point', coordinates: coords },
  properties,
});

describe('formatPhotonFeature', () => {
  it('formats a street address with number, area and country', () => {
    const s = formatPhotonFeature(
      feature({ osm_type: 'N', osm_id: 1, street: 'Rr. UÇK', housenumber: '12', city: 'Pristina', country: 'Kosovo', countrycode: 'xk' }),
    );
    expect(s).toMatchObject({ label: 'Rr. UÇK 12, Pristina, Kosovo', area: 'Pristina', countryCode: 'XK', lat: 42.66, lon: 21.16 });
  });

  it('shows a named place with its street underneath', () => {
    const s = formatPhotonFeature(
      feature({ name: 'Gjimnazi "Remzi Ademaj"', street: 'Rr. Remzi Ademi', housenumber: '194', city: 'Prizren', country: 'Kosovo', countrycode: 'XK' }),
    );
    expect(s?.label).toBe('Gjimnazi "Remzi Ademaj", Rr. Remzi Ademi 194, Prizren, Kosovo');
  });

  it('does not repeat the area for a city result', () => {
    const s = formatPhotonFeature(feature({ name: 'Prizren', city: 'Prizren', country: 'Kosovo', countrycode: 'XK', type: 'city' }));
    expect(s?.label).toBe('Prizren, Kosovo');
  });

  it('rejects results without a usable country code', () => {
    expect(formatPhotonFeature(feature({ name: 'Somewhere' }))).toBeNull();
  });
});

describe('alongLine', () => {
  const line: [number, number][] = [
    [0, 0],
    [0, 1],
    [1, 1],
  ];

  it('returns the ends at 0 and 1', () => {
    expect(alongLine(line, 0).point).toEqual([0, 0]);
    expect(alongLine(line, 1).point).toEqual([1, 1]);
  });

  it('moves by real distance and reports the travelled part', () => {
    const half = alongLine(line, 0.5);
    expect(half.point[0]).toBeCloseTo(0, 2);
    expect(half.point[1]).toBeCloseTo(1, 1);
    expect(half.done[0]).toEqual([0, 0]);
    expect(compassPoint(alongLine(line, 0.25).bearing)).toBe('N');
    expect(compassPoint(alongLine(line, 0.9).bearing)).toBe('E');
  });
});
