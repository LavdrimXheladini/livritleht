'use server';

import { routeRequestSchema } from '@ranktrip/shared';

import { sampleQuote } from '@/lib/landing-example';
import type { SampleRoute } from '@/lib/landing-types';

export type QuoteActionResult = { ok: true; route: SampleRoute } | { ok: false; error: 'invalid' | 'same_place' };

/**
 * Landing demo quote: validates the two places and returns sample prices for the real road
 * distance. All pricing happens here on the server (COMPLIANCE §1.1, CLAUDE.md §4); the client
 * only sends places, never prices.
 */
export async function quoteRoute(input: unknown): Promise<QuoteActionResult> {
  const parsed = routeRequestSchema.safeParse(input);
  if (!parsed.success) {
    const sameplace = parsed.error.issues.some((i) => i.message === 'same_place');
    return { ok: false, error: sameplace ? 'same_place' : 'invalid' };
  }
  return { ok: true, route: await sampleQuote(parsed.data.pickup, parsed.data.dropoff) };
}
