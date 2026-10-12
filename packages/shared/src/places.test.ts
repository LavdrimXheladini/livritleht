import { describe, expect, it } from 'vitest';

import { demoPlaceById, photonSearchUrl, photonSuggestions } from './places';

describe('address search helpers', () => {
  it('builds the Photon URL: Europe, 6 results, language and nearby bias', () => {
    const url = photonSearchUrl('rruga b 12', 'en', { lat: 42.6629, lon: 21.1655 });
    expect(url).toBe('https://photon.komoot.io/api/?q=rruga%20b%2012&limit=6&bbox=-25%2C34%2C45%2C72&lang=en&lat=42.66&lon=21.17');
    expect(photonSearchUrl('x', 'sq')).not.toContain('lang=');
  });

  it('keeps the first of duplicate suggestions', () => {
    const feature = { geometry: { type: 'Point' as const, coordinates: [21.16, 42.66] as [number, number] }, properties: { street: 'Rr. B', housenumber: '12', city: 'Prishtinë', country: 'Kosovo', countrycode: 'XK' } };
    expect(photonSuggestions({ features: [feature, feature] })).toHaveLength(1);
    expect(photonSuggestions({})).toEqual([]);
  });

  it('names demo neighbourhoods with their city', () => {
    const t = (key: string) => ({ 'places.dardania': 'Dardania', 'places.prishtina': 'Prishtina' })[key] ?? key;
    expect(demoPlaceById('dardania', t)).toMatchObject({ label: 'Dardania, Prishtina', area: 'Prishtina', district: 'Dardania', countryCode: 'XK' });
  });
});
