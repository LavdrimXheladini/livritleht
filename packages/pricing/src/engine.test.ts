import { describe, expect, it } from 'vitest';

import type { QuoteJob, RateCard } from '@ranktrip/shared';

import { estimateLaborMinutes, quoteVehicle, type Quote } from './engine';

const card: RateCard = {
  currency: 'EUR',
  baseFee: 3000,
  perKm: 90,
  perLaborMinute: { 1: 60, 2: 95, 3: 130 },
  minPrice: 6000,
  floorWithoutLiftFee: 300,
  heavyItemFee: 500,
  assemblyPerItem: 800,
  longDistanceThresholdKm: 150,
  longDistancePerKm: 40,
};

const job: QuoteJob = {
  vehicleClass: 'LARGE_VAN',
  distanceKm: 82.37,
  crossBorder: false,
  helpers: 2,
  stops: [
    { floor: 3, hasLift: false },
    { floor: 1, hasLift: true },
  ],
  items: [
    { key: 'sofa3', qty: 1, assembly: false },
    { key: 'box', qty: 14, assembly: false },
    { key: 'wardrobe', qty: 1, assembly: true },
    { key: 'washingMachine', qty: 1, assembly: false },
  ],
};

const noFee = { bookingFee: null };

function quoteOf(j: QuoteJob, c: RateCard = card, opts: Parameters<typeof quoteVehicle>[2] = noFee): Quote {
  const r = quoteVehicle(j, c, opts);
  if (!r.ok) throw new Error(`expected a quote, got ${r.reason}`);
  return r.quote;
}

describe('labour estimate', () => {
  it('adds handling, stairs without a lift and setup, then scales by crew', () => {
    // handling 20 + 14×2 + 25 + 15 = 88; stairs 3 floors × 8 = 24 (drop-off has a lift); setup 20
    // → 132 min for one person; a crew of 2 takes 60% → 79.2 → 80.
    expect(estimateLaborMinutes({ ...job, helpers: 1 })).toBe(132);
    expect(estimateLaborMinutes(job)).toBe(80);
    expect(estimateLaborMinutes({ ...job, helpers: 3 })).toBe(60); // 132 × 45% = 59.4 → 60
  });
});

describe('quote = the mover’s own rate card (COMPLIANCE §1, §1.1, §13)', () => {
  it('matches the formula worked out by hand', () => {
    const q = quoteOf(job);
    expect(q.lines).toEqual([
      { kind: 'base', amount: 3000 },
      { kind: 'distance', amount: 7416, quantity: 82.4, unitAmount: 90 }, // 82.4 km × €0.90
      { kind: 'labor', amount: 7600, quantity: 80, unitAmount: 95 }, // 80 min × €0.95 (crew of 2)
      { kind: 'floors', amount: 900, quantity: 3, unitAmount: 300 },
      { kind: 'heavyItems', amount: 1500, quantity: 3, unitAmount: 500 }, // sofa, wardrobe, washing machine
      { kind: 'assembly', amount: 800, quantity: 1, unitAmount: 800 }, // wardrobe
    ]);
    expect(q.moverPrice).toBe(21216);
    expect(q.takeRatePct).toBe(20);
    expect(q.platformCommission).toBe(4243); // 20% of €212.16, rounded
    expect(q.moverPayout).toBe(21216 - 4243);
    expect(q.bookingFee).toBeNull();
    expect(q.total).toBe(21216);
  });

  it('lines always add up to the mover’s price, and every amount is whole cents', () => {
    // Deterministic pseudo-random inputs (Park–Miller; stays within exact integer range).
    let seed = 7;
    const rnd = (n: number) => (seed = (seed * 48271) % 2147483647) % n;
    for (let i = 0; i < 200; i++) {
      const j: QuoteJob = {
        ...job,
        distanceKm: rnd(250_000) / 100,
        crossBorder: rnd(2) === 1,
        helpers: ([1, 2, 3] as const)[rnd(3)]!,
        stops: [
          { floor: rnd(9), hasLift: rnd(2) === 1 },
          { floor: rnd(9), hasLift: rnd(2) === 1 },
        ],
      };
      const q = quoteOf(j, { ...card, perKm: rnd(300), baseFee: rnd(9000), minPrice: rnd(20_000) });
      expect(q.lines.reduce((s, l) => s + l.amount, 0)).toBe(q.moverPrice);
      for (const n of [q.moverPrice, q.platformCommission, q.moverPayout, q.total, ...q.lines.map((l) => l.amount)]) {
        expect(Number.isInteger(n) && n >= 0).toBe(true);
      }
      expect(q.platformCommission + q.moverPayout).toBe(q.moverPrice);
    }
  });

  it('never caps the price: more distance, more money', () => {
    const near = quoteOf({ ...job, distanceKm: 1000 });
    const far = quoteOf({ ...job, distanceKm: 5000 });
    expect(far.moverPrice).toBeGreaterThan(near.moverPrice);
    expect(far.moverPrice - near.moverPrice).toBe(4000 * 90 + 4000 * 40); // per km + long-distance per km
  });

  it('uses the mover’s new rates on the next quote', () => {
    const before = quoteOf(job);
    const after = quoteOf(job, { ...card, perKm: 120 });
    expect(after.moverPrice - before.moverPrice).toBe(Math.round(82.4 * 30));
  });

  it('tops up to the mover’s minimum price', () => {
    const small: QuoteJob = { ...job, distanceKm: 2, helpers: 1, stops: [{ floor: 0, hasLift: false }, { floor: 0, hasLift: false }], items: [{ key: 'box', qty: 1, assembly: false }] };
    const q = quoteOf(small);
    // base 3000 + 2 km × 90 + 22 min × 60 = 4500 → minimum 6000
    expect(q.lines.at(-1)).toEqual({ kind: 'minimumPrice', amount: 1500 });
    expect(q.moverPrice).toBe(6000);
  });

  it('adds the long-distance rate only beyond the mover’s threshold', () => {
    const q = quoteOf({ ...job, distanceKm: 1313 });
    expect(q.lines.find((l) => l.kind === 'longDistance')).toEqual({ kind: 'longDistance', amount: 46520, quantity: 1163, unitAmount: 40 });
    expect(quoteOf(job).lines.some((l) => l.kind === 'longDistance')).toBe(false);
    expect(quoteOf({ ...job, distanceKm: 1313 }, { ...card, longDistanceThresholdKm: null }).lines.some((l) => l.kind === 'longDistance')).toBe(false);
  });

  it('is pure: same input, same quote, inputs untouched', () => {
    const clone = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;
    const frozenJob = clone(job);
    const frozenCard = clone(card);
    Object.freeze(frozenJob);
    Object.freeze(frozenCard);
    expect(quoteOf(frozenJob, frozenCard)).toEqual(quoteOf(job));
  });
});

