// Writes by the server functions with the service role (tables the app may only read, e.g.
// phone_verifications, company_registry_checks). The key never leaves the server.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** POST rows to a table through PostgREST; `upsertOn` = the conflict columns of an upsert. Throws on failure. */
export async function insertRows(table: string, rows: Record<string, unknown>[], upsertOn?: string): Promise<void> {
  const query = upsertOn ? `?on_conflict=${encodeURIComponent(upsertOn)}` : '';
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}${query}`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: upsertOn ? 'resolution=merge-duplicates,return=minimal' : 'return=minimal',
    },
    body: JSON.stringify(rows),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`insert into ${table}: ${res.status} ${await res.text()}`);
}

/**
 * A PostgREST request as the service role that returns rows (`Prefer: return=representation` for
 * writes): GET to read, POST to insert, PATCH to update, DELETE to delete. `path` is the table and its query, e.g.
 * `jobs?id=eq.…`. Throws on failure.
 */
export async function serviceRows<T>(method: 'GET' | 'POST' | 'PATCH' | 'DELETE', path: string, body?: unknown): Promise<T[]> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      ...(method === 'GET' ? {} : { Prefer: 'return=representation' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`${method} ${path.split('?')[0]}: ${res.status} ${await res.text()}`);
  return (await res.json()) as T[];
}

/** A Postgres function refused the call: its message (e.g. `quote_expired`) and SQLSTATE code. */
export class RpcError extends Error {
  constructor(
    readonly fn: string,
    readonly status: number,
    readonly reason: string,
    readonly code: string,
  ) {
    super(`rpc ${fn}: ${status} ${code} ${reason}`);
  }
}

/** Calls a Postgres function through PostgREST as the service role; returns its result. Throws `RpcError` on failure. */
export async function serviceRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) {
    const text = await res.text();
    let body: { message?: string; code?: string } = {};
    try {
      body = JSON.parse(text) as typeof body;
    } catch {
      // not JSON: keep the text
    }
    throw new RpcError(fn, res.status, body.message ?? text, body.code ?? '');
  }
  return (await res.json()) as T;
}
