import { z } from 'zod';

import { CURRENCIES, JOB_STATUSES, JOB_TYPES, VEHICLE_CLASSES, type JobStatus } from '../constants';
import { CANCELLATION_FEE_RULES } from './booking';
import { jobItemSchema } from './pricing';

/**
 * The accepted mover's steps on the move day, in order (design/DECISIONS.md #36): on my way (from
 * 6 hours before the arrival time), at the pickup, loaded and leaving (at least one pickup photo), at
 * the drop-off, done (at least one drop-off photo). One at a time, never back.
 */
export const MOVER_STEPS = ['EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT', 'AT_DROPOFF', 'COMPLETED'] as const satisfies readonly JobStatus[];
export type MoverStep = (typeof MOVER_STEPS)[number];

/** The step after `status`, or null when there is none for the mover to take. Mirrors public.job_step_from. */
export function nextMoverStep(status: JobStatus): MoverStep | null {
  if (status === 'ACCEPTED') return 'EN_ROUTE_TO_PICKUP';
  const at = (MOVER_STEPS as readonly JobStatus[]).indexOf(status);
  return at >= 0 && at < MOVER_STEPS.length - 1 ? MOVER_STEPS[at + 1]! : null;
}

/** From how long before the arrival time the mover may mark "On my way" (public.on_my_way_from; owner decision 2026-10-17). */
export const ON_MY_WAY_HOURS_BEFORE = 6;

/**
 * Why the mover cancels, if they say (optional; shown to the customer; fixed choices, no free text):
 * the job isn't what was described, nobody at the pickup (only there, 15 minutes after the later of the
 * arrival time and their arrival), or they can't do it.
 */
export const MOVER_CANCEL_REASONS = ['job_differs', 'customer_absent', 'cannot_do'] as const;
export type MoverCancelReason = (typeof MOVER_CANCEL_REASONS)[number];

/** How long after the later of the arrival time and their arrival a mover may say nobody was there. */
export const CUSTOMER_ABSENT_AFTER_MINUTES = 15;

/** The highest fee a customer can agree to (minor units): far above any real price, so a typo can't pass. */
const MAX_FEE = 100_000_000;

// Moving a job along (design/DECISIONS.md #35, #36; COMPLIANCE §2, §7, §9.1): the `job-transition` function.
//   book_test — the customer books a saved request with a test mover, without a card (until card
//               payments exist; real movers need the card): it goes to the mover as an offer
//   accept / decline — the mover answers an offer, freely
//   cancel    — the customer cancels: free before a mover accepted; after, until loaded, under the
//               mover's terms, never above `maxFee` (the amount they were shown; missing = 0)
//   step      — the accepted mover marks the next step (`to`); repeating the step the move is at is a no-op
//   mover_cancel — the accepted mover cancels before loading, for free (an optional reason)
//   confirm   — the customer confirms the move is done
export const jobTransitionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('book_test'), jobId: z.uuid() }).strict(),
  z.object({ action: z.literal('accept'), offerId: z.uuid() }).strict(),
  z.object({ action: z.literal('decline'), offerId: z.uuid() }).strict(),
  z.object({ action: z.literal('cancel'), jobId: z.uuid(), maxFee: z.number().int().min(0).max(MAX_FEE).optional() }).strict(),
  z.object({ action: z.literal('step'), jobId: z.uuid(), to: z.enum(MOVER_STEPS) }).strict(),
  z.object({ action: z.literal('mover_cancel'), jobId: z.uuid(), reason: z.enum(MOVER_CANCEL_REASONS).optional() }).strict(),
  z.object({ action: z.literal('confirm'), jobId: z.uuid() }).strict(),
]);
export type JobTransition = z.infer<typeof jobTransitionSchema>;

/** The customer's side: they book, cancel and confirm; every other action is the mover's. */
export const isCustomerAction = (action: JobTransition['action']) => action === 'book_test' || action === 'cancel' || action === 'confirm';

