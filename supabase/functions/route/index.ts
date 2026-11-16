// `route` — the road between two places, for the map of a move in the app. Asked on the server, like
// the address search: the phone's IP address never reaches the routing service, and the provider can
// change (Google Routes later) without an app update.
//   POST { from: { lat, lon }, to: { lat, lon } } → { km, geometry: [[lon, lat], …] }
// For the signed-in app only: no signed-in user → 401. Limited per account (RATE_LIMITS.route → 429).
// The OSRM demo server is fair use only, NOT for production (see CLAUDE.md, maps).
// Shared code: run `pnpm functions:build` before serving or deploying.

import { z } from 'zod';

import { caller, type Caller } from '../_shared/auth.ts';
import { failure, json, preflight } from '../_shared/http.ts';
import { rateLimited } from '../_shared/rate-limit.ts';

const point = z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).strict();
const requestSchema = z.object({ from: point, to: point }).strict();

/** Five decimals ≈ 1 m: plenty for a line on a map, and a smaller answer. */
const round = (n: number) => Math.round(n * 1e5) / 1e5;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405, { Allow: 'POST, OPTIONS' });
  let who: Caller;
  try {
    who = await caller(req);
  } catch (e) {
    console.error('route: sign-in check failed', failure(e));
    return json(req, { error: 'route_unavailable' }, 503);
  }
  if (who.kind === 'anonymous') return json(req, { error: 'sign_in_required' }, 401);
  const limited = await rateLimited(req, 'route', who);
  if (limited) return limited;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'invalid_json' }, 400);
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return json(req, { error: 'invalid_request' }, 400);
  const { from, to } = parsed.data;

  try {
    const res = await fetch(
      `https://router.project-osrm.org/route/v1/driving/${from.lon},${from.lat};${to.lon},${to.lat}?overview=full&geometries=geojson`,
      { signal: AbortSignal.timeout(5000), headers: { 'User-Agent': 'MoversHub/0.1 (route function)' } },
    );
    if (!res.ok) return json(req, { error: 'route_unavailable' }, 502);
    const answer = (await res.json()) as { code?: string; routes?: { distance: number; geometry: { coordinates: [number, number][] } }[] };
    const found = answer.code === 'Ok' ? answer.routes?.[0] : undefined;
    if (!found) return json(req, { error: 'route_unavailable' }, 502);
    return json(req, {
      km: Math.round(found.distance / 100) / 10,
      geometry: found.geometry.coordinates.map(([lon, lat]) => [round(lon), round(lat)]),
    });
  } catch (e) {
    console.error('route failed', failure(e));
    return json(req, { error: 'route_unavailable' }, 502);
  }
});
