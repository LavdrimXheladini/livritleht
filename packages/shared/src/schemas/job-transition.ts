import { z } from 'zod';

import { CURRENCIES, JOB_STATUSES, JOB_TYPES, VEHICLE_CLASSES } from '../constants';
import { jobItemSchema } from './pricing';

// Moving a job along (design/DECISIONS.md #35; COMPLIANCE §2, §9.1): the `job-transition` function.
//   book_test — the customer books a saved request with a test mover, without a card (until card
//               payments exist; real movers need the card): it goes to the mover as an offer
//   accept / decline — the mover answers an offer, freely
//   cancel    — the customer cancels before a mover has accepted
export const jobTransitionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('book_test'), jobId: z.uuid() }).strict(),
  z.object({ action: z.literal('accept'), offerId: z.uuid() }).strict(),
  z.object({ action: z.literal('decline'), offerId: z.uuid() }).strict(),
  z.object({ action: z.literal('cancel'), jobId: z.uuid() }).strict(),
]);
export type JobTransition = z.infer<typeof jobTransitionSchema>;

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
});
export type MoverJobRow = z.infer<typeof moverJobRowSchema>;

/** A stop's area as a mover sees it before accepting: "Dardania, Prishtina" or "Prishtina". */
export const stopArea = (area: string, district: string | null) => (district ? `${district}, ${area}` : area);
