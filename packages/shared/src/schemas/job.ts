import { z } from 'zod';

import { CURRENCIES, JOB_STATUSES, JOB_TYPES, VEHICLE_CLASSES } from '../constants';
import {
  CANCELLATION_FEE_RULES,
  bookedMoverSchema,
  bookingDraftSchema,
  localDay,
  type BookingDraft,
  type BookingItems,
  type BookingStop,
} from './booking';
import { MOVER_CANCEL_REASONS, MOVER_STEPS, OFFER_STATUSES } from './job-transition';
import { jobItemSchema } from './pricing';

// A customer's saved move as the app reads it (`jobs` with its latest quote — RLS: their own only),
// for "My moves" (design/DECISIONS.md #28): the list on the home screen, the move's own screen, and
// "Continue booking", which turns it back into the move being put together on the device.

const quoteRowSchema = z.object({
  id: z.uuid(),
  currency: z.enum(CURRENCIES),
  line_items: z.array(z.object({ kind: z.string(), amount: z.number().int(), quantity: z.number().optional(), unitAmount: z.number().optional() })),
  mover_price: z.number().int(),
  booking_fee: z.number().int().nullable(),
  total: z.number().int(),
  cancel_free_hours: z.number().int(),
  cancel_late_pct: z.number().int(),
  expires_at: z.string(),
  created_at: z.string(),
  /** The mover as the customer saw them (null on quotes saved before it was kept). */
  mover: bookedMoverSchema.nullable().catch(null),
});
export type JobQuoteRow = z.infer<typeof quoteRowSchema>;

/** A request to the mover for this move (design/DECISIONS.md #35): open, answered, ended or cancelled. */
const offerRowSchema = z.object({ status: z.enum(OFFER_STATUSES), expires_at: z.string(), created_at: z.string() });
export type JobOfferRow = z.infer<typeof offerRowSchema>;

/** A line of the move's log (design/DECISIONS.md #35, #36): what happened, the status after it, which side, when. */
const eventRowSchema = z.object({
  event: z.string(),
  status: z.enum(JOB_STATUSES),
  actor_role: z.enum(['customer', 'mover', 'admin', 'system']),
  created_at: z.string(),
});
export type JobEventRow = z.infer<typeof eventRowSchema>;

/**
 * A cancellation after a mover accepted (design/DECISIONS.md #36): who, at which step, the mover's
 * reason if they gave one, and what it cost under the mover's terms — recorded; nothing is charged
 * until card payments exist.
 */
const cancellationRowSchema = z.object({
  cancelled_by: z.enum(['customer', 'mover']),
  status_before: z.enum(JOB_STATUSES),
  reason: z.enum(MOVER_CANCEL_REASONS).nullable(),
  free_until: z.string(),
  cancel_late_pct: z.number().int(),
  currency: z.enum(CURRENCIES),
  fee: z.number().int(),
  fee_rule: z.enum(CANCELLATION_FEE_RULES),
  created_at: z.string(),
});
export type JobCancellationRow = z.infer<typeof cancellationRowSchema>;

const stopColumns = (prefix: 'pickup' | 'dropoff') =>
  [
    `${prefix}_area`,
    `${prefix}_district`,
    `${prefix}_country`,
    `${prefix}_label`,
    `${prefix}_street`,
    `${prefix}_house_number`,
    `${prefix}_details`,
    `${prefix}_floor`,
    `${prefix}_has_lift`,
    // Computed fields (migration 20261015140000).
    `${prefix}_lat`,
    `${prefix}_lon`,
  ] as const;

export const jobRowSchema = z.object({
  id: z.uuid(),
  status: z.enum(JOB_STATUSES),
  type: z.enum(JOB_TYPES),
  vehicle_class: z.enum(VEHICLE_CLASSES),
  helpers: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  scheduled_at: z.string(),
  pickup_area: z.string(),
  pickup_district: z.string().nullable(),
  pickup_country: z.string(),
  pickup_label: z.string(),
  pickup_street: z.string().nullable(),
  pickup_house_number: z.string().nullable(),
  pickup_details: z.string(),
  pickup_floor: z.number().int(),
  pickup_has_lift: z.boolean(),
  pickup_lat: z.number(),
  pickup_lon: z.number(),
  dropoff_area: z.string(),
  dropoff_district: z.string().nullable(),
  dropoff_country: z.string(),
  dropoff_label: z.string(),
  dropoff_street: z.string().nullable(),
  dropoff_house_number: z.string().nullable(),
  dropoff_details: z.string(),
  dropoff_floor: z.number().int(),
  dropoff_has_lift: z.boolean(),
  dropoff_lat: z.number(),
  dropoff_lon: z.number(),
  items: z.array(jobItemSchema),
  distance_km: z.coerce.number(),
  chosen_mover_company_id: z.uuid(),
  chosen_vehicle_id: z.uuid(),
  created_at: z.string(),
  /** The phone for the move day and who to ask for (design/DECISIONS.md #37); none before booking. */
  contact_phone: z.string().nullable().default(null),
  contact_name: z.string().nullable().default(null),
  /** The latest quote only (the select orders and limits it). */
  quotes: z.array(quoteRowSchema),
  /** The requests to movers for this move, newest first (the select orders them). */
  job_offers: z.array(offerRowSchema).default([]),
  /** The move's log (the select orders it oldest first). */
  job_events: z.array(eventRowSchema).default([]),
  /** A cancellation after acceptance: one per move, so PostgREST answers an object (or null). */
  job_cancellations: z.preprocess((v) => (Array.isArray(v) ? (v[0] ?? null) : v), cancellationRowSchema.nullable()).default(null),
});
export type JobRow = z.infer<typeof jobRowSchema>;

