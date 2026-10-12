import { expect, test } from '@playwright/test';

import { resources } from '@ranktrip/i18n';

import { appUrl, fitScreenToPage, serveFixtures } from './app';

const url = appUrl('mover');
const en = resources.en.translation;

test.beforeEach(async ({ page }) => {
  await serveFixtures(page);
});

test('home: intro and an example request with the payout', async ({ page }) => {
  await page.goto(url);
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

test('sign-in on the dark screen: a wrong number shows a readable error', async ({ page }) => {
  await page.goto(url);
  await page.getByTestId('mover-sign-in').click();
  await page.getByTestId('login-target').fill('12345');
  await page.getByTestId('login-send-code').click();
  await expect(page.getByText(en.auth.errors.invalid_phone)).toBeVisible();
  await expect(page).toHaveScreenshot('mover-sign-in-error.png');
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
