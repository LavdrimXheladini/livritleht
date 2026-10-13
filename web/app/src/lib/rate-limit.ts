import 'server-only';

import { createClient } from '@supabase/supabase-js';

import {
  RATE_LIMITS,
  clientIp,
  memoryRateLimiter,
  rateLimitKey,
  type HeaderReader,
  type RateLimitScope,
} from '@movershub/shared';

import { supabaseConfigured, supabaseUrl } from './supabase/env';

// Per-IP limits for the website's anonymous endpoints (quote action, address search): the same
// RATE_LIMITS and the same database count (`public.hit_rate_limit`) as the edge functions, shared by
// every server instance. The secret key lives only here, on the server (never NEXT_PUBLIC_).
// In-memory count per server instance instead: RATE_LIMIT_STORE=memory (offline tests), no
// SUPABASE_SECRET_KEY (local development), or while the database can't be asked.

const secretKey = process.env.SUPABASE_SECRET_KEY;
const db =
  secretKey && supabaseConfigured && process.env.RATE_LIMIT_STORE !== 'memory'
    ? createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
const memory = memoryRateLimiter();

export type RateLimitOutcome = { ok: true } | { ok: false; retryAfterSeconds: number };

export async function rateLimit(scope: RateLimitScope, headers: HeaderReader): Promise<RateLimitOutcome> {
  const rule = RATE_LIMITS[scope];
  // On Vercel the client's address comes from Vercel's own headers (a client can't forge them).
  const key = rateLimitKey(scope, clientIp(headers, 'vercel'));
  let allowed: boolean | null = null;
  if (db) {
    try {
      const { data, error } = await db.rpc('hit_rate_limit', { p_key: key, p_limit: rule.limit, p_window_seconds: rule.windowSeconds });
      if (error) console.error('rate limit check failed — counting in memory', error.code, error.message);
      else allowed = data === true;
    } catch (e) {
      console.error('rate limit check failed — counting in memory', e);
    }
  }
  allowed ??= memory(key, rule);
  return allowed ? { ok: true } : { ok: false, retryAfterSeconds: rule.windowSeconds };
}
