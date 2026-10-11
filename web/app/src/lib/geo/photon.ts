import type { GeoSuggestion } from './types';

// Photon (OpenStreetMap geocoder, https://photon.komoot.io) response → our GeoSuggestion.
// Pure function, unit-tested in photon.test.ts.

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
  };
}
