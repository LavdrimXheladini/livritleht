// The `quote` request from start to finish, with the I/O passed in (route lookup, database).
// The whole flow is unit-tested in Node; the Deno function only plugs in the real services.

import {
  VEHICLE_CLASSES,
  moveScope,
  quoteRequestSchema,
  type BookingFeeRule,
  type MoveScope,
  type Place,
  type QuoteJob,
  type VehicleClass,
} from '@ranktrip/shared';

import { buildClassOffers, type ClassOffers, type QuotableVehicleRow } from './offers';

export type QuoteDeps = {
  /** Road distance in km from the routing service, or null when it is unavailable. */
  routeKm: (pickup: Place, dropoff: Place) => Promise<number | null>;
  /** `public.quotable_vehicles` for one class (server only); the countries decide cabotage + cross-border rules. */
  quotableVehicles: (args: { pickup: Place; dropoff: Place; vehicleClass: VehicleClass }) => Promise<QuotableVehicleRow[]>;
  bookingFee: BookingFeeRule | null;
};

export type QuoteResponse = {
  /** Route distance the prices use, km (one decimal). */
  distanceKm: number;
  /** True when routing was unavailable and the distance is a straight-line estimate. */
  distanceEstimated: boolean;
  /** Within one city (or a short hop), between cities, or across a border. */
  scope: MoveScope;
  crossBorder: boolean;
  /** False while the booking fee amount is not decided (design/DECISIONS.md #6). */
  bookingFeeDecided: boolean;
  classes: ClassOffers[];
};

export type QuoteOutcome =
  | { ok: true; response: QuoteResponse }
  | { ok: false; error: 'invalid_request'; issues: { path: string; message: string }[] };

/** Straight-line distance × a typical road detour (1.28). Only used when routing is down. */
export function estimateRoadKm(a: Place, b: Place): number {
  const r = Math.PI / 180;
  const h =
    Math.sin(((b.lat - a.lat) * r) / 2) ** 2 +
    Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lon - a.lon) * r) / 2) ** 2;
  const metres = 2 * 6_371_000 * Math.asin(Math.sqrt(h));
  return Math.round((metres * 1.28) / 100) / 10;
}

export async function quoteForRequest(body: unknown, deps: QuoteDeps): Promise<QuoteOutcome> {
  const parsed = quoteRequestSchema.safeParse(body);
  if (!parsed.success) {
    return {
      ok: false,
      error: 'invalid_request',
      issues: parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
  }
  const req = parsed.data;

  const routed = await deps.routeKm(req.pickup, req.dropoff).catch(() => null);
  const distanceKm = Math.round((routed ?? estimateRoadKm(req.pickup, req.dropoff)) * 10) / 10;
  const crossBorder = req.pickup.countryCode !== req.dropoff.countryCode;
  const classes = req.vehicleClass ? [req.vehicleClass] : [...VEHICLE_CLASSES];

  const results = await Promise.all(
    classes.map(async (vehicleClass) => {
      const job: QuoteJob = {
        vehicleClass,
        distanceKm,
        crossBorder,
        helpers: req.helpers,
        stops: [req.pickupStop, req.dropoffStop],
        items: req.items,
      };
      const rows = await deps.quotableVehicles({ pickup: req.pickup, dropoff: req.dropoff, vehicleClass });
      return buildClassOffers(vehicleClass, job, rows, deps.bookingFee);
    }),
  );

  return {
    ok: true,
    response: {
      distanceKm,
      distanceEstimated: routed === null,
      scope: moveScope(req.pickup, req.dropoff, distanceKm),
      crossBorder,
      bookingFeeDecided: deps.bookingFee !== null,
      classes: results,
    },
  };
}
