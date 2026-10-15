import { z } from 'zod';

import { VEHICLE_CLASSES, type Currency, type JobType, type VehicleClass } from '../constants';
import { ITEM_CATALOGUE, ITEM_KEYS, type ItemKey } from '../items';
import { placeSchema, type Place } from './geo';
import { jobItemSchema, type JobItem, type QuoteRequest } from './pricing';

// The customer's move request, as the app's booking screens build it (CLAUDE.md §10 step 4): the
// exact stops, what to move, when, how many people and the van size. It stays on the customer's
// device until they choose a mover. Prices still come only from the server's quote (COMPLIANCE §1.1).

/** The item picker's sections, in the order shown. Every catalogue item is in exactly one. */
export const ITEM_GROUPS = {
  furniture: [
    'sofa2',
    'sofa3',
    'cornerSofa',
    'armchair',
    'chair',
    'bedSingle',
    'bedDouble',
    'mattressSingle',
    'mattressDouble',
    'wardrobe',
    'chestOfDrawers',
    'bookshelf',
    'desk',
    'diningTable',
  ],
  appliances: ['fridge', 'washingMachine', 'dishwasher', 'cooker', 'tv'],
  other: ['box', 'suitcase', 'bicycle', 'mirror', 'plant', 'lamp'],
} as const satisfies Record<string, readonly ItemKey[]>;
export type ItemGroup = keyof typeof ITEM_GROUPS;

/** Most of one item a customer can list (the quote accepts more; nobody moves 100 fridges). */
export const MAX_ITEM_QTY = 99;

/**
 * Load space per class in tenths of a m³: the lower end of each class's "approx. load" (COMPLIANCE
 * §1.1 table). Only to suggest a size that fits the customer's items — it never changes a price.
 */
export const CLASS_LOAD_TENTHS_M3: Record<VehicleClass, number> = { SMALL: 30, VAN: 60, LARGE_VAN: 120, BOX: 180, TRUCK: 300 };

/** The items' volume in tenths of a m³ (the catalogue's estimates). */
export function loadTenthsM3(items: readonly Pick<JobItem, 'key' | 'qty'>[]): number {
  return items.reduce((sum, it) => sum + ITEM_CATALOGUE[it.key].volumeTenthsM3 * it.qty, 0);
}

/** The smallest class whose load space holds `tenths`; the truck for anything bigger. */
export function fittingClass(tenths: number): VehicleClass {
  return VEHICLE_CLASSES.find((k) => tenths <= CLASS_LOAD_TENTHS_M3[k]) ?? 'TRUCK';
}

/** True when `cls` is a smaller class than `than`. */
export const smallerClass = (cls: VehicleClass, than: VehicleClass) => VEHICLE_CLASSES.indexOf(cls) < VEHICLE_CLASSES.indexOf(than);

/** How much the customer writes about a stop when the map found only a town or a neighbourhood. */
export const STOP_DETAILS_MIN = 5;
export const STOP_DETAILS_MAX = 300;

export const bookingStopSchema = z.object({
  place: placeSchema,
  /** The street the map search found; null = it found only a town or a neighbourhood. */
  street: z.string().trim().min(1).max(200).nullable(),
  houseNumber: z.string().trim().min(1).max(20).nullable(),
  /** 0 = ground floor. */
  floor: z.number().int().min(0).max(60),
  /** Asked above the ground floor only; null = not answered yet. */
  hasLift: z.boolean().nullable(),
  /** Building, entrance, flat, how to find it. The mover sees it once they accept (COMPLIANCE §9.1). */
  details: z.string().max(STOP_DETAILS_MAX),
});
export type BookingStop = z.infer<typeof bookingStopSchema>;

/** A stop at a place from the map search, on the ground floor. */
export function newStop(place: Place, parts: { street?: string | undefined; houseNumber?: string | undefined } = {}): BookingStop {
  return { place, street: parts.street ?? null, houseNumber: parts.houseNumber ?? null, floor: 0, hasLift: null, details: '' };
}

/**
 * What a stop still needs: `place` — the map found only a town or a neighbourhood and the details
 * don't say where; `lift` — above the ground floor, whether there is a lift.
 */
export function stopProblems(stop: BookingStop): ('place' | 'lift')[] {
  const problems: ('place' | 'lift')[] = [];
  if (stop.street === null && stop.details.trim().length < STOP_DETAILS_MIN) problems.push('place');
  if (stop.floor > 0 && stop.hasLift === null) problems.push('lift');
  return problems;
}

