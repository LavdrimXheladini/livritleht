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
/** A password still owed after a sign-in by code (mobile/core/src/password.ts). */
export const PASSWORD_OWED_KEY = 'movershub.passwordOwed';
export const STAND_IN_ID = '00000000-0000-4000-8000-0000000e2e01';

type Role = 'customer' | 'mover';

/** The password the stand-in account accepts on "Sign in" (once it has one). */
export const STAND_IN_PASSWORD = 'movers2026';

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
    user: standInUser(email),
  };
}

function standInUser(email: string) {
  return { id: STAND_IN_ID, aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {} };
}

/** What the app asked the stand-in server for. */
export type StandInCalls = {
  /** Roles sent to `choose_role`. */
  chosen: unknown[];
  /** Codes checked: the kind ("email" to confirm an account, "recovery" after "Forgot password?"). */
  verified: { type: string; email: string }[];
  /** Addresses sent to "Forgot password?" (also the ones Supabase Auth refused to email again). */
  recovered: string[];
  /** Sign-ins with a password. */
  signIns: { email: string; password: string }[];
  /** Account updates (a new password). */
  updates: { password?: string; data?: Record<string, unknown> }[];
  /** Changes to the profile row (e.g. the language). */
  profileUpdates: Record<string, unknown>[];
};

/**
 * The account behind the stand-in session, without a server, answering like Supabase Auth:
 * - a code (/verify) signs in;
 * - "Sign in" accepts `email` with STAND_IN_PASSWORD once the account has a password (`hasPassword`),
 *   otherwise it answers `invalid_credentials` — the same for a wrong password and an unknown address;
 * - "Forgot password?" (/recover) answers 200, except a second email to `email` within a minute:
 *   429 `over_email_send_rate_limit` (Supabase Auth's per-address limit; never for unknown addresses);
 * - a new password (PUT /user) is saved, unless it is the current one (`same_password`);
 * - the profile answers with `role` (null = not chosen yet) and `choose_role` sets it (the first
 *   `failChooseRole` calls answer 500); sign out works.
 */
export async function fakeAccount(
  page: Page,
  {
    role,
    email = 'new@example.com',
    failChooseRole = 0,
    hasPassword = role !== null,
  }: { role: Role | null; email?: string; failChooseRole?: number; hasPassword?: boolean },
): Promise<StandInCalls> {
  const state = { role, failuresLeft: failChooseRole, password: hasPassword ? STAND_IN_PASSWORD : null };
  const calls: StandInCalls = { chosen: [], verified: [], recovered: [], signIns: [], updates: [], profileUpdates: [] };
  const json = (route: Route, body: unknown, status = 200) =>
    route.request().method() === 'OPTIONS' || status === 204
      ? route.fulfill({ status: 204, headers: cors })
      : route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
  const authError = (route: Route, status: number, code: string) =>
    json(route, { code: status, error_code: code, msg: code }, status);
  const body = (route: Route) => (route.request().method() === 'OPTIONS' ? null : (route.request().postDataJSON() as Record<string, unknown>));

  await page.route('**/auth/v1/verify*', (route) => {
    const sent = body(route);
    if (sent) calls.verified.push({ type: String(sent.type), email: String(sent.email) });
    return json(route, standInSession(email));
  });
  await page.route(/\/auth\/v1\/token\?grant_type=password/, (route) => {
    const sent = body(route);
    if (!sent) return json(route, null);
    calls.signIns.push({ email: String(sent.email), password: String(sent.password) });
    return sent.email === email && state.password !== null && sent.password === state.password
      ? json(route, standInSession(email))
      : authError(route, 400, 'invalid_credentials');
  });
  await page.route('**/auth/v1/recover*', (route) => {
    const sent = body(route);
    if (!sent) return json(route, null);
    calls.recovered.push(String(sent.email));
    const again = sent.email === email && calls.recovered.filter((e) => e === email).length > 1;
    return again ? authError(route, 429, 'over_email_send_rate_limit') : json(route, {});
  });
  await page.route('**/auth/v1/user*', (route) => {
    const sent = body(route);
    if (route.request().method() === 'PUT' && sent) {
      const update = { password: sent.password as string | undefined, data: sent.data as Record<string, unknown> | undefined };
      calls.updates.push(update);
      if (update.password !== undefined && update.password === state.password) return authError(route, 422, 'same_password');
      if (update.password !== undefined) state.password = update.password;
    }
    return json(route, standInUser(email));
  });
  await page.route('**/auth/v1/logout*', (route) => json(route, {}, 204));
  await page.route('**/rest/v1/profiles*', (route) => {
    if (route.request().method() === 'PATCH') {
      calls.profileUpdates.push(route.request().postDataJSON() as Record<string, unknown>);
      return json(route, null, 204);
    }
    return json(route, { role: state.role });
  });
  await page.route('**/rest/v1/rpc/choose_role*', (route) => {
    if (route.request().method() === 'OPTIONS') return json(route, null);
    const { p_role } = route.request().postDataJSON() as { p_role: Role };
    calls.chosen.push(p_role);
    if (state.failuresLeft > 0) {
      state.failuresLeft--;
      return json(route, { code: 'XX000', message: 'stand-in failure' }, 500);
    }
    state.role = p_role;
    return json(route, state.role);
  });
  return calls;
}

/**
 * Opens the app already signed in as a customer or a mover (the session is in storage before it
 * starts); `passwordOwed`: it closed while a password was still owed after a code. Returns what the
 * app asked the stand-in server for.
 */
export async function signInAs(
  page: Page,
  role: Role,
  { failChooseRole = 0, passwordOwed }: { failChooseRole?: number; passwordOwed?: 'register' | 'recovery' } = {},
) {
  const email = `${role}@example.com`;
  await page.addInitScript(
    ({ keys, session, owed }) => {
      localStorage.setItem(keys.session, session);
      if (owed) localStorage.setItem(keys.owed, owed);
    },
    {
      keys: { session: SESSION_KEY, owed: PASSWORD_OWED_KEY },
      session: JSON.stringify(standInSession(email)),
      owed: passwordOwed ? JSON.stringify({ email, purpose: passwordOwed }) : null,
    },
  );
  return fakeAccount(page, { role, email, failChooseRole });
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
