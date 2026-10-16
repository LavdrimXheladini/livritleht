import 'server-only';

import { supabaseKey, supabaseUrl } from '@/lib/supabase/env';
import { createClient } from '@/lib/supabase/server';

/**
 * Calls the `account` function (design/DECISIONS.md #31) as the signed-in visitor, from the server: their
 * own access token, which the function checks itself. Null when nobody is signed in.
 */
export async function callAccount(body: object): Promise<Response | null> {
  const supabase = await createClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) return null;
  return fetch(`${supabaseUrl}/functions/v1/account`, {
    method: 'POST',
    headers: { apikey: supabaseKey, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20_000),
  });
}
