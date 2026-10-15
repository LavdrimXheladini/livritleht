import { expect, test, type Page } from '@playwright/test';

import { resources } from '@movershub/i18n';

import {
  PASSWORD_OWED_KEY,
  SAVED_ROLE_KEY,
  SESSION_KEY,
  STAND_IN_ID,
  STAND_IN_PASSWORD,
  appUrl,
  cors,
  fakeAccount,
  fakeCompanyChecks,
  fakeMoverCompany,
  fakeMoverDocuments,
  fakeRates,
  fakeVehicles,
  fitScreenToPage,
  noNetwork,
  offlineWithSavedSide,
  savedQuote,
  serveFixtures,
  serveOtp,
  signInAs,
  stored,
} from './app';

// The one MoversHub app (customers and movers): it opens on sign in (email and password) / create
// account. A code is needed once, to confirm the email, then a password; "Forgot password?" sends a
// code for a new one. The role is saved only after the code has proven the email; it picks the
// customer or the mover side, and people can switch sides later.

const url = appUrl();
const en = resources.en.translation;
const codeSent = (email: string) => en.auth.codeSentTo.replace('{{target}}', email);
/** The app itself — not the hidden live region that repeats error texts for screen readers on the web. */
const app = (page: Page) => page.locator('#root');

test.beforeEach(async ({ page }) => {
  await serveFixtures(page);
});

/** Enters the 6-digit code (the stand-in server accepts any). */
async function enterCode(page: Page) {
  await page.getByTestId('verify-code').fill('123456');
  await page.getByTestId('verify-submit').click();
}

/** Requests a code on the current tab and enters it. */
async function sendAndEnterCode(page: Page, email = 'new@example.com') {
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-send-code').click();
  await expect(page.getByText(codeSent(email))).toBeVisible();
  await enterCode(page);
}

/** The password asked for after the code. */
async function createPassword(page: Page, password = 'movers2027') {
  await expect(page.getByText(en.auth.createPasswordTitle)).toBeVisible();
  await page.getByTestId('password-new').fill(password);
  await page.getByTestId('password-save').click();
}

/** Signs in on the "Sign in" tab. */
async function signInWithPassword(page: Page, email: string, password = STAND_IN_PASSWORD) {
  await page.getByTestId('auth-email').fill(email);
  await page.getByTestId('auth-password').fill(password);
  await page.getByTestId('auth-sign-in').click();
}

