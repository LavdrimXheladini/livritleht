import { z } from 'zod';

/**
 * A geocoded address. `area` is the district / city — the only part shown to movers before they
 * accept a job (COMPLIANCE §9.1); `label` is the full street-level address.
 */
export const placeSchema = z.object({
  label: z.string().trim().min(1).max(200),
  area: z.string().trim().min(1).max(120),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  /** ISO 3166-1 alpha-2, plus XK for Kosovo. */
  countryCode: z.string().regex(/^[A-Z]{2}$/),
});
export type Place = z.infer<typeof placeSchema>;

export const routeRequestSchema = z
  .object({ pickup: placeSchema, dropoff: placeSchema })
  .refine((r) => r.pickup.lat !== r.dropoff.lat || r.pickup.lon !== r.dropoff.lon, {
    message: 'same_place',
  });
export type RouteRequest = z.infer<typeof routeRequestSchema>;
