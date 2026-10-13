import { expect, test, type Page } from '@playwright/test';

import { resources } from '@movershub/i18n';

import {
  SAVED_ROLE_KEY,
  SESSION_KEY,
  STAND_IN_ID,
  STAND_IN_PASSWORD,
  appUrl,
  fakeAccount,
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
    expect(calls.updates.at(-1)).toEqual({ password: 'movers2027', data: { password_set: true } });
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
    expect(calls.updates).toEqual([{ password: 'movers2027', data: { password_set: true } }]);
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
    // It has a password already: no password screen.
    await expect(page.getByTestId('home-notice')).toHaveText(en.auth.existingCustomer);
    await expect(page.getByTestId('home-sign-out')).toBeVisible();
    expect(calls.updates).toEqual([]);
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

test.describe('an older account without a password', () => {
  test('creates one before anything else', async ({ page }) => {
    const calls = await signInAs(page, 'customer', { hasPassword: false });
    await page.goto(url);
    await createPassword(page);
    await expect(page.getByTestId('home-sign-out')).toBeVisible();
    expect(calls.updates).toEqual([{ password: 'movers2027', data: { password_set: true } }]);
  });

  test('can sign out instead', async ({ page }) => {
    await signInAs(page, 'mover', { hasPassword: false });
    await page.goto(url);
    await expect(page.getByText(en.auth.createPasswordTitle)).toBeVisible();
    await page.getByTestId('password-sign-out').click();
    await expect(page.getByTestId('auth-password')).toBeVisible();
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

test.describe('signed in as a mover', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'mover');
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
