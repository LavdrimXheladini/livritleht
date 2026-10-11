import { sameCity, type Place } from '@ranktrip/shared';

/**
 * "Prishtinë → Prizren" between cities; within one city the neighbourhoods ("Dardania → Velania"),
 * or "Within Prishtinë" when they aren't known. City / district level only — never the street, so
 * it is also safe to show movers before they accept (COMPLIANCE §9.1).
 */
export function routeLabel(pickup: Place, dropoff: Place, withinCity: (city: string) => string): string {
  if (!sameCity(pickup, dropoff)) return `${pickup.area} → ${dropoff.area}`;
  return pickup.district && dropoff.district && pickup.district !== dropoff.district
    ? `${pickup.district} → ${dropoff.district}`
    : withinCity(pickup.area);
}

/** One stop's name: its neighbourhood when the move stays in one city, otherwise the city. */
export function stopName(stop: Place, other: Place): string {
  return sameCity(stop, other) && stop.district ? stop.district : stop.area;
}
