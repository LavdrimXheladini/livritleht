import { expect, test, type APIRequestContext } from '@playwright/test';

// API tests for the deployed `company-registry` and `phone-verification` functions ("Your company",
// design/DECISIONS.md #19). Skipped unless:
//   QUOTE_API_URL=https://<ref>.supabase.co/functions/v1/quote QUOTE_API_KEY=<publishable key> pnpm e2e
// The signed-in tests also need SUPABASE_SECRET_KEY (they create test users and delete them afterwards)
// and ask the real registers (VIES, the Polish VAT white list). The phone tests use a test number from the
// project secret PHONE_TEST_NUMBERS: +38344000001 with code 123456. PHONE_CODES_LIVE=1 when Twilio is
// set up (then other numbers get real codes, and that test is skipped).
const quoteUrl = process.env.QUOTE_API_URL ?? '';
const key = process.env.QUOTE_API_KEY ?? '';
const secret = process.env.SUPABASE_SECRET_KEY ?? '';
const registryUrl = quoteUrl.replace(/\/quote$/, '/company-registry');
const phoneUrl = quoteUrl.replace(/\/quote$/, '/phone-verification');
const projectUrl = quoteUrl.replace(/\/functions\/v1\/quote$/, '');
const TEST_PHONE = '+38344000001';
test.skip(!quoteUrl || !key, 'set QUOTE_API_URL and QUOTE_API_KEY to test the deployed functions');
// The registers are public services, now and then slow: one retry.
test.describe.configure({ retries: 1 });

test('both answer signed-in users only', async ({ request }) => {
  for (const [url, data] of [
    [registryUrl, { country: 'PL', isBusiness: true, taxId: '7740001454', legalName: 'Orlen' }],
    [phoneUrl, { action: 'send', phone: TEST_PHONE, channel: 'sms', locale: 'en' }],
  ] as const) {
    const res = await request.post(url, { headers: { apikey: key, Authorization: `Bearer ${key}` }, data });
    expect(res.status()).toBe(401);
    expect((await res.json()).error).toBe('sign_in_required');
  }
});

