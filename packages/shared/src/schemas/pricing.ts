import { z } from 'zod';

import { CURRENCIES, VEHICLE_CLASSES } from '../constants';
import { ITEM_CATALOGUE, ITEM_KEYS } from '../items';
import { placeSchema } from './geo';

/**
 * Money in minor units (cents). Deliberately no upper limit: the platform never caps what a mover
 * may charge (COMPLIANCE §1 MUST NOT).
 */
const cents = z.number().int().nonnegative();

/**
 * One vehicle's rate card, set by the mover (COMPLIANCE §1, §1.1). Mirrors the `rate_cards` table.
 * Only cards the mover has confirmed may be quoted — eligibility is checked by the quote function.
 */
export const rateCardSchema = z.object({
  currency: z.enum(CURRENCIES),
  baseFee: cents,
  /** Per km of route distance. */
  perKm: cents,
  /** Per minute of estimated labour, by crew size. `null` = this vehicle doesn't offer that crew. */
  perLaborMinute: z.object({ 1: cents, 2: cents.nullable(), 3: cents.nullable() }),
  minPrice: cents,
  /** Per floor carried without a lift, summed over the stops. */
  floorWithoutLiftFee: cents,
  heavyItemFee: cents,
  assemblyPerItem: cents,
  /** Beyond this many km `longDistancePerKm` is added on top of `perKm`; `null` = no long-distance rate. */
  longDistanceThresholdKm: z.number().int().nonnegative().nullable(),
  longDistancePerKm: cents,
});
export type RateCard = z.infer<typeof rateCardSchema>;

export const stopSchema = z.object({
  /** 0 = ground floor. */
  floor: z.number().int().min(0).max(60),
  hasLift: z.boolean(),
});
export type Stop = z.infer<typeof stopSchema>;

export const jobItemSchema = z.object({
  key: z.enum(ITEM_KEYS),
  qty: z.number().int().min(1).max(500),
  /** Customer asks the mover to take it apart / rebuild it. */
  assembly: z.boolean().default(false),
});
export type JobItem = z.infer<typeof jobItemSchema>;

/** What the pricing engine needs about a job. Built on the server — never trusted from the client as-is. */
export const quoteJobSchema = z
  .object({
    vehicleClass: z.enum(VEHICLE_CLASSES),
    /** Route distance between the stops at quote time (maps API), km. Traffic or detours never change it. */
    distanceKm: z.number().nonnegative().max(5000),
    crossBorder: z.boolean(),
    /** People working, including the mover (see CREW_SIZES). */
    helpers: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    /** Pickup first, drop-off last. */
    stops: z.array(stopSchema).min(2).max(5),
    items: z.array(jobItemSchema).min(1).max(100),
  })
  .superRefine((job, ctx) => {
    job.items.forEach((it, i) => {
      if (it.assembly && !ITEM_CATALOGUE[it.key].assemblable) {
        ctx.addIssue({ code: 'custom', message: 'assembly_not_possible', path: ['items', i, 'assembly'] });
      }
    });
  });
export type QuoteJob = z.infer<typeof quoteJobSchema>;

const crewSchema = z.union([z.literal(1), z.literal(2), z.literal(3)]);

/**
 * Body of the `quote` function. There is deliberately no price or distance field: the server
 * measures the route and prices every offer itself, and `.strict()` rejects anything extra, so a
 * client can never send a price (COMPLIANCE §1.1, §13).
 */
export const quoteRequestSchema = z
  .object({
    pickup: placeSchema,
    dropoff: placeSchema,
    /** Floor + lift at each end; ground floor with a lift when not given yet. */
    pickupStop: stopSchema.default({ floor: 0, hasLift: true }),
    dropoffStop: stopSchema.default({ floor: 0, hasLift: true }),
    helpers: crewSchema,
    /**
     * The customer's items. Left out = a typical load for each vehicle class (TYPICAL_LOADS) — for
     * "from" prices before the customer lists anything (landing page, design/DECISIONS.md #11).
     */
    items: z.array(jobItemSchema).min(1).max(100).optional(),
    /** Only this class; every class when left out (the vehicle-class screen). */
    vehicleClass: z.enum(VEHICLE_CLASSES).optional(),
  })
  .strict()
  .refine((r) => r.pickup.lat !== r.dropoff.lat || r.pickup.lon !== r.dropoff.lon, { message: 'same_place' })
  .superRefine((r, ctx) => {
    r.items?.forEach((it, i) => {
      if (it.assembly && !ITEM_CATALOGUE[it.key].assemblable) {
        ctx.addIssue({ code: 'custom', message: 'assembly_not_possible', path: ['items', i, 'assembly'] });
      }
    });
  });
export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
