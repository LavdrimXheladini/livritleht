import { expect, type APIRequestContext } from '@playwright/test';

import { JOB_PHOTO_BUCKET, JOB_PHOTO_STAGES } from '@movershub/shared';

// Helpers of the live tests for moves (jobs.spec.ts, job-day.spec.ts): throwaway people, movers, saved
// requests written by the platform (service role), and a clean-up that leaves nothing behind. Needs
// QUOTE_API_URL, QUOTE_API_KEY and SUPABASE_SECRET_KEY.
export const quoteUrl = process.env.QUOTE_API_URL ?? '';
export const key = process.env.QUOTE_API_KEY ?? '';
export const secret = process.env.SUPABASE_SECRET_KEY ?? '';
export const projectUrl = quoteUrl.replace(/\/functions\/v1\/quote$/, '');
export const stepUrl = quoteUrl.replace(/\/quote$/, '/job-transition');
export const accountUrl = quoteUrl.replace(/\/quote$/, '/account');
export const service = () => ({ apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' });
export const PASSWORD = 'movers2027';

export type Person = { id: string; email: string; token: string; headers: Record<string, string> };

/** A confirmed login with a side, signed in. Its id goes into `created` for the clean-up. */
export async function person(request: APIRequestContext, role: 'customer' | 'mover', created: string[]): Promise<Person> {
  const email = `e2e-jobs-${role}-${crypto.randomUUID()}@example.com`;
  const res = await request.post(`${projectUrl}/auth/v1/admin/users`, { headers: service(), data: { email, password: PASSWORD, email_confirm: true } });
  expect(res.ok(), await res.text()).toBe(true);
  const id = ((await res.json()) as { id: string }).id;
  created.push(id);
  expect((await request.patch(`${projectUrl}/rest/v1/profiles?id=eq.${id}`, { headers: service(), data: { role } })).ok()).toBe(true);
  const session = await request.post(`${projectUrl}/auth/v1/token?grant_type=password`, { headers: { apikey: key }, data: { email, password: PASSWORD } });
  expect(session.ok(), await session.text()).toBe(true);
  const token = ((await session.json()) as { access_token: string }).access_token;
  return { id, email, token, headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
}

export async function insert<T>(request: APIRequestContext, table: string, data: object): Promise<T> {
  const res = await request.post(`${projectUrl}/rest/v1/${table}`, { headers: { ...service(), Prefer: 'return=representation' }, data });
  expect(res.ok(), await res.text()).toBe(true);
  return ((await res.json()) as T[])[0]!;
}

export type Mover = { companyId: string; vanId: string; insuranceId: string };

/** What a test made in the cloud, for the clean-up: logins (customers first) and companies. */
export type Made = { customers: string[]; companies: string[]; movers: string[] };
export const nothingMade = (): Made => ({ customers: [], companies: [], movers: [] });

/**
 * A mover's company and van, written by the platform. A test mover is fully quotable in Prishtina —
 * checked company and van, payouts, own prices and terms (free until 48 hours before, then 50 %), a work
 * area, checked insurance — because accepting checks all of that again (20261017120000). A real mover
 * only has a company and an unchecked van.
 */
export async function moverWithVan(request: APIRequestContext, owner: Person, isTest: boolean, made: Made): Promise<Mover> {
  const now = new Date().toISOString();
  const company = await insert<{ id: string }>(request, 'mover_companies', {
    owner_id: owner.id,
    legal_name: `E2E ${isTest ? 'Test' : 'Real'} Movers`,
    country: 'XK',
    is_test: isTest,
    ...(isTest ? { verification_status: 'verified', stripe_onboarding_complete: true, cancel_free_hours: 48, cancel_late_pct: 50 } : {}),
  });
  // Recorded at once: a quotable test company must never stay behind if a later insert fails.
  made.companies.push(company.id);
  const van = await insert<{ id: string }>(request, 'vehicles', {
    company_id: company.id,
    class: 'VAN',
    plate: `E2E-${crypto.randomUUID().slice(0, 6).toUpperCase()}${isTest ? 'T' : 'R'}`,
    max_weight_kg: 2800,
    volume_m3: 6,
    ...(isTest ? { verified_at: now } : {}),
  });
  let insuranceId = '';
  if (isTest) {
    await insert(request, 'rate_cards', { vehicle_id: van.id, currency: 'EUR', base_fee: 2500, per_km: 60, per_labor_minute_1_helper: 28, confirmed_by_mover_at: now });
    await insert(request, 'service_areas', { company_id: company.id, center: 'SRID=4326;POINT(21.1655 42.6629)', radius_km: 90 });
    insuranceId = (
      await insert<{ id: string }>(request, 'mover_documents', {
        company_id: company.id,
        type: 'insurance',
        file_path: `${company.id}/insurance/e2e.pdf`,
        expires_at: new Date(Date.now() + 365 * 86_400_000).toISOString(),
        verified_at: now,
      })
    ).id;
  }
  return { companyId: company.id, vanId: van.id, insuranceId };
}

/** A saved request (QUOTED) with a fresh quote — EUR 50.00, 48 h / 50 % — as `book` writes it; the move in `inHours`. */
export async function savedRequest(request: APIRequestContext, customer: Person, mover: Mover, inHours = 72): Promise<string> {
  const job = await insert<{ id: string }>(request, 'jobs', {
    customer_id: customer.id,
    type: 'SMALL_MOVE',
    vehicle_class: 'VAN',
    helpers: 2,
    scheduled_at: new Date(Date.now() + inHours * 3_600_000).toISOString(),
    pickup_area: 'Prishtina',
    pickup_district: 'Dardania',
    pickup_country: 'XK',
    pickup_label: 'Rr. Agim Ramadani 12, Prishtina',
    pickup_point: 'SRID=4326;POINT(21.1655 42.6629)',
    pickup_details: 'Ring twice',
    pickup_floor: 2,
    pickup_has_lift: true,
    dropoff_area: 'Prizren',
    dropoff_country: 'XK',
    dropoff_label: 'Prizren',
    dropoff_point: 'SRID=4326;POINT(20.7397 42.2139)',
    dropoff_floor: 0,
    dropoff_has_lift: false,
    items: [{ key: 'box', qty: 5, assembly: false }],
    distance_km: 83.2,
    est_labor_min: 40,
    chosen_mover_company_id: mover.companyId,
    chosen_vehicle_id: mover.vanId,
  });
  await insert(request, 'quotes', {
    job_id: job.id,
    vehicle_id: mover.vanId,
    mover_company_id: mover.companyId,
    currency: 'EUR',
    line_items: [{ kind: 'base', amount: 5000 }],
    mover_price: 5000,
    total: 5000,
    take_rate_pct: 20,
    platform_commission: 1000,
    mover_payout: 4000,
    cancel_free_hours: 48,
    cancel_late_pct: 50,
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    mover: { companyId: mover.companyId, name: 'E2E Movers', isBusiness: true },
  });
  return job.id;
}

/**
 * Removes everything a test made (run it from `test.afterEach`, which also runs after a timeout): the
 * photo files of the customers' moves (nothing else removes them), the moves themselves on purpose (an
 * accepted move is a record that only public.erase_jobs deletes), then the customers, the companies and
 * the movers. Every answer is checked: anything left behind in the cloud fails the test.
 */
export async function cleanUp(request: APIRequestContext, made: Made) {
  const failed: string[] = [];
  const check = async (what: string, res: Awaited<ReturnType<APIRequestContext['get']>>) => {
    if (!res.ok()) failed.push(`${what}: ${res.status()} ${(await res.text()).slice(0, 200)}`);
    return res;
  };
  for (const customer of made.customers) {
    const listed = await check('jobs', await request.get(`${projectUrl}/rest/v1/jobs?customer_id=eq.${customer}&select=id`, { headers: service() }));
    const jobs = listed.ok() ? ((await listed.json()) as { id: string }[]) : [];
    const files: string[] = [];
    for (const { id } of jobs) {
      for (const stage of JOB_PHOTO_STAGES) {
        const list = await check('photo list', await request.post(`${projectUrl}/storage/v1/object/list/${JOB_PHOTO_BUCKET}`, { headers: service(), data: { prefix: `${id}/${stage}/`, limit: 100 } }));
        if (list.ok()) for (const f of (await list.json()) as { name: string }[]) files.push(`${id}/${stage}/${f.name}`);
      }
    }
    if (files.length) await check('photo files', await request.delete(`${projectUrl}/storage/v1/object/${JOB_PHOTO_BUCKET}`, { headers: service(), data: { prefixes: files } }));
    if (jobs.length) await check('erase_jobs', await request.post(`${projectUrl}/rest/v1/rpc/erase_jobs`, { headers: service(), data: { p_job_ids: jobs.map((j) => j.id) } }));
    await check(`customer ${customer}`, await request.delete(`${projectUrl}/auth/v1/admin/users/${customer}`, { headers: service() }));
  }
  for (const id of made.companies) await check(`company ${id}`, await request.delete(`${projectUrl}/rest/v1/mover_companies?id=eq.${id}`, { headers: service() }));
  for (const id of made.movers) await check(`mover ${id}`, await request.delete(`${projectUrl}/auth/v1/admin/users/${id}`, { headers: service() }));
  expect(failed, 'left behind in the cloud').toEqual([]);
}
