import { expect, test, type APIRequestContext, type APIResponse } from '@playwright/test';

// API tests for the deployed `places` edge function (address search for the signed-in app). Skipped unless:
//   QUOTE_API_URL=https://<ref>.supabase.co/functions/v1/quote QUOTE_API_KEY=<publishable key> pnpm e2e
// (the places URL is derived from the quote URL). The searches need a signed-in user: with
// SUPABASE_SECRET_KEY=<the project's secret key> the tests create test users (and delete them afterwards).
// The formatter itself is unit-tested in packages/shared.
const quoteUrl = process.env.QUOTE_API_URL ?? '';
const key = process.env.QUOTE_API_KEY ?? '';
const secret = process.env.SUPABASE_SECRET_KEY ?? '';
const url = quoteUrl.replace(/\/quote$/, '/places');
const projectUrl = quoteUrl.replace(/\/functions\/v1\/quote$/, '');
test.skip(!quoteUrl || !key, 'set QUOTE_API_URL and QUOTE_API_KEY to test the deployed places function');
// Photon is a free public service and now and then slower than the function's 5 s limit: one retry.
test.describe.configure({ retries: 1 });

type Suggestion = { id: string; label: string; area: string; district?: string; lat: number; lon: number; countryCode: string };

const b64url = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');

test('needs a signed-in user: visitors, the bare app key and forged tokens get 401', async ({ request }) => {
  const forged = `${b64url({ alg: 'ES256', typ: 'JWT' })}.${b64url({ sub: crypto.randomUUID(), role: 'authenticated', exp: Math.floor(Date.now() / 1000) + 3600 })}.Zm9yZ2Vk`;
  for (const authorization of [undefined, `Bearer ${key}`, `Bearer ${forged}`]) {
    const res = await request.post(url, {
      headers: { apikey: key, ...(authorization ? { Authorization: authorization } : {}) },
      data: { q: 'Prishtina', locale: 'en' },
    });
    expect(res.status()).toBe(401);
    expect((await res.json()).error).toBe('sign_in_required');
  }
});

test.describe('signed in', () => {
  test.skip(!secret, 'set SUPABASE_SECRET_KEY to create signed-in test users');
  /** Every test user made in this worker: deleted afterwards, also when signing it in failed. */
  const created: string[] = [];
  let token = '';

  test.beforeAll(async ({ playwright }) => {
    token = await signedInUser(await playwright.request.newContext(), created);
  });

  test.afterAll(async ({ playwright }) => {
    const api = await playwright.request.newContext();
    // Every one is tried before anything is reported, so one failed delete leaves no others behind.
    const failed: string[] = [];
    for (const id of created.splice(0)) {
      try {
        const res = await api.delete(`${projectUrl}/auth/v1/admin/users/${id}`, { headers: admin() });
        if (!res.ok()) failed.push(`${id}: ${res.status()} ${await res.text()}`);
      } catch (e) {
        failed.push(`${id}: ${(e as Error).message}`);
      }
    }
    expect(failed, 'test users left behind').toEqual([]);
  });

  const asUser = (accessToken = token) => ({ apikey: key, Authorization: `Bearer ${accessToken}` });

  test('finds street addresses with their city and neighbourhood', async ({ request }) => {
    const res = await request.post(url, { headers: asUser(), data: { q: 'Puławska 10 Warszawa', locale: 'pl' } });
    expect(res.ok()).toBe(true);
    const { suggestions } = (await res.json()) as { suggestions: Suggestion[] };
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions[0]).toMatchObject({ area: 'Warszawa', district: 'Mokotów', countryCode: 'PL' });
  });

  test('rejects too-short or unexpected input', async ({ request }) => {
    for (const data of [{ q: 'ab', locale: 'en' }, { q: 'Prishtina', locale: 'fr' }, { q: 'Prishtina', locale: 'en', extra: 1 }]) {
      const res = await request.post(url, { headers: asUser(), data });
      expect(res.status()).toBe(400);
    }
  });

  test('limits each account on its own, not the network it is on', async ({ request }) => {
    // Two people behind the same IP (like many phones behind one carrier address).
    const first = await signedInUser(request, created);
    const second = await signedInUser(request, created);
    // Too-short searches: counted, then refused before any request to Photon.
    const search = (accessToken: string) => request.post(url, { headers: asUser(accessToken), data: { q: 'ab', locale: 'en' } });
    // RATE_LIMITS.addressSearch in packages/shared: 60 a minute. Six at a time — one after another
    // they take too long from far away (~1 s each), all 61 at once overwhelm the function — and
    // Postgres counts them one by one.
    test.setTimeout(120_000);
    const answers: APIResponse[] = [];
    const lane = async (n: number) => {
      for (let i = 0; i < n; i++) answers.push(await search(first));
    };
    await Promise.all([11, 10, 10, 10, 10, 10].map(lane));
    expect(answers.map((r) => r.status()).sort()).toEqual([...Array<number>(60).fill(400), 429]);
    const over = answers.find((r) => r.status() === 429);
    expect(Number(over?.headers()['retry-after'])).toBeGreaterThan(0);
    // The same machine, another account: not limited (a per-IP count would be over by now).
    expect((await search(second)).status()).toBe(400);
  });
});

/** Admin headers for the Auth API: a secret key goes in `apikey`; a legacy service-role JWT also as Bearer. */
function admin(): Record<string, string> {
  return secret.startsWith('eyJ') ? { apikey: secret, Authorization: `Bearer ${secret}` } : { apikey: secret };
}

/**
 * A confirmed test user's access token: a one-time email code made by the Auth admin API (no email is
 * sent). Its id goes into `created` as soon as it exists, so it is deleted even if signing in fails.
 */
async function signedInUser(api: APIRequestContext, created: string[]): Promise<string> {
  const email = `e2e-places-${crypto.randomUUID()}@example.com`;
  const res = await api.post(`${projectUrl}/auth/v1/admin/users`, { headers: admin(), data: { email, email_confirm: true } });
  expect(res.ok(), await res.text()).toBe(true);
  created.push(((await res.json()) as { id: string }).id);
  const link = await api.post(`${projectUrl}/auth/v1/admin/generate_link`, { headers: admin(), data: { type: 'magiclink', email } });
  expect(link.ok(), await link.text()).toBe(true);
  const { email_otp: code } = (await link.json()) as { email_otp: string };
  const verified = await api.post(`${projectUrl}/auth/v1/verify`, { headers: { apikey: key }, data: { type: 'magiclink', email, token: code } });
  expect(verified.ok(), await verified.text()).toBe(true);
  return ((await verified.json()) as { access_token: string }).access_token;
}
