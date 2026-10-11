import { expect, test } from '@playwright/test';

import { LOCALES, resources } from '@ranktrip/i18n';

const en = resources.en.translation;

// Every language: page renders, no browser errors (incl. hydration mismatches), no sideways scroll on phones.
for (const lang of LOCALES) {
  test(`landing (${lang}) renders without errors at 375px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/${lang}`);
    const t = resources[lang].translation;
    await expect(page.getByRole('heading', { level: 1 })).toContainText(t.landing.hero.title.split('\n')[0]!);
    for (const id of ['#quote', '#how', '#movers', '#markets', '#join']) await expect(page.locator(id)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
    expect(errors).toEqual([]);
  });
}

test('quote widget: five classes, "from" prices, labelled as sample rates (COMPLIANCE §1.1, design/DECISIONS.md)', async ({ page }) => {
  await page.goto('/en');
  const quote = page.locator('#quote');
  for (const cls of ['SMALL', 'VAN', 'LARGE_VAN', 'BOX', 'TRUCK'] as const) {
    const tile = quote.getByRole('button', { name: new RegExp(`^${en.vehicles[cls].name}`) });
    await expect(tile).toBeVisible();
    // Never a bare platform price: every tile price carries "from".
    await expect(tile).toContainText(new RegExp(`${en.landing.quote.from}\\s*€\\d+`));
  }
  await expect(quote.getByText(en.landing.quote.note)).toBeVisible();
  await expect(quote).not.toContainText(/includes Ranktrip's fee/i);
});

test('picking a popular route loads it into the quote widget and the mover phone', async ({ page }) => {
  await page.goto('/en');
  await page.getByRole('radio', { name: 'Munich → Prishtina' }).click();
  await expect(page.locator('input[name=pickup]')).toHaveValue('Munich');
  await expect(page.locator('input[name=dropoff]')).toHaveValue('Prishtina');
  await expect(page.locator('#quote')).toContainText(en.landing.quote.crossBorder);
  await expect(page.locator('#movers')).toContainText('Munich → Prishtina');
  await page.locator('#quote').getByRole('button', { name: en.landing.quote.seeMovers }).click();
  await expect(page.getByText(en.landing.quote.soonTitle)).toBeVisible();
});

test('address search: type, pick a suggestion, the server re-prices the route', async ({ page }) => {
  await page.goto('/en');
  const quote = page.locator('#quote');
  const summary = quote.locator('[aria-live=polite]');
  const before = await summary.innerText();

  const dropoff = page.getByRole('combobox', { name: en.landing.quote.dropoff });
  await dropoff.fill('Tirana');
  const option = page.getByRole('option', { name: /Tirana Centre/ });
  await expect(option).toBeVisible();
  await dropoff.press('Enter');

  await expect(dropoff).toHaveValue(/Tirana Centre/);
  await expect(summary).toContainText(en.landing.quote.crossBorder);
  await expect(summary).not.toHaveText(before);
  // The mover only sees the area before accepting (COMPLIANCE §9.1), never the street label.
  await expect(page.locator('#movers')).toContainText('Prishtina → Tirana');
  await expect(page.locator('#movers')).not.toContainText('Tirana Centre');
});

test('swap exchanges pickup and drop-off', async ({ page }) => {
  await page.goto('/en');
  await page.getByRole('button', { name: en.landing.quote.swap }).click();
  await expect(page.locator('input[name=pickup]')).toHaveValue('Prizren');
  await expect(page.locator('input[name=dropoff]')).toHaveValue('Prishtina');
});

test('mover phone uses compliant wording: Payout, district only, free to decline (COMPLIANCE §2, §9.1, §12)', async ({ page }) => {
  await page.goto('/en');
  const movers = page.locator('#movers');
  await expect(movers.getByText(en.landing.movers.phone.payout, { exact: true })).toBeVisible();
  await expect(movers.getByText(en.landing.movers.phone.district)).toBeVisible();
  await expect(movers).not.toContainText(/you earn/i);
  await movers.getByRole('button', { name: en.landing.movers.phone.decline }).click();
  await expect(movers.getByText(en.landing.movers.phone.declinedText)).toBeVisible();
});

test('waitlist rejects an invalid email without saving it', async ({ page }) => {
  await page.goto('/en');
  const footer = page.locator('#join');
  await footer.getByLabel(en.landing.footer.emailLabel).fill('not-an-email');
  await footer.getByRole('button', { name: en.landing.footer.join }).click();
  await expect(footer.getByText(en.landing.footer.invalid)).toBeVisible();
});

test('language switcher keeps the page and changes the language', async ({ page }) => {
  await page.goto('/en');
  await page.getByRole('button', { name: /Language: English/ }).click();
  await page.getByRole('menuitem', { name: /Deutsch/ }).click();
  await expect(page).toHaveURL(/\/de$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(resources.de.translation.landing.hero.title.split('\n')[0]!);
});
