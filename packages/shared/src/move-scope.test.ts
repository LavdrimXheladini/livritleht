import { describe, expect, it } from 'vitest';

import { moveScope, sameCity } from './move-scope';

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
