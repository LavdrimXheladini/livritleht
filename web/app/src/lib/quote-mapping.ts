// Pure mapping from a quote answer (live or sample) to what the landing page shows. Kept apart from
// route-quote.ts (server-only, does the fetching) so it can be unit-tested.
import { pickFrom, type QuoteResponse } from '@ranktrip/pricing';
import { MARKET_RATES, PLATFORM_TAKE_RATE_PCT, VEHICLE_CLASSES, type Currency, type Place, type VehicleClass } from '@ranktrip/shared';

import type { CrewFrom, RouteQuote, SampleRoute } from './landing-types';

const perClass = (cell: (cls: VehicleClass, crew: 1 | 2 | 3) => CrewFrom) =>
  Object.fromEntries(VEHICLE_CLASSES.map((cls) => [cls, [cell(cls, 1), cell(cls, 2), cell(cls, 3)] as const])) as RouteQuote['prices'];

/** The labelled sample rates (design/DECISIONS.md #4). */
export function fromSample(s: SampleRoute): RouteQuote {
  return {
    km: s.km,
    crossBorder: s.crossBorder,
    scope: s.scope,
    hours: s.hours,
    takeRatePct: s.takeRatePct,
    source: 'sample',
    testMovers: false,
    prices: perClass((cls, crew) => {
      const [moverPrice, payout] = s.prices[cls][crew - 1];
      return { moverPrice, payout, currency: 'EUR', offers: 0 };
    }),
    geometry: s.geometry,
    estimated: s.estimated,
  };
}

/** Live quotes from movers' own rate cards; the road map and duration come from the geo provider. */
export function fromLive(s: SampleRoute, live: QuoteResponse, pickup: Place): RouteQuote {
  // Prices in the pickup country's own currency when a class has several (e.g. EUR and CHF).
  const local: Currency | undefined = MARKET_RATES[pickup.countryCode as keyof typeof MARKET_RATES]?.currency;
  return {
    km: Math.max(1, Math.round(live.distanceKm)),
    crossBorder: live.crossBorder,
    scope: live.scope,
    hours: s.hours,
    takeRatePct: live.crossBorder ? PLATFORM_TAKE_RATE_PCT.crossBorder : PLATFORM_TAKE_RATE_PCT.domestic,
    source: 'movers',
    testMovers: live.testMovers,
    prices: perClass((cls, crew) => {
      const summary = live.classes.find((c) => c.vehicleClass === cls)?.crews[crew];
      const best = summary ? pickFrom(summary.from, local) : undefined;
      return best && summary
        ? { moverPrice: best.moverPrice, payout: best.moverPayout, currency: best.currency, offers: summary.count }
        : null;
    }),
    geometry: s.geometry,
    estimated: live.distanceEstimated,
  };
}
