import { expect, test, type Page } from '@playwright/test';

import { LOCALES, resources } from '@ranktrip/i18n';

const en = resources.en.translation;
const d = en.dashboard;

/** Tests stay offline: block the map style so the dashboard shows its "map unavailable" fallback. */
async function blockMapTiles(page: Page) {
  await page.route('https://tiles.openfreemap.org/**', (route) => route.abort());
}

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // The blocked map request itself is expected; anything else (hydration, React) is a failure.
  page.on('console', (m) => m.type() === 'error' && !m.text().startsWith('Failed to load resource') && errors.push(m.text()));
  return errors;
}

for (const lang of LOCALES) {
  test(`live dashboard (${lang}) renders without errors at 375px`, async ({ page }) => {
    await blockMapTiles(page);
    const errors = collectErrors(page);
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/${lang}/live`);
    const t = resources[lang].translation.dashboard;
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.title);
    // Demo data is always labelled as simulated.
    await expect(page.getByText(t.stats.simulated, { exact: true })).toBeVisible();
    await expect(page.getByText(t.map.unavailable)).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
    expect(errors).toEqual([]);
  });
}

test('live dashboard: pick a job, cross-border notice, van load (COMPLIANCE §4, §6, §11)', async ({ page }) => {
  await blockMapTiles(page);
  await page.goto('/en/live');
  await page.getByRole('button', { name: d.pause }).click(); // freeze the simulation
  await expect(page.getByRole('button', { name: d.play })).toBeVisible();

  const jobs = page.getByRole('button', { name: /^RT-\d{4}/ });
  await expect(jobs).toHaveCount(3);
  await page.getByRole('button', { name: /^RT-2047/ }).click();
  await expect(page.getByRole('button', { name: /^RT-2047/ })).toHaveAttribute('aria-pressed', 'true');

  // Job card: the mover is shown as a company, never a person (§4, §12).
  await expect(page.getByText(`${en.vehicles.LARGE_VAN.name} · ${d.companies.b}`).first()).toBeVisible();
  // Munich (DE) → Prishtina (XK, non-EU): customs documentation notice (§11).
  await expect(page.getByText(d.job.crossBorderCustoms.replace('{{pct}}', '15'))).toBeVisible();
  // Card saved at booking, charged after the move — never "paid" up front (§6).
  await expect(page.getByText(d.timeline.cardSaved)).toBeVisible();

  await expect(page.getByRole('heading', { name: d.items.title.replace('{{n}}', '5') })).toBeVisible();
  await page.getByRole('button', { name: d.views.load }).click();
  await expect(page.getByRole('heading', { name: d.load.title.replace('{{vehicle}}', en.vehicles.LARGE_VAN.name) })).toBeVisible();
  // A cargo slot and the items list share the selection.
  await page.getByRole('button', { name: d.itemNames.desk, exact: true }).click();
  await expect(page.getByRole('button', { name: new RegExp(`^${d.itemNames.desk}`), expanded: true })).toBeVisible();
});

test('landing: "Open full dashboard" leads to the live dashboard', async ({ page }) => {
  await page.goto('/en');
  await page.getByRole('link', { name: en.landing.map.dashboard }).click();
  await expect(page).toHaveURL(/\/en\/live$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(d.title);
});
