import { expect, test } from '@playwright/test';

// Browser access to the deployed public functions (supabase/functions/_shared/http.ts): only the
// app's web build may call them — the local preview, and the hosted computer version (the
// APP_WEB_ORIGINS secret; set APP_WEB_ORIGIN to one of them to test it). Other sites get no CORS
// headers. Skipped unless:
//   QUOTE_API_URL=https://<ref>.supabase.co/functions/v1/quote QUOTE_API_KEY=<publishable key> pnpm e2e
// Not against the local stack: its gateway answers every preflight itself, for any origin.
const quoteUrl = process.env.QUOTE_API_URL ?? '';
const key = process.env.QUOTE_API_KEY ?? '';
const hostedApp = process.env.APP_WEB_ORIGIN ?? '';
test.skip(!quoteUrl || !key, 'set QUOTE_API_URL and QUOTE_API_KEY to test the deployed functions');

const urls = { quote: quoteUrl, places: quoteUrl.replace(/\/quote$/, '/places') };
/** The answer to an empty request from a visitor: quote checks the input, places wants a signed-in user first. */
const emptyRequestStatus = { quote: 400, places: 401 };
const preflight = (origin: string) => ({
  Origin: origin,
  'Access-Control-Request-Method': 'POST',
  'Access-Control-Request-Headers': 'authorization, apikey, content-type, x-client-info',
});

for (const [name, url] of Object.entries(urls) as [keyof typeof urls, string][]) {
  test(`${name}: the app's browser preview may call it`, async ({ request }) => {
    const res = await request.fetch(url, { method: 'OPTIONS', headers: preflight('http://localhost:8081') });
    expect(res.status()).toBe(204);
    expect(res.headers()['access-control-allow-origin']).toBe('http://localhost:8081');
    expect(res.headers()['access-control-allow-methods']).toContain('POST');
    expect(res.headers()['access-control-allow-headers']).toContain('x-client-info');

    // The real request carries the header too, so the browser can read the answer.
    const post = await request.post(url, { headers: { apikey: key, Origin: 'http://localhost:8081' }, data: {} });
    expect(post.status()).toBe(emptyRequestStatus[name]);
    expect(post.headers()['access-control-allow-origin']).toBe('http://localhost:8081');
  });

  test(`${name}: the hosted computer version may call it`, async ({ request }) => {
    test.skip(!hostedApp, 'set APP_WEB_ORIGIN to an origin listed in the APP_WEB_ORIGINS secret');
    const res = await request.fetch(url, { method: 'OPTIONS', headers: preflight(hostedApp) });
    expect(res.status()).toBe(204);
    expect(res.headers()['access-control-allow-origin']).toBe(hostedApp);
  });

  test(`${name}: other websites get no CORS access`, async ({ request }) => {
    for (const origin of ['https://example.com', 'http://localhost.example.com', 'https://localhost:8081']) {
      const res = await request.fetch(url, { method: 'OPTIONS', headers: preflight(origin) });
      expect(res.headers()['access-control-allow-origin']).toBeUndefined();
    }
  });
}
