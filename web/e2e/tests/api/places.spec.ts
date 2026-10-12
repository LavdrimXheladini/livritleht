import { expect, test } from '@playwright/test';

// API tests for the deployed `places` edge function (address search for the apps). Skipped unless:
//   QUOTE_API_URL=https://<ref>.supabase.co/functions/v1/quote QUOTE_API_KEY=<publishable key> pnpm e2e
// (the places URL is derived from the quote URL). The formatter itself is unit-tested in packages/shared.
const quoteUrl = process.env.QUOTE_API_URL ?? '';
const key = process.env.QUOTE_API_KEY ?? '';
const url = quoteUrl.replace(/\/quote$/, '/places');
test.skip(!quoteUrl || !key, 'set QUOTE_API_URL and QUOTE_API_KEY to test the deployed places function');
// Photon is a free public service and now and then slower than the function's 5 s limit: one retry.
test.describe.configure({ retries: 1 });

type Suggestion = { id: string; label: string; area: string; district?: string; lat: number; lon: number; countryCode: string };

test('finds street addresses with their city and neighbourhood', async ({ request }) => {
  const res = await request.post(url, { headers: { apikey: key }, data: { q: 'Puławska 10 Warszawa', locale: 'pl' } });
  expect(res.ok()).toBe(true);
  const { suggestions } = (await res.json()) as { suggestions: Suggestion[] };
  expect(suggestions.length).toBeGreaterThan(0);
  expect(suggestions[0]).toMatchObject({ area: 'Warszawa', district: 'Mokotów', countryCode: 'PL' });
});

test('rejects too-short or unexpected input', async ({ request }) => {
  for (const data of [{ q: 'ab', locale: 'en' }, { q: 'Prishtina', locale: 'fr' }, { q: 'Prishtina', locale: 'en', extra: 1 }]) {
    const res = await request.post(url, { headers: { apikey: key }, data });
    expect(res.status()).toBe(400);
  }
});
