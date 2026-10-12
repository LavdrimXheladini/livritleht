// `quote` — prices a job with every eligible mover's OWN rate card (CLAUDE.md §4, COMPLIANCE §1.1).
//   POST { pickup, dropoff, pickupStop?, dropoffStop?, helpers, items?, vehicleClass? }
//   → { distanceKm, scope, crossBorder, typicalLoad, testMovers, classes: [{ vehicleClass, count, from, offers, crews }] }
// Without items each class is priced for its typical load (the landing's "from" prices).
// Public: visitors see prices before signing in. The client never sends a price — the request
// schema rejects one. The logic lives in packages/pricing (unit-tested); this file only plugs in
// the route lookup and the database. Run `pnpm functions:build` before serving or deploying.

import { quoteForRequest, type QuotableVehicleRow } from '../_shared/movershub/pricing/index.ts';
import { BOOKING_FEE_RULE, type Place, type VehicleClass } from '../_shared/movershub/shared/index.ts';
import { failure, json, preflight } from '../_shared/http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
/** Test movers (design/DECISIONS.md #7) are quoted only while this secret is "true". */
const INCLUDE_TEST_MOVERS = Deno.env.get('INCLUDE_TEST_MOVERS') === 'true';

/** Road distance from the OSRM demo server — fair use only, NOT for production (see CLAUDE.md, maps). */
async function routeKm(a: Place, b: Place): Promise<number | null> {
  const res = await fetch(
    `https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`,
    { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'MoversHub/0.1 (quote function)' } },
  );
  if (!res.ok) return null;
  const body = (await res.json()) as { code?: string; routes?: { distance: number }[] };
  const metres = body.code === 'Ok' ? body.routes?.[0]?.distance : undefined;
  return metres === undefined ? null : metres / 1000;
}

/** Eligible vehicles for one class (`public.quotable_vehicles`, service role only). */
async function quotableVehicles(args: { pickup: Place; dropoff: Place; vehicleClass: VehicleClass }): Promise<QuotableVehicleRow[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/quotable_vehicles`, {
    method: 'POST',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_pickup: `SRID=4326;POINT(${args.pickup.lon} ${args.pickup.lat})`,
      p_pickup_country: args.pickup.countryCode,
      p_dropoff_country: args.dropoff.countryCode,
      p_class: args.vehicleClass,
      p_include_test: INCLUDE_TEST_MOVERS,
    }),
  });
  if (!res.ok) throw new Error(`quotable_vehicles ${res.status}: ${await res.text()}`);
  return (await res.json()) as QuotableVehicleRow[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);
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
