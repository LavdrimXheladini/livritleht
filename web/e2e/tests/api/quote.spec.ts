import { expect, test } from '@playwright/test';

// API tests for the deployed `quote` edge function (network + test movers enabled). Skipped unless:
//   QUOTE_API_URL=https://<ref>.supabase.co/functions/v1/quote QUOTE_API_KEY=<publishable key> pnpm e2e
// The pricing rules themselves are unit-tested in packages/pricing; these check the live wiring.
const url = process.env.QUOTE_API_URL ?? '';
const key = process.env.QUOTE_API_KEY ?? '';
test.skip(!url || !key, 'set QUOTE_API_URL and QUOTE_API_KEY to test the deployed quote function');

const prishtina = { label: 'Prishtina', area: 'Prishtina', lat: 42.6629, lon: 21.1655, countryCode: 'XK' };
const prizren = { label: 'Prizren', area: 'Prizren', lat: 42.2139, lon: 20.7397, countryCode: 'XK' };
const munich = { label: 'Munich', area: 'Munich', lat: 48.1351, lon: 11.582, countryCode: 'DE' };
const job = { helpers: 2, items: [{ key: 'sofa3', qty: 1 }, { key: 'box', qty: 14 }] };

type Offer = { companyName: string; quote: { currency: string; moverPrice: number; total: number } };
type ClassOffers = { vehicleClass: string; count: number; from: { currency: string; moverPrice: number }[]; offers: Offer[] };
type QuoteResponse = { distanceKm: number; crossBorder: boolean; classes: ClassOffers[] };

test('rejects a price sent by the client (COMPLIANCE §1.1, §13)', async ({ request }) => {
  const res = await request.post(url, { headers: { apikey: key }, data: { pickup: prishtina, dropoff: prizren, ...job, price: 1 } });
  expect(res.status()).toBe(400);
  expect((await res.json()).error).toBe('invalid_request');
});

test('"from" is the lowest mover quote in each class, from the server (COMPLIANCE §13)', async ({ request }) => {
  const res = await request.post(url, { headers: { apikey: key }, data: { pickup: prishtina, dropoff: prizren, ...job } });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as QuoteResponse;
  expect(body.crossBorder).toBe(false);
  expect(body.classes).toHaveLength(5);
  for (const c of body.classes) {
    expect(c.count).toBe(c.offers.length);
    for (const f of c.from) {
      const prices = c.offers.filter((o) => o.quote.currency === f.currency).map((o) => o.quote.moverPrice);
      expect(f.moverPrice).toBe(Math.min(...prices));
    }
  }
});

test('the same job gets the same prices (no surge set by the platform, COMPLIANCE §1)', async ({ request }) => {
  const ask = async () =>
    ((await (await request.post(url, { headers: { apikey: key }, data: { pickup: prishtina, dropoff: prizren, ...job, vehicleClass: 'VAN' } })).json()) as QuoteResponse)
      .classes[0]!.offers.map((o) => o.quote.moverPrice);
  expect(await ask()).toEqual(await ask());
});

test('without items, each class is priced for a typical load, with a "from" price per crew (landing page)', async ({ request }) => {
  const res = await request.post(url, { headers: { apikey: key }, data: { pickup: prishtina, dropoff: prizren, helpers: 2 } });
  expect(res.ok()).toBe(true);
  const body = (await res.json()) as QuoteResponse & {
    typicalLoad: boolean;
    classes: (ClassOffers & { crews: Record<'1' | '2' | '3', { count: number; from: { moverPrice: number }[] }> })[];
  };
  expect(body.typicalLoad).toBe(true);
  for (const c of body.classes) {
    // The detailed offers are for crew 2; its summary must agree with them.
    expect(c.crews['2'].count).toBe(c.count);
    if (c.count) expect(c.crews['2'].from[0]!.moverPrice).toBe(c.from[0]!.moverPrice);
  }
});

test('corridor jobs are offered in EUR only (COMPLIANCE §11)', async ({ request }) => {
  const res = await request.post(url, { headers: { apikey: key }, data: { pickup: munich, dropoff: prishtina, ...job } });
  const body = (await res.json()) as QuoteResponse;
  expect(body.crossBorder).toBe(true);
  expect(body.classes.flatMap((c) => c.offers).every((o) => o.quote.currency === 'EUR')).toBe(true);
});
