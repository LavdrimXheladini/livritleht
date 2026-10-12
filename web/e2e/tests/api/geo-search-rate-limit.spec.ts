import { expect, test, type APIRequestContext } from '@playwright/test';

// The website's address search is limited per visitor (RATE_LIMITS.addressSearch in
// packages/shared: 60 a minute) to protect the free geocoder behind it. Runs against the local
// production build, offline: fixture search results, limits counted in memory.
//
// Each test is a made-up visitor from the IPv6 documentation range (a random /64, so a retry is a
// new visitor too): it never uses up the budget of the other tests, which all come from localhost.
// Locally the server takes the visitor's address from X-Forwarded-For; on Vercel, Vercel writes
// that header itself, so these tests only run locally.
test.skip(!!process.env.E2E_BASE_URL, 'needs the local server: a deployed site sees the tester’s real address');

const MAX_REQUESTS = 200;
const hex = () => Math.floor(Math.random() * 0x10000).toString(16);
const visitor = () => `2001:db8:${hex()}:${hex()}`;
const search = (request: APIRequestContext, ip: string) =>
  request.get('/api/geo/search?q=Prishtina&locale=en', { headers: { 'x-forwarded-for': ip } });

/** Searches from one address until the server says 429; how many got through before that. */
async function burst(request: APIRequestContext, ip: string) {
  for (let allowed = 0; allowed < MAX_REQUESTS; allowed++) {
    const res = await search(request, ip);
    if (res.status() === 429) return { allowed, res };
    expect(res.status()).toBe(200);
  }
  throw new Error(`no 429 after ${MAX_REQUESTS} searches`);
}

test('a burst of address searches from one visitor ends in 429 with Retry-After', async ({ request }) => {
  const ip = `${visitor()}::1`;
  const { allowed, res } = await burst(request, ip);
  expect(allowed).toBeGreaterThan(0);
  expect(Number(res.headers()['retry-after'])).toBeGreaterThan(0);
  expect(await res.json()).toEqual({ results: [], error: 'rate_limited' });
  // Still blocked on the next try.
  expect((await search(request, ip)).status()).toBe(429);
});

test('the limit is per visitor: others still search, the same IPv6 network does not', async ({ request }) => {
  const net = visitor();
  await burst(request, `${net}::1`);
  // Another address in the same /64 is the same home or phone.
  expect((await search(request, `${net}::2`)).status()).toBe(429);
  expect((await search(request, `${visitor()}::1`)).status()).toBe(200);
  expect((await search(request, `198.51.100.${Math.floor(Math.random() * 250) + 1}`)).status()).toBe(200);
});
