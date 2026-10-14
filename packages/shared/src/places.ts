// Places shared by the website, the app and the server functions: demo places (example routes,
// offline test fixtures) and the Photon address-search formatter. Pure, no I/O.
import type { Place } from './schemas/geo';

/**
 * An address-search suggestion: a Place plus a stable id for lists, and the address parts the map
 * data has (a mover's company address is stored by parts — street, number, postcode, city).
 */
export type GeoSuggestion = Place & {
  id: string;
  street?: string;
  houseNumber?: string;
  postcode?: string;
  city?: string;
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

// Photon (OpenStreetMap geocoder, https://photon.komoot.io) response → our GeoSuggestion.
// Pure function; unit-tested in web/app/src/lib/geo/geo.test.ts. Shared by the website and the `places` function.

export type PhotonFeature = {
  geometry: { type: 'Point'; coordinates: [number, number] };
  properties: {
    osm_type?: string;
    osm_id?: number;
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    district?: string;
    city?: string;
    county?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    type?: string;
  };
};

export function formatPhotonFeature(f: PhotonFeature): GeoSuggestion | null {
  const p = f.properties;
  const [lon, lat] = f.geometry.coordinates;
  const countryCode = p.countrycode?.toUpperCase();
  if (!countryCode || !/^[A-Z]{2}$/.test(countryCode)) return null;

  const streetLine = p.street ? [p.street, p.housenumber].filter(Boolean).join(' ') : undefined;
  const area = p.city ?? p.county ?? p.state ?? p.name;
  // Named place ("Sheshi Nëna Terezë"), else the street address ("Rr. UÇK 12"), else the area.
  const primary = p.name && p.name !== p.street ? p.name : (streetLine ?? p.name ?? area);
  if (!primary || !area) return null;
  // Neighbourhood inside the city (Photon's district, or the result itself when it is one) —
  // lets moves within one city read "Dardania → Velania" instead of "Prishtinë → Prishtinë".
  const district = p.district ?? (p.type === 'district' && p.city ? p.name : undefined);

  const parts = [
    primary,
    primary === p.name ? streetLine : undefined, // street under a named place
    district && district !== primary && district !== area ? district : undefined,
    primary !== area ? area : undefined,
    p.country,
  ];
  return {
    id: `${p.osm_type ?? 'X'}${p.osm_id ?? `${lat},${lon}`}`,
    label: parts.filter((x): x is string => Boolean(x)).join(', '),
    area,
    ...(district && district !== area ? { district } : {}),
    lat,
    lon,
    countryCode,
    ...(p.street ? { street: p.street } : {}),
    ...(p.housenumber ? { houseNumber: p.housenumber } : {}),
    ...(p.postcode ? { postcode: p.postcode } : {}),
    ...(p.city ? { city: p.city } : {}),
  };
}

/* ── Photon request / response (website provider + `places` function) ── */

/** Europe incl. the Balkans, Poland and the DACH diaspora corridors. */
const EUROPE_BBOX = '-25,34,45,72';
/** Photon translates results into these languages; others get local names. */
const PHOTON_LANGS = new Set(['en', 'de', 'fr']);

/** Photon search URL: 6 results in Europe, translated when possible, biased towards `near`. */
export function photonSearchUrl(query: string, locale: string, near?: { lat: number; lon: number }): string {
  const params: [string, string][] = [
    ['q', query],
    ['limit', '6'],
    ['bbox', EUROPE_BBOX],
  ];
  if (PHOTON_LANGS.has(locale)) params.push(['lang', locale]);
  if (near) params.push(['lat', near.lat.toFixed(2)], ['lon', near.lon.toFixed(2)]);
  return `https://photon.komoot.io/api/?${params.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&')}`;
}

/** Photon answer → suggestions. Photon often returns one address twice (node + way): first wins. */
export function photonSuggestions(body: { features?: PhotonFeature[] }): GeoSuggestion[] {
  const unique = new Map<string, GeoSuggestion>();
  for (const feature of body.features ?? []) {
    const s = formatPhotonFeature(feature);
    if (s && !unique.has(s.label)) unique.set(s.label, s);
  }
  return [...unique.values()];
}
