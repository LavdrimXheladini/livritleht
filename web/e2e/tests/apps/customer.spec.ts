import { expect, test } from '@playwright/test';

import { resources } from '@ranktrip/i18n';

import { appUrl, fitScreenToPage, savedQuote, serveFixtures } from './app';

const url = appUrl('customer');
const en = resources.en.translation;

test.beforeEach(async ({ page }) => {
  await serveFixtures(page);
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
  await fitScreenToPage(page);
  await expect(page).toHaveScreenshot('customer-home.png');
});

test('sign-in: a wrong number shows the error under the field', async ({ page }) => {
  await page.getByTestId('home-sign-in').click();
  await page.getByTestId('login-target').fill('12345');
  await page.getByTestId('login-send-code').click();
  await expect(page.getByText(en.auth.errors.invalid_phone)).toBeVisible();
  await expect(page).toHaveScreenshot('customer-sign-in-error.png');
});
