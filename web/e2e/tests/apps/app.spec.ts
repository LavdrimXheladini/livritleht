import { readFileSync } from 'node:fs';

import { expect, test, type Page, type Route } from '@playwright/test';

import { legalDocument, resources } from '@movershub/i18n';

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

test.describe('booking a move', () => {
  const b = en.booking;
  /** What the address search finds: one street address in Prizren. */
  const street = {
    id: 'osm:w1',
    label: 'Rruga Remzi Ademaj 5, Prizren',
    area: 'Prizren',
    lat: 42.2093,
    lon: 20.7415,
    countryCode: 'XK',
    street: 'Rruga Remzi Ademaj',
    houseNumber: '5',
    city: 'Prizren',
  };
  type SavedOffer = { vehicleId: string; companyId: string; companyName: string; mover: Record<string, unknown>; quote: { moverPrice: number } };
  /** A fresh copy of the saved quote (Prishtina → Prizren, test movers), to read or change. */
  const savedQuoteCopy = () =>
    JSON.parse(readFileSync(new URL('../../fixtures/quote-prishtina-prizren.json', import.meta.url), 'utf8')) as {
      classes: { vehicleClass: string; offers: SavedOffer[]; crews: Record<string, { from: { moverPrice: number }[] }> }[];
    };
  /** The saved quote's lowest price for a class and crew size. */
  const fromPrice = (cls: string, crew: 1 | 2 | 3) => savedQuoteCopy().classes.find((c) => c.vehicleClass === cls)!.crews[crew]!.from[0]!.moverPrice;

  /**
   * A move with every step filled in (2 people, a van, tomorrow 09:00), on the device as the app keeps
   * it (mobile/core/src/booking-draft.ts) — only when the device has none yet, so a reload keeps changes.
   */
  async function plannedMove(page: Page, changes: Record<string, unknown> = {}) {
    const draft = {
      pickup: {
        place: { label: 'Prishtina', area: 'Prishtina', lat: 42.6629, lon: 21.1655, countryCode: 'XK' },
        street: null,
        houseNumber: null,
        floor: 2,
        hasLift: true,
        details: 'Block B, entrance 2',
      },
      dropoff: {
        place: { label: street.label, area: street.area, lat: street.lat, lon: street.lon, countryCode: 'XK' },
        street: street.street,
        houseNumber: street.houseNumber,
        floor: 0,
        hasLift: null,
        details: '',
      },
      items: { sofa3: { qty: 1, assembly: false }, box: { qty: 10, assembly: false } },
      day: '2026-10-16',
      hour: 9,
      crew: 2,
      vehicleClass: 'VAN',
      choice: null,
      jobId: null,
      ...changes,
    };
    await page.addInitScript(
      ({ key, value }) => {
        if (!localStorage.getItem(key)) localStorage.setItem(key, value);
      },
      { key: 'movershub.booking', value: JSON.stringify({ userId: STAND_IN_ID, draft }) },
    );
  }
  const euros = (cents: number) => `€${cents % 100 ? (cents / 100).toFixed(2) : cents / 100}`;

  test.beforeEach(async ({ page }) => {
    // A fixed day, so the days offered (from tomorrow) and the screenshots stay the same.
    await page.clock.setFixedTime(new Date(2026, 9, 15, 10));
    await signInAs(page, 'customer');
    await page.route('**/functions/v1/places', (route) =>
      route.request().method() === 'OPTIONS'
        ? route.fulfill({ status: 204, headers: cors })
        : route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify({ suggestions: [street] }) }),
    );
    await page.goto(url);
  });

  /** The `book` function's answer for the saved quote's cheapest van mover (Test Transport Prizren), valid until 10:15. */
  const bookAnswer = (changes: Record<string, unknown> = {}) => {
    const prizren = savedQuoteCopy().classes.find((c) => c.vehicleClass === 'VAN')!.offers[0]!;
    return {
      jobId: '00000000-0000-4000-8000-0000000e0b01',
      distanceKm: 83.2,
      quote: {
        id: '00000000-0000-4000-8000-0000000e0c01',
        expiresAt: new Date(2026, 9, 15, 10, 15).toISOString(),
        currency: 'EUR',
        lines: (prizren.quote as unknown as { lines: unknown[] }).lines,
        estLaborMin: 40,
        moverPrice: prizren.quote.moverPrice,
        bookingFee: null,
        total: prizren.quote.moverPrice,
      },
      mover: {
        companyId: prizren.companyId,
        name: prizren.companyName,
        isBusiness: true,
        registrationNo: 'TEST-XK-002',
        address: 'Test address, Prizren',
        country: 'XK',
        phone: '+38344000902',
        email: 'test-prizren@example.com',
        insuranceUntil: '2027-12-31T23:59:59+00:00',
        cancellation: { freeHours: 24, latePct: 50 },
      },
      testMover: false,
      ...changes,
    };
  };

  /** The move saved by `book` (bookAnswer) as the customer reads it back ("Your moves"). */
  const savedJob = (changes: Record<string, unknown> = {}) => {
    const answer = bookAnswer();
    const prizren = savedQuoteCopy().classes.find((c) => c.vehicleClass === 'VAN')!.offers[0]!;
    return {
      id: answer.jobId,
      status: 'QUOTED',
      type: 'SMALL_MOVE',
      vehicle_class: 'VAN',
      helpers: 2,
      scheduled_at: new Date(2026, 9, 16, 9).toISOString(),
      pickup_area: 'Prishtina',
      pickup_district: null,
      pickup_country: 'XK',
      pickup_label: 'Prishtina',
      pickup_street: null,
      pickup_house_number: null,
      pickup_details: 'Block B, entrance 2',
      pickup_floor: 2,
      pickup_has_lift: false,
      pickup_lat: 42.6629,
      pickup_lon: 21.1655,
      dropoff_area: street.area,
      dropoff_district: null,
      dropoff_country: 'XK',
      dropoff_label: street.label,
      dropoff_street: street.street,
      dropoff_house_number: street.houseNumber,
      dropoff_details: '',
      dropoff_floor: 0,
      dropoff_has_lift: false,
      dropoff_lat: street.lat,
      dropoff_lon: street.lon,
      items: [
        { key: 'sofa3', qty: 1, assembly: false },
        { key: 'box', qty: 10, assembly: false },
      ],
      distance_km: 83.2,
      chosen_mover_company_id: prizren.companyId,
      chosen_vehicle_id: prizren.vehicleId,
      created_at: new Date(2026, 9, 15, 9, 50).toISOString(),
      quotes: [
        {
          id: answer.quote.id,
          currency: 'EUR',
          line_items: answer.quote.lines,
          mover_price: answer.quote.moverPrice,
          booking_fee: null,
          total: answer.quote.total,
          cancel_free_hours: 24,
          cancel_late_pct: 50,
          expires_at: new Date(2026, 9, 15, 10, 5).toISOString(),
          created_at: new Date(2026, 9, 15, 9, 50).toISOString(),
          mover: answer.mover,
        },
      ],
      ...changes,
    };
  };

  /** The `book` function: answers in turn (the last one repeats); records what the app sent. */
  async function fakeBook(page: Page, ...answers: { status?: number; body: unknown }[]) {
    const sent: Record<string, unknown>[] = [];
    await page.route('**/functions/v1/book', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      sent.push(route.request().postDataJSON() as Record<string, unknown>);
      const { status = 200, body } = answers[Math.min(sent.length, answers.length) - 1]!;
      return route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
    });
    return sent;
  }

  /** Records every `quote` request the app sends; the saved quote answers them. */
  async function quoteRequests(page: Page) {
    const sent: Record<string, unknown>[] = [];
    await page.route('**/functions/v1/quote', (route) => {
      if (route.request().method() === 'POST') sent.push(route.request().postDataJSON() as Record<string, unknown>);
      return route.fallback();
    });
    return sent;
  }

  test('where, what and when, then the van sizes priced for exactly this move', async ({ page }) => {
    const sent = await quoteRequests(page);
    await page.getByTestId('see-movers').click();

    // 1. Where. The home's places are towns only: say how to find the place, or search the street.
    await expect(page.getByText(b.stops.title)).toBeVisible();
    await expect(page.getByTestId('stop-pickup-only-area')).toBeVisible();
    await page.getByTestId('stops-next').click();
    await expect(app(page).getByText(b.stops.detailsRequired)).toHaveCount(2);
    await page.getByTestId('stop-pickup-details').fill('Block B, entrance 2, flat 14');
    await page.getByTestId('stop-dropoff').fill('Rruga Remzi');
    await page.getByRole('button', { name: street.label }).click();
    await expect(page.getByTestId('stop-dropoff-only-area')).toHaveCount(0);
    await expect(app(page).getByText(b.stops.detailsRequired)).toHaveCount(0);
    // Third floor: is there a lift?
    for (let i = 0; i < 3; i++) await page.getByTestId('stop-pickup-floor-more').click();
    await expect(page.getByTestId('stop-pickup-floor-value')).toHaveText(b.stops.floorN.replace('{{n}}', '3'));
    await page.getByTestId('stops-next').click();
    await expect(app(page).getByText(b.stops.liftRequired)).toBeVisible();
    await page.getByTestId('stop-pickup-lift-no').click();
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('booking-stops.png');
    await page.getByTestId('stops-next').click();

    // 2. What: at least one thing; the volume suggests a size.
    await expect(page.getByText(b.items.title)).toBeVisible();
    await page.getByTestId('items-next').click();
    await expect(page.getByTestId('items-none')).toBeVisible();
    await page.getByTestId('item-sofa3-more').click();
    await page.getByTestId('item-wardrobe-more').click();
    await page.getByTestId('item-wardrobe-assembly').click();
    for (let i = 0; i < 10; i++) await page.getByTestId('item-box-more').click();
    await expect(page.getByTestId('item-box-value')).toHaveText('10');
    await expect(page.getByTestId('items-load')).toHaveText(b.items.load.replace('{{m3}}', '4.3'));
    await expect(page.getByTestId('items-fits')).toHaveText(b.items.fits.replace('{{vehicle}}', en.vehicles.VAN.name));
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('booking-items.png');
    await page.getByTestId('items-next').click();

    // 3. When: from tomorrow; the arrival time; three people.
    await page.getByTestId('when-next').click();
    await expect(app(page).getByText(b.when.dayRequired)).toBeVisible();
    // The first day offered is tomorrow.
    await expect(page.locator('[data-testid^="when-day-"]').first()).toHaveAttribute('data-testid', 'when-day-2026-10-16');
    await page.getByTestId('when-day-2026-10-16').click();
    await page.getByTestId('when-hour-9').click();
    await page.getByRole('radio', { name: en.landing.quote.crew3 }).click();
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('booking-when.png');
    await page.getByTestId('when-next').click();

    // 4. The sizes, priced on the server for this move: its stops, floors, items, crew and day.
    await expect(page.getByText(b.size.title)).toBeVisible();
    await expect(page.getByTestId('size-class-VAN')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('size-class-VAN')).toContainText(euros(fromPrice('VAN', 3)));
    expect(sent.at(-1)).toEqual({
      pickup: expect.objectContaining({ countryCode: 'XK' }),
      dropoff: { label: street.label, area: 'Prizren', lat: street.lat, lon: street.lon, countryCode: 'XK' },
      pickupStop: { floor: 3, hasLift: false },
      dropoffStop: { floor: 0, hasLift: false },
      helpers: 3,
      items: [
        { key: 'sofa3', qty: 1, assembly: false },
        { key: 'wardrobe', qty: 1, assembly: true },
        { key: 'box', qty: 10, assembly: false },
      ],
      // 09:00 on the device's clock (every market is on Central European Time), sent as UTC.
      scheduledAt: new Date(2026, 9, 16, 9).toISOString(),
    });
    // How to find the place is for the mover who accepts — never sent to price the move.
    expect(JSON.stringify(sent)).not.toContain('Block B');
    await expect(page.getByTestId('size-summary-2')).toHaveText(en.landing.quote.crew3);
    await expect(page.getByTestId('size-summary-3')).toHaveText(b.size.things.replace('{{n}}', '12').replace('{{m3}}', '4.3'));
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('booking-size.png');

    // A smaller size may be picked, with a warning.
    await page.getByTestId('size-class-SMALL').click();
    await expect(page.getByTestId('size-too-small')).toHaveText(b.size.tooSmall.replace('{{vehicle}}', en.vehicles.SMALL.name));
    await page.getByTestId('size-class-VAN').click();
    await expect(page.getByTestId('size-too-small')).toHaveCount(0);
    await page.getByTestId('size-see-movers').click();
    await expect(page.getByText(b.movers.title)).toBeVisible();

    // Home remembers the move and goes back to where it was left: choosing the mover.
    await page.goto(url);
    await expect(page.getByTestId('current-move')).toContainText('→');
    await page.getByTestId('booking-continue').click();
    await expect(page.getByText(b.movers.title)).toBeVisible();
  });

  test('movers: each with their own price and who they are, lowest first; "Book best offer" chooses the lowest', async ({ page }) => {
    // The saved quote's two van movers; the dearer one as a private person.
    const quote = savedQuoteCopy();
    const vans = quote.classes.find((c) => c.vehicleClass === 'VAN')!.offers;
    const [prizren, prishtina] = vans as [SavedOffer, SavedOffer];
    prishtina.mover = {
      isBusiness: false,
      registrationNo: null,
      town: 'Prishtinë',
      insuranceUntil: '2027-12-31T23:59:59+00:00',
      cancellation: { freeHours: 72, latePct: 0 },
    };
    await page.route('**/functions/v1/quote', (route) =>
      route.request().method() === 'OPTIONS'
        ? route.fulfill({ status: 204, headers: cors })
        : route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify(quote) }),
    );
    await plannedMove(page);
    await page.goto(`${url}book/movers`);
    const m = b.movers;
    const card = (o: SavedOffer) => page.getByTestId(`offer-${o.companyId}`);

    await expect(page.getByText(m.title)).toBeVisible();
    // Lowest first, at the mover's own price to the cent (COMPLIANCE §1.1).
    await expect(page.locator('[data-testid^="offer-"][data-testid$="-price"]')).toHaveText([euros(prizren.quote.moverPrice), euros(prishtina.quote.moverPrice)]);
    // Who they are (COMPLIANCE §4): business with its registration number, checked insurance…
    await expect(card(prizren)).toContainText(prizren.companyName);
    await expect(card(prizren)).toContainText(m.business);
    await expect(card(prizren)).toContainText(m.regNo.replace('{{no}}', 'TEST-XK-002'));
    await expect(card(prizren)).toContainText(m.insurance.replace('{{date}}', '31.12.2027'));
    // …or a private person, said plainly, without a registration number.
    await expect(card(prishtina)).toContainText(m.private);
    await expect(card(prishtina)).toContainText(m.privateNote);
    await expect(card(prishtina)).toContainText('Prishtinë');
    await expect(card(prishtina)).not.toContainText('Reg. no.');
    await expect(app(page).getByText(m.feeTba)).toHaveCount(2);
    // Each mover's own cancellation terms (COMPLIANCE §8).
    await expect(page.getByTestId(`offer-${prizren.companyId}-cancellation`)).toHaveText(
      `${b.cancel.free24} ${b.cancel.late.replace('{{pct}}', '50')}`,
    );
    await expect(page.getByTestId(`offer-${prishtina.companyId}-cancellation`)).toHaveText(`${b.cancel.free72} ${b.cancel.late0}`);

    // The price line by line, adding up to the mover's price.
    await page.getByTestId(`offer-${prizren.companyId}-details`).click();
    const lines = page.getByTestId(`offer-${prizren.companyId}-lines`);
    await expect(lines).toContainText(m.lines.base);
    await expect(lines).toContainText(m.lines.distance.replace('{{km}}', '83.2'));
    await expect(lines).toContainText(m.lines.labor.replace('{{min}}', '40'));
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('booking-movers.png');

    // "Book best offer" chooses the lowest and opens the review; back, another can be chosen instead.
    await fakeBook(page, { body: bookAnswer() });
    const choice = async () => JSON.parse((await stored(page, 'movershub.booking'))!).draft.choice as unknown;
    await page.getByTestId('movers-best').click();
    await expect(page.getByText(b.review.title)).toBeVisible();
    expect(await choice()).toEqual({ vehicleId: prizren.vehicleId, companyId: prizren.companyId });
    await page.getByTestId('review-back').click();
    await expect(page.getByTestId(`offer-${prizren.companyId}-choose`)).toHaveText(m.chosen);
    await page.getByTestId(`offer-${prishtina.companyId}-choose`).click();
    await expect(page.getByText(b.review.title)).toBeVisible();
    expect(await choice()).toEqual({ vehicleId: prishtina.vehicleId, companyId: prishtina.companyId });
  });

  test('review: priced again on the server, with whom the contract is, their details and terms — before any payment', async ({ page }) => {
    const prizren = savedQuoteCopy().classes.find((c) => c.vehicleClass === 'VAN')!.offers[0]!;
    const sent = await fakeBook(page, { body: bookAnswer() });
    await plannedMove(page, { choice: { vehicleId: prizren.vehicleId, companyId: prizren.companyId } });
    await page.goto(`${url}book/review`);
    const r = b.review;

    await expect(page.getByTestId('review-contract')).toHaveText(r.contract.replace('{{name}}', prizren.companyName));
    // The move and the chosen van — never a price (COMPLIANCE §1.1, §13); the directions go with it.
    expect(sent[0]).toMatchObject({ vehicleId: prizren.vehicleId, vehicleClass: 'VAN', helpers: 2, scheduledAt: new Date(2026, 9, 16, 9).toISOString() });
    expect(sent[0]).not.toHaveProperty('jobId');
    expect(Object.keys(sent[0]!).filter((k) => /price|total|fee/i.test(k))).toEqual([]);
    expect((sent[0]!.pickup as { details: string }).details).toBe('Block B, entrance 2');
    // Who the mover is (COMPLIANCE §4), the price as the server worked it out, the terms (§8).
    const details = page.getByTestId('review-mover-details');
    for (const line of [
      b.movers.regNo.replace('{{no}}', 'TEST-XK-002'),
      r.address.replace('{{address}}', 'Test address, Prizren'),
      r.phone.replace('{{phone}}', '+38344000902'),
      r.email.replace('{{email}}', 'test-prizren@example.com'),
    ]) {
      await expect(details).toContainText(line);
    }
    await expect(page.getByTestId('review-mover-price')).toContainText(euros(prizren.quote.moverPrice));
    await expect(app(page).getByText(r.feeTba)).toBeVisible();
    await expect(page.getByTestId('review-valid')).toHaveText(r.validUntil.replace('{{time}}', '10:15'));
    await expect(page.getByTestId('review-cancellation')).toHaveText(`${b.cancel.free24} ${b.cancel.late.replace('{{pct}}', '50')}`);
    // At 10:00 the day before a 09:00 move, 24 hours' free cancellation is already over: said before booking (COMPLIANCE §8).
    await expect(page.getByTestId('review-cancel-when')).toHaveText(
      resources.en.job.review.lateAlready.replace('{{amount}}', euros(Math.floor((prizren.quote.moverPrice * 50) / 100))),
    );
    await expect(page.getByTestId('review-mover-may-cancel')).toHaveText(resources.en.job.review.moverMayCancel);
    // Paying (the card books the move) waits for Stripe.
    await expect(page.getByTestId('review-pay')).toBeDisabled();
    await expect(page.getByTestId('review-pay-note')).toHaveText(r.payNote);
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('booking-review.png');

    // The saved request is remembered with the move: asked again, it is updated, not saved twice.
    expect(JSON.parse((await stored(page, 'movershub.booking'))!).draft.jobId).toBe('00000000-0000-4000-8000-0000000e0b01');
    await page.reload();
    await expect(page.getByTestId('review-contract')).toBeVisible();
    expect(sent.at(-1)).toMatchObject({ jobId: '00000000-0000-4000-8000-0000000e0b01' });
  });

  test('review: an expired price is priced again; a mover no longer available sends back to the movers', async ({ page }) => {
    const prizren = savedQuoteCopy().classes.find((c) => c.vehicleClass === 'VAN')!.offers[0]!;
    const expired = bookAnswer();
    expired.quote.expiresAt = new Date(2026, 9, 15, 9, 59).toISOString();
    const sent = await fakeBook(page, { body: expired }, { status: 409, body: { error: 'mover_unavailable' } });
    await plannedMove(page, { choice: { vehicleId: prizren.vehicleId, companyId: prizren.companyId } });
    await page.goto(`${url}book/review`);
    await expect(page.getByTestId('review-valid')).toHaveText(b.review.expired);
    await page.getByTestId('review-price-again').click();
    await expect(page.getByTestId('review-unavailable')).toHaveText(b.review.unavailable);
    expect(sent).toHaveLength(2);
    await page.getByRole('button', { name: b.review.chooseAnother }).click();
    await expect(page.getByText(b.movers.title)).toBeVisible();
    expect(JSON.parse((await stored(page, 'movershub.booking'))!).draft.choice).toBeNull();
  });

  test('my moves: saved requests on the home; a move shows its addresses, mover and price, and can be continued', async ({ page }) => {
    const answer = bookAnswer();
    const prizren = savedQuoteCopy().classes.find((c) => c.vehicleClass === 'VAN')!.offers[0]!;
    const job = savedJob();
    await page.route('**/rest/v1/jobs*', (route) =>
      route.request().method() === 'OPTIONS'
        ? route.fulfill({ status: 204, headers: cors })
        : route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify([job]) }),
    );
    const sent = await fakeBook(page, { body: answer });
    await page.goto(url);
    const m = en.customer.moves;

    // On the home: route, day and time, size, mover and price, where it stands.
    const row = page.getByTestId(`move-${job.id}`);
    await expect(row).toContainText('Prishtina → Prizren');
    await expect(row).toContainText(`Fri 16 Oct, 09:00 · ${en.vehicles.VAN.name}`);
    await expect(row).toContainText(`${prizren.companyName} · ${euros(prizren.quote.moverPrice)}`);
    await expect(row).toContainText(m.status.QUOTED);

    // Its own screen: everything agreed, as the customer saw it (COMPLIANCE §4).
    await row.click();
    await expect(page.getByTestId('move-state-note')).toHaveText(m.quotedNote);
    await expect(page.getByTestId('move-pickup')).toContainText('Block B, entrance 2');
    await expect(page.getByTestId('move-pickup')).toContainText(`${b.stops.floorN.replace('{{n}}', '2')} · ${b.stops.liftNo}`);
    await expect(page.getByTestId('move-items')).toContainText(`${en.items.sofa3} × 1`);
    await expect(page.getByTestId('move-contract')).toHaveText(b.review.contract.replace('{{name}}', prizren.companyName));
    await expect(page.getByTestId('move-mover-details')).toContainText(b.review.phone.replace('{{phone}}', '+38344000902'));
    await expect(page.getByTestId('move-mover-price')).toContainText(euros(prizren.quote.moverPrice));
    await expect(page.getByTestId('move-cancellation')).toHaveText(`${b.cancel.free24} ${b.cancel.late.replace('{{pct}}', '50')}`);
    await expect(page.getByTestId('move-price-checked')).toHaveText(
      m.priceChecked.replace('{{date}}', 'Thursday 15 October').replace('{{time}}', '09:50'),
    );
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('customer-move.png');

    // Continue booking: the same request, reviewed again on the server.
    await page.getByTestId('move-continue').click();
    await expect(page.getByText(b.review.title)).toBeVisible();
    expect(sent.at(-1)).toMatchObject({ jobId: job.id, vehicleId: prizren.vehicleId, helpers: 2, scheduledAt: job.scheduled_at });
  });

  /** `jobs`: the customer's moves as they are now; `job-transition`: records each step and says it worked. */
  async function fakeMoves(page: Page, moves: () => unknown[]) {
    const steps: Record<string, unknown>[] = [];
    await page.route('**/rest/v1/jobs*', (route) =>
      route.request().method() === 'OPTIONS'
        ? route.fulfill({ status: 204, headers: cors })
        : route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify(moves()) }),
    );
    await page.route('**/functions/v1/job-transition', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const step = route.request().postDataJSON() as Record<string, unknown>;
      steps.push(step);
      const status = step.action === 'cancel' ? 'CANCELLED' : 'OFFERED';
      return route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify({ status, offerId: '00000000-0000-4000-8000-0000000f0001' }) });
    });
    return steps;
  }

  test('a test booking: a test mover is booked without a card, and the move waits for their answer', async ({ page }) => {
    const prizren = savedQuoteCopy().classes.find((c) => c.vehicleClass === 'VAN')!.offers[0]!;
    await fakeBook(page, { body: bookAnswer({ testMover: true }) });
    let booked = false;
    const offer = { status: 'offered', expires_at: new Date(2026, 9, 15, 11).toISOString(), created_at: new Date(2026, 9, 15, 10).toISOString() };
    const steps = await fakeMoves(page, () => (booked ? [savedJob({ status: 'OFFERED', job_offers: [offer] })] : []));
    await plannedMove(page, { choice: { vehicleId: prizren.vehicleId, companyId: prizren.companyId } });
    await page.goto(`${url}book/review`);
    const m = en.customer.moves;

    // No card for a test mover — and never for a real one (the review test above).
    await expect(page.getByTestId('review-test-note')).toHaveText(b.review.testNote.replace('{{name}}', prizren.companyName));
    await expect(page.getByTestId('review-pay')).toHaveCount(0);
    booked = true;
    await page.getByTestId('review-book-test').click();
    await expect(page.getByTestId('move-state-note')).toHaveText(
      m.offeredNote.replace('{{name}}', prizren.companyName).replace('{{date}}', 'Thu 15 Oct').replace('{{time}}', '11:00'),
    );
    expect(steps).toEqual([{ action: 'book_test', jobId: savedJob().id }]);
    // The move being put together is done.
    expect(await stored(page, 'movershub.booking')).toBeNull();
    await expect(page.getByTestId('move-continue')).toHaveCount(0);
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('customer-move-offered.png');
  });

  test('the mover said no: the same move, another mover — or cancel it, for free', async ({ page }) => {
    const prizren = savedQuoteCopy().classes.find((c) => c.vehicleClass === 'VAN')!.offers[0]!;
    const declined = { status: 'declined', expires_at: new Date(2026, 9, 15, 11).toISOString(), created_at: new Date(2026, 9, 15, 10).toISOString() };
    const steps = await fakeMoves(page, () => [savedJob({ job_offers: [declined] })]);
    const m = en.customer.moves;
    await page.goto(url);
    await expect(page.getByTestId(`move-${savedJob().id}`)).toContainText(m.status.DECLINED);
    await page.getByTestId(`move-${savedJob().id}`).click();
    await expect(page.getByTestId('move-state-note')).toHaveText(m.declinedNote.replace('{{name}}', prizren.companyName));

    // Cancel: asked once more, then done.
    await page.getByTestId('move-cancel').click();
    await expect(app(page).getByText(m.cancelConfirm)).toBeVisible();
    await page.getByTestId('move-cancel-yes').click();
    await expect.poll(() => steps).toEqual([{ action: 'cancel', jobId: savedJob().id }]);

    // Another mover for the same move: the movers step, nobody chosen.
    await page.getByTestId('move-continue').click();
    await expect(page.getByText(b.movers.title)).toBeVisible();
    const draft = JSON.parse((await stored(page, 'movershub.booking'))!).draft as { choice: unknown; jobId: string };
    expect(draft.choice).toBeNull();
    expect(draft.jobId).toBe(savedJob().id);
  });

  test('the move stays on the device after a reload, and is forgotten on sign out', async ({ page }) => {
    await page.getByTestId('see-movers').click();
    await page.getByTestId('stop-pickup-details').fill('Block B, entrance 2');
    await page.getByTestId('stop-dropoff-details').fill('Behind the school');
    await page.getByTestId('stops-next').click();
    await page.getByTestId('item-box-more').click();
    await page.reload();
    await expect(page.getByTestId('item-box-value')).toHaveText('1');
    expect(await stored(page, 'movershub.booking')).toContain('Behind the school');
    // Back after a reload (no history): the step before.
    await page.getByTestId('items-back').click();
    await expect(page.getByTestId('stop-dropoff-details')).toHaveValue('Behind the school');
    await page.goto(url);
    await page.getByTestId('home-sign-out').click();
    await expect(page.getByTestId('auth-email')).toBeVisible();
    expect(await stored(page, 'movershub.booking')).toBeNull();
  });

  test('a step opened before the earlier ones are done shows the first open one', async ({ page }) => {
    await page.getByTestId('see-movers').click();
    await expect(page.getByText(b.stops.title)).toBeVisible();
    await page.goto(`${url}book/size`);
    await expect(page.getByText(b.stops.title)).toBeVisible();
  });

  test('the mover side has no booking: it goes home', async ({ page }) => {
    await page.getByTestId('see-movers').click();
    await expect(page.getByText(b.stops.title)).toBeVisible();
    await signInAs(page, 'mover');
    await page.goto(`${url}book/stops`);
    await expect(page.getByTestId('step-company')).toBeVisible();
  });
});

