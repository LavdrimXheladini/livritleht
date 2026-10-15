import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A server function's answer: its JSON, or the error code it sent (`{ error }`) with the HTTP status;
 * `network` when there was no answer at all.
 */
export type Called<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

export async function callFunction<T>(supabase: SupabaseClient, name: string, body: object): Promise<Called<T>> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (!error && data) return { ok: true, data };
  // supabase-js puts the function's own answer in `context` (a Response) when it isn't 2xx.
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    const answer = (await context.json().catch(() => ({}))) as { error?: unknown };
    return { ok: false, error: typeof answer.error === 'string' ? answer.error : 'unavailable', status: context.status };
  }
  return { ok: false, error: 'network', status: 0 };
}