test.describe('signed out', () => {
  test('opens on sign in with email and password, with create account next to it', async ({ page }) => {
    await page.goto(url);
    await expect(page.getByTestId('auth-email')).toBeVisible();
    await expect(page.getByTestId('auth-password')).toBeVisible();
    await expect(page.getByTestId('auth-forgot')).toBeVisible();
    await expect(page.getByTestId('auth-mode-register')).toBeVisible();
    await expect(page).toHaveScreenshot('sign-in.png');
  });

  test('sign in: a wrong email and a missing password show under their fields, read out together', async ({ page }) => {
    await page.goto(url);
    await page.getByTestId('auth-email').fill('not-an-email');
    await page.getByTestId('auth-sign-in').click();
    await expect(app(page).getByText(en.auth.errors.invalid_email)).toBeVisible();
    await expect(app(page).getByText(en.auth.errors.password_required)).toBeVisible();
    await expect(page.locator('#a11y-announcer')).toHaveText(`${en.auth.errors.invalid_email} ${en.auth.errors.password_required}`);
    await expect(page).toHaveScreenshot('sign-in-error.png');
  });

  test('sign in with email and password: no code, straight home', async ({ page }) => {
    const calls = await fakeAccount(page, { role: 'customer', email: 'ana@example.com' });
    await page.goto(url);
    await signInWithPassword(page, 'ana@example.com');
    await expect(page.getByTestId('home-sign-out')).toBeVisible();
    expect(calls.signIns).toEqual([{ email: 'ana@example.com', password: STAND_IN_PASSWORD }]);
    expect(calls.verified).toEqual([]);
  });

  test('sign in: a wrong password and an unknown address get the same answer', async ({ page }) => {
    const calls = await fakeAccount(page, { role: 'customer', email: 'ana@example.com' });
    await page.goto(url);
    await signInWithPassword(page, 'ana@example.com', 'wrongpass1');
    await expect(page.getByTestId('auth-error')).toHaveText(en.auth.errors.wrong_credentials);
    await signInWithPassword(page, 'nobody@example.com');
    await expect(page.getByTestId('auth-error')).toHaveText(en.auth.errors.wrong_credentials);
    await expect(page.locator('#a11y-announcer')).toHaveText(en.auth.errors.wrong_credentials);
    expect(calls.signIns).toHaveLength(2);
    // Addresses stay out of the URL (browser history, server logs — COMPLIANCE §9).
    expect(decodeURIComponent(page.url())).not.toContain('example.com');
  });

  test('"Show password" shows what was typed, and hides it again', async ({ page }) => {
    await page.goto(url);
    await page.getByTestId('auth-password').fill('secret12');
    await expect(page.getByTestId('auth-password')).toHaveAttribute('type', 'password');
    await page.getByTestId('auth-password-toggle').click();
    await expect(page.getByTestId('auth-password')).not.toHaveAttribute('type', 'password');
    await page.getByRole('button', { name: en.auth.hidePassword }).click();
    await expect(page.getByTestId('auth-password')).toHaveAttribute('type', 'password');
  });

  test('forgot password: a code by email, then a new password, then home', async ({ page }) => {
    const calls = await fakeAccount(page, { role: 'customer', email: 'ana@example.com' });
    await page.goto(url);
    await page.getByTestId('auth-email').fill('ana@example.com');
    await page.getByTestId('auth-forgot').click();
    // The address typed on sign in comes along.
    await expect(page.getByTestId('forgot-email')).toHaveValue('ana@example.com');
    await page.getByTestId('forgot-send-code').click();
    await expect(page.getByText(en.auth.recoveryCodeSentTo.replace('{{target}}', 'ana@example.com'))).toBeVisible();
    await expect(page.getByText(en.auth.recoveryNoCode)).toBeVisible();
    expect(calls.recovered).toEqual(['ana@example.com']);
    await enterCode(page);
    await expect(page.getByText(en.auth.newPasswordTitle)).toBeVisible();
    // The server refuses the old password again.
    await page.getByTestId('password-new').fill(STAND_IN_PASSWORD);
    await page.getByTestId('password-save').click();
    await expect(app(page).getByText(en.auth.errors.same_password)).toBeVisible();
    await page.getByTestId('password-new').fill('movers2027');
    await page.getByTestId('password-save').click();
    await expect(page.getByTestId('home-sign-out')).toBeVisible();
    expect(calls.verified).toEqual([{ type: 'recovery', email: 'ana@example.com' }]);
    expect(calls.updates.at(-1)).toEqual({ password: 'movers2027' });
    // Nothing is owed any more: a reload opens home.
    expect(await stored(page, PASSWORD_OWED_KEY)).toBeNull();
  });

  test('forgot password: a reload on "Choose a new password" keeps asking for it', async ({ page }) => {
    await fakeAccount(page, { role: 'customer', email: 'ana@example.com' });
    await page.goto(url);
    await page.getByTestId('auth-forgot').click();
    await page.getByTestId('forgot-email').fill('ana@example.com');
    await page.getByTestId('forgot-send-code').click();
    await enterCode(page);
    await expect(page.getByText(en.auth.newPasswordTitle)).toBeVisible();
    await page.reload();
    await expect(page.getByText(en.auth.newPasswordTitle)).toBeVisible();
    await expect(page.getByTestId('home-sign-out')).toHaveCount(0);
  });

  test('forgot password: asking twice gets the same answer for an address with and without an account', async ({ page }) => {
    const calls = await fakeAccount(page, { role: 'customer', email: 'ana@example.com' });
    await page.goto(url);
    for (const address of ['ana@example.com', 'ana@example.com', 'nobody@example.com', 'nobody@example.com']) {
      await page.getByTestId('auth-forgot').click();
      await page.getByTestId('forgot-email').fill(address);
      await page.getByTestId('forgot-send-code').click();
      // The second request for Ana's address is refused by Supabase Auth's per-address limit: the
      // earlier code still works, and the screen says exactly what it says for any address.
      await expect(page.getByText(en.auth.recoveryCodeSentTo.replace('{{target}}', address))).toBeVisible();
      await page.getByTestId('verify-change-email').click();
      await page.getByTestId('forgot-back').click();
    }
    expect(calls.recovered).toEqual(['ana@example.com', 'ana@example.com', 'nobody@example.com', 'nobody@example.com']);
  });

  test('a code asked for and not used doesn\'t force a new password after signing in with the password', async ({ page }) => {
    await fakeAccount(page, { role: 'customer', email: 'ana@example.com' });
    await page.goto(url);
    await page.getByTestId('auth-forgot').click();
    await page.getByTestId('forgot-email').fill('ana@example.com');
    await page.getByTestId('forgot-send-code').click();
    await page.getByTestId('verify-change-email').click();
    await page.getByTestId('forgot-back').click();
    await signInWithPassword(page, 'ana@example.com');
    await expect(page.getByTestId('home-sign-out')).toBeVisible();
    await expect(page.getByText(en.auth.newPasswordTitle)).toHaveCount(0);
  });

  test('"Forgot password?" is its own screen: Back returns to sign in with the address kept', async ({ page }) => {
    await page.goto(url);
    await page.getByTestId('auth-email').fill('ana@example.com');
    await page.getByTestId('auth-forgot').click();
    await expect(page.getByTestId('forgot-email')).toHaveValue('ana@example.com');
    await page.goBack();
    await expect(page.getByTestId('auth-password')).toBeVisible();
    await expect(page.getByTestId('auth-email')).toHaveValue('ana@example.com');
  });

  test('an address corrected on "Forgot password?" comes back to the sign-in form', async ({ page }) => {
    await page.goto(url);
    await page.getByTestId('auth-email').fill('ana@example.con');
    await page.getByTestId('auth-forgot').click();
    await page.getByTestId('forgot-email').fill('ana@example.com');
    await page.getByTestId('forgot-back').click();
    await expect(page.getByTestId('auth-email')).toHaveValue('ana@example.com');
  });

  test('create account: a reload on "Create your password" keeps asking for it', async ({ page }) => {
    await serveOtp(page);
    await fakeAccount(page, { role: null });
    await page.goto(url);
    await page.getByTestId('auth-mode-register').click();
    await page.getByTestId('role-customer').click();
    await sendAndEnterCode(page);
    await expect(page.getByText(en.auth.createPasswordTitle)).toBeVisible();
    await page.reload();
    await expect(page.getByText(en.auth.createPasswordTitle)).toBeVisible();
    await expect(page.getByTestId('home-sign-out')).toHaveCount(0);
  });

  test('create account: a code asked for again within a minute still goes to the code screen', async ({ page }) => {
    let requests = 0;
    await page.route('**/auth/v1/otp*', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      requests += 1;
      // The second request: Supabase Auth's per-address limit (the first code still works).
      return requests === 1
        ? route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: '{}' })
        : route.fulfill({
            status: 429,
            contentType: 'application/json',
            headers: cors,
            body: JSON.stringify({ code: 429, error_code: 'over_email_send_rate_limit', msg: 'For security purposes, you can only request this after 52 seconds.' }),
          });
    });
    await page.goto(url);
    for (let attempt = 0; attempt < 2; attempt++) {
      await page.getByTestId('auth-mode-register').click();
      await page.getByTestId('role-customer').click();
      await page.getByTestId('auth-email').fill('new@example.com');
      await page.getByTestId('auth-send-code').click();
      await expect(page.getByText(codeSent('new@example.com'))).toBeVisible();
      await page.getByTestId('verify-change-email').click();
    }
    expect(requests).toBe(2);
  });

  test('create account: when the hourly email budget is used up it says so, instead of "code sent"', async ({ page }) => {
    await serveOtp(page, 429, JSON.stringify({ code: 429, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' }));
    await page.goto(url);
    await page.getByTestId('auth-mode-register').click();
    await page.getByTestId('role-customer').click();
    await page.getByTestId('auth-email').fill('new@example.com');
    await page.getByTestId('auth-send-code').click();
    await expect(app(page).getByText(en.auth.errors.too_many_attempts)).toBeVisible();
    await expect(page.getByTestId('verify-code')).toHaveCount(0);
  });

  test('a code used in one tab of the computer version: another open tab asks for the password too', async ({ page, context }) => {
    await serveOtp(page);
    await fakeAccount(page, { role: null });
    const other = await context.newPage();
    await serveFixtures(other);
    await fakeAccount(other, { role: null });
    await other.goto(url);
    await expect(other.getByTestId('auth-email')).toBeVisible();
    await page.goto(url);
    await page.getByTestId('auth-mode-register').click();
    await page.getByTestId('role-customer').click();
    await sendAndEnterCode(page);
    await expect(page.getByText(en.auth.createPasswordTitle)).toBeVisible();
    // The other tab hears about the sign-in and shows the same step, not the home screen.
    await expect(other.getByText(en.auth.createPasswordTitle)).toBeVisible();
    await expect(other.getByTestId('home-sign-out')).toHaveCount(0);
  });

  test('forgot password: an address without an account gets the same answer, and back leads to sign in', async ({ page }) => {
    const calls = await fakeAccount(page, { role: 'customer', email: 'ana@example.com' });
    await page.goto(url);
    await page.getByTestId('auth-forgot').click();
    await page.getByTestId('forgot-back').click();
    await expect(page.getByTestId('auth-password')).toBeVisible();
    await page.getByTestId('auth-forgot').click();
    await page.getByTestId('forgot-email').fill('nobody@example.com');
    await page.getByTestId('forgot-send-code').click();
    await expect(page.getByText(en.auth.recoveryCodeSentTo.replace('{{target}}', 'nobody@example.com'))).toBeVisible();
    expect(calls.recovered).toEqual(['nobody@example.com']);
  });

  test('create account: the role and email errors are read out together, once per attempt', async ({ page }) => {
    await page.goto(url);
    await page.getByTestId('auth-mode-register').click();
    await page.getByTestId('auth-send-code').click();
    await expect(page.locator('#a11y-announcer')).toHaveText(`${en.auth.errors.choose_role} ${en.auth.errors.invalid_email}`);
    // Each radio's spoken name carries the error too (react-native-web drops accessibility hints).
    await expect(page.getByRole('radio', { name: new RegExp(en.auth.errors.choose_role) })).toHaveCount(2);
  });

  test('create account: no code until you choose customer or mover', async ({ page }) => {
    const sent = await serveOtp(page);
    await page.goto(url);
    await page.getByTestId('auth-mode-register').click();
    await page.getByTestId('auth-email').fill('new@example.com');
    await page.getByTestId('auth-send-code').click();
    await expect(app(page).getByText(en.auth.errors.choose_role)).toBeVisible();
    expect(sent).toEqual([]);
    await expect(page).toHaveScreenshot('create-account-choose.png');
  });

  test('the typed email stays when switching between sign in and create account', async ({ page }) => {
    await page.goto(url);
    await page.getByTestId('auth-email').fill('new@example.com');
    await page.getByTestId('auth-mode-register').click();
    await expect(page.getByTestId('auth-email')).toHaveValue('new@example.com');
  });

  test('create account as a mover: the role waits for the code, it is never sent with the request', async ({ page }) => {
    const sent = await serveOtp(page);
    await page.goto(url);
    await page.getByTestId('auth-mode-register').click();
    await page.getByTestId('role-mover').click();
    await expect(page.getByRole('radio', { name: new RegExp(`^${en.auth.roleMover}`) })).toBeChecked();
    await expect(page.getByRole('radio', { name: new RegExp(`^${en.auth.roleCustomer}`) })).not.toBeChecked();
    await page.getByTestId('auth-email').fill('new@example.com');
    await expect(page).toHaveScreenshot('create-account-mover.png');
    await page.getByTestId('auth-send-code').click();
    await expect(page.getByText(codeSent('new@example.com'))).toBeVisible();
    expect(sent).toEqual([expect.objectContaining({ email: 'new@example.com', create_user: true, data: { locale: 'en' } })]);
  });

  test('after the code, a new account creates its password first, then opens the side it chose', async ({ page }) => {
    await serveOtp(page);
    const calls = await fakeAccount(page, { role: null });
    await page.goto(url);
    await page.getByTestId('auth-mode-register').click();
    await page.getByTestId('role-mover').click();
    await sendAndEnterCode(page);
    await expect(page.getByText(en.auth.createPasswordTitle)).toBeVisible();
    expect(calls.verified).toEqual([{ type: 'email', email: 'new@example.com' }]);
    expect(calls.chosen).toEqual([]);
    // The rules are checked before anything is sent.
    await page.getByTestId('password-new').fill('short1');
    await page.getByTestId('password-save').click();
    await expect(app(page).getByText(en.auth.errors.password_too_short)).toBeVisible();
    await page.getByTestId('password-new').fill('onlyletters');
    await page.getByTestId('password-save').click();
    await expect(app(page).getByText(en.auth.errors.password_weak)).toBeVisible();
    expect(calls.updates).toEqual([]);
    await expect(page).toHaveScreenshot('create-password.png');
    await page.getByTestId('password-new').fill('movers2027');
    await page.getByTestId('password-save').click();
    await expect(page.getByText(en.mover.homeTitle)).toBeVisible();
    expect(calls.updates).toEqual([{ password: 'movers2027' }]);
    expect(calls.chosen).toEqual(['mover']);
  });

  test('an account without a role (e.g. made on the website) chooses it after signing in', async ({ page }) => {
    const calls = await fakeAccount(page, { role: null, email: 'web@example.com', hasPassword: true });
    await page.goto(url);
    await signInWithPassword(page, 'web@example.com');
    await expect(page.getByTestId('role-continue')).toBeVisible();
    // It says which account this is.
    await expect(page.getByText(en.auth.signedInAs.replace('{{email}}', 'web@example.com'))).toBeVisible();
    await page.getByTestId('role-continue').click();
    await expect(app(page).getByText(en.auth.errors.choose_role)).toBeVisible();
    expect(calls.chosen).toEqual([]);
    await page.getByTestId('role-customer').click();
    await expect(page).toHaveScreenshot('choose-role.png');
    await page.getByTestId('role-continue').click();
    await expect(page.getByTestId('home-sign-out')).toBeVisible();
    expect(calls.chosen).toEqual(['customer']);
  });

  test('an email that already has a customer account: create account as a mover signs in, says so and points to the switch', async ({ page }) => {
    await serveOtp(page);
    const calls = await fakeAccount(page, { role: 'customer' });
    await page.goto(url);
    await page.getByTestId('auth-mode-register').click();
    await page.getByTestId('role-mover').click();
    await sendAndEnterCode(page);
    // A sign-in by code always ends with choosing a password — no endless sign-in by code. The
    // account's current password is fine (Supabase Auth calls it same_password).
    await createPassword(page, STAND_IN_PASSWORD);
    await expect(page.getByTestId('home-notice')).toHaveText(en.auth.existingCustomer);
    await expect(page.getByTestId('home-sign-out')).toBeVisible();
    expect(calls.updates).toEqual([{ password: STAND_IN_PASSWORD }]);
    // Never switched without being asked.
    expect(calls.chosen).toEqual([]);
    await page.getByTestId('switch-to-mover').click();
    await expect(page.getByText(en.mover.checklistTitle)).toBeVisible();
    await expect(page.getByTestId('home-notice')).toHaveCount(0);
    expect(calls.chosen).toEqual(['mover']);
  });

  test('if saving the role fails, the choice comes back with Retry; switching sides then shows no notice', async ({ page }) => {
    await serveOtp(page);
    const calls = await fakeAccount(page, { role: null, failChooseRole: 1 });
    await page.goto(url);
    await page.getByTestId('auth-mode-register').click();
    await page.getByTestId('role-mover').click();
    await sendAndEnterCode(page);
    await createPassword(page);
    await expect(app(page).getByText(en.common.errorGeneric)).toBeVisible();
    await expect(page.getByRole('radio', { name: new RegExp(`^${en.auth.roleMover}`) })).toBeChecked();
    await page.getByTestId('role-customer').click();
    await page.getByTestId('role-continue').click();
    await expect(page.getByTestId('home-sign-out')).toBeVisible();
    await expect(page.getByTestId('home-notice')).toHaveCount(0);
    expect(calls.chosen).toEqual(['mover', 'customer']);
  });

  test('create account fits a small phone: a person can scroll to Send code', async ({ page }) => {
    await serveOtp(page);
    await page.setViewportSize({ width: 360, height: 520 });
    await page.goto(url);
    await page.getByTestId('auth-mode-register').click();
    const send = page.getByTestId('auth-send-code');
    await expect(send).not.toBeInViewport();
    // Scroll like a person (a wheel or a swipe), not the way Playwright reaches elements from code.
    await page.mouse.move(180, 300);
    await page.mouse.wheel(0, 1500);
    await expect(send).toBeInViewport();
    await page.mouse.wheel(0, -1500);
    await expect(page.getByText(en.auth.registerTitle, { exact: true }).first()).toBeInViewport();
  });

  test('the code screen without a pending sign-in (e.g. after a reload) starts again at sign in', async ({ page }) => {
    await page.goto(`${url}verify`);
    await expect(page.getByTestId('auth-email')).toBeVisible();
  });
});

test.describe('a password still owed when the app opens again (closed after the code)', () => {
  test('a new account chooses it before anything else', async ({ page }) => {
    const calls = await signInAs(page, 'customer', { passwordOwed: 'register' });
    await page.goto(url);
    await createPassword(page);
    await expect(page.getByTestId('home-sign-out')).toBeVisible();
    expect(calls.updates).toEqual([{ password: 'movers2027' }]);
  });

  test('after "Forgot password?" it is a new password', async ({ page }) => {
    await signInAs(page, 'customer', { passwordOwed: 'recovery' });
    await page.goto(url);
    await expect(page.getByText(en.auth.newPasswordTitle)).toBeVisible();
  });

  test('signing out instead forgets it', async ({ page }) => {
    await signInAs(page, 'mover', { passwordOwed: 'register' });
    await page.goto(url);
    await expect(page.getByText(en.auth.createPasswordTitle)).toBeVisible();
    await page.getByTestId('password-sign-out').click();
    await expect(page.getByTestId('auth-password')).toBeVisible();
    expect(await stored(page, PASSWORD_OWED_KEY)).toBeNull();
  });
});

test.describe('language', () => {
  const sq = resources.sq.translation;

  test('signed out: switch to Albanian; the choice stays after a reload', async ({ page }) => {
    await page.goto(url);
    await expect(page.getByTestId('language-button')).toHaveAccessibleName(`${en.common.language}: English`);
    await page.getByTestId('language-button').click();
    await expect(page.getByRole('radio', { name: 'English' })).toBeChecked();
    await expect(page).toHaveScreenshot('language-menu.png');
    await page.getByTestId('language-sq').click();
    await expect(page.getByText(sq.auth.passwordSubtitle)).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('lang', 'sq');
    await page.reload();
    await expect(page.getByText(sq.auth.passwordSubtitle)).toBeVisible();
    await expect(page.getByTestId('language-button')).toHaveAccessibleName(`${sq.common.language}: Shqip`);
  });

  test('closing the menu keeps the language', async ({ page }) => {
    await page.goto(url);
    await page.getByTestId('language-button').click();
    await page.getByTestId('language-close').click();
    await expect(page.getByTestId('language-sq')).toHaveCount(0);
    await expect(page.getByText(en.auth.passwordSubtitle)).toBeVisible();
  });

  test('signed in: switching from the customer home is saved with the account', async ({ page }) => {
    const calls = await signInAs(page, 'customer');
    await page.goto(url);
    await page.getByTestId('language-button').click();
    await page.getByTestId('language-de').click();
    await expect(page.getByText(resources.de.translation.landing.hero.subtitle)).toBeVisible();
    await expect.poll(() => calls.profileUpdates).toEqual([{ locale: 'de' }]);
  });

  test('the mover side has it too', async ({ page }) => {
    const calls = await signInAs(page, 'mover');
    await page.goto(url);
    await page.getByTestId('language-button').click();
    await page.getByTestId('language-pl').click();
    await expect(page.getByText(resources.pl.translation.mover.homeTitle)).toBeVisible();
    await expect.poll(() => calls.profileUpdates).toEqual([{ locale: 'pl' }]);
  });
});

test.describe('signed in as a customer', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'customer');
    await page.goto(url);
  });

  /** "€152.80", "€162" — like formatMoney in English. */
  const euros = (cents: number) => `€${cents % 100 ? (cents / 100).toFixed(2) : cents / 100}`;

  test('home: quote card with the movers’ prices, to the cent', async ({ page }) => {
    // Each class shows its cheapest mover's own price, exactly (COMPLIANCE §13).
    for (const { vehicleClass, offers } of savedQuote.classes) {
      const prices = offers.filter((o) => o.quote.currency === 'EUR').map((o) => o.quote.moverPrice);
      if (prices.length) await expect(page.getByTestId(`class-${vehicleClass}`)).toContainText(euros(Math.min(...prices)));
    }
    await expect(page.getByTestId('home-notice')).toHaveCount(0);
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('customer-home.png');
  });

  test('sign out returns to sign in, and the device forgets the side', async ({ page }) => {
    // The app saved the side the server confirmed, for the next start.
    await expect.poll(() => stored(page, SAVED_ROLE_KEY)).toBe(JSON.stringify({ userId: STAND_IN_ID, role: 'customer' }));
    await page.getByTestId('home-sign-out').click();
    await expect(page.getByTestId('auth-email')).toBeVisible();
    expect(await stored(page, SAVED_ROLE_KEY)).toBeNull();
    expect(await stored(page, SESSION_KEY)).toBeNull();
  });
});

