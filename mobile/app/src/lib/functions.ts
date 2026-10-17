import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * A server function's answer: its JSON, or the error code it sent (`{ error }`) with the HTTP status and
 * the rest of its answer (e.g. the new fee of `fee_changed`); `network` when there was no answer at all
 * — also after `timeoutMs` without one, so a stalled connection never leaves a button spinning.
 */
export type Called<T> = { ok: true; data: T } | { ok: false; error: string; status: number; body: Record<string, unknown> };

/** `promise`, or `fallback` when it hasn't settled after `ms` (it keeps running; its late answer is ignored). */
export function withDeadline<T, F>(promise: Promise<T>, ms: number, fallback: F): Promise<T | F> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const late = new Promise<F>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

export async function callFunction<T>(supabase: SupabaseClient, name: string, body: object, timeoutMs = 15_000): Promise<Called<T>> {
  // The time limit covers the whole call: supabase-js renews the session before sending, which can stall too.
  const answer = await withDeadline(supabase.functions.invoke<T>(name, { body, timeout: timeoutMs }), timeoutMs + 2_000, null);
  if (!answer) return { ok: false, error: 'network', status: 0, body: {} };
  const { data, error } = answer;
  if (!error && data) return { ok: true, data };
  // supabase-js puts the function's own answer in `context` (a Response) when it isn't 2xx.
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    const answer = (await context.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: false, error: typeof answer.error === 'string' ? answer.error : 'unavailable', status: context.status, body: answer };
  }
  return { ok: false, error: 'network', status: 0, body: {} };
}