/** The items listed, by catalogue key. Zod 4's partialRecord: any subset of the keys. */
export const bookingItemsSchema = z.partialRecord(
  z.enum(ITEM_KEYS),
  z.object({ qty: z.number().int().min(1).max(MAX_ITEM_QTY), assembly: z.boolean() }),
);
export type BookingItems = z.infer<typeof bookingItemsSchema>;

const PICKER_ORDER: readonly ItemKey[] = Object.values(ITEM_GROUPS).flat();

/** The listed items for the quote, in the picker's order; assembly only where the item can be taken apart. */
export function jobItems(items: BookingItems): JobItem[] {
  return PICKER_ORDER.flatMap((key) => {
    const it = items[key];
    return it ? [{ key, qty: it.qty, assembly: it.assembly && ITEM_CATALOGUE[key].assemblable }] : [];
  });
}

/** How many days ahead a move can be booked; the earliest day is tomorrow (movers plan their day). */
export const BOOKING_DAYS_AHEAD = 60;
/** Start times offered, in local hours. */
export const MOVE_START_HOURS = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18] as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** A local date as YYYY-MM-DD. */
export const localDay = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The days a move can be booked, from tomorrow (local dates, YYYY-MM-DD). */
export function moveDays(today: Date, count = BOOKING_DAYS_AHEAD): string[] {
  return Array.from({ length: count }, (_, i) => localDay(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1 + i)));
}

/**
 * A day and start hour on the device's clock, as an ISO 8601 time for the server (UTC). Every
 * MoversHub market is on Central European Time, so the device's time is the move's.
 */
export function scheduledAt(day: string, hour: number): string {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d, hour).toISOString();
}

/**
 * The mover the customer chose: their van in the chosen size. Only which one — the price is the
 * server's, shown from its quote and priced again when the booking is sent.
 */
export const bookingChoiceSchema = z.object({ vehicleId: z.string().min(1).max(64), companyId: z.string().min(1).max(64) });
export type BookingChoice = z.infer<typeof bookingChoiceSchema>;

export const bookingDraftSchema = z.object({
  pickup: bookingStopSchema,
  dropoff: bookingStopSchema,
  items: bookingItemsSchema,
  /** Local date (YYYY-MM-DD) and start hour; null = not chosen yet. */
  day: z.iso.date().nullable(),
  hour: z.number().int().min(0).max(23).nullable(),
  crew: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  vehicleClass: z.enum(VEHICLE_CLASSES),
  /** Null until a mover is chosen (also in moves saved before choosing existed). */
  choice: bookingChoiceSchema.nullable().default(null),
  /** The booking request saved on the server for this move (the `book` function), once the customer reviewed it. */
  jobId: z.string().min(1).max(64).nullable().default(null),
});
export type BookingDraft = z.infer<typeof bookingDraftSchema>;

/** The `quote` request for this move: the customer's own stops, items, crew and date. */
export function moveQuoteRequest(draft: BookingDraft): QuoteRequest {
  const stop = (s: BookingStop) => ({ floor: s.floor, hasLift: s.floor > 0 && s.hasLift === true });
  return {
    pickup: draft.pickup.place,
    dropoff: draft.dropoff.place,
    pickupStop: stop(draft.pickup),
    dropoffStop: stop(draft.dropoff),
    helpers: draft.crew,
    items: jobItems(draft.items),
    ...(draft.day !== null && draft.hour !== null ? { scheduledAt: scheduledAt(draft.day, draft.hour) } : {}),
  };
}

/* ── Cancellation terms ──────────────────────────────────────────────────────── */

/**
 * Each mover's own cancellation terms (owner decision 2026-10-15, design/DECISIONS.md #26), from fixed
 * choices so customers can compare them: free cancellation until this many hours before the arrival
 * time, and what a later cancellation costs, in percent of the mover's price. Mirrors the checks on
 * `mover_companies.cancel_free_hours` / `cancel_late_pct`.
 */
export const CANCEL_FREE_HOURS = [24, 48, 72, 168] as const;
export type CancelFreeHours = (typeof CANCEL_FREE_HOURS)[number];
export const CANCEL_LATE_PCT = [0, 25, 50, 100] as const;
export type CancelLatePct = (typeof CANCEL_LATE_PCT)[number];

