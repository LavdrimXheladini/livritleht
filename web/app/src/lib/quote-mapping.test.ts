import { describe, expect, it } from 'vitest';

import type { FromPrice, QuoteResponse } from '@movershub/pricing';
import { VEHICLE_CLASSES, type Place, type VehicleClass } from '@movershub/shared';

import type { CrewPrices, SampleRoute } from './landing-types';
import { fromLive, fromSample } from './quote-mapping';

const zurich: Place = { label: 'Zürich', area: 'Zürich', lat: 47.37, lon: 8.54, countryCode: 'CH' };
const prishtina: Place = { label: 'Prishtina', area: 'Prishtina', lat: 42.66, lon: 21.16, countryCode: 'XK' };

const crewPrices = (base: number): CrewPrices => [
  [base, base * 0.8],
  [base + 10, (base + 10) * 0.8],
  [base + 20, (base + 20) * 0.8],
];
const sample: SampleRoute = {
  km: 83,
  crossBorder: false,
  scope: 'domestic',
  hours: 2,
  takeRatePct: 20,
  prices: Object.fromEntries(VEHICLE_CLASSES.map((c, i) => [c, crewPrices(1000 * (i + 1))])) as SampleRoute['prices'],
  geometry: [
    [21.16, 42.66],
    [20.74, 42.21],
  ],
  estimated: false,
};

const from = (currency: FromPrice['currency'], moverPrice: number): FromPrice => ({
  currency,
  moverPrice,
  moverPayout: moverPrice * 0.8,
  bookingFee: null,
  total: moverPrice,
});
const empty = { count: 0, from: [] };

/** A live answer where only the VAN has offers: EUR and CHF movers, no crew of 3. */
function live(over: Partial<QuoteResponse> = {}): QuoteResponse {
  const classes = VEHICLE_CLASSES.map((vehicleClass: VehicleClass) => ({
    vehicleClass,
    count: 0,
    from: [],
    offers: [],
    crews:
      vehicleClass === 'VAN'
        ? { 1: { count: 2, from: [from('CHF', 25000), from('EUR', 26000)] }, 2: { count: 2, from: [from('CHF', 28000), from('EUR', 29000)] }, 3: empty }
        : { 1: empty, 2: empty, 3: empty },
  }));
  return {
    distanceKm: 4.6,
    distanceEstimated: false,
    scope: 'local',
    crossBorder: false,
    bookingFeeDecided: false,
    typicalLoad: true,
    testMovers: true,
    classes,
    ...over,
  };
}

describe('landing quote mapping', () => {
  it('shows live offers in the local currency, with how many movers offer them', () => {
    const q = fromLive(sample, live(), zurich);
    expect(q).toMatchObject({ source: 'movers', testMovers: true, scope: 'local', km: 5 });
    expect(q.prices.VAN[0]).toEqual({ moverPrice: 25000, payout: 20000, currency: 'CHF', offers: 2 });
    // Kosovo's own currency is the euro; a country without market data gets the first currency.
    expect(fromLive(sample, live(), prishtina).prices.VAN[1]).toMatchObject({ currency: 'EUR', moverPrice: 29000 });
    expect(fromLive(sample, live(), { ...prishtina, countryCode: 'FR' }).prices.VAN[1]).toMatchObject({ currency: 'CHF', moverPrice: 28000 });
  });

  it('marks classes and crews no mover offers', () => {
    const q = fromLive(sample, live(), zurich);
    expect(q.prices.VAN[2]).toBeNull(); // no crew of 3
    expect(q.prices.TRUCK).toEqual([null, null, null]);
  });

  it('takes the commission rate from the route (15% cross-border)', () => {
    expect(fromLive(sample, live({ crossBorder: true, scope: 'crossBorder' }), zurich).takeRatePct).toBe(15);
    expect(fromLive(sample, live(), zurich).takeRatePct).toBe(20);
  });

  it('labels sample rates as samples', () => {
    const q = fromSample(sample);
    expect(q).toMatchObject({ source: 'sample', testMovers: false });
    expect(q.prices.SMALL[0]).toEqual({ moverPrice: 1000, payout: 800, currency: 'EUR', offers: 0 });
  });
});
