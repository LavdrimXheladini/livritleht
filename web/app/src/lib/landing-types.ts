// Client-safe types for the landing demo. Data is built on the server (landing-example.ts,
// server-only; quote-action.ts) and passed to client components.
import type { MoveScope, VehicleClass } from '@ranktrip/shared';

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