test.describe('terms, privacy policy and contact (COMPLIANCE §8, §9)', () => {
  const visible = (page: Page, testId: string) => page.getByTestId(testId).locator('visible=true');

  test('signed out, from the sign-in screen: a draft with every section, and on to the privacy policy', async ({ page }) => {
    await page.goto(url);
    await page.getByTestId('legal-link-terms').click();
    await expect(visible(page, 'legal-draft')).toHaveText(en.legal.draft);
    await expect(page.getByTestId('legal-english-only')).toHaveCount(0);
    for (const section of legalDocument('terms', 'en').text.sections) {
      await expect(page.getByTestId(`legal-section-${section.id}`).first()).toContainText(section.heading);
    }
    await expect(page).toHaveScreenshot('legal-terms.png');
    await visible(page, 'legal-see-privacy').click();
    await expect(app(page).getByText(legalDocument('privacy', 'en').text.intro)).toBeVisible();
    await visible(page, 'legal-back').click();
    await visible(page, 'legal-back').click();
    await expect(page.getByTestId('auth-email')).toBeVisible();
  });

  test('"Your account" links to the terms for its side, the privacy policy and the contact', async ({ page }) => {
    await signInAs(page, 'mover');
    await page.goto(`${url}account`);
    const links = page.getByTestId('account-legal');
    await expect(links.getByTestId('legal-link-mover-terms')).toBeVisible();
    await expect(links.getByTestId('legal-link-privacy')).toBeVisible();
    await expect(links.getByTestId('legal-link-contact')).toBeVisible();
    await expect(links.getByTestId('legal-link-terms')).toHaveCount(0);
    await links.getByTestId('legal-link-contact').click();
    await expect(app(page).getByText('Operator: [company name — added once the company is registered]')).toBeVisible();
  });

  test.describe('in Albanian', () => {
    test.use({ locale: 'sq-XK' });

    test('the screen in Albanian; the text in English, and it says so', async ({ page }) => {
      const sq = resources.sq.translation.legal;
      await page.goto(`${url}legal/privacy`);
      await expect(app(page).getByText(sq.titles.privacy, { exact: true })).toBeVisible();
      await expect(visible(page, 'legal-draft')).toHaveText(sq.draft);
      await expect(visible(page, 'legal-english-only')).toHaveText(sq.englishOnly);
      await expect(app(page).getByText(legalDocument('privacy', 'en').text.intro)).toBeVisible();
    });
  });
});

