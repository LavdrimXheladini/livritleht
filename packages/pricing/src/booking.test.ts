import { describe, expect, it, vi } from 'vitest';

import { moveQuoteRequest, newStop, type BookingDraft, type Place, type VehicleClass } from '@movershub/shared';

import { jobColumns, priceBooking, quoteColumns, type BookingDeps } from './booking';
import type { QuotableVehicleRow } from './offers';
import { quoteForRequest } from './service';

const prishtina: Place = { label: 'Prishtina', area: 'Prishtina', lat: 42.6629, lon: 21.1655, countryCode: 'XK' };
const prizren: Place = { label: 'Prizren', area: 'Prizren', lat: 42.2139, lon: 20.7397, countryCode: 'XK' };
const VAN_A = '00000000-0000-4000-8000-0000000000a1';
const VAN_B = '00000000-0000-4000-8000-0000000000b1';

const card = (vehicleId: string, over: Partial<QuotableVehicleRow> = {}): QuotableVehicleRow => ({
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
  registration_no: 'reg',
  town: null,
  insurance_until: '2027-12-31T23:59:59+00:00',
  cancel_free_hours: 48,
  cancel_late_pct: 50,
  ...over,
});

const now = new Date('2026-10-15T10:00:00Z');

function deps(over: Partial<BookingDeps> = {}): BookingDeps {
  return {
    routeKm: vi.fn(async () => 82.37),
    quotableVehicles: vi.fn(async ({ vehicleClass }: { vehicleClass: VehicleClass }) =>
      vehicleClass === 'VAN' ? [card(VAN_A), card(VAN_B, { base_fee: 2000 })] : [],
    ),
    bookingFee: null,
    now,
    ...over,
  };
}

const draft: BookingDraft = {
  pickup: { ...newStop(prishtina), details: 'Block B, entrance 2', floor: 3, hasLift: false },
  dropoff: newStop(prizren, { street: 'Rruga Remzi Ademaj', houseNumber: '5' }),
  items: { sofa3: { qty: 1, assembly: false }, wardrobe: { qty: 1, assembly: true } },
  day: '2026-10-16',
  hour: 9,
  crew: 2,
  vehicleClass: 'VAN',
  choice: { vehicleId: VAN_A, companyId: `c-${VAN_A}` },
  jobId: null,
};
const body = {
  pickup: draft.pickup,
  dropoff: draft.dropoff,
  items: [
    { key: 'sofa3', qty: 1, assembly: false },
    { key: 'wardrobe', qty: 1, assembly: true },
  ],
  helpers: 2,
  scheduledAt: '2026-10-16T07:00:00.000Z',
  vehicleClass: 'VAN',
  vehicleId: VAN_A,
};

describe('booking request priced on the server', () => {
  it('prices the chosen van exactly as the quote the customer saw (COMPLIANCE §1.1, §13)', async () => {
    const d = deps();
    const booked = await priceBooking(body, d);
    if (!booked.ok) throw new Error(booked.error);
    const seen = await quoteForRequest({ ...moveQuoteRequest(draft), scheduledAt: body.scheduledAt }, { ...d, testMovers: false });
    if (!seen.ok) throw new Error('quote');
    const offer = seen.response.classes.find((c) => c.vehicleClass === 'VAN')!.offers.find((o) => o.vehicleId === VAN_A)!;
    expect(booked.booking.quote).toEqual(offer.quote);
    expect(booked.booking).toMatchObject({ distanceKm: 82.4, crossBorder: false, type: 'SMALL_MOVE' });
    expect(booked.booking.row.vehicle_id).toBe(VAN_A);
    // Documents must be valid on the move date (COMPLIANCE §5).
    expect(d.quotableVehicles).toHaveBeenCalledWith({ pickup: prishtina, dropoff: prizren, vehicleClass: 'VAN', scheduledAt: body.scheduledAt });
  });

  it('never takes a price from the client', async () => {
    for (const extra of [{ moverPrice: 1 }, { total: 1 }, { distanceKm: 1 }, { quote: { moverPrice: 1 } }]) {
      const r = await priceBooking({ ...body, ...extra }, deps());
      expect(r.ok === false && r.error).toBe('invalid_request');
    }
  });

  it('a van no longer offered for this move (or for that day) is refused', async () => {
    const gone = await priceBooking({ ...body, vehicleId: '00000000-0000-4000-8000-0000000000c1' }, deps());
    expect(gone.ok === false && gone.error).toBe('mover_unavailable');
    const noCrew = await priceBooking({ ...body, helpers: 3 }, deps());
    expect(noCrew.ok === false && noCrew.error).toBe('mover_unavailable');
    const noTerms = await priceBooking(body, deps({ quotableVehicles: vi.fn(async () => [card(VAN_A, { cancel_free_hours: null, cancel_late_pct: null })]) }));
    expect(noTerms.ok === false && noTerms.error).toBe('mover_unavailable');
  });

  it('only moves in the future, at most two months ahead', async () => {
    for (const scheduledAt of ['2026-10-15T09:00:00Z', '2027-01-01T09:00:00Z']) {
      const r = await priceBooking({ ...body, scheduledAt }, deps());
      expect(r.ok === false && r.error).toBe('invalid_date');
    }
  });

  it('needs the stops complete: the place found and the lift answered', async () => {
    const r = await priceBooking({ ...body, pickup: { ...body.pickup, hasLift: null } }, deps());
    expect(r.ok === false && r.error).toBe('invalid_request');
  });
});

describe('saved booking request', () => {
  it('keeps the town apart from the exact place, and the quote with the terms the customer saw', async () => {
    const r = await priceBooking(body, deps());
    if (!r.ok) throw new Error(r.error);
    const job = jobColumns(r.booking, 'customer-1');
    expect(job).toMatchObject({
      customer_id: 'customer-1',
      status: 'QUOTED',
      type: 'SMALL_MOVE',
      pickup_area: 'Prishtina',
      pickup_street: null,
      pickup_details: 'Block B, entrance 2',
      pickup_floor: 3,
      pickup_has_lift: false,
      pickup_point: 'SRID=4326;POINT(21.1655 42.6629)',
      dropoff_street: 'Rruga Remzi Ademaj',
      dropoff_house_number: '5',
      dropoff_has_lift: false,
      distance_km: 82.4,
      chosen_vehicle_id: VAN_A,
      chosen_mover_company_id: `c-${VAN_A}`,
    });
    const mover = {
      companyId: `c-${VAN_A}`,
      name: 'Mover a1',
      isBusiness: true,
      registrationNo: 'reg',
      address: 'Rr. Agim Ramadani 12, Prishtinë',
      country: 'XK',
      phone: '+38344000001',
      email: 'mover@example.com',
      insuranceUntil: '2027-12-31T23:59:59+00:00',
      cancellation: { freeHours: 48, latePct: 50 },
    } as const;
    const quote = quoteColumns(r.booking, 'job-1', new Date('2026-10-15T10:15:00Z'), mover);
    expect(quote).toMatchObject({
      job_id: 'job-1',
      mover_price: r.booking.quote.moverPrice,
      total: r.booking.quote.total,
      booking_fee: null,
      cancel_free_hours: 48,
      cancel_late_pct: 50,
      expires_at: '2026-10-15T10:15:00.000Z',
      mover,
    });
    expect(quote.line_items.reduce((sum, l) => sum + l.amount, 0)).toBe(quote.mover_price);
  });
});
