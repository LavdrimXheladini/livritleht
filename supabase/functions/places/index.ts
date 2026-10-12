// `places` — address search for the apps (Photon / OpenStreetMap), on the server like the website's
// /api/geo/search: visitors' IP addresses never reach the geocoder (GDPR) and the provider can
// change (Google Places later) without an app update.
//   POST { q, locale, near? } → { suggestions: [{ id, label, area, district?, lat, lon, countryCode }] }
// Public, like `quote`. Shared code: run `pnpm functions:build` before serving or deploying.

import { z } from 'zod';

import { LOCALES, photonSearchUrl, photonSuggestions, type PhotonFeature } from '../_shared/movershub/shared/index.ts';
import { failure, json, preflight } from '../_shared/http.ts';

const requestSchema = z
  .object({
    q: z.string().trim().min(3).max(120),
    locale: z.enum(LOCALES),
    /** Bias results towards the other address (pickup ↔ drop-off). */
    near: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180) }).optional(),
  })
  .strict();

const USER_AGENT = 'MoversHub/0.1 (+https://github.com/LavdrimXheladini/livritleht)';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405);
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'invalid_json' }, 400);
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) return json(req, { error: 'invalid_request' }, 400);
  const { q, locale, near } = parsed.data;

  try {
    const res = await fetch(photonSearchUrl(q.toLowerCase(), locale, near), {
      headers: { 'User-Agent': USER_AGENT },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return json(req, { error: 'search_unavailable' }, 502);
    return json(req, { suggestions: photonSuggestions((await res.json()) as { features?: PhotonFeature[] }) });
  } catch (e) {
    console.error('places failed', failure(e));
    return json(req, { error: 'search_unavailable' }, 502);
  }
});
