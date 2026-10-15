// `quote` — prices a job with every eligible mover's OWN rate card (CLAUDE.md §4, COMPLIANCE §1.1).
//   POST { pickup, dropoff, pickupStop?, dropoffStop?, helpers, items?, vehicleClass?, scheduledAt? }
//   → { distanceKm, scope, crossBorder, typicalLoad, testMovers, classes: [{ vehicleClass, count, from, offers, crews }] }
// Without items each class is priced for its typical load (the landing's "from" prices).
// Public: visitors see prices before signing in. Limited per account for signed-in app users, else
// per IP (RATE_LIMITS.quote → 429). The client never sends a price — the request schema rejects
// one. The logic lives in packages/pricing (unit-tested); this file only plugs in the route lookup
// and the database. Run `pnpm functions:build` before serving or deploying.

import { quoteForRequest } from '../_shared/movershub/pricing/index.ts';
import { BOOKING_FEE_RULE } from '../_shared/movershub/shared/index.ts';
import { caller, type Caller } from '../_shared/auth.ts';
import { failure, json, preflight } from '../_shared/http.ts';
import { INCLUDE_TEST_MOVERS, quotableVehicles, routeKm } from '../_shared/quote-data.ts';
import { rateLimited } from '../_shared/rate-limit.ts';

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