const QUOTE_COLUMNS = Object.keys(quoteRowSchema.shape).join(',');

/** The `select` for a customer's moves: every column above, and the latest quote. */
export const JOB_COLUMNS = [
  'id',
  'status',
  'type',
  'vehicle_class',
  'helpers',
  'scheduled_at',
  ...stopColumns('pickup'),
  ...stopColumns('dropoff'),
  'items',
  'distance_km',
  'chosen_mover_company_id',
  'chosen_vehicle_id',
  'created_at',
  'contact_phone',
  'contact_name',
  `quotes(${QUOTE_COLUMNS})`,
  `job_offers(${Object.keys(offerRowSchema.shape).join(',')})`,
  `job_events(${Object.keys(eventRowSchema.shape).join(',')})`,
  `job_cancellations(${Object.keys(cancellationRowSchema.shape).join(',')})`,
].join(',');

/**
 * Where a customer's move stands, for the words shown: a saved request comes back `declined` or
 * `expired` when its mover said no or didn't answer in time (choose another mover); a move the mover
 * cancelled after accepting is theirs to explain (book another mover); otherwise its status.
 */
export type MoveState = JobRow['status'] | 'DECLINED' | 'EXPIRED' | 'CANCELLED_BY_MOVER';
export function moveState(job: Pick<JobRow, 'status' | 'job_offers'> & Partial<Pick<JobRow, 'job_cancellations'>>): MoveState {
  const last = job.job_offers[0];
  if (job.status === 'QUOTED' && last?.status === 'declined') return 'DECLINED';
  if (job.status === 'QUOTED' && last?.status === 'expired') return 'EXPIRED';
  if (job.status === 'CANCELLED' && job.job_cancellations?.cancelled_by === 'mover') return 'CANCELLED_BY_MOVER';
  return job.status;
}

/** The steps of the move day the customer follows, from the mover's acceptance to "done". */
export const JOB_DAY_STEPS = ['ACCEPTED', ...MOVER_STEPS] as const;
export type JobDayStep = (typeof JOB_DAY_STEPS)[number];

export type JobDay = {
  /** Each step, with the time it was reached (null: not yet). */
  steps: { status: JobDayStep; at: string | null }[];
  cancelled: { at: string; by: JobEventRow['actor_role'] } | null;
  /** When the customer confirmed the move was done. */
  confirmedAt: string | null;
};

/**
 * The move day from its log (design/DECISIONS.md #36): null until a mover accepted; what happened
 * before that acceptance (earlier movers' answers) doesn't count.
 */
export function jobDay(events: readonly JobEventRow[]): JobDay | null {
  const sorted = [...events].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at));
  const from = sorted.findIndex((e) => e.event === 'accepted');
  if (from < 0) return null;
  const since = sorted.slice(from);
  const at = (event: string) => since.find((e) => e.event === event)?.created_at ?? null;
  const cancelled = since.find((e) => e.event === 'cancelled');
  return {
    steps: JOB_DAY_STEPS.map((status) => ({ status, at: at(status.toLowerCase()) })),
    cancelled: cancelled ? { at: cancelled.created_at, by: cancelled.actor_role } : null,
    confirmedAt: at('confirmed'),
  };
}

function stopFromRow(job: JobRow, prefix: 'pickup' | 'dropoff'): BookingStop {
  const district = job[`${prefix}_district`];
  const floor = job[`${prefix}_floor`];
  return {
    place: {
      label: job[`${prefix}_label`],
      area: job[`${prefix}_area`],
      ...(district ? { district } : {}),
      lat: job[`${prefix}_lat`],
      lon: job[`${prefix}_lon`],
      countryCode: job[`${prefix}_country`],
    },
    street: job[`${prefix}_street`],
    houseNumber: job[`${prefix}_house_number`],
    floor,
    hasLift: floor > 0 ? job[`${prefix}_has_lift`] : null,
    details: job[`${prefix}_details`],
  };
}

/**
 * A saved move, to put together again on the device ("Continue booking"): the same stops, items, day,
 * people, size and mover, and the phone for the move day if one was given — tied to the saved request so
 * reviewing it updates that request. A day that has passed is simply not chosen any more (the booking
 * screens ask for a new one).
 */
export function draftFromJob(job: JobRow): BookingDraft {
  const at = new Date(job.scheduled_at);
  const items: BookingItems = {};
  for (const it of job.items) items[it.key] = { qty: it.qty, assembly: it.assembly };
  return bookingDraftSchema.parse({
    pickup: stopFromRow(job, 'pickup'),
    dropoff: stopFromRow(job, 'dropoff'),
    items,
    day: localDay(at),
    hour: at.getHours(),
    crew: job.helpers,
    vehicleClass: job.vehicle_class,
    choice: { vehicleId: job.chosen_vehicle_id, companyId: job.chosen_mover_company_id },
    jobId: job.id,
    contactPhone: job.contact_phone,
    contactName: job.contact_name,
  });
}

/** The saved move's pickup and drop-off as places (for route labels). */
export function jobPlaces(job: JobRow): [BookingStop['place'], BookingStop['place']] {
  return [stopFromRow(job, 'pickup').place, stopFromRow(job, 'dropoff').place];
}

/** `draftFromJob`, or null when the saved move can't be put together again (e.g. more of an item than the app lists). */
export function safeDraftFromJob(job: JobRow): BookingDraft | null {
  try {
    return draftFromJob(job);
  } catch {
    return null;
  }
}
