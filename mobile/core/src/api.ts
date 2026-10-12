import type { SupabaseClient } from '@supabase/supabase-js';
import { keepPreviousData, useQuery } from '@tanstack/react-query';

import { pickFrom, type QuoteResponse } from '@ranktrip/pricing';
import { MARKET_RATES, type Currency, type GeoSuggestion, type Locale, type Place, type VehicleClass } from '@ranktrip/shared';

import { useAuth } from './auth-provider';

// The apps' server calls: the same Supabase edge functions the website uses. Prices are computed
// only on the server, from each mover's own rate card (COMPLIANCE §1.1) — the app never prices.

/** Live quote for a route: no items = a typical load per class, "from" prices for every crew size. */
export async function fetchQuote(supabase: SupabaseClient, pickup: Place, dropoff: Place): Promise<QuoteResponse> {
  const { data, error } = await supabase.functions.invoke<QuoteResponse>('quote', { body: { pickup, dropoff, helpers: 2 } });
  if (error || !data) throw error ?? new Error('Empty quote');
  return data;
}

/** Address search (the `places` function — Photon on the server). */
export async function searchPlaces(
  supabase: SupabaseClient,
  q: string,
  locale: Locale,
  near?: Pick<Place, 'lat' | 'lon'>,
): Promise<GeoSuggestion[]> {
  const body = { q, locale, ...(near ? { near: { lat: near.lat, lon: near.lon } } : {}) };
  const { data, error } = await supabase.functions.invoke<{ suggestions: GeoSuggestion[] }>('places', { body });
  if (error || !data) throw error ?? new Error('Empty search');
  return data.suggestions;
}

/** Quote for a route, cached for a few minutes (movers may change their rates at any time). */
export function useQuote(pickup: Place | null, dropoff: Place | null) {
  const { supabase } = useAuth();
  return useQuery({
    queryKey: ['quote', pickup, dropoff],
    queryFn: () => fetchQuote(supabase, pickup!, dropoff!),
    enabled: pickup !== null && dropoff !== null,
    staleTime: 5 * 60_000,
    placeholderData: keepPreviousData,
  });
}

/** The cheapest offer for one class + crew: the mover's own price, their payout, how many offers. */
export type ClassFrom = { moverPrice: number; payout: number; currency: Currency; offers: number };

/** Lowest offer of a class for a crew size, in the pickup country's currency when offered. */
export function classFrom(quote: QuoteResponse, vehicleClass: VehicleClass, crew: 1 | 2 | 3, pickup: Place): ClassFrom | null {
  const summary = quote.classes.find((c) => c.vehicleClass === vehicleClass)?.crews[crew];
  const local = MARKET_RATES[pickup.countryCode as keyof typeof MARKET_RATES]?.currency;
  const best = summary ? pickFrom(summary.from, local) : undefined;
  return best && summary ? { moverPrice: best.moverPrice, payout: best.moverPayout, currency: best.currency, offers: summary.count } : null;
}