export const cancellationTermsSchema = z.object({
  freeHours: z.literal(CANCEL_FREE_HOURS),
  latePct: z.literal(CANCEL_LATE_PCT),
});
export type CancellationTerms = z.infer<typeof cancellationTermsSchema>;

/** The terms from a company row (null while the mover hasn't chosen them, or the row holds something else). */
export function cancellationTerms(row: { cancel_free_hours?: number | null; cancel_late_pct?: number | null }): CancellationTerms | null {
  const parsed = cancellationTermsSchema.safeParse({ freeHours: row.cancel_free_hours, latePct: row.cancel_late_pct });
  return parsed.success ? parsed.data : null;
}

/* ── Booking request (the `book` function) ───────────────────────────────────── */

/**
 * The kind of move, from what the customer listed: across a border; a few things (at most 3, up to
 * 2 m³); a home (a box van or truck, or 12 m³ and more); else a small move. Only a label for the job —
 * it never changes a price.
 */
export function jobType({ crossBorder, vehicleClass, items }: { crossBorder: boolean; vehicleClass: VehicleClass; items: readonly JobItem[] }): JobType {
  if (crossBorder) return 'CROSS_BORDER';
  const count = items.reduce((n, it) => n + it.qty, 0);
  const tenths = loadTenthsM3(items);
  if (count <= 3 && tenths <= 20) return 'ITEM';
  if (vehicleClass === 'BOX' || vehicleClass === 'TRUCK' || tenths >= 120) return 'FULL_MOVE';
  return 'SMALL_MOVE';
}

/** A stop as the booking request sends it: complete (the place found, the lift answered above the ground floor). */
const requestStopSchema = bookingStopSchema.refine((s) => stopProblems(s).length === 0, { message: 'stop_incomplete' });

/**
 * Body of the `book` function: the customer's move and the mover's van they chose. There is no price
 * field — the server prices the van again from the mover's own card — and `.strict()` rejects
 * anything extra (COMPLIANCE §1.1, §13). `jobId` = the request saved earlier for this move: it is
 * updated (the customer changed something, or the price expired) instead of saved twice.
 */
export const bookRequestSchema = z
  .object({
    jobId: z.uuid().optional(),
    pickup: requestStopSchema,
    dropoff: requestStopSchema,
    items: z.array(jobItemSchema).min(1).max(100),
    helpers: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    scheduledAt: z.iso.datetime({ offset: true }),
    vehicleClass: z.enum(VEHICLE_CLASSES),
    vehicleId: z.uuid(),
  })
  .strict()
  .refine((r) => r.pickup.place.lat !== r.dropoff.place.lat || r.pickup.place.lon !== r.dropoff.place.lon, { message: 'same_place' });
export type BookRequest = z.infer<typeof bookRequestSchema>;

/** The booking request for this move and the chosen mover (null until a mover and a day are chosen). */
export function bookRequestFromDraft(draft: BookingDraft): BookRequest | null {
  if (draft.choice === null || draft.day === null || draft.hour === null) return null;
  return {
    ...(draft.jobId ? { jobId: draft.jobId } : {}),
    pickup: draft.pickup,
    dropoff: draft.dropoff,
    items: jobItems(draft.items),
    helpers: draft.crew,
    scheduledAt: scheduledAt(draft.day, draft.hour),
    vehicleClass: draft.vehicleClass,
    vehicleId: draft.choice.vehicleId,
  };
}

/** How long a saved quote stays valid; after that the customer sees the price again (priced anew). */
export const BOOKING_QUOTE_MINUTES = 15;

/** The mover as the customer about to book sees them: everything COMPLIANCE §4 lists. */
export type BookedMover = {
  companyId: string;
  name: string;
  isBusiness: boolean;
  registrationNo: string | null;
  address: string | null;
  country: string;
  phone: string | null;
  email: string | null;
  insuranceUntil: string | null;
  cancellation: CancellationTerms;
};

/** The `book` function's answer: the saved request, its quote (priced on the server) and the mover. */
export type BookResponse = {
  jobId: string;
  distanceKm: number;
  quote: {
    id: string;
    expiresAt: string;
    currency: Currency;
    lines: { kind: string; amount: number; quantity?: number; unitAmount?: number }[];
    estLaborMin: number;
    moverPrice: number;
    bookingFee: number | null;
    total: number;
  };
  mover: BookedMover;
};

