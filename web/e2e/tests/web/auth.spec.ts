import { expect, test, type APIRequestContext, type Page, type Route } from '@playwright/test';

import { resources } from '@movershub/i18n';

// The website's sign-in, the same as the app's (design/DECISIONS.md #17, #29): email + password; a
// 6-digit code only confirms a new account or resets a forgotten password, and then a password is
// chosen. The browser's Supabase Auth calls are answered by stand-ins here (the pages that need a real
// session are checked by the live test at the end).

const en = resources.en.translation;
const sq = resources.sq.translation;
const OWED = 'mh_password_owed';

test('bare URL redirects to the browser language', async ({ browser }) => {
  const context = await browser.newContext({ locale: 'sq-XK' });
  const page = await context.newPage();
  await page.goto('/');
  await expect(page).toHaveURL(/\/sq$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(sq.landing.hero.title.split('\n')[0]!);
  await context.close();
});

test('landing page presents MoversHub as a platform, not the mover (COMPLIANCE §4)', async ({ page }) => {
  await page.goto('/en');
  await expect(page.getByText(/Movers are independent businesses\./)).toBeVisible();
  await expect(page.locator('body')).not.toContainText(/our movers|our team|our vans/i);
});

/** A session Supabase Auth would return after a code (never checked by the server here). */
function standInSession(email: string) {
  const part = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const exp = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: '00000000-0000-4000-8000-0000000e2e02', aud: 'authenticated', role: 'authenticated', email, app_metadata: {}, user_metadata: {} };
  return {
    access_token: `${part({ alg: 'HS256', typ: 'JWT' })}.${part({ sub: user.id, role: 'authenticated', exp, email })}.e2e`,
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: exp,
    refresh_token: 'e2e',
    user,
  };
}

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': '*' };

/** Answers one Supabase endpoint; records the JSON bodies sent to it. */
async function answer(page: Page, pattern: string | RegExp, reply: (body: Record<string, unknown>, n: number) => { status?: number; json: unknown }) {
  const sent: Record<string, unknown>[] = [];
  await page.route(pattern, (route: Route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const body = (route.request().postDataJSON() ?? {}) as Record<string, unknown>;
    sent.push(body);
    const { status = 200, json } = reply(body, sent.length);
    return route.fulfill({ status, headers: cors, contentType: 'application/json', body: JSON.stringify(json) });
  });
  return sent;
}

const owedCookie = async (page: Page) => (await page.context().cookies()).find((c) => c.name === OWED)?.value;

test('sign in: checks the fields; a wrong password and an unknown address get the same answer', async ({ page }) => {
  const tries = await answer(page, /\/auth\/v1\/token\?grant_type=password/, () => ({
    status: 400,
    json: { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' },
  }));
  await page.goto('/en/login');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.auth.title);
  await page.getByLabel(en.auth.emailLabel).fill('not-an-email');
  await page.getByRole('button', { name: en.auth.signIn, exact: true }).click();
  await expect(page.getByText(en.auth.errors.invalid_email)).toBeVisible();
  await expect(page.getByText(en.auth.errors.password_required)).toBeVisible();
  expect(tries).toHaveLength(0);

  await page.getByLabel(en.auth.emailLabel).fill('ana@example.com');
  await page.getByLabel(en.auth.passwordLabel).fill('wrong-password-1');
  await page.getByRole('button', { name: en.auth.signIn, exact: true }).click();
  await expect(page.getByTestId('auth-error')).toHaveText(en.auth.errors.wrong_credentials);
  expect(tries[0]).toMatchObject({ email: 'ana@example.com', password: 'wrong-password-1' });
});

test('create account: a role first; the code request never carries it; then the code and a password, and the role is saved', async ({ page }) => {
  const codes = await answer(page, '**/auth/v1/otp*', () => ({ json: {} }));
  const checks = await answer(page, '**/auth/v1/verify*', (_body, n) =>
    n === 1 ? { status: 403, json: { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' } } : { json: standInSession('new@example.com') },
  );
  const passwords = await answer(page, '**/auth/v1/user*', () => ({ json: standInSession('new@example.com').user }));
  await page.route('**/rest/v1/profiles*', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: cors })
      : route.fulfill({ headers: cors, contentType: 'application/json', body: JSON.stringify({ role: null }) }),
  );
  const roles = await answer(page, '**/rest/v1/rpc/choose_role*', () => ({ json: 'mover' }));

  await page.goto('/en/login');
  await page.getByRole('tab', { name: en.auth.registerTab }).click();
  await page.getByLabel(en.auth.emailLabel).fill('new@example.com');
  await page.getByRole('button', { name: en.auth.sendCode }).click();
  await expect(page.getByText(en.auth.errors.choose_role)).toBeVisible();
  expect(codes).toHaveLength(0);

  await page.getByRole('radio', { name: new RegExp(en.auth.roleMover) }).check();
  await page.getByRole('button', { name: en.auth.sendCode }).click();
  await expect(page.getByText(en.auth.codeSentTo.replace('{{target}}', 'new@example.com'))).toBeVisible();
  // Anyone could ask for any address: the role waits for the code (public.choose_role).
  expect(codes[0]).toMatchObject({ email: 'new@example.com', create_user: true, data: { locale: 'en' } });
  expect(JSON.stringify(codes[0])).not.toContain('mover');

  // A wrong code: nothing owed.
  await page.getByLabel(en.auth.codeLabel).fill('111111');
  await page.getByRole('button', { name: en.auth.verify }).click();
  await expect(page.getByText(en.auth.errors.wrong_code)).toBeVisible();
  expect(await owedCookie(page)).toBeUndefined();

  // The right code signs in — and a password is owed before anything else, also after a reload.
  await page.getByLabel(en.auth.codeLabel).fill('123456');
  await page.getByRole('button', { name: en.auth.verify }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.auth.createPasswordTitle);
  expect(checks.at(-1)).toMatchObject({ email: 'new@example.com', token: '123456', type: 'email' });
  expect(await owedCookie(page)).toBe('register');

  await page.getByLabel(en.auth.passwordLabel).fill('short');
  await page.getByRole('button', { name: en.auth.savePassword }).click();
  await expect(page.getByText(en.auth.errors.password_too_short)).toBeVisible();
  await page.getByLabel(en.auth.passwordLabel).fill('movers2027');
  await page.getByRole('button', { name: en.auth.savePassword }).click();
  await expect.poll(() => roles.length).toBe(1);
  expect(passwords[0]).toMatchObject({ password: 'movers2027' });
  expect(roles[0]).toEqual({ p_role: 'mover' });
  expect(await owedCookie(page)).toBeUndefined();
});