test("a customer who opens the mover's company form is sent home", async ({ page }) => {
  await signInAs(page, 'customer');
  await page.goto(`${url}mover/company`);
  await expect(page.getByTestId('home-sign-out')).toBeVisible();
  await expect(page.getByText(en.mover.company.title, { exact: true })).toHaveCount(0);
});

test.describe('switching sides', () => {
  test('a customer switches to the mover side, which starts with the setup, and back', async ({ page }) => {
    const { chosen } = await signInAs(page, 'customer');
    await page.goto(url);
    // The way to the mover side says what a mover fills in first.
    await expect(page.getByText(en.customer.switchText)).toBeVisible();
    await page.getByTestId('switch-to-mover').click();
    await expect(page.getByText(en.mover.checklistTitle)).toBeVisible();
    await expect(page.getByText(en.mover.exampleLabel)).toBeVisible();
    await expect(page.locator('#a11y-announcer')).toHaveText(en.mover.nowHere);

    await page.getByTestId('switch-to-customer').click();
    await expect(page.getByTestId('switch-to-mover')).toBeVisible();
    await expect(page.locator('#a11y-announcer')).toHaveText(en.customer.nowHere);
    expect(chosen).toEqual(['mover', 'customer']);
  });

  test('switching without network fails at once with the error, also when the browser knows it is offline', async ({ page }) => {
    await signInAs(page, 'customer');
    await page.goto(url);
    await expect(page.getByTestId('switch-to-mover')).toBeVisible();
    // The browser reports offline (TanStack Query would otherwise hold the request until it's back),
    // and the stand-in server stops answering too.
    await page.context().setOffline(true);
    await noNetwork(page);
    await page.getByTestId('switch-to-mover').click();
    await expect(app(page).getByText(en.common.errorGeneric)).toBeVisible();
    await expect(page.getByTestId('home-sign-out')).toBeVisible();
    await page.context().setOffline(false);
  });

  test('if switching fails, the person stays where they are and can try again', async ({ page }) => {
    const { chosen } = await signInAs(page, 'customer', { failChooseRole: 1 });
    await page.goto(url);
    await page.getByTestId('switch-to-mover').click();
    await expect(app(page).getByText(en.common.errorGeneric)).toBeVisible();
    await expect(page.getByTestId('home-sign-out')).toBeVisible();
    await page.getByTestId('switch-to-mover').click();
    await expect(page.getByText(en.mover.checklistTitle)).toBeVisible();
    expect(chosen).toEqual(['mover', 'mover']);
  });
});

