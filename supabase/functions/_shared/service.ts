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
