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

type Line = { kind: string; amount: number; quantity?: number; unitAmount?: number };
type Offer = {
  companyName: string;
  quote: {
    currency: string;
    moverPrice: number;
    total: number;
    lines: Line[];
    bookingFee: number | null;
    takeRatePct: number;
    platformCommission: number;
    moverPayout: number;
  };
};
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

test('rejects any other price field a client sends (COMPLIANCE §1.1)', async ({ request }) => {
  for (const extra of [{ moverPrice: 1 }, { total: 1 }, { distanceKm: 1 }, { crossBorder: true }]) {
    const res = await request.post(url, { headers: { apikey: key }, data: { pickup: prishtina, dropoff: prizren, ...job, ...extra } });
    expect(res.status()).toBe(400);
    expect((await res.json()).error).toBe('invalid_request');
  }
});

test('a live offer uses exactly its mover’s own card (COMPLIANCE §1.1)', async ({ request }) => {
  // Test Movers Prishtina's van as saved by migrations 20261012120000 + 20261012130000 (test data).
  const card = { baseFee: 2000, perKm: 50, perMinuteCrewOf2: 47, heavyItemFee: 400 };
  const res = await request.post(url, { headers: { apikey: key }, data: { pickup: prishtina, dropoff: prizren, ...job, vehicleClass: 'VAN' } });
  const body = (await res.json()) as QuoteResponse;
  const offer = body.classes[0]!.offers.find((o) => o.companyName === 'Test Movers Prishtina')!;
  const line = (kind: string) => offer.quote.lines.find((l) => l.kind === kind)!;
  expect(line('base').amount).toBe(card.baseFee);
  expect(line('distance').unitAmount).toBe(card.perKm);
  expect(line('labor').unitAmount).toBe(card.perMinuteCrewOf2);
  expect(line('heavyItems')).toMatchObject({ unitAmount: card.heavyItemFee, quantity: 1 }); // the sofa
  const tenths = Math.round(body.distanceKm * 10);
  expect(offer.quote.moverPrice).toBe(
    card.baseFee + Math.round((card.perKm * tenths) / 10) + card.perMinuteCrewOf2 * line('labor').quantity! + card.heavyItemFee,
  );
});

test('every live offer adds up line by line: rate × quantity, nothing added on top (COMPLIANCE §1)', async ({ request }) => {
  const res = await request.post(url, { headers: { apikey: key }, data: { pickup: prishtina, dropoff: prizren, ...job } });
  const offers = ((await res.json()) as QuoteResponse).classes.flatMap((c) => c.offers);
  expect(offers.length).toBeGreaterThan(0);
  for (const { quote } of offers) {
    expect(quote.lines.reduce((sum, l) => sum + l.amount, 0)).toBe(quote.moverPrice);
    for (const line of quote.lines) {
      // Every line is the mover's rate × the quantity (km, minutes, floors, items) — nothing added by the platform.
      if (line.unitAmount !== undefined) expect(line.amount).toBe(Math.round(line.unitAmount * line.quantity!));
    }
    expect(quote.total).toBe(quote.moverPrice + (quote.bookingFee ?? 0));
    expect(quote.platformCommission).toBe(Math.round((quote.moverPrice * quote.takeRatePct) / 100));
    expect(quote.moverPayout).toBe(quote.moverPrice - quote.platformCommission);
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

test('lek and denar prices are whole units (their hundredths are no longer used)', async ({ request }) => {
  const tirana = { label: 'Tirana', area: 'Tirana', lat: 41.3275, lon: 19.8187, countryCode: 'AL' };
  const durres = { label: 'Durrës', area: 'Durrës', lat: 41.3231, lon: 19.4414, countryCode: 'AL' };
  const skopje = { label: 'Skopje', area: 'Skopje', lat: 41.9973, lon: 21.428, countryCode: 'MK' };
  const bitola = { label: 'Bitola', area: 'Bitola', lat: 41.0297, lon: 21.3292, countryCode: 'MK' };
  for (const [pickup, dropoff, currency] of [[tirana, durres, 'ALL'], [skopje, bitola, 'MKD']] as const) {
    const res = await request.post(url, { headers: { apikey: key }, data: { pickup, dropoff, ...job } });
    expect(res.ok()).toBe(true);
    const offers = ((await res.json()) as QuoteResponse).classes.flatMap((c) => c.offers);
    expect(offers.length).toBeGreaterThan(0);
    for (const { quote } of offers) {
      expect(quote.currency).toBe(currency);
      expect(quote.moverPrice % 100).toBe(0);
      expect(quote.total % 100).toBe(0);
    }
  }
});

test('every offer names its mover by the company’s legal name (COMPLIANCE §4)', async ({ request }) => {
  const res = await request.post(url, { headers: { apikey: key }, data: { pickup: prishtina, dropoff: prizren, ...job } });
  const offers = ((await res.json()) as QuoteResponse).classes.flatMap((c) => c.offers);
  expect(offers.length).toBeGreaterThan(0);
  for (const { companyName } of offers) {
    expect(companyName.length).toBeGreaterThanOrEqual(2); // mover_companies.legal_name: 2–160 characters
    expect(companyName).not.toMatch(/ranktrip/i); // the mover is the provider, never the platform
  }
  expect(offers.map((o) => o.companyName)).toContain('Test Movers Prishtina');
});

test('cross-border quotes leave out movers without CMR insurance (COMPLIANCE §5, §11)', async ({ request }) => {
  const skopje = { label: 'Skopje', area: 'Skopje', lat: 41.9973, lon: 21.428, countryCode: 'MK' };
  const movers = async (dropoff: typeof prizren) => {
    const res = await request.post(url, { headers: { apikey: key }, data: { pickup: prishtina, dropoff, ...job } });
    return ((await res.json()) as QuoteResponse).classes.flatMap((c) => c.offers.map((o) => o.companyName));
  };
  // At home both test movers take the job; neither has CMR insurance, so abroad neither is offered.
  expect(await movers(prizren)).toEqual(expect.arrayContaining(['Test Movers Prishtina', 'Test Transport Prizren']));
  const abroad = await movers(skopje);
  expect(abroad.length).toBeGreaterThan(0);
  expect(abroad).not.toContain('Test Movers Prishtina');
  expect(abroad).not.toContain('Test Transport Prizren');
});
