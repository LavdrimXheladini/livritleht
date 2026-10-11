// Client-safe geo types. Providers (server-only) live in ./provider.ts.
import type { Place } from '@ranktrip/shared';

export type GeoSuggestion = Place & { id: string };

/** [lon, lat] pairs, GeoJSON order. */
export type LineCoords = [number, number][];

export type RouteResult = {
  distanceM: number;
  durationS: number;
  geometry: LineCoords;
};

/** Demo city centres (corridor pills, fixture provider). Names are translated via i18n `places.<id>`. */
export const DEMO_CITIES = [
  { id: 'prishtina', countryCode: 'XK', lat: 42.6629, lon: 21.1655 },
  { id: 'prizren', countryCode: 'XK', lat: 42.2139, lon: 20.7397 },
  { id: 'peja', countryCode: 'XK', lat: 42.6593, lon: 20.2887 },
  { id: 'gjakova', countryCode: 'XK', lat: 42.3803, lon: 20.4308 },
  { id: 'ferizaj', countryCode: 'XK', lat: 42.3702, lon: 21.1553 },
  { id: 'tirana', countryCode: 'AL', lat: 41.3275, lon: 19.8187 },
  { id: 'skopje', countryCode: 'MK', lat: 41.9981, lon: 21.4254 },
  { id: 'podgorica', countryCode: 'ME', lat: 42.4304, lon: 19.2594 },
  { id: 'warsaw', countryCode: 'PL', lat: 52.2297, lon: 21.0122 },
  { id: 'krakow', countryCode: 'PL', lat: 50.0647, lon: 19.945 },
  { id: 'munich', countryCode: 'DE', lat: 48.1351, lon: 11.582 },
  { id: 'stuttgart', countryCode: 'DE', lat: 48.7758, lon: 9.1829 },
  { id: 'vienna', countryCode: 'AT', lat: 48.2082, lon: 16.3738 },
  { id: 'zurich', countryCode: 'CH', lat: 47.3769, lon: 8.5417 },
] as const;
export type DemoCityId = (typeof DEMO_CITIES)[number]['id'];

/** Demo neighbourhoods for moves within one city (local corridor pills). Names via i18n `places.<id>`. */
export const DEMO_DISTRICTS = [
  { id: 'dardania', city: 'prishtina', countryCode: 'XK', lat: 42.6518, lon: 21.1537 },
  { id: 'velania', city: 'prishtina', countryCode: 'XK', lat: 42.6567, lon: 21.1796 },
  { id: 'mokotow', city: 'warsaw', countryCode: 'PL', lat: 52.1933, lon: 21.035 },
  { id: 'wola', city: 'warsaw', countryCode: 'PL', lat: 52.2361, lon: 20.9836 },
] as const satisfies readonly { id: string; city: DemoCityId; countryCode: string; lat: number; lon: number }[];
export type DemoDistrictId = (typeof DEMO_DISTRICTS)[number]['id'];
export type DemoPlaceId = DemoCityId | DemoDistrictId;

export const isDemoDistrict = (id: DemoPlaceId): id is DemoDistrictId => DEMO_DISTRICTS.some((d) => d.id === id);

/** Great-circle distance in metres. */
export function haversineM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = Math.PI / 180;
  const dLat = (b.lat - a.lat) * r;
  const dLon = (b.lon - a.lon) * r;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLon / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** A demo city centre as a Place, using the translated city name (e.g. from i18n `places.<id>`). */
export function demoPlace(id: DemoCityId, name: string): Place {
  const c = DEMO_CITIES.find((x) => x.id === id)!;
  return { label: name, area: name, lat: c.lat, lon: c.lon, countryCode: c.countryCode };
}

/** A demo neighbourhood as a Place: `area` is the city, `district` the neighbourhood. */
export function demoDistrict(id: DemoDistrictId, name: string, cityName: string): Place {
  const d = DEMO_DISTRICTS.find((x) => x.id === id)!;
  return { label: `${name}, ${cityName}`, area: cityName, district: name, lat: d.lat, lon: d.lon, countryCode: d.countryCode };
}

/** Any demo place by id, with names from i18n (`t('places.<id>')`). */
export function demoPlaceById(id: DemoPlaceId, t: (key: `places.${DemoPlaceId}`) => string): Place {
  if (isDemoDistrict(id)) {
    const d = DEMO_DISTRICTS.find((x) => x.id === id)!;
    return demoDistrict(id, t(`places.${id}`), t(`places.${d.city}`));
  }
  return demoPlace(id, t(`places.${id}`));
}
