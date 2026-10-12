import { expect, test } from '@playwright/test';

// Browser access to the deployed public functions (supabase/functions/_shared/http.ts): only the
// apps' local browser preview may call them; other sites get no CORS headers. Skipped unless:
//   QUOTE_API_URL=https://<ref>.supabase.co/functions/v1/quote QUOTE_API_KEY=<publishable key> pnpm e2e
const quoteUrl = process.env.QUOTE_API_URL ?? '';
const key = process.env.QUOTE_API_KEY ?? '';
test.skip(!quoteUrl || !key, 'set QUOTE_API_URL and QUOTE_API_KEY to test the deployed functions');

const urls = { quote: quoteUrl, places: quoteUrl.replace(/\/quote$/, '/places') };
const preflight = (origin: string) => ({
  Origin: origin,
  'Access-Control-Request-Method': 'POST',
  'Access-Control-Request-Headers': 'authorization, apikey, content-type, x-client-info',
});

for (const [name, url] of Object.entries(urls)) {
  test(`${name}: the apps' browser preview may call it`, async ({ request }) => {
    const res = await request.fetch(url, { method: 'OPTIONS', headers: preflight('http://localhost:8081') });
    expect(res.status()).toBe(204);
    expect(res.headers()['access-control-allow-origin']).toBe('http://localhost:8081');
    expect(res.headers()['access-control-allow-methods']).toContain('POST');
    expect(res.headers()['access-control-allow-headers']).toContain('x-client-info');

    // The real request carries the header too, so the browser can read the answer.
    const post = await request.post(url, { headers: { apikey: key, Origin: 'http://localhost:8081' }, data: {} });
    expect(post.status()).toBe(400);
    expect(post.headers()['access-control-allow-origin']).toBe('http://localhost:8081');
  });

  test(`${name}: other websites get no CORS access`, async ({ request }) => {
    for (const origin of ['https://example.com', 'http://localhost.example.com', 'https://localhost:8081']) {
      const res = await request.fetch(url, { method: 'OPTIONS', headers: preflight(origin) });
      expect(res.headers()['access-control-allow-origin']).toBeUndefined();
    }
  });
}
