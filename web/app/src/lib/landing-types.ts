// Client-safe types for the landing demo. Data is built on the server (landing-example.ts,
// server-only; quote-action.ts) and passed to client components.
import type { Currency, MoveScope, VehicleClass } from '@movershub/shared';

import type { DemoPlaceId, LineCoords } from './geo/types';

/** [moverPriceCents, payoutCents] for crew 1, 2, 3 (index = crew − 1). */
export type CrewPrices = readonly [readonly [number, number], readonly [number, number], readonly [number, number]];

/** Sample quote for one route (design/DECISIONS.md #4): example rates, computed on the server. */
export type SampleRoute = {
  km: number;
  crossBorder: boolean;
  /** Within one city / short hop, between cities, or across a border. */
  scope: MoveScope;
  /** Rounded driving + loading time in hours. */
  hours: number;
  takeRatePct: number;
  prices: Record<VehicleClass, CrewPrices>;
  /** Road geometry for the map ([lon, lat]). */
  geometry: LineCoords;
  /** True when the routing service was unavailable and distance is a straight-line estimate. */
  estimated: boolean;
};

/** Example route; both ends in one city = a local move. */
export type Corridor = { from: DemoPlaceId; to: DemoPlaceId };
export type ExampleCurves = Record<VehicleClass, number[]>;

/** The cheapest offer for one class + crew: the mover's own price, their payout, how many offers. */
export type CrewFrom = { moverPrice: number; payout: number; currency: Currency; offers: number } | null;

/**
 * What the landing page shows for a route (page.tsx, quote-action.ts → client components).
 * `source: 'movers'` = live quotes from movers' own rate cards (the `quote` function, a typical load
 * per class — design/DECISIONS.md #11); `'sample'` = the labelled sample rates (offline tests, or
 * when the quote service can't be reached). Prices are always computed on the server.
 */
export type RouteQuote = {
  km: number;
  crossBorder: boolean;
  scope: MoveScope;
  /** Rounded driving + loading time in hours. */
  hours: number;
  takeRatePct: number;
  source: 'movers' | 'sample';
  /** Live quotes from test movers (development, design/DECISIONS.md #7) — the page says so. */
  testMovers: boolean;
  /** Per class, crew 1–3 (index = crew − 1); null = no mover offers it here. */
  prices: Record<VehicleClass, readonly [CrewFrom, CrewFrom, CrewFrom]>;
  geometry: LineCoords;
  /** The routing service was unavailable and the distance is a straight-line estimate. */
  estimated: boolean;
};