test('forgot password: a code by email, then a new password', async ({ page }) => {
  const asked = await answer(page, '**/auth/v1/recover*', () => ({ json: {} }));
  const checks = await answer(page, '**/auth/v1/verify*', () => ({ json: standInSession('ana@example.com') }));
  await page.goto('/en/login');
  await page.getByLabel(en.auth.emailLabel).fill('ana@example.com');
  await page.getByRole('button', { name: en.auth.forgotPassword }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.auth.forgotTitle);
  await expect(page.getByLabel(en.auth.emailLabel)).toHaveValue('ana@example.com');
  await page.getByRole('button', { name: en.auth.sendCode }).click();
  // The same answer whether or not the address has an account.
  await expect(page.getByText(en.auth.recoveryCodeSentTo.replace('{{target}}', 'ana@example.com'))).toBeVisible();
  expect(asked[0]).toMatchObject({ email: 'ana@example.com' });
  await page.getByLabel(en.auth.codeLabel).fill('123456');
  await page.getByRole('button', { name: en.auth.verify }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.auth.newPasswordTitle);
  expect(checks[0]).toMatchObject({ type: 'recovery' });
  expect(await owedCookie(page)).toBe('recovery');
});

test('an invalid email link returns to sign in with an error', async ({ page }) => {
  await page.goto('/en/auth/confirm?code=not-a-real-code');
  await expect(page).toHaveURL(/\/en\/login\?error=link_invalid$/);
  await expect(page.getByText(en.auth.errors.link_invalid)).toBeVisible();
});

test('the email link route ignores missing or unknown parameters', async ({ page }) => {
  await page.goto('/sq/auth/confirm?token_hash=x&type=not-a-type');
  await expect(page).toHaveURL(/\/sq\/login\?error=link_invalid$/);
  await expect(page.getByText(sq.auth.errors.link_invalid)).toBeVisible();
});

test('the account page sends signed-out visitors to sign in', async ({ page }) => {
  await page.goto('/en/account');
  await expect(page).toHaveURL(/\/en\/login$/);
});

// Live, against the cloud project the website uses: a throwaway account with a password (Auth admin
// API), signed in on the website, switched to the mover side and back, signed out, deleted.
// Needs QUOTE_API_URL (the project's functions URL) and SUPABASE_SECRET_KEY.
test.describe('live', () => {
  const quoteUrl = process.env.QUOTE_API_URL ?? '';
  const secret = process.env.SUPABASE_SECRET_KEY ?? '';
  const projectUrl = quoteUrl.replace(/\/functions\/v1\/quote$/, '');
  test.skip(!quoteUrl || !secret, 'set QUOTE_API_URL and SUPABASE_SECRET_KEY to sign in on the cloud project');
  const admin = () => ({ apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' });

  async function account(api: APIRequestContext) {
    const email = `e2e-web-${crypto.randomUUID()}@example.com`;
    const res = await api.post(`${projectUrl}/auth/v1/admin/users`, { headers: admin(), data: { email, password: 'movers2027', email_confirm: true } });
    expect(res.ok(), await res.text()).toBe(true);
    const id = ((await res.json()) as { id: string }).id;
    const role = await api.patch(`${projectUrl}/rest/v1/profiles?id=eq.${id}`, { headers: admin(), data: { role: 'customer' } });
    expect(role.ok(), await role.text()).toBe(true);
    return { email, id };
  }

  test('sign in with email and password; the account page shows the side, which can be switched', async ({ page, request }) => {
    const { email, id } = await account(request);
    try {
      await page.goto('/en/login');
      await page.getByLabel(en.auth.emailLabel).fill(email);
      await page.getByLabel(en.auth.passwordLabel).fill('movers2027');
      await page.getByRole('button', { name: en.auth.signIn, exact: true }).click();
      await expect(page).toHaveURL(/\/en\/account$/);
      await expect(page.getByTestId('account-email')).toHaveText(en.account.signedInAs.replace('{{email}}', email));
      await expect(page.getByTestId('account-side')).toHaveText(en.account.customer);
      await page.getByRole('button', { name: en.customer.switchToMover }).click();
      await expect(page.getByTestId('account-side')).toHaveText(en.account.mover);
      // Signed in already: the sign-in page leads to the account.
      await page.goto('/en/login');
      await expect(page).toHaveURL(/\/en\/account$/);
      await page.getByRole('button', { name: en.common.signOut }).click();
      await expect(page).toHaveURL(/\/en$/);
      await page.goto('/en/account');
      await expect(page).toHaveURL(/\/en\/login$/);
    } finally {
      const removed = await request.delete(`${projectUrl}/auth/v1/admin/users/${id}`, { headers: admin() });
      expect(removed.ok(), await removed.text()).toBe(true);
    }
  });
});
