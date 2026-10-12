'use server';

import { headers } from 'next/headers';

import { routeRequestSchema } from '@movershub/shared';

import type { RouteQuote } from '@/lib/landing-types';
import { rateLimit } from '@/lib/rate-limit';
import { routeQuote } from '@/lib/route-quote';

export type QuoteActionResult = { ok: true; route: RouteQuote } | { ok: false; error: 'invalid' | 'same_place' | 'rate_limited' };

/**
 * Landing quote: validates the two places and returns the "from" prices for the real road route —
 * live from movers' own rate cards (the `quote` function), or the labelled sample rates. All pricing
 * happens on the server (COMPLIANCE §1.1, CLAUDE.md §4); the client only sends places, never prices.
 * Each quote costs a route lookup on a fair-use service, so visitors are limited per IP (RATE_LIMITS.quote).
 */
export async function quoteRoute(input: unknown): Promise<QuoteActionResult> {
  if (!(await rateLimit('quote', await headers())).ok) return { ok: false, error: 'rate_limited' };
  const parsed = routeRequestSchema.safeParse(input);
  if (!parsed.success) {
    const sameplace = parsed.error.issues.some((i) => i.message === 'same_place');
    return { ok: false, error: sameplace ? 'same_place' : 'invalid' };
  }
  return { ok: true, route: await routeQuote(parsed.data.pickup, parsed.data.dropoff) };
}
