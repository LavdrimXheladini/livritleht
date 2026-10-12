import type { Place } from './schemas/geo';

/** Within one city (or a short hop next to it), between cities in one country, or across a border. */
export type MoveScope = 'local' | 'domestic' | 'crossBorder';

/** A move this short counts as local even between neighbouring towns (e.g. Prishtina → Fushë Kosovë). */
export const LOCAL_MAX_KM = 25;

const sameArea = (a: string, b: string) => a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();

export function moveScope(pickup: Pick<Place, 'area' | 'countryCode'>, dropoff: Pick<Place, 'area' | 'countryCode'>, km: number): MoveScope {
  if (pickup.countryCode !== dropoff.countryCode) return 'crossBorder';
  return sameArea(pickup.area, dropoff.area) || km <= LOCAL_MAX_KM ? 'local' : 'domestic';
}

/** True when both places are in the same city. */
export function sameCity(pickup: Pick<Place, 'area' | 'countryCode'>, dropoff: Pick<Place, 'area' | 'countryCode'>): boolean {
  return pickup.countryCode === dropoff.countryCode && sameArea(pickup.area, dropoff.area);
}

/**
 * "Prishtinë → Prizren" between cities; within one city the neighbourhoods ("Dardania → Velania"),
 * or "Within Prishtinë" when they aren't known. City / neighbourhood only — never the street, so it
 * is also safe to show movers before they accept (COMPLIANCE §9.1).
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