describe('commission, booking fee and eligibility', () => {
  it('takes 15% on cross-border jobs, 20% domestic (COMPLIANCE §1 ALLOWED)', () => {
    const q = quoteOf({ ...job, crossBorder: true });
    expect(q.takeRatePct).toBe(15);
    expect(q.platformCommission).toBe(Math.round(21216 * 0.15));
  });

  it('shows the booking fee as its own amount on top of the mover’s price', () => {
    const pct = quoteOf(job, card, { bookingFee: { kind: 'percent', pct: 5 } });
    expect(pct.bookingFee).toBe(1061); // 5% of 21216, rounded
    expect(pct.total).toBe(21216 + 1061);
    expect(pct.moverPrice).toBe(21216); // the mover's price is never changed by the fee
    const flat = quoteOf(job, card, { bookingFee: { kind: 'flat', amountByCurrency: { EUR: 499 } } });
    expect(flat.total).toBe(21216 + 499);
    expect(() => quoteOf(job, { ...card, currency: 'PLN' }, { bookingFee: { kind: 'flat', amountByCurrency: { EUR: 499 } } })).toThrow(/PLN/);
  });

  it('refuses a crew size the vehicle doesn’t offer', () => {
    expect(quoteVehicle({ ...job, helpers: 3 }, { ...card, perLaborMinute: { 1: 60, 2: 95, 3: null } }, noFee)).toEqual({
      ok: false,
      reason: 'CREW_NOT_OFFERED',
    });
  });

  it('prices corridor jobs only in EUR (COMPLIANCE §11)', () => {
    expect(quoteVehicle({ ...job, crossBorder: true }, { ...card, currency: 'PLN' }, noFee)).toEqual({
      ok: false,
      reason: 'CROSS_BORDER_NEEDS_EUR',
    });
    expect(quoteVehicle(job, { ...card, currency: 'PLN' }, noFee).ok).toBe(true);
  });
});

describe('lek, denar and dinar: whole units (their hundredths are no longer used)', () => {
  // The Macedonian test mover's large van: 45,50 den per km and 31,35 den per crew minute.
  const denar: RateCard = {
    currency: 'MKD',
    baseFee: 156000,
    perKm: 4550,
    perLaborMinute: { 1: 1650, 2: 3135, 3: 4290 },
    minPrice: 325000,
    floorWithoutLiftFee: 13200,
    heavyItemFee: 27500,
    assemblyPerItem: 38500,
    longDistanceThresholdKm: null,
    longDistancePerKm: 0,
  };
  const whole = (q: Quote) => [q.moverPrice, q.platformCommission, q.moverPayout, q.total, ...q.lines.map((l) => l.amount)];

  it('rounds each line, so the lines still add up to the price', () => {
    const q = quoteOf(job, denar);
    // 82.4 km × 45,50 den = 3 749,20 den → 3 749 den
    expect(q.lines.find((l) => l.kind === 'distance')).toEqual({ kind: 'distance', amount: 374900, quantity: 82.4, unitAmount: 4550 });
    expect(q.lines.reduce((s, l) => s + l.amount, 0)).toBe(q.moverPrice);
    for (const n of whole(q)) expect(n % 100).toBe(0);
  });

  it('holds for any job, crew and card in all three currencies', () => {
    let seed = 11;
    const rnd = (n: number) => (seed = (seed * 48271) % 2147483647) % n;
    for (let i = 0; i < 300; i++) {
      const currency = (['ALL', 'MKD', 'RSD'] as const)[rnd(3)]!;
      const j: QuoteJob = { ...job, distanceKm: rnd(250_000) / 100, helpers: ([1, 2, 3] as const)[rnd(3)]! };
      const c: RateCard = {
        ...denar,
        currency,
        baseFee: rnd(500_000),
        perKm: rnd(20_000),
        perLaborMinute: { 1: rnd(5000), 2: rnd(9000), 3: rnd(12_000) },
        minPrice: rnd(900_000),
        longDistanceThresholdKm: rnd(2) === 1 ? rnd(300) : null,
        longDistancePerKm: rnd(10_000),
      };
      const q = quoteOf(j, c, { bookingFee: { kind: 'percent', pct: 3 } });
      for (const n of whole(q)) expect(n % 100).toBe(0);
      expect(q.lines.reduce((s, l) => s + l.amount, 0)).toBe(q.moverPrice);
      expect(q.platformCommission + q.moverPayout).toBe(q.moverPrice);
    }
  });

  it('keeps euro cents as they are', () => {
    expect(quoteOf(job).lines.find((l) => l.kind === 'distance')!.amount).toBe(7416);
    expect(quoteOf(job, { ...card, currency: 'PLN' }).moverPrice).toBe(21216);
  });
});
