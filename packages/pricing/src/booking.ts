// The `book` request priced on the server: the customer's move with the ONE van they chose, from that
// mover's own rate card (COMPLIANCE §1.1, §13) — the same distance and engine as the quote they saw.
// Pure, with the I/O passed in (like quoteForRequest); the Deno function saves the result.

import { BOOKING_DAYS_AHEAD, bookRequestSchema, jobType, type BookRequest, type BookingStop, type JobType, type QuoteJob } from '@movershub/shared';

import { quoteVehicle, type Quote } from './engine';
import { moverFactsFromRow, rateCardFromRow, type QuotableVehicleRow } from './offers';
import { estimateRoadKm, type QuoteDeps } from './service';

export type BookingDeps = Pick<QuoteDeps, 'routeKm' | 'quotableVehicles' | 'bookingFee'> & { now: Date };

export type PricedBooking = {
  request: BookRequest;
  /** Route distance the price uses, km (one decimal) — as the quote measured it. */
  distanceKm: number;
  crossBorder: boolean;
  type: JobType;
  /** The chosen van's row from `quotable_vehicles`: still offered for this move on that day. */
  row: QuotableVehicleRow;
  quote: Quote;
};

export type BookingOutcome =
  | { ok: true; booking: PricedBooking }
  | { ok: false; error: 'invalid_request'; issues: { path: string; message: string }[] }
  /** The move is not in the future, or further ahead than can be booked. */
  | { ok: false; error: 'invalid_date' }
  /** The chosen van is no longer offered for this move (documents, area, suspension, terms) or can't take it. */
  | { ok: false; error: 'mover_unavailable' };

const DAY_MS = 24 * 60 * 60 * 1000;

const stop = (s: BookingStop) => ({ floor: s.floor, hasLift: s.floor > 0 && s.hasLift === true });

export async function priceBooking(body: unknown, deps: BookingDeps): Promise<BookingOutcome> {
  const parsed = bookRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'invalid_request',
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
  }
  const request = parsed.data;
  const at = Date.parse(request.scheduledAt);
  const now = deps.now.getTime();
  if (at <= now || at > now + (BOOKING_DAYS_AHEAD + 1) * DAY_MS) return { ok: false, error: 'invalid_date' };

  const pickup = request.pickup.place;
  const dropoff = request.dropoff.place;
  const routed = await deps.routeKm(pickup, dropoff).catch(() => null);
  const distanceKm = Math.round((routed ?? estimateRoadKm(pickup, dropoff)) * 10) / 10;
  const crossBorder = pickup.countryCode !== dropoff.countryCode;

  const rows = await deps.quotableVehicles({ pickup, dropoff, vehicleClass: request.vehicleClass, scheduledAt: request.scheduledAt });
  const row = rows.find((r) => r.vehicle_id === request.vehicleId);
  if (!row || moverFactsFromRow(row).cancellation === null) return { ok: false, error: 'mover_unavailable' };

  const job: QuoteJob = {
    vehicleClass: request.vehicleClass,
    distanceKm,
    crossBorder,
    helpers: request.helpers,
    stops: [stop(request.pickup), stop(request.dropoff)],
    items: request.items,
  };
  const result = quoteVehicle(job, rateCardFromRow(row), { bookingFee: deps.bookingFee });
  if (!result.ok) return { ok: false, error: 'mover_unavailable' };

  return {
    ok: true,
    booking: { request, distanceKm, crossBorder, type: jobType({ crossBorder, vehicleClass: request.vehicleClass, items: request.items }), row, quote: result.quote },
  };
}

/** One stop as `jobs` columns: the town / neighbourhood, and the exact place with the customer's directions. */
function stopColumns(prefix: 'pickup' | 'dropoff', s: BookingStop) {
  return {
    [`${prefix}_area`]: s.place.area,
    [`${prefix}_district`]: s.place.district ?? null,
    [`${prefix}_country`]: s.place.countryCode,
    [`${prefix}_label`]: s.place.label,
    [`${prefix}_street`]: s.street,
    [`${prefix}_house_number`]: s.houseNumber,
    [`${prefix}_point`]: `SRID=4326;POINT(${s.place.lon} ${s.place.lat})`,
    [`${prefix}_details`]: s.details.trim(),
    [`${prefix}_floor`]: s.floor,
    [`${prefix}_has_lift`]: s.floor > 0 && s.hasLift === true,
  };
}

/** The `jobs` row for a priced booking (status QUOTED: saved, not booked — that needs the card). */
export function jobColumns({ request, distanceKm, type, row, quote }: PricedBooking, customerId: string) {
  return {
    customer_id: customerId,
    status: 'QUOTED',
    type,
    vehicle_class: request.vehicleClass,
    helpers: request.helpers,
    scheduled_at: request.scheduledAt,
    ...stopColumns('pickup', request.pickup),
    ...stopColumns('dropoff', request.dropoff),
    items: request.items,
    distance_km: distanceKm,
    est_labor_min: quote.estLaborMin,
    chosen_mover_company_id: row.company_id,
    chosen_vehicle_id: row.vehicle_id,
  };
}

/** The `quotes` row: the mover's price as the server computed it, and their terms as the customer saw them. */
export function quoteColumns({ row, quote }: PricedBooking, jobId: string, expiresAt: Date) {
  const terms = moverFactsFromRow(row).cancellation;
  if (!terms) throw new Error('a quotable mover has cancellation terms');
  return {
    job_id: jobId,
    vehicle_id: row.vehicle_id,
    mover_company_id: row.company_id,
    currency: quote.currency,
    line_items: quote.lines,
    mover_price: quote.moverPrice,
    booking_fee: quote.bookingFee,
    total: quote.total,
    take_rate_pct: quote.takeRatePct,
    platform_commission: quote.platformCommission,
    mover_payout: quote.moverPayout,
    cancel_free_hours: terms.freeHours,
    cancel_late_pct: terms.latePct,
    expires_at: expiresAt.toISOString(),
  };
}