test.describe('without network', () => {
  // With an expired session the profile request waits while supabase-js keeps trying to renew it
  // (~25 s), then fails; TanStack Query tries once more (1 s later), and postgrest repeats a failed read
  // 3 times (1 + 2 + 4 s). Without the device fallback the error screen would show at ~33.5 s: the
  // checks run again after that.
  const SETTLED_MS = 40_000;
  test.setTimeout(90_000);

  test('opens on the side last shown on this device, even with an expired session', async ({ page }) => {
    await offlineWithSavedSide(page, 'mover');
    await page.goto(url);
    await expect(page.getByText(en.mover.homeTitle)).toBeVisible();
    await page.waitForTimeout(SETTLED_MS);
    await expect(page.getByText(en.mover.homeTitle)).toBeVisible();
    await expect(page.getByTestId('auth-email')).toHaveCount(0);
    await expect(page.getByTestId('profile-retry')).toHaveCount(0);
  });

  test('a customer too', async ({ page }) => {
    await offlineWithSavedSide(page, 'customer');
    await page.goto(url);
    await page.waitForTimeout(SETTLED_MS);
    await expect(page.getByTestId('switch-to-mover')).toBeVisible();
    await expect(page.getByTestId('profile-retry')).toHaveCount(0);
  });

  test('the side the app saved itself opens the next start without network', async ({ page }) => {
    await signInAs(page, 'mover');
    await page.goto(url);
    await expect(page.getByText(en.mover.homeTitle)).toBeVisible();
    await expect.poll(() => stored(page, SAVED_ROLE_KEY)).toBe(JSON.stringify({ userId: STAND_IN_ID, role: 'mover' }));
    await noNetwork(page);
    await page.reload();
    await expect(page.getByText(en.mover.homeTitle)).toBeVisible();
    // Without the device fallback the error screen would show at ~15 s (postgrest's 1 + 2 + 4 s, TanStack's
    // retry 1 s later, postgrest's again): the check runs after that.
    await page.waitForTimeout(20_000);
    await expect(page.getByText(en.mover.homeTitle)).toBeVisible();
    await expect(page.getByTestId('profile-retry')).toHaveCount(0);
  });

  test('sign out works without network, also with an expired session', async ({ page }) => {
    await offlineWithSavedSide(page, 'customer');
    await page.goto(url);
    await page.getByTestId('home-sign-out').click();
    await expect(page.getByTestId('auth-email')).toBeVisible();
    expect(await stored(page, SESSION_KEY)).toBeNull();
    expect(await stored(page, SAVED_ROLE_KEY)).toBeNull();
  });
});

