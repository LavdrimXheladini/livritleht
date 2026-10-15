import { describe, expect, it, vi } from 'vitest';

import type { Place, VehicleClass } from '@movershub/shared';

import type { Quote } from './engine';
import type { QuotableVehicleRow } from './offers';
import { estimateRoadKm, quoteForRequest, type QuoteDeps, type QuoteOutcome } from './service';

const prishtina: Place = { label: 'Prishtina', area: 'Prishtina', lat: 42.6629, lon: 21.1655, countryCode: 'XK' };
const prizren: Place = { label: 'Prizren', area: 'Prizren', lat: 42.2139, lon: 20.7397, countryCode: 'XK' };
const munich: Place = { label: 'Munich', area: 'Munich', lat: 48.1351, lon: 11.582, countryCode: 'DE' };

const card = (vehicleId: string): QuotableVehicleRow => ({
  vehicle_id: vehicleId,
  company_id: `c-${vehicleId}`,
  company_name: `Mover ${vehicleId}`,
  currency: 'EUR',
  base_fee: 3000,
  per_km: 80,
  per_labor_minute_1_helper: 30,
  per_labor_minute_2_helpers: 55,
  per_labor_minute_3_helpers: null,
  min_price: 5000,
  floor_without_lift_fee: 250,
  heavy_item_fee: 500,
  assembly_per_item: 700,
  long_distance_threshold_km: null,
  long_distance_per_km: 0,
  is_business: true,
  registration_no: `reg-${vehicleId}`,
  town: null,
  insurance_until: null,
  cancel_free_hours: 24,
  cancel_late_pct: 50,
});

function deps(over: Partial<QuoteDeps> = {}): QuoteDeps {
  return {
    routeKm: vi.fn(async () => 82.37),
    quotableVehicles: vi.fn(async ({ vehicleClass }: { vehicleClass: VehicleClass }) => (vehicleClass === 'VAN' ? [card('v1'), card('v2')] : [])),
    bookingFee: null,
    testMovers: false,
    ...over,
  };
}

const body = { pickup: prishtina, dropoff: prizren, helpers: 2, items: [{ key: 'sofa3', qty: 1 }] };

describe('quote request', () => {
  it('prices every class from the movers available there', async () => {
    const d = deps();
    const r = await quoteForRequest(body, d);
    if (!r.ok) throw new Error('expected a quote');
    expect(r.response.classes.map((c) => [c.vehicleClass, c.count])).toEqual([
      ['SMALL', 0],
      ['VAN', 2],
      ['LARGE_VAN', 0],
      ['BOX', 0],
      ['TRUCK', 0],
    ]);
    expect(r.response).toMatchObject({ distanceKm: 82.4, distanceEstimated: false, scope: 'domestic', crossBorder: false, bookingFeeDecided: false });
    expect(d.quotableVehicles).toHaveBeenCalledWith({ pickup: prishtina, dropoff: prizren, vehicleClass: 'VAN' });
  });

  it('passes the move date on, so movers’ documents must be valid that day (COMPLIANCE §5)', async () => {
    const d = deps();
    const scheduledAt = '2026-11-20T09:00:00+01:00';
    await quoteForRequest({ ...body, vehicleClass: 'VAN', scheduledAt }, d);
    expect(d.quotableVehicles).toHaveBeenCalledWith({ pickup: prishtina, dropoff: prizren, vehicleClass: 'VAN', scheduledAt });
  });

  it('rejects a move date that is not a full ISO date and time', async () => {
    for (const scheduledAt of ['2026-11-20', 'tomorrow', '2026-11-20 09:00', 1795000000000]) {
      expect((await quoteForRequest({ ...body, scheduledAt }, deps())).ok).toBe(false);
    }
  });

  it('asks for one class only when told to', async () => {
    const d = deps();
    const r = await quoteForRequest({ ...body, vehicleClass: 'VAN' }, d);
    expect(r.ok && r.response.classes.map((c) => c.vehicleClass)).toEqual(['VAN']);
    expect(d.quotableVehicles).toHaveBeenCalledTimes(1);
  });

  it('rejects a price sent by the client (COMPLIANCE §1.1, §13)', async () => {
    const r = await quoteForRequest({ ...body, price: 100, moverPrice: 1 }, deps());
    expect(r.ok).toBe(false);
    expect(!r.ok && r.issues[0]?.message).toMatch(/unrecognized/i);
  });

  it('rejects any other price-shaping field from the client', async () => {
    for (const extra of [{ distanceKm: 1 }, { crossBorder: true }, { total: 1 }, { bookingFee: 0 }, { takeRatePct: 0 }]) {
      const r = await quoteForRequest({ ...body, ...extra }, deps());
      expect(r.ok).toBe(false);
      expect(!r.ok && r.issues[0]?.message).toMatch(/unrecognized/i);
    }
  });

  it('ignores price data hidden inside items and stops: only the catalogue and the mover’s card count', async () => {
    const prices = (r: QuoteOutcome) => (r.ok ? r.response.classes.flatMap((c) => c.offers.map((o) => o.quote.moverPrice)) : []);
    const hidden = await quoteForRequest(
      { ...body, items: [{ key: 'sofa3', qty: 1, price: 1, handlingMin: 0, heavy: false }], pickupStop: { floor: 0, hasLift: true, fee: 0 } },
      deps(),
    );
    expect(hidden.ok).toBe(true);
    expect(prices(hidden)).toEqual(prices(await quoteForRequest(body, deps())));
  });

  it('reads the movers’ rates again for every request, so a changed rate counts at once (COMPLIANCE §13)', async () => {
    const quotableVehicles = vi.fn().mockResolvedValueOnce([card('v1')]).mockResolvedValueOnce([{ ...card('v1'), per_km: 120 }]);
    const d = deps({ quotableVehicles });
    const quote = async () => {
      const r = await quoteForRequest({ ...body, vehicleClass: 'VAN' }, d);
      if (!r.ok) throw new Error('expected a quote');
      return r.response.classes[0]!.offers[0]!.quote;
    };
    const distance = (q: Quote) => q.lines.find((l) => l.kind === 'distance')!;
    const before = await quote();
    const after = await quote();
    expect([distance(before).unitAmount, distance(after).unitAmount]).toEqual([80, 120]);
    expect(after.moverPrice - before.moverPrice).toBe(distance(after).amount - distance(before).amount);
  });

  it('rejects incomplete or impossible requests', async () => {
    for (const bad of [
      { ...body, items: [] },
      { ...body, dropoff: prishtina },
      { ...body, helpers: 4 },
      { ...body, items: [{ key: 'box', qty: 1, assembly: true }] },
      null,
    ]) {
      expect((await quoteForRequest(bad, deps())).ok).toBe(false);
    }
  });

  it('quotes moves within one city (local), not only city to city', async () => {
    const ulpiana: Place = { label: 'Ulpianë, Prishtinë', area: 'Prishtina', district: 'Ulpianë', lat: 42.6504, lon: 21.1607, countryCode: 'XK' };
    const r = await quoteForRequest({ ...body, dropoff: ulpiana }, deps({ routeKm: async () => 2.4 }));
    expect(r.ok && r.response).toMatchObject({ scope: 'local', distanceKm: 2.4 });
    // The mover's minimum price still applies to a short hop.
    const van = r.ok ? r.response.classes.find((c) => c.vehicleClass === 'VAN') : undefined;
    expect(van?.from[0]?.moverPrice).toBeGreaterThanOrEqual(5000);
  });

  it('marks cross-border jobs from the countries, never from the client', async () => {
    const d = deps();
    const r = await quoteForRequest({ ...body, dropoff: munich }, d);
    expect(r.ok && r.response.crossBorder).toBe(true);
    expect(d.quotableVehicles).toHaveBeenCalledWith(expect.objectContaining({ pickup: prishtina, dropoff: munich }));
  });

  it('falls back to an estimated distance when routing is down, and says so', async () => {
    const r = await quoteForRequest(body, deps({ routeKm: async () => Promise.reject(new Error('down')) }));
    expect(r.ok && r.response).toMatchObject({ distanceEstimated: true, distanceKm: estimateRoadKm(prishtina, prizren) });
  });

  it('includes the booking fee once it is decided', async () => {
    const r = await quoteForRequest(body, deps({ bookingFee: { kind: 'flat', amountByCurrency: { EUR: 499 } } }));
    const van = r.ok ? r.response.classes.find((c) => c.vehicleClass === 'VAN') : undefined;
    expect(r.ok && r.response.bookingFeeDecided).toBe(true);
    expect(van?.from[0]).toMatchObject({ bookingFee: 499, total: van!.from[0]!.moverPrice + 499 });
  });
});

