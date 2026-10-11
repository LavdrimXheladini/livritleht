// Client-safe types for the landing demo. Data is built on the server (landing-example.ts,
// server-only; quote-action.ts) and passed to client components.
import type { VehicleClass } from '@ranktrip/shared';

import type { DemoCityId, LineCoords } from './geo/types';

/** [moverPriceCents, payoutCents] for crew 1, 2, 3 (index = crew − 1). */
export type CrewPrices = readonly [readonly [number, number], readonly [number, number], readonly [number, number]];

/** Sample quote for one route (design/DECISIONS.md #4): example rates, computed on the server. */
export type SampleRoute = {
  km: number;
  crossBorder: boolean;
  /** Rounded driving + loading time in hours. */
  hours: number;
  takeRatePct: number;
  prices: Record<VehicleClass, CrewPrices>;
  /** Road geometry for the map ([lon, lat]). */
  geometry: LineCoords;
  /** True when the routing service was unavailable and distance is a straight-line estimate. */
  estimated: boolean;
};

export type Corridor = { from: DemoCityId; to: DemoCityId };
export type ExampleCurves = Record<VehicleClass, number[]>;
