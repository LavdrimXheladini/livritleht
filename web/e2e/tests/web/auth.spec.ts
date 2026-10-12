import { expect, test } from '@playwright/test';

import { resources } from '@movershub/i18n';

const en = resources.en.translation;
const sq = resources.sq.translation;

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

test('login validates the phone number before sending a code', async ({ page }) => {
  await page.goto('/en/login');
  await page.getByLabel(en.auth.phoneLabel).fill('044123456');
  await page.getByRole('button', { name: en.auth.sendCode }).click();
  await expect(page.getByText(en.auth.errors.invalid_phone)).toBeVisible();
});

test('login validates email on the email tab', async ({ page }) => {
  await page.goto('/en/login');
  await page.getByRole('tab', { name: en.auth.useEmail }).click();
  await page.getByLabel(en.auth.emailLabel).fill('not-an-email');
  await page.getByRole('button', { name: en.auth.sendCode }).click();
  await expect(page.getByText(en.auth.errors.invalid_email)).toBeVisible();
});

test('an invalid email sign-in link returns to login with an error', async ({ page }) => {
  await page.goto('/en/auth/confirm?code=not-a-real-code');
  await expect(page).toHaveURL(/\/en\/login\?error=link_invalid$/);
  await expect(page.getByText(en.auth.errors.link_invalid)).toBeVisible();
});

test('the email link route ignores missing or unknown parameters', async ({ page }) => {
  await page.goto('/sq/auth/confirm?token_hash=x&type=not-a-type');
  await expect(page).toHaveURL(/\/sq\/login\?error=link_invalid$/);
  await expect(page.getByText(sq.auth.errors.link_invalid)).toBeVisible();
});

test('account page sends signed-out users to login', async ({ page }) => {
  await page.goto('/en/account');
  await expect(page).toHaveURL(/\/en\/login$/);
});

// Needs `supabase start` (test OTP numbers from supabase/config.toml).
test('customer signs in with phone OTP', async ({ page }) => {
  test.skip(!process.env.E2E_SUPABASE, 'set E2E_SUPABASE=1 with local Supabase running');
  await page.goto('/en/login');
  await page.getByLabel(en.auth.phoneLabel).fill('+383 44 000 001');
  await page.getByRole('button', { name: en.auth.sendCode }).click();
  await page.getByLabel(en.auth.codeLabel).fill('123456');
  await page.getByRole('button', { name: en.auth.verify }).click();
  await expect(page).toHaveURL(/\/en\/account$/);
  await expect(page.getByText('Test Customer')).toBeVisible();
});
