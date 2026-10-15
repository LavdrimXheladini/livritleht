import { expect, test, type APIRequestContext } from '@playwright/test';

import { JOB_COLUMNS, jobRowSchema } from '@movershub/shared';

// API tests for the deployed `book` function (design/DECISIONS.md #26). Skipped unless:
//   QUOTE_API_URL=https://<ref>.supabase.co/functions/v1/quote QUOTE_API_KEY=<publishable key> pnpm e2e
// The signed-in tests also need SUPABASE_SECRET_KEY: they create a customer and a mover account and
// delete them afterwards (their booking requests go with them). Uses the test movers (Prishtina → Prizren).
const quoteUrl = process.env.QUOTE_API_URL ?? '';
const key = process.env.QUOTE_API_KEY ?? '';
const secret = process.env.SUPABASE_SECRET_KEY ?? '';
const bookUrl = quoteUrl.replace(/\/quote$/, '/book');
const projectUrl = quoteUrl.replace(/\/functions\/v1\/quote$/, '');
test.skip(!quoteUrl || !key, 'set QUOTE_API_URL and QUOTE_API_KEY to test the deployed functions');

const prishtina = { label: 'Prishtina', area: 'Prishtina', lat: 42.6629, lon: 21.1655, countryCode: 'XK' };
const prizren = { label: 'Rruga Remzi Ademaj 5, Prizren', area: 'Prizren', lat: 42.2093, lon: 20.7415, countryCode: 'XK' };
const items = [
  { key: 'sofa3', qty: 1, assembly: false },
  { key: 'box', qty: 10, assembly: false },
];
/** Two days ahead, 09:00 UTC: inside the bookable window, documents checked for that day. */
const scheduledAt = (() => {
  const d = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  d.setUTCHours(9, 0, 0, 0);
  return d.toISOString();
})();
const move = {
  pickup: { place: prishtina, street: null, houseNumber: null, floor: 2, hasLift: false, details: 'Block B, entrance 2' },
  dropoff: { place: prizren, street: 'Rruga Remzi Ademaj', houseNumber: '5', floor: 0, hasLift: null, details: '' },
  items,
  helpers: 2,
  scheduledAt,
  vehicleClass: 'VAN',
};

type Offer = { vehicleId: string; companyName: string; quote: { moverPrice: number; total: number } };

test('answers signed-in users only', async ({ request }) => {
  const res = await request.post(bookUrl, { headers: { apikey: key, Authorization: `Bearer ${key}` }, data: { ...move, vehicleId: crypto.randomUUID() } });
  expect(res.status()).toBe(401);
  expect((await res.json()).error).toBe('sign_in_required');
});

