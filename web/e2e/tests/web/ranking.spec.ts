import { expect, test } from '@playwright/test';

import { LOCALES, resources } from '@movershub/i18n';

// "How ranking works" (COMPLIANCE §3, design/DECISIONS.md #27): public, in every language, reachable
// from every page's footer, and it lists every condition and every "never".
const en = resources.en.translation;

for (const lang of LOCALES) {
  test(`ranking page (${lang}) renders without errors at 375px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/${lang}/ranking`);
    const t = resources[lang].translation.ranking;
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.title);
    await expect(page).toHaveTitle(new RegExp(`^${t.title}`));
    for (const text of [...Object.values(t.who), t.orderText, ...Object.values(t.never), t.reviewsText]) {
      await expect(page.getByText(text, { exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
    expect(errors).toEqual([]);
  });
}

test('the footer leads to it, and its links lead back to the landing page', async ({ page }) => {
  await page.goto('/en');
  await page.getByRole('contentinfo').getByRole('link', { name: en.landing.footer.ranking }).click();
  await expect(page).toHaveURL(/\/en\/ranking$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.ranking.title);
  await expect(page.getByRole('navigation', { name: en.landing.nav.main }).getByRole('link', { name: en.landing.nav.movers })).toHaveAttribute(
    'href',
    '/en#movers',
  );
  await page.getByRole('link', { name: en.landing.nav.getPrice }).click();
  await expect(page).toHaveURL(/\/en#quote$/);
});

test('switching the language keeps the page', async ({ page }) => {
  await page.goto('/en/ranking');
  await page.getByRole('button', { name: /Language/ }).click();
  await page.getByRole('menuitem', { name: /Shqip/ }).click();
  await expect(page).toHaveURL(/\/sq\/ranking$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(resources.sq.translation.ranking.title);
});
