import 'server-only';

import { createClient } from '@/lib/supabase/server';

/** An admin's Supabase client (their own session). */
export type AdminSupabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Who opens the admin pages: nobody signed in, someone who isn't an admin, or an admin. Everything an
 * admin reads or decides goes through their own session — Postgres decides what they may do
 * (`public.is_admin()`, the admin read policies and the admin_review_* functions). No service key here.
 */
export async function adminSession(): Promise<{ state: 'signed-out' } | { state: 'not-admin' } | { state: 'admin'; supabase: AdminSupabase }> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims.sub) return { state: 'signed-out' };
  const { data: isAdmin } = await supabase.rpc('is_admin');
  return isAdmin === true ? { state: 'admin', supabase } : { state: 'not-admin' };
}
