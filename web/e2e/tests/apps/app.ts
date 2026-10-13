import { readFileSync } from 'node:fs';

import { test, type Page, type Route } from '@playwright/test';

// Screenshots of the phone app, taken in its browser preview (Expo web): `pnpm e2e:apps`. Offline
// and still: the server functions answer from a saved real quote (fixtures/), signed-in screens use
// a stand-in session plus the profile's role, and the app's motion is reduced.

const quote = readFileSync(new URL('../../fixtures/quote-prishtina-prizren.json', import.meta.url), 'utf8');

/** The saved quote: per class, every mover's offer for a crew of 2 (the app's default). */
export const savedQuote = JSON.parse(quote) as {
  classes: { vehicleClass: string; offers: { companyName: string; quote: { currency: string; moverPrice: number } }[] }[];
};
export const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };

/** Skips the file unless the app's preview is running (`pnpm e2e:apps`); returns its address. */
export function appUrl(): string {
  test.skip(!process.env.E2E_APP, 'runs with pnpm e2e:apps');
  return 'http://localhost:8081/';
}

/** Answers browser preflights, and requests with `body`. */
const answer = (body: string, status = 200) => (route: Route) =>
  route.request().method() === 'OPTIONS'
    ? route.fulfill({ status: 204, headers: cors })
    : route.fulfill({ status, contentType: 'application/json', headers: cors, body });

/** `quote` answers with the saved Prishtina → Prizren quote (test movers, 83.2 km); `places` finds nothing. */
export async function serveFixtures(page: Page) {
  await page.route('**/functions/v1/quote', answer(quote));
  await page.route('**/functions/v1/places', answer('{"suggestions":[]}'));
}

/** Where the app keeps the session and the side it last showed (SESSION_STORAGE_KEY, mobile/core/src/saved-role.ts). */
export const SESSION_KEY = 'movershub.auth';
export const SAVED_ROLE_KEY = 'movershub.role';
export const STAND_IN_ID = '00000000-0000-4000-8000-0000000e2e01';

type Role = 'customer' | 'mover';

/**
 * A session the app accepts without a server: valid for a year, so the client never refreshes it —
 * or `expired`, as on a phone opened after more than an hour.
 */
function standInSession(email: string, { expired = false } = {}) {
  const id = STAND_IN_ID;
  const expiresAt = Math.floor(Date.now() / 1000) + (expired ? -2 * 3600 : 365 * 24 * 3600);
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  return {
    access_token: `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: id, role: 'authenticated', exp: expiresAt })}.e2e`,
    token_type: 'bearer',
    expires_in: expiresAt - Math.floor(Date.now() / 1000),
    expires_at: expiresAt,
    refresh_token: 'e2e',
    user: { id, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {} },
  };
}

/**
 * The account behind the stand-in session, without a server: the code check (/verify) signs in,
 * the profile answers with `role` (null = not chosen yet), `choose_role` sets it — first choice and
 * switching sides (the first `failChooseRole` calls answer 500) — and sign out works. Returns the
 * roles the app asked `choose_role` for.
 */
export async function fakeAccount(
  page: Page,
  { role, email = 'new@example.com', failChooseRole = 0 }: { role: Role | null; email?: string; failChooseRole?: number },
) {
  const state = { role, failuresLeft: failChooseRole };
  const chosen: unknown[] = [];
  const json = (route: Route, body: unknown, status = 200) =>
    route.request().method() === 'OPTIONS' || status === 204
      ? route.fulfill({ status: 204, headers: cors })
      : route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
  await page.route('**/auth/v1/verify*', (route) => json(route, standInSession(email)));
  await page.route('**/auth/v1/logout*', (route) => json(route, {}, 204));
  await page.route('**/rest/v1/profiles*', (route) => json(route, { role: state.role }));
  await page.route('**/rest/v1/rpc/choose_role*', (route) => {
    if (route.request().method() === 'OPTIONS') return json(route, null);
    const { p_role } = route.request().postDataJSON() as { p_role: Role };
    chosen.push(p_role);
    if (state.failuresLeft > 0) {
      state.failuresLeft--;
      return json(route, { code: 'XX000', message: 'stand-in failure' }, 500);
    }
    state.role = p_role;
    return json(route, state.role);
  });
  return chosen;
}

/**
 * Opens the app already signed in as a customer or a mover (the session is in storage before it
 * starts). Returns the roles the app asked `choose_role` for.
 */
export async function signInAs(page: Page, role: Role, { failChooseRole = 0 } = {}) {
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), {
    key: SESSION_KEY,
    value: JSON.stringify(standInSession(`${role}@example.com`)),
  });
  return fakeAccount(page, { role, email: `${role}@example.com`, failChooseRole });
}

/**
 * A phone without network, opened by someone who used the app before: their session (expired, as
 * after more than an hour) and the side the app last showed are on the device; every request fails.
 */
export async function offlineWithSavedSide(page: Page, role: Role) {
  await page.addInitScript(
    ({ keys, session, saved }) => {
      localStorage.setItem(keys.session, session);
      localStorage.setItem(keys.role, saved);
    },
    {
      keys: { session: SESSION_KEY, role: SAVED_ROLE_KEY },
      session: JSON.stringify(standInSession(`${role}@example.com`, { expired: true })),
      saved: JSON.stringify({ userId: STAND_IN_ID, role }),
    },
  );
  await noNetwork(page);
}

/** From now on every request to Supabase fails, as without network (the app itself stays loaded). */
export async function noNetwork(page: Page) {
  await page.route(/\/(auth|rest|functions)\/v1\//, (route) => route.abort('internetdisconnected'));
}

/** What the app keeps on the device under `key` (localStorage in the browser version). */
export const stored = (page: Page, key: string) => page.evaluate((k) => localStorage.getItem(k), key);

/** Makes the screen as tall as the page, so one screenshot shows all of it (the app scrolls inside the screen). */
export async function fitScreenToPage(page: Page) {
  const height = await page.evaluate(() => Math.max(...[...document.querySelectorAll('div')].map((el) => el.scrollHeight)));
  await page.setViewportSize({ width: page.viewportSize()!.width, height: Math.min(height, 4000) });
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** Answers the email-code request: `status` 200 = code sent; records what the app sent. */
export async function serveOtp(page: Page, status = 200, body = '{}') {
  const sent: unknown[] = [];
  await page.route('**/auth/v1/otp*', async (route) => {
    if (route.request().method() !== 'OPTIONS') sent.push(route.request().postDataJSON());
    await answer(body, status)(route);
  });
  return sent;
}