/** Why a transition was refused (Postgres's reasons; anything else is `unavailable`). */
export const JOB_TRANSITION_ERRORS = [
  'not_found',
  'not_bookable',
  'quote_required',
  'quote_expired',
  'card_required',
  'too_late',
  'already_answered',
  'offer_expired',
  'not_open',
  'not_cancellable',
  'not_eligible',
  'invalid_step',
  'wrong_step',
  'too_early',
  'photos_required',
  'job_cancelled',
  'fee_changed',
  'invalid_reason',
  'reason_too_early',
  'not_confirmable',
] as const;
export type JobTransitionError = (typeof JOB_TRANSITION_ERRORS)[number];

export const OFFER_STATUSES = ['offered', 'accepted', 'declined', 'expired', 'cancelled'] as const;
export type OfferStatus = (typeof OFFER_STATUSES)[number];

/** How long a mover has to answer an offer, at most (Postgres: public.offer_expiry). */
export const OFFER_ANSWER_HOURS = 12;

/**
 * A move as the mover sees it (public.my_mover_jobs): an open offer — the area of each stop, the day,
 * the work and their own price — or an accepted move, with the exact places and the customer's
 * directions (COMPLIANCE §9.1).
 */
export const moverJobRowSchema = z.object({
  offer_id: z.uuid(),
  offer_status: z.enum(OFFER_STATUSES),
  offer_expires_at: z.string(),
  job_id: z.uuid(),
  status: z.enum(JOB_STATUSES),
  type: z.enum(JOB_TYPES),
  vehicle_class: z.enum(VEHICLE_CLASSES),
  helpers: z.number().int(),
  scheduled_at: z.string(),
  items: z.array(jobItemSchema),
  distance_km: z.coerce.number(),
  est_labor_min: z.number().int(),
  pickup_area: z.string(),
  pickup_district: z.string().nullable(),
  pickup_country: z.string(),
  pickup_floor: z.number().int(),
  pickup_has_lift: z.boolean(),
  dropoff_area: z.string(),
  dropoff_district: z.string().nullable(),
  dropoff_country: z.string(),
  dropoff_floor: z.number().int(),
  dropoff_has_lift: z.boolean(),
  currency: z.enum(CURRENCIES),
  line_items: z.array(z.object({ kind: z.string(), amount: z.number(), quantity: z.number().optional(), unitAmount: z.number().optional() })),
  mover_price: z.number().int(),
  take_rate_pct: z.number().int(),
  platform_commission: z.number().int(),
  mover_payout: z.number().int(),
  cancel_free_hours: z.number().int(),
  cancel_late_pct: z.number().int(),
  pickup_label: z.string().nullable(),
  pickup_street: z.string().nullable(),
  pickup_house_number: z.string().nullable(),
  pickup_details: z.string().nullable(),
  pickup_lat: z.number().nullable(),
  pickup_lon: z.number().nullable(),
  dropoff_label: z.string().nullable(),
  dropoff_street: z.string().nullable(),
  dropoff_house_number: z.string().nullable(),
  dropoff_details: z.string().nullable(),
  dropoff_lat: z.number().nullable(),
  dropoff_lon: z.number().nullable(),
  // The job day (20261017130000; missing from older servers' answers until deployed — then null).
  /** From when "On my way" may be marked. */
  on_my_way_from: z.string().nullable().default(null),
  /** The last change the mover can see (for refreshing). */
  last_event_at: z.string().nullable().default(null),
  /** When the move was done or cancelled. */
  ended_at: z.string().nullable().default(null),
  cancelled_by: z.enum(['customer', 'mover']).nullable().default(null),
  cancel_reason: z.enum(MOVER_CANCEL_REASONS).nullable().default(null),
  /** What the customer's cancellation cost under the mover's terms (recorded; nothing charged yet). */
  cancellation_fee: z.number().int().nullable().default(null),
  fee_rule: z.enum(CANCELLATION_FEE_RULES).nullable().default(null),
  confirmed_at: z.string().nullable().default(null),
  /** At the pickup: from when the mover may say nobody was there. */
  absent_reason_from: z.string().nullable().default(null),
});
export type MoverJobRow = z.infer<typeof moverJobRowSchema>;

/** A stop's area as a mover sees it before accepting: "Dardania, Prishtina" or "Prishtina". */
export const stopArea = (area: string, district: string | null) => (district ? `${district}, ${area}` : area);
