import { expect, test, type APIRequestContext } from '@playwright/test';

// API tests for the deployed `account` function (design/DECISIONS.md #31; COMPLIANCE §9: download and
// delete one's data). Skipped unless QUOTE_API_URL and QUOTE_API_KEY are set; the signed-in tests also
// need SUPABASE_SECRET_KEY (they create accounts with data, delete them through the function, and check
// that nothing is left — removing anything a failed run leaves behind).
const quoteUrl = process.env.QUOTE_API_URL ?? '';
const key = process.env.QUOTE_API_KEY ?? '';
const secret = process.env.SUPABASE_SECRET_KEY ?? '';
const accountUrl = quoteUrl.replace(/\/quote$/, '/account');
const projectUrl = quoteUrl.replace(/\/functions\/v1\/quote$/, '');
const PASSWORD = 'movers2027';
test.skip(!quoteUrl || !key, 'set QUOTE_API_URL and QUOTE_API_KEY to test the deployed functions');

const service = () => ({ apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' });

test('answers signed-in users only', async ({ request }) => {
  const res = await request.post(accountUrl, { headers: { apikey: key, Authorization: `Bearer ${key}` }, data: { action: 'export' } });
  expect(res.status()).toBe(401);
});

test.describe('signed in', () => {
  test.skip(!secret, 'set SUPABASE_SECRET_KEY to create signed-in test users');
  const created: string[] = [];

  test.afterAll(async ({ playwright }) => {
    // Anything a failed run left: the company first (its owner can't go before it), then the login.
    const api = await playwright.request.newContext();
    for (const id of created.splice(0)) {
      await api.delete(`${projectUrl}/rest/v1/mover_companies?owner_id=eq.${id}`, { headers: service() });
      await api.delete(`${projectUrl}/auth/v1/admin/users/${id}`, { headers: service() });
    }
  });

  async function account(request: APIRequestContext, role: 'customer' | 'mover') {
    const email = `e2e-account-${role}-${crypto.randomUUID()}@example.com`;
    const res = await request.post(`${projectUrl}/auth/v1/admin/users`, { headers: service(), data: { email, password: PASSWORD, email_confirm: true } });
    expect(res.ok(), await res.text()).toBe(true);
    const id = ((await res.json()) as { id: string }).id;
    created.push(id);
    expect((await request.patch(`${projectUrl}/rest/v1/profiles?id=eq.${id}`, { headers: service(), data: { role } })).ok()).toBe(true);
    const session = await request.post(`${projectUrl}/auth/v1/token?grant_type=password`, { headers: { apikey: key }, data: { email, password: PASSWORD } });
    expect(session.ok(), await session.text()).toBe(true);
    const token = ((await session.json()) as { access_token: string }).access_token;
    return { id, email, call: (data: object) => request.post(accountUrl, { headers: { apikey: key, Authorization: `Bearer ${token}` }, data }) };
  }

  const rows = async (request: APIRequestContext, path: string) => {
    const res = await request.get(`${projectUrl}/rest/v1/${path}`, { headers: service() });
    expect(res.ok(), await res.text()).toBe(true);
    return (await res.json()) as unknown[];
  };

  test('a mover: the export holds the company and a link to each document; deleting removes it all, files too', async ({ request }) => {
    const mover = await account(request, 'mover');
    // A company with a van, prices, a work area and an uploaded document (written by the platform).
    const company = (await (
      await request.post(`${projectUrl}/rest/v1/mover_companies`, {
        headers: { ...service(), Prefer: 'return=representation' },
        data: { owner_id: mover.id, legal_name: 'E2E Leaving Movers', country: 'XK' },
      })
    ).json()) as { id: string }[];
    const companyId = company[0]!.id;
    const van = (await (
      await request.post(`${projectUrl}/rest/v1/vehicles`, {
        headers: { ...service(), Prefer: 'return=representation' },
        data: { company_id: companyId, class: 'VAN', plate: `E2E-${Date.now() % 100000}`, max_weight_kg: 2800, volume_m3: 6 },
      })
    ).json()) as { id: string }[];
    await request.post(`${projectUrl}/rest/v1/rate_cards`, { headers: service(), data: { vehicle_id: van[0]!.id, currency: 'EUR', base_fee: 2500, per_km: 60, per_labor_minute_1_helper: 28 } });
    await request.post(`${projectUrl}/rest/v1/service_areas`, { headers: service(), data: { company_id: companyId, center: 'SRID=4326;POINT(21.1655 42.6629)', radius_km: 30 } });
    const path = `${companyId}/insurance/policy.pdf`;
    const upload = await request.post(`${projectUrl}/storage/v1/object/mover-documents/${path}`, {
      headers: { apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/pdf' },
      data: Buffer.from('%PDF-1.4 e2e'),
    });
    expect(upload.ok(), await upload.text()).toBe(true);
    await request.post(`${projectUrl}/rest/v1/mover_documents`, {
      headers: service(),
      data: { company_id: companyId, type: 'insurance', file_path: path, expires_at: new Date(Date.now() + 365 * 86_400_000).toISOString() },
    });

    const exported = await mover.call({ action: 'export' });
    expect(exported.ok(), await exported.text()).toBe(true);
    const data = (await exported.json()) as {
      account: { email: string };
      moverCompany: { legal_name: string };
      documents: { type: string; downloadUrl: string | null }[];
      vehicles: { rate_cards: { base_fee: number } | null }[];
      serviceAreas: unknown[];
    };
    expect(data.account.email).toBe(mover.email);
    expect(data.moverCompany.legal_name).toBe('E2E Leaving Movers');
    // One price card per van (embedded as an object).
    expect(data.vehicles[0]!.rate_cards).toMatchObject({ base_fee: 2500 });
    expect(data.serviceAreas).toHaveLength(1);
    expect(data.documents[0]!.type).toBe('insurance');
    // The file itself, through the link in the export.
    expect((await request.get(data.documents[0]!.downloadUrl!)).ok()).toBe(true);

    const wrong = await mover.call({ action: 'delete', password: 'not-the-password-1' });
    expect(wrong.status()).toBe(400);
    expect((await wrong.json()).error).toBe('wrong_password');

    const deleted = await mover.call({ action: 'delete', password: PASSWORD });
    expect(deleted.ok(), await deleted.text()).toBe(true);
    expect(await rows(request, `mover_companies?id=eq.${companyId}&select=id`)).toEqual([]);
    expect(await rows(request, `vehicles?company_id=eq.${companyId}&select=id`)).toEqual([]);
    expect(await rows(request, `profiles?id=eq.${mover.id}&select=id`)).toEqual([]);
    expect((await request.get(`${projectUrl}/auth/v1/admin/users/${mover.id}`, { headers: service() })).status()).toBe(404);
    const file = await request.get(`${projectUrl}/storage/v1/object/mover-documents/${path}`, { headers: { apikey: secret, Authorization: `Bearer ${secret}` } });
    expect(file.ok()).toBe(false);
  });

  test('a customer: deleting takes the account and its saved requests; an admin account is the platform\'s', async ({ request }) => {
    const customer = await account(request, 'customer');
    const deleted = await customer.call({ action: 'delete', password: PASSWORD });
    expect(deleted.ok(), await deleted.text()).toBe(true);
    expect(await rows(request, `profiles?id=eq.${customer.id}&select=id`)).toEqual([]);

    const admin = await account(request, 'customer');
    await request.patch(`${projectUrl}/rest/v1/profiles?id=eq.${admin.id}`, { headers: service(), data: { role: 'admin' } });
    const refused = await admin.call({ action: 'delete', password: PASSWORD });
    expect(refused.status()).toBe(403);
  });
});
