// Client-safe geo types. Providers (server-only) live in ./provider.ts.

/** [lon, lat] pairs, GeoJSON order. */
export type LineCoords = [number, number][];

export type RouteResult = {
  distanceM: number;
  durationS: number;
  geometry: LineCoords;
};

/** Great-circle distance in metres. */
export function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

// Demo places and the address-suggestion type live in packages/shared (also used by the apps).
export {
  DEMO_CITIES,
  DEMO_DISTRICTS,
  demoDistrict,
  demoPlace,
  demoPlaceById,
  isDemoDistrict,
  type DemoCityId,
  type DemoDistrictId,
  type DemoPlaceId,
  type GeoSuggestion,
} from '@ranktrip/shared';
