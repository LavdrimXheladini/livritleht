import { NextResponse, type NextRequest } from 'next/server';
import { z } from 'zod';

import { LOCALES } from '@movershub/shared';

import { geoProvider } from '@/lib/geo/provider';
import { rateLimit } from '@/lib/rate-limit';

// Address autocomplete for the quote widget. Proxies the geocoder so visitors' IP addresses are
// not sent to third parties and results are cached server-side (fair use of free services), and
// limits each visitor (RATE_LIMITS.addressSearch → 429 with Retry-After).

const querySchema = z.object({
  q: z.string().trim().min(3).max(120),
  locale: z.enum(LOCALES).default('en'),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lon: z.coerce.number().min(-180).max(180).optional(),
});

export async function GET(request: NextRequest) {
  const limit = await rateLimit('addressSearch', request.headers);
  if (!limit.ok) {
    return NextResponse.json(
      { results: [], error: 'rate_limited' },
      { status: 429, headers: { 'Retry-After': String(limit.retryAfterSeconds) } },
    );
  }
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ results: [] }, { status: 400 });
  const { q, locale, lat, lon } = parsed.data;
  try {
    const results = await geoProvider().search(q, {
      locale,
      near: lat !== undefined && lon !== undefined ? { lat, lon } : undefined,
    });
    return NextResponse.json({ results }, { headers: { 'Cache-Control': 'private, max-age=300' } });
  } catch (e) {
    console.error('address search failed', e);
    return NextResponse.json({ results: [], error: 'unavailable' }, { status: 502 });
  }
}
