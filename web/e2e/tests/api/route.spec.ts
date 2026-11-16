import { expect, test } from '@playwright/test';

// API test for the deployed `route` edge function (the road of a move, for the app's map). Skipped unless:
//   QUOTE_API_URL=https://<ref>.supabase.co/functions/v1/quote QUOTE_API_KEY=<publishable key> pnpm e2e
// (the route URL is derived from the quote URL).
const quoteUrl = process.env.QUOTE_API_URL ?? '';
const key = process.env.QUOTE_API_KEY ?? '';
const url = quoteUrl.replace(/\/quote$/, '/route');
test.skip(!quoteUrl || !key, 'set QUOTE_API_URL and QUOTE_API_KEY to test the deployed route function');

const body = { from: { lat: 42.6629, lon: 21.1655 }, to: { lat: 42.2139, lon: 20.7397 } };

test('needs a signed-in user: visitors and the bare app key get 401', async ({ request }) => {
  for (const authorization of [undefined, `Bearer ${key}`]) {
    const res = await request.post(url, { headers: { apikey: key, ...(authorization ? { Authorization: authorization } : {}) }, data: body });
    expect(res.status()).toBe(401);
    expect((await res.json()).error).toBe('sign_in_required');
  }
});
