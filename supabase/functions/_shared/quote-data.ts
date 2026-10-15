// What pricing needs from outside, shared by `quote` and `book` so a booking is priced exactly like the
// quote the customer saw: the road distance (OSRM) and the vans quotable for a class on the move date.

import type { QuotableVehicleRow } from './movershub/pricing/index.ts';
import { routeCacheKey, ttlCache, type Place, type VehicleClass } from './movershub/shared/index.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
/** Test movers (design/DECISIONS.md #7) are quoted only while this secret is "true". */
export const INCLUDE_TEST_MOVERS = Deno.env.get('INCLUDE_TEST_MOVERS') === 'true';

/**
 * Distances already looked up by this isolate, by stops rounded to ~11 m: a re-quote of the same
 * route (another crew, a retry) doesn't call OSRM again. Roads rarely change within hours.
 */
const routeCache = ttlCache<number>({ ttlMs: 6 * 60 * 60 * 1000, maxEntries: 2000 });

/** Road distance from the OSRM demo server — fair use only, NOT for production (see CLAUDE.md, maps). */
export async function routeKm(a: Place, b: Place): Promise<number | null> {
  const key = routeCacheKey(a, b);
  const cached = routeCache.get(key);
  if (cached !== undefined) return cached;
  const res = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`,
    { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'MoversHub/0.1 (quote function)' } },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { code?: string; routes?: { distance: number }[] };
  const metres = body.code === 'Ok' ? body.routes?.[0]?.distance : undefined;
  if (metres === undefined) return null;
  routeCache.set(key, metres / 1000);
  return metres / 1000;
}

/** Eligible vehicles for one class on the move date (`public.quotable_vehicles`, service role only). */
export async function quotableVehicles(args: {
  pickup: Place;
  dropoff: Place;
  vehicleClass: VehicleClass;
  scheduledAt?: string;
}): Promise<QuotableVehicleRow[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/quotable_vehicles`, {
    method: 'POST',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_pickup: `SRID=4326;POINT(${args.pickup.lon} ${args.pickup.lat})`,
      p_pickup_country: args.pickup.countryCode,
      p_dropoff_country: args.dropoff.countryCode,
      p_class: args.vehicleClass,
      p_include_test: INCLUDE_TEST_MOVERS,
      // Left out (undefined is not sent) = now: documents valid today.
      p_scheduled_at: args.scheduledAt,
    }),
  });
  if (!res.ok) throw new Error(`quotable_vehicles ${res.status}: ${await res.text()}`);
  return (await res.json()) as QuotableVehicleRow[];
}