test.describe('accepting the terms (COMPLIANCE §3, §8)', () => {
  const tr = en.terms;
  const published = (n: number, audience: 'customer' | 'mover', effective: string, summary: string | null = null) => ({
    id: `00000000-0000-4000-8000-0000000e700${n}`,
    audience,
    version: n,
    summary,
    published_at: '2026-10-01T09:00:00+00:00',
    effective_at: effective,
  });

  /** Published versions (with a text for each), the person's acceptances; records accept_terms calls. */
  async function fakeTerms(page: Page, versions: ReturnType<typeof published>[], accepted: string[]) {
    const calls: unknown[] = [];
    const json = (route: Route, body: unknown) => route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
    await page.route('**/rest/v1/terms_versions*', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const url = decodeURIComponent(route.request().url());
      const one = /id=eq\.([0-9a-f-]+)/.exec(url)?.[1];
      if (!one) return json(route, versions);
      const v = versions.find((x) => x.id === one)!;
      const doc = v.audience === 'mover' ? 'mover-terms' : 'terms';
      return json(route, { version: v.version, effective_at: v.effective_at, content: { doc, locale: 'en', updated: '2026-10-16', text: legalDocument(doc, 'en').text } });
    });
    await page.route('**/rest/v1/terms_acceptances*', (route) =>
      route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: cors }) : json(route, accepted.map((id) => ({ terms_version_id: id }))),
    );
    await page.route('**/rest/v1/rpc/accept_terms', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      calls.push(route.request().postDataJSON());
      return json(route, '2026-10-16T10:00:00+00:00');
    });
    return calls;
  }

  test('a customer accepts the terms in effect before anything else: ticked by them, never for them', async ({ page }) => {
    await signInAs(page, 'customer');
    const v1 = published(1, 'customer', '2026-10-01T09:00:00+00:00');
    const calls = await fakeTerms(page, [v1], []);
    await page.goto(url);
    await expect(page.getByTestId('accept-terms')).toContainText(tr.acceptText.customer);
    await expect(app(page).getByText(tr.acceptTitle)).toBeVisible();
    await expect(page.getByTestId('accept-terms-tick')).toHaveAttribute('aria-checked', 'false');
    await expect(page).toHaveScreenshot('accept-terms.png');
    await page.getByTestId('accept-terms-accept').click();
    await expect(app(page).getByText(tr.tickFirst)).toBeVisible();
    expect(calls).toEqual([]);
    await page.getByTestId('accept-terms-tick').click();
    await page.getByTestId('accept-terms-accept').click();
    await expect(page.getByTestId('home-sign-out')).toBeVisible();
    expect(calls).toEqual([{ p_version_id: v1.id }]);
  });

  test('a mover after a change: "New terms" with what changed; the published version is what they read', async ({ page }) => {
    await signInAs(page, 'mover');
    await fakeMoverCompany(page, { initial: savedCompany() });
    const v1 = published(1, 'mover', '2026-09-01T09:00:00+00:00');
    const v2 = published(2, 'mover', '2026-10-10T00:00:00+00:00', 'The commission across a border is now 15%.');
    await fakeTerms(page, [v1, v2], [v1.id]);
    await page.goto(url);
    await expect(app(page).getByText(tr.newTitle)).toBeVisible();
    await expect(page.getByTestId('accept-terms')).toContainText(tr.changedText.mover.replace('{{version}}', '2').replace('{{date}}', '10.10.2026'));
    await expect(page.getByTestId('accept-terms-summary')).toHaveText(tr.whatChanged.replace('{{summary}}', v2.summary!));
    await page.getByTestId('accept-terms-read').click();
    await expect(page.getByTestId('legal-version')).toHaveText(tr.versionLine.replace('{{version}}', '2').replace('{{date}}', '10.10.2026'));
    await expect(app(page).getByText(legalDocument('mover-terms', 'en').text.intro)).toBeVisible();
  });

  test('new terms coming: a notice on the home with the date and what changed; "Accept now" puts it away', async ({ page }) => {
    await signInAs(page, 'mover');
    await fakeMoverCompany(page, { initial: savedCompany() });
    const v1 = published(1, 'mover', '2026-09-01T09:00:00+00:00');
    const v2 = published(2, 'mover', '2099-01-01T00:00:00+00:00', 'Payouts move to Mondays.');
    const calls = await fakeTerms(page, [v1, v2], [v1.id]);
    await page.goto(url);
    const notice = page.getByTestId('terms-notice');
    await expect(notice).toContainText(tr.upcomingTitle.mover.replace('{{date}}', '01.01.2099'));
    await expect(notice).toContainText(tr.whatChanged.replace('{{summary}}', v2.summary!));
    await expect(notice).toContainText(tr.upcomingText.mover);
    await page.getByTestId('terms-notice-accept').click();
    await expect(notice).toHaveCount(0);
    expect(calls).toEqual([{ p_version_id: v2.id }]);
  });
});

