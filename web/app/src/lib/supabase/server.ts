import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { connection } from 'next/server';

import { supabaseKey, supabaseUrl } from './env';

/**
 * Per-request server client. Must be created inside a Suspense boundary (reads cookies). It also marks
 * the render as per-request (`connection()`): checking the session reads the current time (token
 * expiry), which Cache Components otherwise reports as an unstable value while prerendering.
 */
export async function createClient() {
  await connection();
  const cookieStore = await cookies();
  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Called from a Server Component — the proxy refreshes the session instead.
        }
      },
    },
  });
}