const prishtinaDetails = { street: 'Rr. Agim Ramadani', houseNumber: '12', postcode: '10000', city: 'Prishtinë', countryCode: 'XK', lat: 42.6629, lon: 21.1655 };

/** A company already saved by the form (Kosovo, waiting for verification), with `changes`. */
const savedCompany = (changes: Record<string, unknown> = {}) => ({
  id: '00000000-0000-4000-8000-0000000c0002',
  is_business: true,
  legal_name: 'Lëvizje Shpk',
  registration_no: '810123456',
  tax_id: '601234567',
  country: 'XK',
  tax_residency_country: 'XK',
  address: 'Rr. Agim Ramadani 12, 10000 Prishtinë',
  address_details: prishtinaDetails,
  contact_phone: '+38344123456',
  contact_email: 'info@levizje.example',
  verification_status: 'pending',
  self_certification_at: '2026-10-01T09:00:00.000Z',
  ...changes,
});

/** A checked van in use (Kosovo company). */
const van = {
  id: '00000000-0000-4000-8000-0000000be100',
  class: 'VAN',
  plate: '01-111 AA',
  max_weight_kg: 2800,
  volume_m3: 6,
  has_tail_lift: false,
  tachograph: false,
  active: true,
  verified_at: '2026-10-10T09:00:00.000Z',
  created_at: '2026-10-01T09:00:00.000Z',
};

/** A saved rate card (EUR). */
const savedCard = {
  currency: 'EUR',
  base_fee: 2500,
  per_km: 60,
  per_labor_minute_1_helper: 50,
  per_labor_minute_2_helpers: 96,
  per_labor_minute_3_helpers: null,
  min_price: 4000,
  floor_without_lift_fee: 500,
  heavy_item_fee: 1000,
  assembly_per_item: 1500,
  long_distance_threshold_km: null,
  long_distance_per_km: 0,
  confirmed_by_mover_at: '2026-10-12T09:00:00.000Z',
};

