// Rate limit for the public functions (`quote`, `places`): RATE_LIMITS in packages/shared, per
// signed-in account or else per IP, counted by `public.hit_rate_limit` (service role) so every edge
// isolate shares one count.

import {
  RATE_LIMITS,
  clientIp,
  memoryRateLimiter,
  rateLimitKey,
  rateLimitUserKey,
  type RateLimitScope,
} from './movershub/shared/index.ts';
import type { Caller } from './auth.ts';
import { failure, json } from './http.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
/** Used only while the database can't be asked: this isolate counts on its own. */
const fallback = memoryRateLimiter();

async function hit(key: string, scope: RateLimitScope): Promise<boolean> {
  const { limit, windowSeconds } = RATE_LIMITS[scope];
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/hit_rate_limit`, {
    method: 'POST',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_key: key, p_limit: limit, p_window_seconds: windowSeconds }),
    signal: AbortSignal.timeout(3000),
  });
  if (!res.ok) throw new Error(`hit_rate_limit ${res.status}: ${await res.text()}`);
  return (await res.json()) === true;
}

/**
 * A 429 answer (with Retry-After) once the caller is over its limit, else null. A signed-in app user
 * is counted per account (many phones share one carrier IP), anyone else per IP. Our own servers
 * call with a secret API key and are not counted here: the website limits each of its visitors
 * itself, and otherwise all its visitors would share the website's IP.
 */
export async function rateLimited(req: Request, scope: RateLimitScope, who: Caller): Promise<Response | null> {
  if (who.kind === 'server') return null;
  const rule = RATE_LIMITS[scope];
  const key = who.kind === 'user' ? rateLimitUserKey(scope, who.userId) : rateLimitKey(scope, clientIp(req.headers, 'supabase'));
  let allowed: boolean;
  try {
    allowed = await hit(key, scope);
  } catch (e) {
    console.error('rate limit check failed — counting in memory', failure(e));
    allowed = fallback(key, rule);
  }
  return allowed ? null : json(req, { error: 'rate_limited' }, 429, { 'Retry-After': String(rule.windowSeconds) });
}
