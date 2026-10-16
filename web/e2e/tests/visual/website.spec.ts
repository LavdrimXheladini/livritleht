import { expect, test, type Page } from '@playwright/test';

import { LOCALES, resources } from '@movershub/i18n';

// Screenshot comparisons of the website: `pnpm e2e:visual`. After an intended design change, look at
// the new pictures and accept them with `pnpm e2e:visual --update-snapshots`.
// Still and offline: no motion (the project prefers reduced motion), map tiles blocked so maps show
// their drawn fallback, sample prices (QUOTE_SOURCE=sample), and the footer's year masked.

const PHONE = { width: 375, height: 800 };
const LAPTOP = { width: 1280, height: 800 };

async function open(page: Page, path: string, viewport: { width: number; height: number }) {
  await page.route('https://tiles.openfreemap.org/**', (route) => route.abort());
  await page.setViewportSize(viewport);
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
}

/** "© 2026 MoversHub …" changes every January. */
const year = (page: Page) => page.locator('footer').getByText(/©/);

for (const lang of LOCALES) {
  test(`landing (${lang}) on a phone`, async ({ page }) => {
    await open(page, `/${lang}`, PHONE);
    await expect(page.locator('#quote [aria-live=polite]')).toContainText(resources[lang].translation.landing.quote.from);
    await expect(page).toHaveScreenshot(`landing-${lang}-phone.png`, { fullPage: true, mask: [year(page)] });
  });
}

test('landing (en) on a laptop', async ({ page }) => {
  await open(page, '/en', LAPTOP);
  await expect(page.locator('#quote [aria-live=polite]')).toContainText(resources.en.translation.landing.quote.from);
  await expect(page).toHaveScreenshot('landing-en-laptop.png', { fullPage: true, mask: [year(page)] });
});

for (const [name, viewport] of [['phone', PHONE], ['laptop', LAPTOP]] as const) {
  test(`live dashboard (en) on a ${name}`, async ({ page }) => {
    await open(page, '/en/live', viewport);
    // With reduced motion the simulation starts paused; the map shows its fallback.
    await expect(page.getByText(resources.en.translation.dashboard.map.unavailable)).toBeVisible();
    await expect(page).toHaveScreenshot(`live-en-${name}.png`, { fullPage: true });
  });
}

test('sign-in (en) on a phone', async ({ page }) => {
  await open(page, '/en/login', PHONE);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(resources.en.translation.auth.title);
  await expect(page).toHaveScreenshot('sign-in-en-phone.png', { fullPage: true });
});

for (const [name, viewport] of [['phone', PHONE], ['laptop', LAPTOP]] as const) {
  test(`how ranking works (en) on a ${name}`, async ({ page }) => {
    await open(page, '/en/ranking', viewport);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(resources.en.translation.ranking.title);
    await expect(page).toHaveScreenshot(`ranking-en-${name}.png`, { fullPage: true, mask: [year(page)] });
  });
}

test('terms for movers (en) on a laptop', async ({ page }) => {
  await open(page, '/en/mover-terms', LAPTOP);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(resources.en.translation.legal.titles['mover-terms']);
  await expect(page).toHaveScreenshot('mover-terms-en-laptop.png', { fullPage: true, mask: [year(page)] });
});
