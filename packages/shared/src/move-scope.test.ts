import { describe, expect, it } from 'vitest';

import { moveScope, routeLabel, sameCity, stopName } from './move-scope';

const prishtina = { area: 'Prishtinë', countryCode: 'XK' };
const fusheKosove = { area: 'Fushë Kosovë', countryCode: 'XK' };
const prizren = { area: 'Prizren', countryCode: 'XK' };
const munich = { area: 'München', countryCode: 'DE' };

describe('move scope', () => {
  it('is local within one city, whatever the distance', () => {
    expect(moveScope(prishtina, { ...prishtina, area: ' prishtinë ' }, 40)).toBe('local');
    expect(sameCity(prishtina, prishtina)).toBe(true);
  });

  it('is local for a short hop to the next town, domestic further away', () => {
    expect(moveScope(prishtina, fusheKosove, 9)).toBe('local');
    expect(moveScope(prishtina, prizren, 83)).toBe('domestic');
    expect(sameCity(prishtina, fusheKosove)).toBe(false);
  });

  it('is cross-border between countries, even when close', () => {
    expect(moveScope(munich, prishtina, 1313)).toBe('crossBorder');
    expect(moveScope({ area: 'X', countryCode: 'MK' }, { area: 'X', countryCode: 'XK' }, 10)).toBe('crossBorder');
  });
});

describe('route names shown to movers before they accept (COMPLIANCE §9.1)', () => {
  // Street-level places, as address search returns them.
  const dardania = { label: 'Rr. Agim Ramadani 12, Dardania, Prishtinë', area: 'Prishtinë', district: 'Dardania', lat: 42.6518, lon: 21.1537, countryCode: 'XK' };
  const velania = { label: 'Rr. Fehmi Agani 5, Velania, Prishtinë', area: 'Prishtinë', district: 'Velania', lat: 42.6567, lon: 21.1796, countryCode: 'XK' };
  const tirana = { label: 'Rruga e Durrësit 20, Tiranë', area: 'Tiranë', lat: 41.3275, lon: 19.8187, countryCode: 'AL' };
  const within = (city: string) => `Within ${city}`;

  it('name the neighbourhood or the city, never the street', () => {
    expect(routeLabel(dardania, velania, within)).toBe('Dardania → Velania');
    expect(routeLabel(dardania, tirana, within)).toBe('Prishtinë → Tiranë');
    expect(routeLabel(dardania, { ...velania, district: 'Dardania' }, within)).toBe('Within Prishtinë');
    expect([stopName(dardania, velania), stopName(dardania, tirana), stopName(tirana, dardania)]).toEqual(['Dardania', 'Prishtinë', 'Tiranë']);
    for (const text of [routeLabel(dardania, velania, within), routeLabel(tirana, dardania, within), stopName(dardania, velania)]) {
      expect(text).not.toMatch(/Rr\.|Rruga|\d/);
    }
  });
});
