import { expect, test, type APIRequestContext } from '@playwright/test';

// API tests for the deployed `job-transition` function and the mover's view of their requests
// (design/DECISIONS.md #35; COMPLIANCE §2, §9.1). Live, against the cloud project: a throwaway
// customer, a test mover and a real mover, each with a van, and saved requests written by the platform.
// Needs QUOTE_API_URL, QUOTE_API_KEY and SUPABASE_SECRET_KEY; removes everything afterwards.
const quoteUrl = process.env.QUOTE_API_URL ?? '';
const key = process.env.QUOTE_API_KEY ?? '';
const secret = process.env.SUPABASE_SECRET_KEY ?? '';
const projectUrl = quoteUrl.replace(/\/functions\/v1\/quote$/, '');
const stepUrl = quoteUrl.replace(/\/quote$/, '/job-transition');
const service = () => ({ apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' });
const PASSWORD = 'movers2027';

test.skip(!quoteUrl || !key || !secret, 'set QUOTE_API_URL, QUOTE_API_KEY and SUPABASE_SECRET_KEY to test the deployed functions');

type Person = { id: string; headers: Record<string, string> };

async function person(request: APIRequestContext, role: 'customer' | 'mover', created: string[]): Promise<Person> {
  const email = `e2e-jobs-${role}-${crypto.randomUUID()}@example.com`;
  const res = await request.post(`${projectUrl}/auth/v1/admin/users`, { headers: service(), data: { email, password: PASSWORD, email_confirm: true } });
  expect(res.ok(), await res.text()).toBe(true);
  const id = ((await res.json()) as { id: string }).id;
  created.push(id);
  expect((await request.patch(`${projectUrl}/rest/v1/profiles?id=eq.${id}`, { headers: service(), data: { role } })).ok()).toBe(true);
  const session = await request.post(`${projectUrl}/auth/v1/token?grant_type=password`, { headers: { apikey: key }, data: { email, password: PASSWORD } });
  expect(session.ok(), await session.text()).toBe(true);
  const token = ((await session.json()) as { access_token: string }).access_token;
  return { id, headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
}

async function insert<T>(request: APIRequestContext, table: string, data: object): Promise<T> {
  const res = await request.post(`${projectUrl}/rest/v1/${table}`, { headers: { ...service(), Prefer: 'return=representation' }, data });
  expect(res.ok(), await res.text()).toBe(true);
  return ((await res.json()) as T[])[0]!;
}

/**
 * A mover's company and van, written by the platform. A test mover is fully quotable in Prishtina —
 * checked company and van, payouts, own prices and terms, a work area, checked insurance — because
 * accepting checks all of that again (20261017120000).
 */
async function moverWithVan(request: APIRequestContext, owner: Person, isTest: boolean) {
  const now = new Date().toISOString();
  const company = await insert<{ id: string }>(request, 'mover_companies', {
    owner_id: owner.id,
    legal_name: `E2E ${isTest ? 'Test' : 'Real'} Movers`,
    country: 'XK',
    is_test: isTest,
    ...(isTest ? { verification_status: 'verified', stripe_onboarding_complete: true, cancel_free_hours: 48, cancel_late_pct: 50 } : {}),
  });
  const van = await insert<{ id: string }>(request, 'vehicles', {
    company_id: company.id,
    class: 'VAN',
    plate: `E2E-${Date.now() % 100000}${isTest ? 'T' : 'R'}`,
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

/** A saved request (QUOTED) with a fresh quote, as `book` writes it. */
async function savedRequest(request: APIRequestContext, customer: Person, mover: { companyId: string; vanId: string }) {
  const job = await insert<{ id: string }>(request, 'jobs', {
    customer_id: customer.id,
    type: 'SMALL_MOVE',
    vehicle_class: 'VAN',
    helpers: 2,
    scheduled_at: new Date(Date.now() + 3 * 86_400_000).toISOString(),
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

test('book (test movers only), the mover sees the area, accepts and then sees the address; declining, cancelling', async ({ request }) => {
  test.setTimeout(120_000);
  const created: string[] = [];
  const companies: string[] = [];
  try {
    const customer = await person(request, 'customer', created);
    const testMover = await person(request, 'mover', created);
    const realMover = await person(request, 'mover', created);
    const testCo = await moverWithVan(request, testMover, true);
    const realCo = await moverWithVan(request, realMover, false);
    companies.push(testCo.companyId, realCo.companyId);
    const step = (who: Person, data: object) => request.post(stepUrl, { headers: who.headers, data });
    const myJobs = async (who: Person) =>
      (await (await request.post(`${projectUrl}/rest/v1/rpc/my_mover_jobs`, { headers: who.headers, data: {} })).json()) as {
        offer_id: string;
        pickup_area: string;
        pickup_label: string | null;
        pickup_details: string | null;
      }[];

    // A real mover is booked with a card (Stripe, next) — never as a test.
    const withReal = await savedRequest(request, customer, realCo);
    const refused = await step(customer, { action: 'book_test', jobId: withReal });
    expect(refused.status()).toBe(409);
    expect((await refused.json()).error).toBe('card_required');
    // Movers don't book; nobody books someone else's request.
    expect((await step(testMover, { action: 'book_test', jobId: withReal })).status()).toBe(403);

    // A test mover: booked, sent to that mover only.
    const withTest = await savedRequest(request, customer, testCo);
    const booked = await step(customer, { action: 'book_test', jobId: withTest });
    expect(booked.status(), await booked.text()).toBe(200);
    const { offerId } = (await booked.json()) as { offerId: string };
    expect(await myJobs(realMover)).toEqual([]);
    const [offered] = await myJobs(testMover);
    expect(offered).toMatchObject({ offer_id: offerId, pickup_area: 'Prishtina', pickup_label: null, pickup_details: null });

    // Only the mover it went to answers; accepted, the exact place.
    expect((await step(realMover, { action: 'accept', offerId })).status()).toBe(404);
    const accepted = await step(testMover, { action: 'accept', offerId });
    expect(await accepted.json()).toEqual({ status: 'ACCEPTED' });
    const [mine] = await myJobs(testMover);
    expect(mine).toMatchObject({ pickup_label: 'Rr. Agim Ramadani 12, Prishtina', pickup_details: 'Ring twice' });
    // Once accepted, cancelling follows the mover's terms (build step 6).
    expect((await (await step(customer, { action: 'cancel', jobId: withTest })).json()).error).toBe('not_cancellable');

    // Accepting checks the mover again for the move day (COMPLIANCE §5): insurance nobody has
    // checked any more → not accepted, and the request stays open.
    const checked = await savedRequest(request, customer, testCo);
    const third = (await (await step(customer, { action: 'book_test', jobId: checked })).json()) as { offerId: string };
    const insurance = `${projectUrl}/rest/v1/mover_documents?id=eq.${testCo.insuranceId}`;
    expect((await request.patch(insurance, { headers: service(), data: { verified_at: null } })).ok()).toBe(true);
    const notEligible = await step(testMover, { action: 'accept', offerId: third.offerId });
    expect(notEligible.status()).toBe(409);
    expect((await notEligible.json()).error).toBe('not_eligible');
    expect((await request.patch(insurance, { headers: service(), data: { verified_at: new Date().toISOString() } })).ok()).toBe(true);
    expect(await (await step(testMover, { action: 'decline', offerId: third.offerId })).json()).toEqual({ status: 'QUOTED' });

    // Declined: back to the customer, who cancels it for free.
    const another = await savedRequest(request, customer, testCo);
    const second = (await (await step(customer, { action: 'book_test', jobId: another })).json()) as { offerId: string };
    expect(await (await step(testMover, { action: 'decline', offerId: second.offerId })).json()).toEqual({ status: 'QUOTED' });
    expect(await (await step(customer, { action: 'cancel', jobId: another })).json()).toEqual({ status: 'CANCELLED' });
    const events = (await (await request.get(`${projectUrl}/rest/v1/job_events?job_id=eq.${another}&select=event&order=id`, { headers: customer.headers })).json()) as { event: string }[];
    expect(events.map((e) => e.event)).toEqual(['booked', 'offered', 'declined', 'cancelled']);
  } finally {
    // The customer first (their requests go with them), then the companies, then the movers.
    if (created[0]) await request.delete(`${projectUrl}/auth/v1/admin/users/${created[0]}`, { headers: service() });
    for (const id of companies) await request.delete(`${projectUrl}/rest/v1/mover_companies?id=eq.${id}`, { headers: service() });
    for (const id of created.slice(1)) await request.delete(`${projectUrl}/auth/v1/admin/users/${id}`, { headers: service() });
  }
});
