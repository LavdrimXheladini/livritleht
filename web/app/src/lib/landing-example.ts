import 'server-only';

import type { Place, VehicleClass } from '@movershub/shared';
import { PLATFORM_TAKE_RATE_PCT, VEHICLE_CLASSES, moveScope } from '@movershub/shared';

import { geoProvider } from './geo/provider';
import { haversineM } from './geo/types';
import type { Corridor, CrewPrices, ExampleCurves, SampleRoute } from './landing-types';

// SAMPLE PRICES for the landing page demo ("Sample rates for the demo" in the UI; design/DECISIONS.md #4).
// One made-up mover's rate card — NOT a platform price list (COMPLIANCE §1, §1.1). Real prices
// come from each mover's own rate card via the server-side quote (build order step 3).
// Everything is computed here on the server; the browser only receives the numbers.

const EXAMPLE_RATES: Record<VehicleClass, { baseCents: number; perKmCents: number }> = {
  SMALL: { baseCents: 2500, perKmCents: 60 },
  VAN: { baseCents: 3900, perKmCents: 80 },
  LARGE_VAN: { baseCents: 5900, perKmCents: 100 },
  BOX: { baseCents: 7900, perKmCents: 125 },
  TRUCK: { baseCents: 9900, perKmCents: 150 },
};
/** The example mover's long-distance discount: km beyond this cost 55% of the normal per-km rate. */
const LONG_DISTANCE_KM = 150;
const LONG_DISTANCE_FACTOR = 0.55;
const HELPER_CENTS = 2500;
/** Loading + unloading added to driving time for the "≈ h" estimate. */
const HANDLING_HOURS = 1;

function examplePriceCents(cls: VehicleClass, km: number, helpers: number): number {
  const { baseCents, perKmCents } = EXAMPLE_RATES[cls];
  const near = Math.min(km, LONG_DISTANCE_KM);
  const far = Math.max(km - LONG_DISTANCE_KM, 0);
  return Math.round(baseCents + near * perKmCents + far * perKmCents * LONG_DISTANCE_FACTOR + helpers * HELPER_CENTS);
}

/** Sample quote between two places: real road distance when available, else a flagged estimate. */
export async function sampleQuote(pickup: Place, dropoff: Place): Promise<SampleRoute> {
  let route = null;
  try {
    route = await geoProvider().route(pickup, dropoff);
  } catch (e) {
    console.error('route lookup failed', e);
  }
  const distanceM = route?.distanceM ?? haversineM(pickup, dropoff) * 1.28;
  const durationS = route?.durationS ?? (distanceM / 1000 / 70) * 3600;
  const km = Math.max(1, Math.round(distanceM / 1000));
  const crossBorder = pickup.countryCode !== dropoff.countryCode;
  const takeRatePct = crossBorder ? PLATFORM_TAKE_RATE_PCT.crossBorder : PLATFORM_TAKE_RATE_PCT.domestic;

  const withPayout = (cls: VehicleClass, helpers: number) => {
    const price = examplePriceCents(cls, km, helpers);
    return [price, price - Math.round((price * takeRatePct) / 100)] as const;
  };
  const prices = Object.fromEntries(
    VEHICLE_CLASSES.map((cls): [VehicleClass, CrewPrices] => [cls, [withPayout(cls, 0), withPayout(cls, 1), withPayout(cls, 2)]]),
  ) as Record<VehicleClass, CrewPrices>;

  return {
    km,
    crossBorder,
    scope: moveScope(pickup, dropoff, km),
    hours: Math.max(1, Math.round(durationS / 3600 + HANDLING_HOURS)),
    takeRatePct,
    prices,
    geometry: route?.geometry ?? [
      [pickup.lon, pickup.lat],
      [dropoff.lon, dropoff.lat],
    ],
    estimated: route === null,
  };
}

/* ── Pricing chart ───────────────────────────────────────────────────── */

export const CHART_STEP_KM = 5;
export const CHART_MAX_KM = 1600;

/** Example price (cents, no helpers) every CHART_STEP_KM km up to CHART_MAX_KM, per class. */
export function exampleCurves(): ExampleCurves {
  const points = CHART_MAX_KM / CHART_STEP_KM + 1;
  return Object.fromEntries(
    VEHICLE_CLASSES.map((cls) => [cls, Array.from({ length: points }, (_, i) => examplePriceCents(cls, i * CHART_STEP_KM, 0))]),
  ) as ExampleCurves;
}

/** Popular routes; clicking one loads it into the quote widget. Local moves first, like most moves. */
export const CORRIDORS: readonly Corridor[] = [
  { from: 'dardania', to: 'velania' },
  { from: 'prishtina', to: 'prizren' },
  { from: 'prishtina', to: 'tirana' },
  { from: 'skopje', to: 'prishtina' },
  { from: 'mokotow', to: 'wola' },
  { from: 'warsaw', to: 'krakow' },
  { from: 'munich', to: 'prishtina' },
  { from: 'zurich', to: 'prishtina' },
  { from: 'vienna', to: 'skopje' },
  { from: 'stuttgart', to: 'tirana' },
];
