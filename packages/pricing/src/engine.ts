// Pricing engine (CLAUDE.md §4): pure functions, no I/O. Runs only on the server (the `quote`
// function); the client never sends a price. Every amount comes from ONE mover's own rate card —
// the platform only adds its labour-time estimate, its commission and the separate booking fee
// (COMPLIANCE §1, §1.1). Money is integer minor units (cents) of the rate card's currency.

import {
  ITEM_CATALOGUE,
  PLATFORM_TAKE_RATE_PCT,
  type BookingFeeRule,
  type CrewSize,
  type Currency,
  type QuoteJob,
  type RateCard,
} from '@ranktrip/shared';

/* ── Labour-time estimate (platform estimate of minutes, never a price) ── */

/** Extra minutes per floor carried without a lift, per stop. */
export const FLOOR_PENALTY_MIN = 8;
/** Setup per job: parking, protecting floors, loading plan, paperwork. */
export const TRAVEL_BUFFER_MIN = 20;
/** More people finish sooner (the mover's per-minute rate for a bigger crew is higher), in percent. */
export const CREW_TIME_PCT: Record<CrewSize, number> = { 1: 100, 2: 60, 3: 45 };

/** Estimated labour minutes for the whole crew, rounded up to whole minutes. */
export function estimateLaborMinutes(job: Pick<QuoteJob, 'items' | 'stops' | 'helpers'>): number {
  const handling = job.items.reduce((min, it) => min + ITEM_CATALOGUE[it.key].handlingMin * it.qty, 0);
  const stairs = job.stops.reduce((min, s) => min + (s.hasLift ? 0 : FLOOR_PENALTY_MIN * s.floor), 0);
  return Math.ceil(((handling + stairs + TRAVEL_BUFFER_MIN) * CREW_TIME_PCT[job.helpers]) / 100);
}

/* ── Quote ───────────────────────────────────────────────────────────── */

export type QuoteLineKind =
  | 'base'
  | 'distance'
  | 'labor'
  | 'floors'
  | 'heavyItems'
  | 'assembly'
  | 'longDistance'
  /** Top-up to the mover's minimum price. */
  | 'minimumPrice';

/** One line of the mover's price. `quantity × unitAmount` explains `amount` (rounded to cents). */
export type QuoteLine = { kind: QuoteLineKind; amount: number; quantity?: number; unitAmount?: number };

export type Quote = {
  currency: Currency;
  estLaborMin: number;
  /** The mover's price, itemised; the amounts add up to `moverPrice`. */
  lines: QuoteLine[];
  moverPrice: number;
  /** Ranktrip's booking fee, its own line. `null` = amount not decided yet (design/DECISIONS.md #6). */
  bookingFee: number | null;
  /** What the customer pays: mover's price + booking fee. */
  total: number;
  takeRatePct: number;
  /** Ranktrip's commission, taken from the mover's price. */
  platformCommission: number;
  moverPayout: number;
};

export type QuoteResult =
  | { ok: true; quote: Quote }
  /**
   * CREW_NOT_OFFERED: this vehicle's card has no rate for the requested crew size.
   * CROSS_BORDER_NEEDS_EUR: corridor jobs are priced in EUR only (COMPLIANCE §11).
   */
  | { ok: false; reason: 'CREW_NOT_OFFERED' | 'CROSS_BORDER_NEEDS_EUR' };

/** Distance in tenths of a km, so the itemised line can be recomputed exactly from what is shown. */
const toTenthsKm = (km: number) => Math.round(km * 10);

/**
 * Price of one job with one vehicle's rate card:
 *   base + per km + per labour minute (crew) + floors without lift + heavy items + assembly
 *   + long-distance km beyond the threshold, at least the mover's minimum price.
 * No maximum is ever applied (COMPLIANCE §1 MUST NOT).
 */
export function quoteVehicle(job: QuoteJob, card: RateCard, opts: { bookingFee: BookingFeeRule | null }): QuoteResult {
  const perMinute = card.perLaborMinute[job.helpers];
  if (perMinute === null) return { ok: false, reason: 'CREW_NOT_OFFERED' };
  if (job.crossBorder && card.currency !== 'EUR') return { ok: false, reason: 'CROSS_BORDER_NEEDS_EUR' };

  const kmTenths = toTenthsKm(job.distanceKm);
  const estLaborMin = estimateLaborMinutes(job);
  const floorsWithoutLift = job.stops.reduce((n, s) => n + (s.hasLift ? 0 : s.floor), 0);
  const heavyItems = job.items.reduce((n, it) => n + (ITEM_CATALOGUE[it.key].heavy ? it.qty : 0), 0);
  const assemblyItems = job.items.reduce((n, it) => n + (it.assembly && ITEM_CATALOGUE[it.key].assemblable ? it.qty : 0), 0);

  const lines: QuoteLine[] = [];
  const add = (kind: QuoteLineKind, amount: number, quantity?: number, unitAmount?: number) => {
    if (amount > 0) lines.push(quantity === undefined ? { kind, amount } : { kind, amount, quantity, unitAmount });
  };
  add('base', card.baseFee);
  add('distance', Math.round((card.perKm * kmTenths) / 10), kmTenths / 10, card.perKm);
  add('labor', perMinute * estLaborMin, estLaborMin, perMinute);
  add('floors', card.floorWithoutLiftFee * floorsWithoutLift, floorsWithoutLift, card.floorWithoutLiftFee);
  add('heavyItems', card.heavyItemFee * heavyItems, heavyItems, card.heavyItemFee);
  add('assembly', card.assemblyPerItem * assemblyItems, assemblyItems, card.assemblyPerItem);
  if (card.longDistanceThresholdKm !== null) {
    const extraTenths = Math.max(0, kmTenths - card.longDistanceThresholdKm * 10);
    add('longDistance', Math.round((card.longDistancePerKm * extraTenths) / 10), extraTenths / 10, card.longDistancePerKm);
  }
  const subtotal = lines.reduce((sum, l) => sum + l.amount, 0);
  add('minimumPrice', card.minPrice - subtotal);
  const moverPrice = Math.max(subtotal, card.minPrice);

  const takeRatePct = job.crossBorder ? PLATFORM_TAKE_RATE_PCT.crossBorder : PLATFORM_TAKE_RATE_PCT.domestic;
  const platformCommission = Math.round((moverPrice * takeRatePct) / 100);
  const bookingFee = bookingFeeFor(opts.bookingFee, moverPrice, card.currency);

  return {
    ok: true,
    quote: {
      currency: card.currency,
      estLaborMin,
      lines,
      moverPrice,
      bookingFee,
      total: moverPrice + (bookingFee ?? 0),
      takeRatePct,
      platformCommission,
      moverPayout: moverPrice - platformCommission,
    },
  };
}

/** Ranktrip's booking fee for a quote, or `null` while the amount isn't decided. */
export function bookingFeeFor(rule: BookingFeeRule | null, moverPrice: number, currency: Currency): number | null {
  if (rule === null) return null;
  if (rule.kind === 'percent') return Math.round((moverPrice * rule.pct) / 100);
  const amount = rule.amountByCurrency[currency];
  if (amount === undefined) throw new Error(`Booking fee has no flat amount for ${currency}`);
  return amount;
}
