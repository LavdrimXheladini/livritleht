import 'server-only';

import { cacheLife } from 'next/cache';

import type { QuoteResponse } from '@movershub/pricing';
import type { Place } from '@movershub/shared';

import { sampleQuote } from './landing-example';
import { supabaseConfigured } from './supabase/env';
import type { RouteQuote } from './landing-types';
import { fromLive, fromSample } from './quote-mapping';

// Landing page prices for a route: the live `quote` edge function (each mover's own rate card,
// a typical load per class — design/DECISIONS.md #11), with the road map from the geo provider.
// Falls back to the labelled sample rates when QUOTE_SOURCE=sample (offline tests) or when the
// quote service can't be reached. Everything runs on the server; the browser only gets numbers.

/** One answer per route for a few minutes: movers may change their rates at any time. */
async function liveQuote(pickup: Place, dropoff: Place): Promise<QuoteResponse> {
  'use cache';
  cacheLife('minutes');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  // The secret key marks this as our own server: the quote action has already limited the visitor
  // (lib/rate-limit.ts), so the function's per-IP limit — which would see one IP for all visitors —
  // doesn't apply. With only the publishable key, all visitors share that limit.
  const key = process.env.SUPABASE_SECRET_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY are not set');
  const res = await fetch(`${url}/functions/v1/quote`, {
    method: 'POST',
    headers: { apikey: key, 'Content-Type': 'application/json' },
    // No items: each class is priced for its typical load. Crew 2 picks the detailed offers; the
    // "from" price for every crew size comes back too (instant crew switch).
    body: JSON.stringify({ pickup, dropoff, helpers: 2 }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`quote ${res.status}: ${await res.text()}`);
  return (await res.json()) as QuoteResponse;
}

export async function routeQuote(pickup: Place, dropoff: Place): Promise<RouteQuote> {
  const sample = await sampleQuote(pickup, dropoff);
  // Offline tests, or a copy without Supabase settings (nothing to ask): the labelled sample rates.
  if (process.env.QUOTE_SOURCE === 'sample' || !supabaseConfigured) return fromSample(sample);
  try {
    return fromLive(sample, await liveQuote(pickup, dropoff), pickup);
  } catch (e) {
    console.error('Live quotes unavailable — showing the labelled sample rates', e);
    return fromSample(sample);
  }
}