test.describe('signed in', () => {
  test.skip(!secret, 'set SUPABASE_SECRET_KEY to create signed-in test users');
  const created: string[] = [];
  let token = '';
  let userId = '';

  test.beforeAll(async ({ playwright }) => {
    ({ token, userId } = await signedInUser(await playwright.request.newContext(), created));
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

  const asUser = () => ({ apikey: key, Authorization: `Bearer ${token}` });
  const registry = (request: APIRequestContext, data: object) => request.post(registryUrl, { headers: asUser(), data });
  /** What the server kept (service role), newest first. */
  const kept = async (request: APIRequestContext, table: string, order: string) => {
    const res = await request.get(`${projectUrl}/rest/v1/${table}?user_id=eq.${userId}&order=${order}.desc`, { headers: serviceRest() });
    expect(res.ok(), await res.text()).toBe(true);
    return (await res.json()) as Record<string, unknown>[];
  };

  test('company-registry: a number that fits no format of the country is refused; Kosovo is checked by hand', async ({ request }) => {
    const wrong = await registry(request, { country: 'PL', isBusiness: true, taxId: '7740001455', legalName: 'Orlen' });
    expect(wrong.status()).toBe(400);
    expect((await wrong.json()).error).toBe('invalid_number');
    const kosovo = await registry(request, { country: 'XK', isBusiness: true, taxId: '601234567', legalName: 'Lëvizje Shpk' });
    expect(await kosovo.json()).toEqual({ result: 'manual' });
  });

  test("company-registry: the register's name for a Polish NIP is compared with the typed one, and kept", async ({ request }) => {
    const match = await registry(request, { country: 'PL', isBusiness: true, taxId: 'PL 774-000-14-54', legalName: 'Orlen' });
    expect(match.ok(), await match.text()).toBe(true);
    expect(await match.json()).toMatchObject({ result: 'match', registeredName: expect.stringMatching(/ORLEN/), authoritative: false });

    const other = await registry(request, { country: 'PL', isBusiness: true, taxId: '7740001454', legalName: 'Lëvizje Shpk' });
    expect(await other.json()).toMatchObject({ result: 'mismatch', registeredName: expect.stringMatching(/ORLEN/) });

    const rows = await kept(request, 'company_registry_checks', 'checked_at');
    expect(rows.slice(0, 2)).toEqual([
      expect.objectContaining({ country: 'PL', tax_id: '7740001454', result: 'mismatch', typed_name: 'Lëvizje Shpk' }),
      expect.objectContaining({ country: 'PL', tax_id: '7740001454', result: 'match', typed_name: 'Orlen' }),
    ]);
  });

  test('company-registry: an EU VAT number VIES does not know is "not found", and that counts (authoritative)', async ({ request }) => {
    // ATU13585627: a well-formed example number (check digit right) that no company holds.
    const res = await registry(request, { country: 'AT', isBusiness: true, taxId: 'ATU13585627', legalName: 'Umzüge Berger' });
    expect(await res.json()).toMatchObject({ result: 'not_found', register: 'vies', authoritative: true });
  });

  test('phone-verification: a test number takes its fixed code; a wrong code does not confirm', async ({ request }) => {
    const call = (data: object) => request.post(phoneUrl, { headers: asUser(), data });
    expect(await (await call({ action: 'send', phone: '+383 44 000 001', channel: 'whatsapp', locale: 'sq' })).json()).toEqual({ status: 'sent' });
    expect(await (await call({ action: 'check', phone: TEST_PHONE, code: '654321' })).json()).toEqual({ status: 'wrong_code' });
    expect(await kept(request, 'phone_verifications', 'verified_at')).toEqual([]);
    expect(await (await call({ action: 'check', phone: TEST_PHONE, code: '123456' })).json()).toEqual({ status: 'approved' });
    expect(await kept(request, 'phone_verifications', 'verified_at')).toEqual([expect.objectContaining({ phone: TEST_PHONE, channel: 'test' })]);
  });

  test('phone-verification: without Twilio, other numbers get no code', async ({ request }) => {
    test.skip(Boolean(process.env.PHONE_CODES_LIVE), 'Twilio is set up: other numbers would get a real (paid) code');
    const res = await request.post(phoneUrl, { headers: asUser(), data: { action: 'send', phone: '+38344999888', channel: 'sms', locale: 'en' } });
    expect(res.status()).toBe(503);
    expect((await res.json()).error).toBe('codes_unavailable');
  });

  test('both refuse unexpected input', async ({ request }) => {
    for (const [url, data] of [
      [registryUrl, { country: 'PT', isBusiness: true, taxId: '123456789', legalName: 'Mudanças' }],
      [registryUrl, { country: 'PL', isBusiness: true, taxId: '7740001454', legalName: 'Orlen', extra: 1 }],
      [phoneUrl, { action: 'send', phone: '044000001', channel: 'sms', locale: 'en' }],
      [phoneUrl, { action: 'send', phone: TEST_PHONE, channel: 'pigeon', locale: 'en' }],
      [phoneUrl, { action: 'check', phone: TEST_PHONE, code: 'abc' }],
    ] as const) {
      const res = await request.post(url, { headers: asUser(), data });
      expect(res.status(), JSON.stringify(data)).toBe(400);
    }
  });
});

/** Admin headers for the Auth API: a secret key goes in `apikey`; a legacy service-role JWT also as Bearer. */
function admin(): Record<string, string> {
  return secret.startsWith('eyJ') ? { apikey: secret, Authorization: `Bearer ${secret}` } : { apikey: secret };
}

/** Reading tables as the service role (the tables the functions write). */
function serviceRest(): Record<string, string> {
  return { apikey: secret, Authorization: `Bearer ${secret}` };
}

/** A confirmed test user (a one-time email code from the Auth admin API, no email sent). */
async function signedInUser(api: APIRequestContext, created: string[]): Promise<{ token: string; userId: string }> {
  const email = `e2e-company-${crypto.randomUUID()}@example.com`;
  const res = await api.post(`${projectUrl}/auth/v1/admin/users`, { headers: admin(), data: { email, email_confirm: true } });
  expect(res.ok(), await res.text()).toBe(true);
  const userId = ((await res.json()) as { id: string }).id;
  created.push(userId);
  const link = await api.post(`${projectUrl}/auth/v1/admin/generate_link`, { headers: admin(), data: { type: 'magiclink', email } });
  expect(link.ok(), await link.text()).toBe(true);
  const { email_otp: code } = (await link.json()) as { email_otp: string };
  const verified = await api.post(`${projectUrl}/auth/v1/verify`, { headers: { apikey: key }, data: { type: 'magiclink', email, token: code } });
  expect(verified.ok(), await verified.text()).toBe(true);
  return { token: ((await verified.json()) as { access_token: string }).access_token, userId };
}
