// `quote` — prices a job with every eligible mover's OWN rate card (CLAUDE.md §4, COMPLIANCE §1.1).
//   POST { pickup, dropoff, pickupStop?, dropoffStop?, helpers, items?, vehicleClass?, scheduledAt? }
//   → { distanceKm, scope, crossBorder, typicalLoad, testMovers, classes: [{ vehicleClass, count, from, offers, crews }] }
// Without items each class is priced for its typical load (the landing's "from" prices).
// Public: visitors see prices before signing in. Limited per account for signed-in app users, else
// per IP (RATE_LIMITS.quote → 429). The client never sends a price — the request schema rejects
// one. The logic lives in packages/pricing (unit-tested); this file only plugs in the route lookup
// and the database. Run `pnpm functions:build` before serving or deploying.

import { quoteForRequest, type QuotableVehicleRow } from '../_shared/movershub/pricing/index.ts';
import {
  BOOKING_FEE_RULE,
  routeCacheKey,
  ttlCache,
  type Place,
  type VehicleClass,
} from '../_shared/movershub/shared/index.ts';
import { caller, type Caller } from '../_shared/auth.ts';
import { failure, json, preflight } from '../_shared/http.ts';
import { rateLimited } from '../_shared/rate-limit.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
/** Test movers (design/DECISIONS.md #7) are quoted only while this secret is "true". */
const INCLUDE_TEST_MOVERS = Deno.env.get('INCLUDE_TEST_MOVERS') === 'true';

/**
 * Distances already looked up by this isolate, by stops rounded to ~11 m: a re-quote of the same
 * route (another crew, a retry) doesn't call OSRM again. Roads rarely change within hours.
 */
const routeCache = ttlCache<number>({ ttlMs: 6 * 60 * 60 * 1000, maxEntries: 2000 });

/** Road distance from the OSRM demo server — fair use only, NOT for production (see CLAUDE.md, maps). */
async function routeKm(a: Place, b: Place): Promise<number | null> {
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
async function quotableVehicles(args: {
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405, { Allow: 'POST, OPTIONS' });
  // Without a working sign-in check the caller is counted per IP, like a visitor.
  const who = await caller(req).catch((e): Caller => {
    console.error('quote: sign-in check failed', failure(e));
    return { kind: 'anonymous' };
  });
  const limited = await rateLimited(req, 'quote', who);
  if (limited) return limited;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'invalid_json' }, 400);
  }
  try {
    const outcome = await quoteForRequest(body, {
      routeKm,
      quotableVehicles,
      bookingFee: BOOKING_FEE_RULE,
      testMovers: INCLUDE_TEST_MOVERS,
    });
    return outcome.ok ? json(req, outcome.response) : json(req, { error: outcome.error, issues: outcome.issues }, 400);
  } catch (e) {
    console.error('quote failed', failure(e));
    return json(req, { error: 'quote_failed' }, 500);
  }
});
