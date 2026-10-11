import { describe, expect, it } from 'vitest';

import { quoteJobSchema, rateCardSchema } from './pricing';

const card = {
  currency: 'EUR',
  baseFee: 3000,
  perKm: 90,
  perLaborMinute: { 1: 60, 2: 95, 3: null },
  minPrice: 6000,
  floorWithoutLiftFee: 300,
  heavyItemFee: 500,
  assemblyPerItem: 800,
  longDistanceThresholdKm: null,
  longDistancePerKm: 0,
};

describe('rateCardSchema', () => {
  it('takes whole cents only, never negative', () => {
    expect(rateCardSchema.safeParse(card).success).toBe(true);
    expect(rateCardSchema.safeParse({ ...card, perKm: 0.9 }).success).toBe(false);
    expect(rateCardSchema.safeParse({ ...card, baseFee: -1 }).success).toBe(false);
  });

  it('has no maximum: the platform never caps a mover’s rates (COMPLIANCE §1)', () => {
    expect(rateCardSchema.safeParse({ ...card, baseFee: 50_000_000, perKm: 1_000_000 }).success).toBe(true);
  });
});

describe('quoteJobSchema', () => {
  const job = {
    vehicleClass: 'VAN',
    distanceKm: 12.5,
    crossBorder: false,
    helpers: 2,
    stops: [
      { floor: 2, hasLift: false },
      { floor: 0, hasLift: false },
    ],
    items: [{ key: 'desk', qty: 1, assembly: true }],
  };

  it('accepts a normal job and defaults assembly to false', () => {
    const parsed = quoteJobSchema.parse({ ...job, items: [{ key: 'box', qty: 10 }] });
    expect(parsed.items[0]).toEqual({ key: 'box', qty: 10, assembly: false });
  });

  it('needs a pickup and a drop-off, a known item, a crew of 1–3', () => {
    expect(quoteJobSchema.safeParse({ ...job, stops: [job.stops[0]] }).success).toBe(false);
    expect(quoteJobSchema.safeParse({ ...job, items: [{ key: 'piano', qty: 1 }] }).success).toBe(false);
    expect(quoteJobSchema.safeParse({ ...job, helpers: 4 }).success).toBe(false);
  });

  it('only allows assembly for items that can be taken apart', () => {
    const r = quoteJobSchema.safeParse({ ...job, items: [{ key: 'box', qty: 1, assembly: true }] });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0]?.message).toBe('assembly_not_possible');
  });
});
