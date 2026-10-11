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