test.describe('signed in as a mover', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'mover');
    await fakeMoverCompany(page); // no company saved yet
  });

  test('home: setup checklist and an example request with the payout', async ({ page }) => {
    await page.goto(url);
    await expect(page.getByText(en.mover.homeTitle)).toBeVisible();
    await expect(page.getByText(en.landing.movers.phone.payout, { exact: true })).toBeVisible();
    await expect(page.getByText(/^€\d/).first()).toBeVisible(); // priced from the quote, not "—"
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('mover-home.png');
  });

  test('example request: accepting shows the confirmation', async ({ page }) => {
    await page.goto(url);
    await expect(page.getByText(/^€\d/).first()).toBeVisible();
    await page.getByTestId('example-accept').click();
    await expect(page.getByText(en.landing.movers.phone.acceptedTitle)).toBeVisible();
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('mover-example-accepted.png');
  });

  test('company: the setup opens "Your company"; a first save sends only what movers may write', async ({ page }) => {
    const writes = await fakeMoverCompany(page);
    const checks = await fakeCompanyChecks(page);
    const c = en.mover.company;
    await page.goto(url);
    await expect(page.getByTestId('step-company')).toContainText(en.mover.stepStatus.todo);
    await page.getByTestId('step-company').click();
    await expect(page.getByRole('heading', { name: c.title })).toBeVisible();
    await expect(page.getByTestId('company-email')).toHaveValue('mover@example.com');

    // Nothing filled in: every missing field says so, nothing is sent. (Whether a registration number
    // is needed depends on the country.)
    await page.getByTestId('company-save').click();
    for (const text of [
      c.errors.legal_name_required,
      c.errors.tax_id_required,
      c.errors.address_required,
      c.errors.self_certification_required,
      en.auth.errors.invalid_phone,
    ])
      await expect(app(page).getByText(text, { exact: true })).toBeVisible();
    await expect(app(page).getByText(c.errors.country_required, { exact: true })).toHaveCount(2);
    expect(writes).toEqual([]);

    // The country first: the number fields then say what its numbers look like.
    await page.getByRole('radiogroup', { name: c.country }).getByRole('radio', { name: en.common.countries.XK }).click();
    await expect(page.getByText('Numri fiskal / NUI — e.g. 601234567')).toBeVisible();
    // Taxed where registered, unless changed.
    await expect(
      page.getByRole('radiogroup', { name: c.taxResidency }).getByRole('radio', { name: en.common.countries.XK }),
    ).toHaveAttribute('aria-checked', 'true');
    await page.getByTestId('company-legal-name').fill('Lëvizje Shpk');
    await page.getByTestId('company-registration').fill('810123456');
    await page.getByTestId('company-tax-id').fill('601 234 567');

    // The address: found on the map, then confirmed.
    await page.getByTestId('company-address-search').fill('Agim Ramadani');
    await page.getByTestId('company-address-suggestion').first().click();
    await expect(page.getByTestId('company-address-text')).toHaveText('Rr. Agim Ramadani 12, 10000 Prishtinë, Kosovo');
    await expect(page.getByTestId('company-address-house-number')).toHaveValue('12');
    await page.getByTestId('company-address-confirm').click();
    await expect(page.getByTestId('company-address-confirmed')).toBeVisible();

    // The phone: a code by WhatsApp.
    await page.getByTestId('company-phone').fill('+383 44 123 456');
    await page.getByRole('radio', { name: c.channelWhatsapp }).click();
    await page.getByTestId('company-phone-send').click();
    await expect(page.getByText(c.codeSent.replace('{{phone}}', '+38344123456'))).toBeVisible();
    await page.getByTestId('company-phone-code').fill('123456');
    await page.getByTestId('company-phone-confirm').click();
    await expect(page.getByTestId('company-phone-confirmed')).toBeVisible();
    expect(checks.phone).toEqual([
      { action: 'send', phone: '+38344123456', channel: 'whatsapp', locale: 'en' },
      { action: 'check', phone: '+38344123456', code: '123456' },
    ]);

    await page.getByTestId('company-self-certification').click();
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('mover-company.png');
    await page.getByTestId('company-save').click();

    // Back on the checklist, saved (not verified: MoversHub checks it with the documents).
    await expect(page.getByTestId('step-company')).toContainText(en.mover.stepStatus.saved);
    expect(checks.registry).toEqual([{ country: 'XK', isBusiness: true, taxId: '601234567', legalName: 'Lëvizje Shpk' }]);
    expect(writes).toHaveLength(1);
    expect(writes[0]?.method).toBe('POST');
    const { self_certification_at, ...sent } = writes[0]?.body ?? {};
    expect(self_certification_at).toEqual(expect.any(String));
    expect(sent).toEqual({
      owner_id: STAND_IN_ID,
      is_business: true,
      legal_name: 'Lëvizje Shpk',
      registration_no: '810123456',
      tax_id: '601234567',
      country: 'XK',
      tax_residency_country: 'XK',
      address: 'Rr. Agim Ramadani 12, 10000 Prishtinë',
      address_details: { street: 'Rr. Agim Ramadani', houseNumber: '12', postcode: '10000', city: 'Prishtinë', countryCode: 'XK', lat: 42.6629, lon: 21.1655 },
      address_point: 'SRID=4326;POINT(21.1655 42.6629)',
      contact_phone: '+38344123456',
      contact_email: 'mover@example.com',
    });
  });

  test('company: a wrong phone code says so; a number not confirmed is not saved', async ({ page }) => {
    const writes = await fakeMoverCompany(page, { initial: savedCompany({ contact_phone: null }) });
    await fakeCompanyChecks(page);
    await page.goto(url);
    await page.getByTestId('step-company').click();
    await page.getByTestId('company-phone').fill('+383 49 765 432');
    await page.getByTestId('company-phone-send').click();
    await page.getByTestId('company-phone-code').fill('000000');
    await page.getByTestId('company-phone-confirm').click();
    await expect(app(page).getByText(en.mover.company.errors.phone_code_wrong, { exact: true })).toBeVisible();
    await page.getByTestId('company-save').click();
    await expect(app(page).getByText(en.mover.company.errors.phone_not_confirmed, { exact: true })).toBeVisible();
    expect(writes).toEqual([]);
  });

  test('company: a tax number the register gives to another company is refused, with that name', async ({ page }) => {
    const writes = await fakeMoverCompany(page, {
      initial: savedCompany({ country: 'PL', tax_residency_country: 'PL', registration_no: '0000028860', tax_id: '5260250995', address_details: { ...prishtinaDetails, countryCode: 'PL' } }),
    });
    const checks = await fakeCompanyChecks(page, {
      confirmedPhones: ['+38344123456'],
      registry: { result: 'mismatch', register: 'pl-white-list', registeredName: 'ORLEN SPÓŁKA AKCYJNA', authoritative: false },
    });
    await page.goto(url);
    await page.getByTestId('step-company').click();
    await expect(page.getByText('NIP — e.g. 5260250995')).toBeVisible();
    // A wrong check digit never reaches the register.
    await page.getByTestId('company-tax-id').fill('7740001455');
    await page.getByTestId('company-save').click();
    await expect(app(page).getByText(en.mover.company.errors.tax_id_format, { exact: true })).toBeVisible();
    expect(checks.registry).toEqual([]);

    await page.getByTestId('company-tax-id').fill('PL 774-000-14-54');
    await page.getByTestId('company-save').click();
    await expect(
      app(page).getByText(en.mover.company.errors.tax_id_mismatch.replace('{{name}}', 'ORLEN SPÓŁKA AKCYJNA'), { exact: true }),
    ).toBeVisible();
    expect(checks.registry).toEqual([{ country: 'PL', isBusiness: true, taxId: '7740001454', legalName: 'Lëvizje Shpk' }]);
    expect(writes).toEqual([]);
  });

  test('company: a verified company says changes go back for a check; a private person has no registration number', async ({ page }) => {
    const writes = await fakeMoverCompany(page, { initial: savedCompany({ verification_status: 'verified' }) });
    await fakeCompanyChecks(page, { confirmedPhones: ['+38344123456'] });
    await page.goto(url);
    await expect(page.getByTestId('step-company')).toContainText(en.mover.stepStatus.verified);
    await page.getByTestId('step-company').click();
    await expect(page.getByTestId('company-reverify')).toHaveText(en.mover.company.reverifyNotice);
    await expect(page.getByTestId('company-legal-name')).toHaveValue('Lëvizje Shpk');
    await expect(page.getByTestId('company-address-confirmed')).toBeVisible();
    await expect(page.getByTestId('company-phone-confirmed')).toBeVisible();
    await expect(page.getByTestId('company-self-certification')).toHaveAttribute('aria-checked', 'true');

    await page.getByRole('radio', { name: en.mover.company.kindIndividual }).click();
    await expect(page.getByTestId('company-registration')).toHaveCount(0);
    await expect(page.getByText(en.mover.company.legalNameIndividual, { exact: true })).toBeVisible();
    await page.getByTestId('company-legal-name').fill('Arben Krasniqi');
    await page.getByTestId('company-tax-id').fill('1234567890');
    await page.getByTestId('company-save').click();

    await expect(page.getByTestId('step-company')).toContainText(en.mover.stepStatus.saved);
    expect(writes.map((w) => w.method)).toEqual(['PATCH']);
    expect(writes[0]?.body).toMatchObject({ is_business: false, registration_no: null, legal_name: 'Arben Krasniqi', tax_id: '1234567890' });
    expect(writes[0]?.body).not.toHaveProperty('verification_status');
    expect(writes[0]?.body).not.toHaveProperty('owner_id');
  });

  test('company: when saving fails, the form stays with what was typed and says so', async ({ page }) => {
    await fakeMoverCompany(page, { initial: savedCompany({ tax_residency_country: 'DE' }), failWrites: true });
    await fakeCompanyChecks(page, { confirmedPhones: ['+38344123456'] });
    await page.goto(url);
    await page.getByTestId('step-company').click();
    // Taxed elsewhere: changing the country of registration leaves the tax country as chosen.
    await page.getByRole('radiogroup', { name: en.mover.company.country }).getByRole('radio', { name: en.common.countries.AL }).click();
    await expect(
      page.getByRole('radiogroup', { name: en.mover.company.taxResidency }).getByRole('radio', { name: en.common.countries.DE }),
    ).toHaveAttribute('aria-checked', 'true');
    // Albania's NIPT is the registration number too; the address must now be in Albania.
    await expect(page.getByTestId('company-registration-same')).toBeVisible();
    await page.getByRole('radiogroup', { name: en.mover.company.country }).getByRole('radio', { name: en.common.countries.XK }).click();
    await page.getByTestId('company-save').click();
    await expect(page.getByTestId('company-error')).toHaveText(en.mover.company.errorSave);
    await expect(page.getByTestId('company-legal-name')).toHaveValue('Lëvizje Shpk');
  });

  test('documents: without a company first, the screen sends the mover to "Your company"', async ({ page }) => {
    await page.goto(url);
    await expect(page.getByTestId('step-documents')).toContainText(en.mover.stepStatus.todo);
    await page.getByTestId('step-documents').click();
    await expect(page.getByText(en.mover.documents.needCompany)).toBeVisible();
    await page.getByTestId('documents-company').click();
    await expect(page.getByRole('heading', { name: en.mover.company.title })).toBeVisible();
  });

  test('documents: the insurance is uploaded with its end date into the company folder, then checked', async ({ page }) => {
    await fakeMoverCompany(page, { initial: savedCompany() });
    const calls = await fakeMoverDocuments(page);
    const d = en.mover.documents;
    await page.goto(url);
    await page.getByTestId('step-documents').click();
    await expect(page.getByRole('heading', { name: d.title })).toBeVisible();
    // A business: register extract + insurance; CMR and licence only for cross-border jobs.
    for (const type of ['registration', 'insurance', 'cmr', 'licence']) await expect(page.getByTestId(`document-${type}`)).toBeVisible();
    await expect(page.getByTestId('document-id')).toHaveCount(0);
    await expect(page.getByTestId('document-insurance')).toContainText(d.status.missing);
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('mover-documents.png');

    const chooser = page.waitForEvent('filechooser');
    await page.getByTestId('document-insurance-choose').click();
    await (await chooser).setFiles({ name: 'polica-2027.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 stand-in policy') });
    await expect(page.getByTestId('document-insurance-file')).toContainText('polica-2027.pdf');

    // The end date: required, real, not past.
    await page.getByTestId('document-insurance-save').click();
    await expect(app(page).getByText(d.errors.expiry_required, { exact: true })).toBeVisible();
    await page.getByTestId('document-insurance-expiry').fill('31.12.2020');
    await page.getByTestId('document-insurance-save').click();
    await expect(app(page).getByText(d.errors.expiry_past, { exact: true })).toBeVisible();
    expect(calls.uploads).toEqual([]);

    await page.getByTestId('document-insurance-expiry').fill('31.12.2030');
    await page.getByTestId('document-insurance-save').click();
    await expect(page.getByTestId('document-insurance')).toContainText(d.status.checking);
    await expect(page.getByTestId('document-insurance')).toContainText(d.validUntil.replace('{{date}}', '31.12.2030'));
    expect(calls.uploads).toHaveLength(1);
    expect(calls.uploads[0]?.path).toMatch(/^00000000-0000-4000-8000-0000000c0002\/insurance\/[a-z0-9]+\.pdf$/);
    expect(calls.uploads[0]?.contentType).toBe('application/pdf');
    expect(calls.writes).toEqual([
      {
        method: 'POST',
        body: { company_id: '00000000-0000-4000-8000-0000000c0002', type: 'insurance', file_path: calls.uploads[0]?.path, expires_at: '2030-12-31T23:59:59Z' },
      },
    ]);
    expect(calls.removed).toEqual([]);
  });

  test('documents: a new file replaces the current one, which is then removed; files over 10 MB or of other types are refused', async ({ page }) => {
    await fakeMoverCompany(page, { initial: savedCompany() });
    const extract = {
      id: '00000000-0000-4000-8000-0000000d0099',
      type: 'registration',
      file_path: '00000000-0000-4000-8000-0000000c0002/registration/old.pdf',
      expires_at: null,
      verified_at: '2026-10-01T09:00:00.000Z',
      updated_at: '2026-10-01T09:00:00.000Z',
    };
    const calls = await fakeMoverDocuments(page, { initial: [extract] });
    await page.goto(url);
    await page.getByTestId('step-documents').click();
    await expect(page.getByTestId('document-registration')).toContainText(en.mover.documents.status.verified);

    const pick = async (file: { name: string; mimeType: string; buffer: Buffer }) => {
      const chooser = page.waitForEvent('filechooser');
      await page.getByTestId('document-registration-choose').click();
      await (await chooser).setFiles(file);
    };
    await pick({ name: 'notes.zip', mimeType: 'application/zip', buffer: Buffer.from('zip') });
    await expect(page.getByTestId('document-registration-problem')).toHaveText(en.mover.documents.errors.file_type);
    await pick({ name: 'huge.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(11 * 1024 * 1024) });
    await expect(page.getByTestId('document-registration-problem')).toHaveText(en.mover.documents.errors.file_too_large);

    await pick({ name: 'extract.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('jpeg stand-in') });
    // A register extract has no end date to ask for.
    await expect(page.getByTestId('document-registration-expiry')).toHaveCount(0);
    await page.getByTestId('document-registration-save').click();
    await expect(page.getByTestId('document-registration')).toContainText(en.mover.documents.status.checking);
    expect(calls.uploads[0]?.path).toMatch(/\/registration\/[a-z0-9]+\.jpg$/);
    expect(calls.writes).toEqual([{ method: 'PATCH', body: { file_path: calls.uploads[0]?.path, expires_at: null } }]);
    expect(calls.removed).toEqual([extract.file_path]);
  });

  test('vans: a van is added with its class, plate, weight and volume, and waits for the check', async ({ page }) => {
    await fakeMoverCompany(page, { initial: savedCompany() });
    const writes = await fakeVehicles(page);
    const v = en.mover.vehicles;
    await page.goto(url);
    await expect(page.getByTestId('step-vehicles')).toContainText(en.mover.stepStatus.todo);
    await page.getByTestId('step-vehicles').click();
    await expect(page.getByText(v.none)).toBeVisible();
    await page.getByTestId('vehicles-add').click();
    await expect(page.getByRole('heading', { name: v.addTitle })).toBeVisible();

    await page.getByTestId('vehicle-save').click();
    for (const text of [v.errors.class_required, v.errors.plate_required, v.errors.weight_required, v.errors.volume_required])
      await expect(app(page).getByText(text, { exact: true })).toBeVisible();

    await page.getByRole('radio', { name: en.vehicles.LARGE_VAN.name }).click();
    await page.getByTestId('vehicle-plate').fill('01-234 ab');
    await page.getByTestId('vehicle-weight').fill('4200');
    await page.getByTestId('vehicle-volume').fill('13,5');
    await page.getByTestId('vehicle-save').click();
    await expect(app(page).getByText(v.errors.weight_too_heavy_for_class, { exact: true })).toBeVisible();
    expect(writes).toEqual([]);

    await page.getByTestId('vehicle-weight').fill('3500');
    // Over 2.5 t: the tachograph question appears.
    await page.getByTestId('vehicle-tachograph').click();
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('mover-vehicle-form.png');
    await page.getByTestId('vehicle-save').click();

    await expect(page.getByTestId('vehicle-01-234 AB')).toContainText(`${en.vehicles.LARGE_VAN.name} · 01-234 AB`);
    await expect(page.getByTestId('vehicle-01-234 AB')).toContainText('3.5 t · 13.5 m³ · Tachograph');
    await expect(page.getByTestId('vehicle-01-234 AB')).toContainText(v.status.checking);
    expect(writes).toEqual([
      {
        method: 'POST',
        body: {
          class: 'LARGE_VAN',
          plate: '01-234 AB',
          max_weight_kg: 3500,
          volume_m3: 13.5,
          has_tail_lift: false,
          tachograph: true,
          company_id: '00000000-0000-4000-8000-0000000c0002',
        },
      },
    ]);
    await page.getByTestId('vehicles-back').click();
    await expect(page.getByTestId('step-vehicles')).toContainText(en.mover.stepStatus.saved);
  });

  test('vans: changing a checked van says it goes back to the check; a van is taken out of use, never deleted', async ({ page }) => {
    await fakeMoverCompany(page, { initial: savedCompany() });
    const van = {
      id: '00000000-0000-4000-8000-0000000be100',
      class: 'VAN',
      plate: '01-111 AA',
      max_weight_kg: 2800,
      volume_m3: 6,
      has_tail_lift: false,
      tachograph: false,
      active: true,
      verified_at: '2026-10-10T09:00:00.000Z',
      created_at: '2026-10-01T09:00:00.000Z',
    };
    const box = { ...van, id: '00000000-0000-4000-8000-0000000be101', class: 'BOX', plate: '01-222 BB', max_weight_kg: 3500, volume_m3: 20, verified_at: null };
    const writes = await fakeVehicles(page, { initial: [van, box] });
    const v = en.mover.vehicles;
    await page.goto(url);
    await expect(page.getByTestId('step-vehicles')).toContainText(en.mover.stepStatus.verified);
    await page.getByTestId('step-vehicles').click();
    await expect(page.getByTestId('vehicle-01-111 AA')).toContainText(v.status.verified);

    await page.getByTestId('vehicle-01-111 AA-edit').click();
    await expect(page.getByTestId('vehicle-reverify')).toHaveText(v.reverifyNotice);
    await expect(page.getByTestId('vehicle-weight')).toHaveValue('2800');
    // The other van's plate is taken.
    await page.getByTestId('vehicle-plate').fill('01-222 BB');
    await page.getByTestId('vehicle-save').click();
    await expect(app(page).getByText(v.errors.plate_taken, { exact: true })).toBeVisible();
    await page.getByTestId('vehicle-plate').fill('01-111 AA');
    await page.getByTestId('vehicle-weight').fill('3100');
    await page.getByTestId('vehicle-save').click();
    await expect(page.getByTestId('vehicle-01-111 AA')).toContainText(v.status.checking);

    await page.getByTestId('vehicle-01-111 AA-toggle').click();
    await expect(page.getByTestId('vehicle-01-111 AA')).toContainText(v.status.inactive);
    await expect(page.getByTestId('vehicle-01-111 AA-toggle')).toHaveText(v.useAgain);
    expect(writes.map((w) => [w.method, w.body])).toEqual([
      ['PATCH', expect.objectContaining({ plate: '01-222 BB' })],
      ['PATCH', expect.objectContaining({ plate: '01-111 AA', max_weight_kg: 3100 })],
      ['PATCH', { active: false }],
    ]);
  });

  test('prices: a van starts from the local averages, marked as suggestions; saving confirms the card', async ({ page }) => {
    await fakeMoverCompany(page, { initial: savedCompany() });
    await fakeVehicles(page, { initial: [van] });
    const writes = await fakeRates(page);
    const r = en.mover.rates;
    await page.goto(url);
    await expect(page.getByTestId('step-rates')).toContainText(en.mover.stepStatus.todo);
    await page.getByTestId('step-rates').click();
    await expect(page.getByTestId('rates-01-111 AA')).toContainText(r.noPrices);
    await page.getByTestId('rates-01-111 AA-edit').click();

    await expect(page.getByTestId('rate-suggested')).toHaveText(r.suggested);
    // Kosovo prices in EUR; the fields hold the local averages for a van, to start from.
    await expect(page.getByRole('radio', { name: 'EUR' })).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('rate-baseFee')).not.toHaveValue('');
    await expect(page.getByTestId('rate-example')).toBeVisible();

    // Hourly in, per minute kept: the form says what is saved.
    await page.getByTestId('rate-hourly1').fill('25');
    await expect(app(page).getByText(r.keptAs.replace('{{perMinute}}', '€0.42').replace('{{hourly}}', '€25.20'))).toBeVisible();
    await page.getByTestId('rate-hourly3').fill('');
    await page.getByTestId('rate-longDistanceFromKm').fill('150');
    await page.getByTestId('rate-save').click();
    await expect(app(page).getByText(r.errors.long_distance_both, { exact: true })).toBeVisible();
    await page.getByTestId('rate-longDistancePerKm').fill('0.30');
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('mover-rate-card.png');
    await page.getByTestId('rate-save').click();

    await expect(page.getByTestId('rates-01-111 AA')).toContainText(r.pricesSaved);
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({
      table: 'rate_cards',
      method: 'POST',
      body: {
        vehicle_id: van.id,
        currency: 'EUR',
        per_labor_minute_1_helper: 42,
        per_labor_minute_3_helpers: null,
        long_distance_threshold_km: 150,
        long_distance_per_km: 30,
      },
    });
    // Saving never sends a confirmation time: Postgres records it.
    expect(writes[0]?.body).not.toHaveProperty('confirmed_by_mover_at');
  });

  test('work area: a town found on the map is added with a radius, and removed again', async ({ page }) => {
    await fakeMoverCompany(page, { initial: savedCompany() });
    await fakeVehicles(page, { initial: [van] });
    await fakeCompanyChecks(page); // the address search
    const writes = await fakeRates(page, { cards: [{ ...savedCard, vehicle_id: van.id }] });
    const r = en.mover.rates;
    await page.goto(url);
    await page.getByTestId('step-rates').click();
    await page.getByTestId('area-search').fill('Prishtina');
    await page.getByTestId('area-suggestion').first().click();
    await page.getByRole('radio', { name: r.km.replace('{{km}}', '25') }).click();
    await page.getByTestId('area-add').click();
    await expect(page.getByText(r.area.replace('{{place}}', 'Prishtinë').replace('{{km}}', '25'))).toBeVisible();
    expect(writes[0]).toMatchObject({
      table: 'service_areas',
      method: 'POST',
      body: { company_id: '00000000-0000-4000-8000-0000000c0002', label: 'Prishtinë', center: 'SRID=4326;POINT(21.1655 42.6629)', radius_km: 25 },
    });
    // Prices for every van in use and an area: the step is done.
    await page.getByTestId('rates-back').click();
    await expect(page.getByTestId('step-rates')).toContainText(en.mover.stepStatus.saved);
    await page.getByTestId('step-rates').click();
    await page.getByTestId('area-Prishtinë-remove').click();
    await expect(page.getByTestId('area-Prishtinë')).toHaveCount(0);
    expect(writes[1]).toMatchObject({ table: 'service_areas', method: 'DELETE' });
  });

  test("MoversHub's notes: the mover reads what to change on the company, a document and a van", async ({ page }) => {
    const note = (text: string) => en.mover.reviewNote.replace('{{note}}', text);
    await fakeMoverCompany(page, { initial: savedCompany({ verification_status: 'rejected', review_note: 'The address is not the one on the extract.' }) });
    await fakeMoverDocuments(page, {
      initial: [
        {
          id: '00000000-0000-4000-8000-0000000d0101',
          type: 'insurance',
          file_path: '00000000-0000-4000-8000-0000000c0002/insurance/old.pdf',
          expires_at: '2027-12-31T23:59:59Z',
          verified_at: null,
          updated_at: '2026-10-14T09:00:00.000Z',
          review_note: 'The policy number is not readable.',
        },
      ],
    });
    await fakeVehicles(page, { initial: [{ ...van, verified_at: null, review_note: 'The plate on the photo is different.' }] });
    await page.goto(url);
    for (const step of ['step-company', 'step-documents', 'step-vehicles']) await expect(page.getByTestId(step)).toContainText(en.mover.stepStatus.rejected);

    await page.getByTestId('step-company').click();
    await expect(page.getByTestId('company-review-note')).toHaveText(note('The address is not the one on the extract.'));
    await page.getByTestId('company-back').click();
    await page.getByTestId('step-documents').click();
    await expect(page.getByTestId('document-insurance')).toContainText(en.mover.documents.status.changes);
    await expect(page.getByTestId('document-insurance-note')).toHaveText(note('The policy number is not readable.'));
    await page.getByTestId('documents-back').click();
    await page.getByTestId('step-vehicles').click();
    await expect(page.getByTestId('vehicle-01-111 AA')).toContainText(en.mover.vehicles.status.changes);
    await expect(page.getByTestId('vehicle-01-111 AA-note')).toHaveText(note('The plate on the photo is different.'));
  });

  test.describe('in Albanian', () => {
    test.use({ locale: 'sq-XK' });

    test('home', async ({ page }) => {
      await page.goto(url);
      await expect(page.getByText(resources.sq.translation.landing.movers.phone.payout, { exact: true })).toBeVisible();
      await expect(page.getByText(/^\d[\d.,]*\s€$/).first()).toBeVisible(); // "122,24 €" (no-break space)
      await fitScreenToPage(page);
      await expect(page).toHaveScreenshot('mover-home-sq.png');
    });
  });
});