test.describe('your account (COMPLIANCE §9)', () => {
  const a = en.account;

  /** The `account` function: answers in turn (the last repeats); records what the app sent. */
  async function fakeAccountFunction(page: Page, ...answers: { status?: number; body: unknown }[]) {
    const sent: Record<string, unknown>[] = [];
    await page.route('**/functions/v1/account', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      sent.push(route.request().postDataJSON() as Record<string, unknown>);
      const { status = 200, body } = answers[Math.min(sent.length, answers.length) - 1]!;
      return route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
    });
    return sent;
  }

  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'customer');
  });

  test('download my data: everything kept about the account, as a file', async ({ page }) => {
    const sent = await fakeAccountFunction(page, { body: { account: { email: 'customer@example.com' }, moves: [] } });
    await page.goto(url);
    await page.getByTestId('open-account').click();
    await expect(page.getByTestId('account-email')).toHaveText(a.signedInAs.replace('{{email}}', 'customer@example.com'));
    const download = page.waitForEvent('download');
    await page.getByTestId('account-download').click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^movershub-data-\d{4}-\d{2}-\d{2}\.json$/);
    expect(sent).toEqual([{ action: 'export' }]);
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('account.png');
  });

  test('delete: the password again; a wrong one or records to keep say so; then signed out with a note', async ({ page }) => {
    const sent = await fakeAccountFunction(
      page,
      { status: 400, body: { error: 'wrong_password' } },
      { status: 409, body: { error: 'records_kept' } },
      { body: { status: 'deleted' } },
    );
    await page.goto(`${url}account`);
    await page.getByTestId('account-delete').click();
    await expect(app(page).getByText(en.auth.errors.password_required)).toBeVisible();
    expect(sent).toHaveLength(0);

    await page.getByTestId('account-password').fill('wrong-one-1');
    await page.getByTestId('account-delete').click();
    await expect(app(page).getByText(a.wrongPassword)).toBeVisible();
    await page.getByTestId('account-password').fill('movers2026');
    await page.getByTestId('account-delete').click();
    await expect(app(page).getByText(a.recordsKept)).toBeVisible();
    await page.getByTestId('account-delete').click();
    // Deleted: this device forgets the account, and the sign-in screen says so.
    await expect(page.getByTestId('auth-notice')).toHaveText(a.deleted);
    expect(sent.at(-1)).toEqual({ action: 'delete', password: 'movers2026' });
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

  test('reminders: documents ending or ended, with what that means; upload leads to the documents, "Got it" puts one away', async ({ page }) => {
    const reminder = (n: number, type: string, days: 0 | 3 | 14 | 30, expires: string) => ({
      id: `00000000-0000-4000-8000-0000000f00${String(n).padStart(2, '0')}`,
      document_id: `00000000-0000-4000-8000-0000000d00${type === 'insurance' ? '01' : '02'}`,
      document_type: type,
      kind: days === 0 ? 'document_ended' : 'document_ending',
      days_before: days,
      expires_at: expires,
      created_at: '2026-10-15T05:07:00+00:00',
    });
    const rows = [
      reminder(1, 'insurance', 30, '2026-10-28T23:59:59+00:00'),
      reminder(2, 'insurance', 14, '2026-10-28T23:59:59+00:00'),
      reminder(3, 'cmr', 0, '2026-10-14T23:59:59+00:00'),
    ];
    const marked: { body: unknown; query: string }[] = [];
    await page.route('**/rest/v1/mover_reminders*', (route) => {
      const request = route.request();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': '*' } });
      if (request.method() === 'PATCH') {
        marked.push({ body: request.postDataJSON(), query: decodeURIComponent(new URL(request.url()).search) });
        return route.fulfill({ status: 204, headers: cors });
      }
      return route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify(rows) });
    });
    await fakeMoverCompany(page, { initial: savedCompany() });
    await fakeMoverDocuments(page);
    await page.goto(url);
    const r = en.mover.reminders;
    const types = en.mover.documents.types;

    // The ended one first; one per document (its latest stage), with what it means (COMPLIANCE §5).
    const cards = page.getByTestId('reminders').locator('[data-testid="reminder-cmr"], [data-testid="reminder-insurance"]');
    await expect(cards).toHaveCount(2);
    await expect(cards.first()).toHaveAttribute('data-testid', 'reminder-cmr');
    await expect(page.getByTestId('reminder-cmr')).toContainText(types.cmr.title);
    await expect(page.getByTestId('reminder-cmr')).toContainText(`${r.endedOn.replace('{{date}}', '14.10.2026')} ${r.endedWhat.crossBorder}`);
    await expect(page.getByTestId('reminder-insurance')).toContainText(`${r.endsOn.replace('{{date}}', '28.10.2026')} ${r.endingWhat.insurance}`);
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('mover-reminders.png');

    // "Got it": all of the document's reminders are read; it goes away.
    await page.getByTestId('reminder-insurance-dismiss').click();
    await expect(page.getByTestId('reminder-insurance')).toHaveCount(0);
    expect(marked).toHaveLength(1);
    expect(marked[0]!.body).toMatchObject({ read_at: expect.any(String) });
    expect(marked[0]!.query).toContain(`id=in.(${rows[0]!.id},${rows[1]!.id})`);
    // "Upload the new one" opens the documents.
    await page.getByTestId('reminder-cmr-upload').click();
    await expect(page.getByText(en.mover.documents.title)).toBeVisible();
  });

  test('job requests: the area only until accepted; accepting shows the exact places; declining is free (COMPLIANCE §2, §9.1)', async ({ page }) => {
    const request = (n: number, accepted = false) => ({
      offer_id: `00000000-0000-4000-8000-0000000f000${n}`,
      offer_status: accepted ? 'accepted' : 'offered',
      offer_expires_at: '2026-10-21T20:00:00+00:00',
      job_id: `00000000-0000-4000-8000-0000000e000${n}`,
      status: accepted ? 'ACCEPTED' : 'OFFERED',
      type: 'SMALL_MOVE',
      vehicle_class: 'VAN',
      helpers: 2,
      scheduled_at: '2026-10-23T07:00:00+00:00',
      items: [
        { key: 'sofa3', qty: 1, assembly: false },
        { key: 'box', qty: 10, assembly: false },
      ],
      distance_km: 83.2,
      est_labor_min: 75,
      pickup_area: 'Prishtina',
      pickup_district: 'Dardania',
      pickup_country: 'XK',
      pickup_floor: 3,
      pickup_has_lift: false,
      dropoff_area: 'Prizren',
      dropoff_district: null,
      dropoff_country: 'XK',
      dropoff_floor: 0,
      dropoff_has_lift: false,
      currency: 'EUR',
      line_items: [{ kind: 'base', amount: 5000 }],
      mover_price: 5000,
      take_rate_pct: 20,
      platform_commission: 1000,
      mover_payout: 4000,
      cancel_free_hours: 48,
      cancel_late_pct: 50,
      pickup_label: accepted ? 'Rr. Agim Ramadani 12, Prishtina' : null,
      pickup_street: accepted ? 'Rr. Agim Ramadani' : null,
      pickup_house_number: accepted ? '12' : null,
      pickup_details: accepted ? 'Ring twice' : null,
      pickup_lat: accepted ? 42.6629 : null,
      pickup_lon: accepted ? 21.1655 : null,
      dropoff_label: accepted ? 'Prizren' : null,
      dropoff_street: null,
      dropoff_house_number: null,
      dropoff_details: accepted ? '' : null,
      dropoff_lat: accepted ? 42.2139 : null,
      dropoff_lon: accepted ? 20.7397 : null,
    });
    let rows = [request(1), request(2)];
    const steps: Record<string, unknown>[] = [];
    await page.route('**/rest/v1/rpc/my_mover_jobs*', (route) =>
      route.request().method() === 'OPTIONS'
        ? route.fulfill({ status: 204, headers: cors })
        : route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify(rows) }),
    );
    await page.route('**/functions/v1/job-transition', (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const step = route.request().postDataJSON() as { action: string; offerId: string };
      steps.push(step);
      rows = step.action === 'accept' ? rows.map((r) => (r.offer_id === step.offerId ? request(1, true) : r)) : rows.filter((r) => r.offer_id !== step.offerId);
      return route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify({ status: step.action === 'accept' ? 'ACCEPTED' : 'QUOTED' }) });
    });
    await page.goto(url);
    const j = en.mover.jobs;
    const st = en.booking.stops;

    // Before accepting: the town and neighbourhood, the work, their own price and payout — no address.
    const first = page.getByTestId('job-request-00000000-0000-4000-8000-0000000e0001');
    await expect(first).toContainText('Dardania, Prishtina → Prizren');
    await expect(first).toContainText(en.landing.movers.phone.district);
    await expect(first).toContainText(j.levels.replace('{{pickup}}', `${st.floorN.replace('{{n}}', '3')} · ${st.liftNo}`).replace('{{dropoff}}', st.ground));
    await expect(first).toContainText('€40');
    await expect(first).toContainText(en.landing.movers.phone.breakdown.replace('{{price}}', '€50').replace('{{pct}}', '20'));
    await expect(app(page).getByText('Rr. Agim Ramadani', { exact: false })).toHaveCount(0);
    await expect(page.getByTestId('job-requests')).toContainText(j.declineNote);
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('mover-job-requests.png');

    // Declining the second costs nothing; accepting the first shows where to go.
    await page.getByTestId('job-request-00000000-0000-4000-8000-0000000e0002-decline').click();
    await expect(page.getByTestId('job-request-00000000-0000-4000-8000-0000000e0002')).toHaveCount(0);
    await page.getByTestId('job-request-00000000-0000-4000-8000-0000000e0001-accept').click();
    const job = page.getByTestId('my-job-00000000-0000-4000-8000-0000000e0001');
    await expect(job.getByTestId('my-job-00000000-0000-4000-8000-0000000e0001-pickup')).toContainText('Rr. Agim Ramadani 12, Prishtina');
    // Its job screen: the customer's directions (design/DECISIONS.md #36).
    await job.click();
    await expect(page.getByTestId('mover-job-pickup')).toContainText(j.directions.replace('{{text}}', 'Ring twice'));
    expect(steps).toEqual([
      { action: 'decline', offerId: '00000000-0000-4000-8000-0000000f0002' },
      { action: 'accept', offerId: '00000000-0000-4000-8000-0000000f0001' },
    ]);
  });

  test('a decision about the account: the reasons on the home, an appeal from there; a complaint about anything else (COMPLIANCE §3)', async ({ page }) => {
    const decisionId = '00000000-0000-4000-8000-0000000d5001';
    const decision = {
      id: decisionId,
      kind: 'suspension',
      reason_text: 'Three customers reported damaged furniture this month.',
      is_serious_violation: false,
      notice_sent_at: '2026-10-14T09:00:00+00:00',
      effective_at: '2026-10-14T09:00:00+00:00',
      lifted_at: null,
      mover_appeals: [] as object[],
    };
    const complaints: object[] = [];
    const sent: Record<string, unknown>[] = [];
    const json = (route: Route, body: unknown) => route.fulfill({ contentType: 'application/json', headers: cors, body: JSON.stringify(body) });
    await page.route('**/rest/v1/suspensions*', (route) =>
      route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: cors }) : json(route, [decision]),
    );
    // Postgres keeps an appeal open until a person at MoversHub answers it (the stand-in does the same).
    await page.route('**/rest/v1/mover_appeals*', (route) => {
      const request = route.request();
      if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': '*' } });
      if (request.method() === 'POST') {
        const body = request.postDataJSON() as Record<string, unknown>;
        sent.push(body);
        const row = { id: `00000000-0000-4000-8000-0000000a500${sent.length}`, ...body, status: 'open', decision_reason: null, created_at: '2026-10-16T10:00:00+00:00', resolved_at: null };
        if (body.suspension_id) decision.mover_appeals.push({ ...row, subject: 'suspension' });
        else complaints.unshift(row);
        return route.fulfill({ status: 201, headers: cors });
      }
      return json(route, complaints);
    });
    await fakeMoverCompany(page, { initial: savedCompany() });
    await fakeMoverDocuments(page);
    await page.goto(url);
    const d = en.mover.decisions;
    const ap = en.mover.appeals;

    // On the home: what it is, what it means, and MoversHub's reasons, as written.
    const card = page.getByTestId(`decision-${decisionId}`);
    await expect(card).toContainText(d.inForce.suspension);
    await expect(card).toContainText(d.what.suspension);
    await expect(card).toContainText(d.reasons.replace('{{date}}', '14.10.2026'));
    await expect(page.getByTestId(`decision-${decisionId}-reasons`)).toHaveText(`“${decision.reason_text}”`);
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('mover-decision.png');

    // The appeal: why, in 10+ characters; sent with the decision; then it waits for an answer.
    await page.getByTestId(`decision-${decisionId}-appeal`).click();
    await page.getByTestId(`appeal-text-${decisionId}`).fill('Not me.');
    await page.getByTestId(`appeal-send-${decisionId}`).click();
    await expect(app(page).getByText(ap.errors.appeal_too_short)).toBeVisible();
    expect(sent).toHaveLength(0);
    await page.getByTestId(`appeal-text-${decisionId}`).fill('  The damage was there before pickup: my pickup photos show it.  ');
    await page.getByTestId(`appeal-send-${decisionId}`).click();
    await expect(page.getByTestId(`appeal-text-${decisionId}`)).toHaveCount(0);
    await expect(page.getByTestId(`decision-${decisionId}-appeal-status`).last()).toHaveText(d.appealWaiting.replace('{{date}}', '16.10.2026'));
    expect(sent[0]).toEqual({
      company_id: savedCompany().id,
      suspension_id: decisionId,
      subject: 'suspension',
      text: 'The damage was there before pickup: my pickup photos show it.',
    });

    // Anything else: a complaint, listed with "waiting for an answer".
    await page.getByTestId('appeal-text-complaint').fill('A job showed up twice in the app yesterday.');
    await page.getByTestId('appeal-send-complaint').click();
    await expect(page.getByTestId('appeal-sent-complaint')).toHaveText(ap.sent);
    expect(sent[1]).toMatchObject({ suspension_id: null, subject: 'other', text: 'A job showed up twice in the app yesterday.' });
    await expect(page.getByTestId('complaints')).toContainText(ap.waiting);
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('mover-appeals.png');
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

  test('cancellation: the mover chooses their own terms; customers see them, and the step needs them', async ({ page }) => {
    const writes = await fakeMoverCompany(page, { initial: savedCompany() });
    await fakeVehicles(page, { initial: [van] });
    await fakeRates(page, { cards: [{ ...savedCard, vehicle_id: van.id }], areas: [{ id: '00000000-0000-4000-8000-0000000a0001', label: 'Prishtinë', radius_km: 50 }] });
    const r = en.mover.rates;
    await page.goto(url);
    // Prices and a work area, but no terms yet: still to do.
    await expect(page.getByTestId('step-rates')).toContainText(en.mover.stepStatus.todo);
    await page.getByTestId('step-rates').click();
    await expect(page.getByTestId('cancel-terms')).toContainText(r.cancelNotSet);
    // Nothing is pre-chosen.
    await page.getByTestId('cancel-save').click();
    await expect(page.getByTestId('cancel-missing')).toHaveText(r.cancelMissing);
    await page.getByTestId('cancel-free-48').click();
    await page.getByTestId('cancel-late-50').click();
    await page.getByTestId('cancel-save').click();
    await expect(page.getByTestId('cancel-current')).toHaveText(
      r.cancelCustomersSee.replace('{{text}}', `${en.booking.cancel.free48} ${en.booking.cancel.late.replace('{{pct}}', '50')}`),
    );
    expect(writes).toEqual([{ method: 'PATCH', body: { cancel_free_hours: 48, cancel_late_pct: 50 } }]);
    await page.getByTestId('rates-back').click();
    await expect(page.getByTestId('step-rates')).toContainText(en.mover.stepStatus.saved);
  });

  test('work area: a town found on the map is added with a radius, and removed again', async ({ page }) => {
    await fakeMoverCompany(page, { initial: savedCompany({ cancel_free_hours: 48, cancel_late_pct: 50 }) });
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