describe('prices before the customer lists items (landing page)', () => {
  const { items: _items, ...noItems } = body;

  it('uses a typical load for each class and says so', async () => {
    const r = await quoteForRequest(noItems, deps({ testMovers: true }));
    if (!r.ok) throw new Error('expected a quote');
    expect(r.response).toMatchObject({ typicalLoad: true, testMovers: true });
    const withItems = await quoteForRequest(body, deps());
    const van = (x: QuoteOutcome) => (x.ok ? x.response.classes.find((c) => c.vehicleClass === 'VAN')!.from[0]!.moverPrice : 0);
    expect(van(r)).not.toBe(van(withItems)); // sofa + 10 boxes + 2 chairs, not just the request's sofa
  });

  it('gives the "from" price for every crew size in one answer', async () => {
    const r = await quoteForRequest(noItems, deps());
    const van = r.ok ? r.response.classes.find((c) => c.vehicleClass === 'VAN')! : undefined;
    expect(van?.crews[1].count).toBe(2);
    expect(van?.crews[2].from[0]).toEqual(van?.from[0]); // the requested crew (2) matches its summary
    expect(van!.crews[1].from[0]!.moverPrice).toBeLessThan(van!.crews[2].from[0]!.moverPrice);
    expect(van?.crews[3]).toEqual({ count: 0, from: [] }); // these vans offer no crew of 3
    expect(van!.crews[2].from[0]!.moverPayout).toBe(Math.round(van!.crews[2].from[0]!.moverPrice * 0.8));
  });

  it('the "from" price of each crew is the lowest quote for that crew (COMPLIANCE §13)', async () => {
    const two = [card('v1'), { ...card('v2'), base_fee: 1000 }];
    const d = deps({ quotableVehicles: vi.fn(async ({ vehicleClass }: { vehicleClass: VehicleClass }) => (vehicleClass === 'VAN' ? two : [])) });
    const van = (x: QuoteOutcome) => (x.ok ? x.response.classes.find((c) => c.vehicleClass === 'VAN')! : undefined);
    const crew2 = van(await quoteForRequest(noItems, d))!;
    const crew1 = van(await quoteForRequest({ ...noItems, helpers: 1 }, d))!;
    expect(crew2.crews[1].from).toEqual(crew1.from);
    expect(crew1.from[0]!.moverPrice).toBe(Math.min(...crew1.offers.map((o) => o.quote.moverPrice)));
  });
});

describe('estimated road distance', () => {
  it('is the straight line plus a typical detour', () => {
    expect(estimateRoadKm(prishtina, prizren)).toBeGreaterThan(70);
    expect(estimateRoadKm(prishtina, prizren)).toBeLessThan(90);
  });
});
