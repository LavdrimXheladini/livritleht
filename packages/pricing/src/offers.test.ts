import { describe, expect, it } from 'vitest';

import type { QuoteJob } from '@movershub/shared';

import { quoteVehicle } from './engine';
import { buildClassOffers, rateCardFromRow, type QuotableVehicleRow } from './offers';

const row = (id: string, over: Partial<QuotableVehicleRow> = {}): QuotableVehicleRow => ({
  vehicle_id: id,
  company_id: `company-${id}`,
  company_name: `Mover ${id}`,
  currency: 'EUR',
  base_fee: 2500,
  per_km: 60,
  per_labor_minute_1_helper: 28,
  per_labor_minute_2_helpers: 48,
  per_labor_minute_3_helpers: 66,
  min_price: 3500,
  floor_without_lift_fee: 200,
  heavy_item_fee: 400,
  assembly_per_item: 600,
  long_distance_threshold_km: null,
  long_distance_per_km: 0,
  ...over,
});

const job: QuoteJob = {
  vehicleClass: 'VAN',
  distanceKm: 82.4,
  crossBorder: false,
  helpers: 2,
  stops: [
    { floor: 2, hasLift: false },
    { floor: 0, hasLift: true },
  ],
  items: [
    { key: 'sofa3', qty: 1, assembly: false },
    { key: 'box', qty: 10, assembly: false },
  ],
};

const rows = [
  row('b', { base_fee: 4000 }), // dearer
  row('a'), // cheapest EUR
  row('c', { per_km: 70 }),
  row('p', { currency: 'PLN', base_fee: 15000, per_km: 320 }), // another currency
];

describe('offers for a vehicle class', () => {
  it('"from" is the lowest mover quote in the class (COMPLIANCE §1.1, §13)', () => {
    const result = buildClassOffers('VAN', job, rows, null);
    const eurPrices = rows
      .filter((r) => r.currency === 'EUR')
      .map((r) => {
        const q = quoteVehicle(job, rateCardFromRow(r), { bookingFee: null });
        if (!q.ok) throw new Error(q.reason);
        return q.quote.moverPrice;
      });
    expect(result.from.find((f) => f.currency === 'EUR')?.moverPrice).toBe(Math.min(...eurPrices));
    expect(result.count).toBe(4);
  });

  it('lists every offer cheapest first, each with its mover and fixed price', () => {
    const { offers } = buildClassOffers('VAN', job, rows, null);
    const eur = offers.filter((o) => o.quote.currency === 'EUR');
    expect(eur.map((o) => o.companyName)).toEqual(['Mover a', 'Mover c', 'Mover b']);
    expect(eur.every((o, i) => i === 0 || o.quote.moverPrice >= eur[i - 1]!.quote.moverPrice)).toBe(true);
  });

  it('never compares amounts across currencies', () => {
    const { from } = buildClassOffers('VAN', job, rows, null);
    expect(from.map((f) => f.currency)).toEqual(['EUR', 'PLN']);
  });

  it('leaves out vehicles that cannot take the job', () => {
    const noCrewOf3 = buildClassOffers('VAN', { ...job, helpers: 3 }, [row('x', { per_labor_minute_3_helpers: null }), row('y')], null);
    expect(noCrewOf3.offers.map((o) => o.vehicleId)).toEqual(['y']);
    const corridor = buildClassOffers('VAN', { ...job, crossBorder: true }, rows, null);
    expect(corridor.offers.every((o) => o.quote.currency === 'EUR')).toBe(true); // COMPLIANCE §11
  });

  it('says so when no mover is available', () => {
    expect(buildClassOffers('TRUCK', job, [], null)).toEqual({ vehicleClass: 'TRUCK', count: 0, from: [], offers: [] });
  });

  it('prices each offer from its own mover’s card, never another’s (COMPLIANCE §1.1)', () => {
    const { offers } = buildClassOffers('VAN', job, rows, null);
    for (const offer of offers) {
      const own = rows.find((r) => r.vehicle_id === offer.vehicleId)!;
      const q = quoteVehicle(job, rateCardFromRow(own), { bookingFee: null });
      expect(q.ok && q.quote).toEqual(offer.quote);
      expect(offer.companyName).toBe(own.company_name);
    }
    expect(new Set(offers.map((o) => o.quote.moverPrice)).size).toBe(offers.length); // different cards, different prices
  });

  it('"from" leaves out vehicles that cannot take the job, however cheap', () => {
    const crew3 = buildClassOffers('VAN', { ...job, helpers: 3 }, [row('cheap', { base_fee: 0, per_labor_minute_3_helpers: null }), row('y')], null);
    expect(crew3.from).toHaveLength(1);
    expect(crew3.from[0]!.moverPrice).toBe(crew3.offers.find((o) => o.vehicleId === 'y')!.quote.moverPrice);
    const corridor = buildClassOffers('VAN', { ...job, crossBorder: true }, [row('p', { currency: 'PLN', base_fee: 0 }), row('a')], null);
    expect(corridor.from.map((f) => f.currency)).toEqual(['EUR']); // COMPLIANCE §11
  });
});

describe('rate card from the database row', () => {
  it('reads every column into the engine card, none swapped', () => {
    const r = row('a', { per_labor_minute_3_helpers: null, long_distance_threshold_km: 150, long_distance_per_km: 40 });
    expect(rateCardFromRow(r)).toEqual({
      currency: 'EUR',
      baseFee: 2500,
      perKm: 60,
      perLaborMinute: { 1: 28, 2: 48, 3: null },
      minPrice: 3500,
      floorWithoutLiftFee: 200,
      heavyItemFee: 400,
      assemblyPerItem: 600,
      longDistanceThresholdKm: 150,
      longDistancePerKm: 40,
    });
  });
});
