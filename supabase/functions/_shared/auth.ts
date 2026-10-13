// Who is calling a public function (`quote`, `places`): one of our own servers (a secret API key), a
// signed-in app user (their access token, confirmed by Supabase Auth) or an anonymous visitor.

import { bearerUserClaims, isServerKey, serverKeys, ttlCache } from './movershub/shared/index.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const SERVER_KEYS = serverKeys(Deno.env.get('SUPABASE_SECRET_KEYS'), SERVICE_ROLE_KEY);

export type Caller = { kind: 'server' } | { kind: 'user'; userId: string } | { kind: 'anonymous' };

/**
 * Tokens Supabase Auth already confirmed, by hash, for a few minutes (never past their expiry): the
 * address search sends a request per typed word. A token of a session that signs out meanwhile can
 * still search for those minutes — this only decides who is counted, it opens no data.
 */
const confirmed = ttlCache<string>({ ttlMs: 5 * 60_000, maxEntries: 5000 });

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Throws when Supabase Auth can't be asked (the caller decides what that means). */
export async function caller(req: Request): Promise<Caller> {
  if (isServerKey(req.headers.get('apikey'), SERVER_KEYS)) return { kind: 'server' };
  const authorization = req.headers.get('Authorization');
  // The app's publishable key, the anonymous key or an expired token carry no user: nothing to check.
  if (!bearerUserClaims(authorization)) return { kind: 'anonymous' };
  const id = await sha256(authorization ?? '');
  const known = confirmed.get(id);
  if (known) return { kind: 'user', userId: known };

  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: authorization ?? '' },
    signal: AbortSignal.timeout(3000),
  });
  // Forged, expired, or the session has ended: not a signed-in user.
  if (res.status >= 400 && res.status < 500) return { kind: 'anonymous' };
  if (!res.ok) throw new Error(`auth/v1/user ${res.status}`);
  const user = (await res.json()) as { id?: unknown };
  if (typeof user.id !== 'string' || !user.id) return { kind: 'anonymous' };
  confirmed.set(id, user.id);
  return { kind: 'user', userId: user.id };
}