test.describe('signed in', () => {
  test.skip(!secret, 'set SUPABASE_SECRET_KEY to create signed-in test users');
  const created: string[] = [];
  let customer = { token: '', userId: '' };
  let mover = { token: '', userId: '' };
  let offer: Offer;

  test.beforeAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    customer = await signedInUser(api, created, 'customer');
    mover = await signedInUser(api, created, 'mover');
    // The quote the customer saw: the cheapest van mover for this move.
    const quote = await api.post(quoteUrl, {
      headers: { apikey: key },
      data: { pickup: prishtina, dropoff: prizren, pickupStop: { floor: 2, hasLift: false }, dropoffStop: { floor: 0, hasLift: false }, helpers: 2, items, vehicleClass: 'VAN', scheduledAt },
    });
    expect(quote.ok(), await quote.text()).toBe(true);
    offer = ((await quote.json()) as { classes: { offers: Offer[] }[] }).classes[0]!.offers[0]!;
  });

  test.afterAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    const failed: string[] = [];
    for (const id of created.splice(0)) {
      const res = await api.delete(`${projectUrl}/auth/v1/admin/users/${id}`, { headers: admin() });
      if (!res.ok()) failed.push(`${id}: ${res.status()} ${await res.text()}`);
    }
    expect(failed, 'test users left behind').toEqual([]);
  });

  const book = (request: APIRequestContext, token: string, data: object) =>
    request.post(bookUrl, { headers: { apikey: key, Authorization: `Bearer ${token}` }, data });

  test('prices the chosen van again — the price the customer saw — and saves the request (COMPLIANCE §1.1, §13)', async ({ request }) => {
    const res = await book(request, customer.token, { ...move, vehicleId: offer.vehicleId });
    expect(res.status(), await res.text()).toBe(200);
    const answer = (await res.json()) as {
      jobId: string;
      quote: { moverPrice: number; expiresAt: string };
      mover: { name: string; isBusiness: boolean; registrationNo: string | null; cancellation: { freeHours: number; latePct: number } };
    };
    expect(answer.quote.moverPrice).toBe(offer.quote.moverPrice);
    // Who the contract is with (COMPLIANCE §4), and their terms (§8).
    expect(answer.mover).toMatchObject({ name: offer.companyName, isBusiness: true, cancellation: { freeHours: 24, latePct: 50 } });
    expect(answer.mover.registrationNo).toMatch(/^TEST-/);
    expect(Date.parse(answer.quote.expiresAt) - Date.now()).toBeGreaterThan(10 * 60 * 1000);

    // Saved for the customer, not booked; the directions kept for the mover who accepts.
    const [job] = await serviceGet(request, `jobs?id=eq.${answer.jobId}&select=customer_id,status,pickup_details,dropoff_house_number,chosen_vehicle_id`);
    expect(job).toEqual({
      customer_id: customer.userId,
      status: 'QUOTED',
      pickup_details: 'Block B, entrance 2',
      dropoff_house_number: '5',
      chosen_vehicle_id: offer.vehicleId,
    });

    // Asked again with the saved request: the same job, a new quote.
    const again = await book(request, customer.token, { ...move, vehicleId: offer.vehicleId, jobId: answer.jobId });
    expect(((await again.json()) as { jobId: string }).jobId).toBe(answer.jobId);
    const quotes = await serviceGet(request, `quotes?job_id=eq.${answer.jobId}&select=mover_price`);
    expect(quotes).toEqual([{ mover_price: offer.quote.moverPrice }, { mover_price: offer.quote.moverPrice }]);

    // The customer reads their own request (RLS) as "My moves" does: the coordinates and the latest
    // quote, with the mover as they saw them (COMPLIANCE §4) — the company record itself stays private.
    const own = await request.get(
      `${projectUrl}/rest/v1/jobs?select=${encodeURIComponent(JOB_COLUMNS)}&order=created_at.desc&quotes.order=created_at.desc&quotes.limit=1`,
      { headers: { apikey: key, Authorization: `Bearer ${customer.token}` } },
    );
    expect(own.ok(), await own.text()).toBe(true);
    const [mine, ...others] = jobRowSchema.array().parse(await own.json());
    expect(others).toEqual([]);
    expect(mine).toMatchObject({ id: answer.jobId, pickup_lat: prishtina.lat, pickup_lon: prishtina.lon, dropoff_lat: prizren.lat });
    expect(mine!.quotes).toHaveLength(1);
    expect(mine!.quotes[0]!.mover).toMatchObject({ name: offer.companyName, cancellation: { freeHours: 24, latePct: 50 } });
    const company = await request.get(`${projectUrl}/rest/v1/mover_companies?select=id`, { headers: { apikey: key, Authorization: `Bearer ${customer.token}` } });
    expect(await company.json()).toEqual([]);
  });

  test('never takes a price from the client', async ({ request }) => {
    for (const extra of [{ moverPrice: 1 }, { total: 1 }, { quote: { moverPrice: 1 } }]) {
      const res = await book(request, customer.token, { ...move, vehicleId: offer.vehicleId, ...extra });
      expect(res.status()).toBe(400);
      expect((await res.json()).error).toBe('invalid_request');
    }
  });

  test('a van not offered for this move is refused', async ({ request }) => {
    const res = await book(request, customer.token, { ...move, vehicleId: crypto.randomUUID() });
    expect(res.status()).toBe(409);
    expect((await res.json()).error).toBe('mover_unavailable');
  });

  test('the mover side does not book', async ({ request }) => {
    const res = await book(request, mover.token, { ...move, vehicleId: offer.vehicleId });
    expect(res.status()).toBe(403);
    expect((await res.json()).error).toBe('customers_only');
  });
});

function admin(): Record<string, string> {
  return secret.startsWith('eyJ') ? { apikey: secret, Authorization: `Bearer ${secret}` } : { apikey: secret };
}

async function serviceGet(request: APIRequestContext, path: string): Promise<Record<string, unknown>[]> {
  const res = await request.get(`${projectUrl}/rest/v1/${path}`, { headers: { apikey: secret, Authorization: `Bearer ${secret}` } });
  expect(res.ok(), await res.text()).toBe(true);
  return (await res.json()) as Record<string, unknown>[];
}

/** A confirmed test user with a role (a one-time email code from the Auth admin API, no email sent). */
async function signedInUser(api: APIRequestContext, created: string[], role: 'customer' | 'mover'): Promise<{ token: string; userId: string }> {
  const email = `e2e-book-${role}-${crypto.randomUUID()}@example.com`;
  const res = await api.post(`${projectUrl}/auth/v1/admin/users`, { headers: admin(), data: { email, email_confirm: true } });
  expect(res.ok(), await res.text()).toBe(true);
  const userId = ((await res.json()) as { id: string }).id;
  created.push(userId);
  const profile = await api.patch(`${projectUrl}/rest/v1/profiles?id=eq.${userId}`, {
    headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    data: { role },
  });
  expect(profile.ok(), await profile.text()).toBe(true);
  const link = await api.post(`${projectUrl}/auth/v1/admin/generate_link`, { headers: admin(), data: { type: 'magiclink', email } });
  expect(link.ok(), await link.text()).toBe(true);
  const { email_otp: code } = (await link.json()) as { email_otp: string };
  const verified = await api.post(`${projectUrl}/auth/v1/verify`, { headers: { apikey: key }, data: { type: 'magiclink', email, token: code } });
  expect(verified.ok(), await verified.text()).toBe(true);
  return { token: ((await verified.json()) as { access_token: string }).access_token, userId };
}
