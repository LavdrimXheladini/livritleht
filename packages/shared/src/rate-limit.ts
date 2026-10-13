// Request limits for the public endpoints: the `quote` and `places` edge functions, the website's
// quote action and address search. They protect the free OpenStreetMap services behind them (OSRM
// demo server, Photon — fair use only, abuse gets us banned) and our database. Anonymous callers are
// counted per IP; signed-in app users per account, because many phones share one carrier IP.
// Counted in Postgres by `public.hit_rate_limit` (service role only); the same rules everywhere come
// from here.

export type RateLimitRule = { limit: number; windowSeconds: number };

export const RATE_LIMITS = {
  /** A quote costs one OSRM route and up to five database lookups. */
  quote: { limit: 30, windowSeconds: 600 },
  /** An address search costs one Photon request. */
  addressSearch: { limit: 60, windowSeconds: 60 },
} as const satisfies Record<string, RateLimitRule>;
export type RateLimitScope = keyof typeof RATE_LIMITS;

/** Request headers in Deno, Node and Next.js alike. */
export type HeaderReader = { get(name: string): string | null };

/**
 * The caller's IP as the hosting platform's own proxy recorded it — never a value the client can
 * choose. `null` when there is none.
 * - `supabase` (edge functions): Cloudflare's `cf-connecting-ip`, else the LAST X-Forwarded-For
 *   entry. The platform appends the real address after whatever the client sent, so the first
 *   entry can be forged.
 * - `vercel` (website): Vercel overwrites `x-real-ip` and X-Forwarded-For with the client's address.
 */
export function clientIp(headers: HeaderReader, platform: 'supabase' | 'vercel'): string | null {
  const forwarded = (headers.get('x-forwarded-for') ?? '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const ip =
    platform === 'supabase'
      ? headers.get('cf-connecting-ip')?.trim() || forwarded.at(-1)
      : headers.get('x-real-ip')?.trim() || forwarded[0];
  return ip || null;
}

/**
 * Who a limit counts against: an IPv4 address, or the /64 network of an IPv6 address (one home or
 * phone gets a whole /64, so single IPv6 addresses would be free to rotate).
 */
export function rateLimitSubject(ip: string): string {
  const v4 = /^(?:::ffff:)?(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(ip);
  if (v4) return v4[1]!;
  const address = ip.toLowerCase().replace(/%.*$/, ''); // without a zone id (fe80::1%eth0)
  if (!address.includes(':')) return address;
  const halves = address.split('::');
  if (halves.length > 2) return address;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if (halves.length === 2 && missing < 1) return address;
  const groups = halves.length === 2 ? [...left, ...Array<string>(missing).fill('0'), ...right] : left;
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return address;
  return `${groups
    .slice(0, 4)
    .map((g) => g.replace(/^0+(?=.)/, ''))
    .join(':')}::/64`;
}

/** The key `hit_rate_limit` counts an anonymous caller under (the database stores only its hash). */
export function rateLimitKey(scope: RateLimitScope, ip: string | null): string {
  return `${scope}:${ip ? rateLimitSubject(ip) : 'unknown'}`;
}

/** The key for a signed-in user: their account, wherever they are (never shared with an IP's key). */
export function rateLimitUserKey(scope: RateLimitScope, userId: string): string {
  return `${scope}:user:${userId}`;
}

/** Base64 decoding, built into Deno, Node and browsers (this package has no DOM or Node types). */
declare const atob: (data: string) => string;

/**
 * The claims of a signed-in user's access token in an `Authorization: Bearer …` header — NOT
 * verified: it only tells which requests are worth checking with Supabase Auth. Null for anything
 * else: no header, the app's publishable key, the anonymous key, a malformed or expired token.
 */
export function bearerUserClaims(authorization: string | null, now: number = Date.now()): { sub: string; exp: number } | null {
  const token = /^Bearer\s+(\S+)$/i.exec(authorization ?? '')?.[1];
  const payload = token?.split('.')[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/'))) as { sub?: unknown; exp?: unknown; role?: unknown };
    const { sub, exp, role } = claims;
    if (role !== 'authenticated' || typeof sub !== 'string' || !sub || typeof exp !== 'number') return null;
    return exp * 1000 > now ? { sub, exp } : null;
  } catch {
    return null;
  }
}

/**
 * The same fixed-window count as `public.hit_rate_limit`, in this process's memory. Only a fallback:
 * for offline tests, for a server without the secret key, and when the database can't be asked —
 * each server instance (or edge isolate) then counts on its own.
 */
export function memoryRateLimiter(now: () => number = Date.now, maxKeys = 10_000) {
  const windows = new Map<string, { start: number; count: number; windowMs: number }>();
  return (key: string, rule: RateLimitRule): boolean => {
    const t = now();
    const current = windows.get(key);
    if (current && t - current.start < current.windowMs) {
      current.count += 1;
      return current.count <= rule.limit;
    }
    windows.delete(key);
    windows.set(key, { start: t, count: 1, windowMs: rule.windowSeconds * 1000 });
    if (windows.size > maxKeys) {
      for (const [k, w] of windows) if (t - w.start >= w.windowMs) windows.delete(k);
      // Still too many live keys (a spread-out attack): forget the oldest.
      for (const k of windows.keys()) {
        if (windows.size <= maxKeys) break;
        windows.delete(k);
      }
    }
    return 1 <= rule.limit;
  };
}

/** The platform's secret API keys: SUPABASE_SECRET_KEYS (JSON `{ name: key }`) and the legacy service-role key. */
export function serverKeys(secretKeysJson: string | undefined, legacyServiceRoleKey: string | undefined): string[] {
  const keys: string[] = [];
  try {
    const parsed: unknown = JSON.parse(secretKeysJson || '{}');
    if (parsed && typeof parsed === 'object') {
      keys.push(...Object.values(parsed).filter((v): v is string => typeof v === 'string' && v.length > 0));
    }
  } catch {
    // Not set or not JSON: no named secret keys.
  }
  if (legacyServiceRoleKey) keys.push(legacyServiceRoleKey);
  return keys;
}

/**
 * True when the caller presented one of our secret keys: one of our own servers (the website, which
 * limits its visitors itself). Compared in constant time.
 */
export function isServerKey(candidate: string | null, keys: readonly string[]): boolean {
  if (!candidate) return false;
  let match = false;
  for (const key of keys) {
    if (key.length !== candidate.length) continue;
    let diff = 0;
    for (let i = 0; i < key.length; i++) diff |= key.charCodeAt(i) ^ candidate.charCodeAt(i);
    match = match || diff === 0;
  }
  return match;
}
