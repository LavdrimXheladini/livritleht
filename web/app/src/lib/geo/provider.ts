import 'server-only';

import { cacheLife } from 'next/cache';

import { photonSearchUrl, photonSuggestions, type Locale, type PhotonFeature, type Place } from '@ranktrip/shared';

import { DEMO_CITIES, haversineM, type GeoSuggestion, type LineCoords, type RouteResult } from './types';

/**
 * Geocoding + routing behind one interface so the provider can change without touching the UI.
 * - `osm` (default): free OpenStreetMap services — Photon (search) and the OSRM demo server
 *   (routes). Fair-use only; the OSRM demo server is NOT for production traffic.
 * - `fixture` (GEO_PROVIDER=fixture): deterministic offline data for tests.
 * - Google Places + Routes: add here when billing is set up (CLAUDE.md §1 plan).
 * All calls run on our server, so visitors' IP addresses are never sent to these services (GDPR).
 */
export interface GeoProvider {
  search(query: string, opts: { locale: Locale; near?: { lat: number; lon: number } }): Promise<GeoSuggestion[]>;
  route(from: Place, to: Place): Promise<RouteResult | null>;
}

const USER_AGENT = 'Ranktrip/0.1 (+https://github.com/LavdrimXheladini/livritleht)';
const MAX_ROUTE_POINTS = 400;

async function photonSearch(query: string, locale: Locale, nearKey: string): Promise<GeoSuggestion[]> {
  'use cache';
  cacheLife('days');
  const [lat, lon] = nearKey.split(',').map(Number);
  const url = photonSearchUrl(query, locale, nearKey ? { lat: lat!, lon: lon! } : undefined);
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  return photonSuggestions((await res.json()) as { features?: PhotonFeature[] });
}

async function osrmRoute(fromKey: string, toKey: string): Promise<RouteResult | null> {
  'use cache';
  cacheLife('days');
  const url = `https://router.project-osrm.org/route/v1/driving/${fromKey};${toKey}?overview=simplified&geometries=geojson`;
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(6000) });
  if (!res.ok) return null;
  const body = (await res.json()) as {
    code: string;
    routes?: { distance: number; duration: number; geometry: { coordinates: LineCoords } }[];
  };
  const r = body.code === 'Ok' ? body.routes?.[0] : undefined;
  if (!r) return null;
  const coords = r.geometry.coordinates;
  const step = Math.max(1, Math.ceil(coords.length / MAX_ROUTE_POINTS));
  const geometry = coords.filter((_, i) => i % step === 0 || i === coords.length - 1);
  return { distanceM: r.distance, durationS: r.duration, geometry };
}

/** Coordinates rounded to ~10 m so nearby requests share the cache. */
const coordKey = (p: { lat: number; lon: number }) => `${p.lon.toFixed(4)},${p.lat.toFixed(4)}`;

const osm: GeoProvider = {
  search: (query, { locale, near }) =>
    photonSearch(query.trim().toLowerCase(), locale, near ? `${near.lat.toFixed(2)},${near.lon.toFixed(2)}` : ''),
  route: (from, to) => osrmRoute(coordKey(from), coordKey(to)),
};

/** Offline provider for tests: demo cities, straight-line routes ×1.28. */
const fixture: GeoProvider = {
  async search(query) {
    const q = query.trim().toLowerCase();
    return DEMO_CITIES.filter((c) => c.id.startsWith(q.slice(0, 4))).map((c) => {
      const name = c.id.charAt(0).toUpperCase() + c.id.slice(1);
      return { id: `fixture-${c.id}`, label: `${name} Centre, ${name}`, area: name, lat: c.lat, lon: c.lon, countryCode: c.countryCode };
    });
  },
  async route(from, to) {
    const distanceM = haversineM(from, to) * 1.28;
    return { distanceM, durationS: (distanceM / 1000 / 70) * 3600, geometry: [[from.lon, from.lat], [to.lon, to.lat]] };
  },
};

export function geoProvider(): GeoProvider {
  return process.env.GEO_PROVIDER === 'fixture' ? fixture : osm;
}
