import { expect, test } from '@playwright/test';

import { LEGAL_DOCS, LOCALES, legalDocument, resources } from '@movershub/i18n';

// The legal pages (design/DECISIONS.md #33; COMPLIANCE §3, §8, §9): privacy policy, terms for
// customers, terms for movers, contact and legal notice — public, linked from every page's footer,
// marked as drafts, and in English (marked) until translated. The operator's unknown details show as
// marked gaps, never as an empty space.
const en = resources.en.translation;

for (const doc of LEGAL_DOCS) {
  test(`${doc}: every section, the draft note, no errors at 375px`, async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.setViewportSize({ width: 375, height: 800 });
    await page.goto(`/en/${doc}`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.legal.titles[doc]);
    await expect(page).toHaveTitle(new RegExp(`^${en.legal.titles[doc]}`));
    await expect(page.getByTestId('legal-draft')).toHaveText(en.legal.draft);
    await expect(page.getByTestId('legal-english-only')).toHaveCount(0);
    for (const section of legalDocument(doc, 'en').text.sections) {
      await expect(page.getByRole('heading', { level: 2, name: section.heading, exact: true })).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBe(0);
    expect(errors).toEqual([]);
  });
}

test('in another language: the page in that language, the text in English and saying so', async ({ page }) => {
  for (const lang of LOCALES.filter((l) => l !== 'en')) {
    const t = resources[lang].translation.legal;
    await page.goto(`/${lang}/privacy`);
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(t.titles.privacy);
    await expect(page.getByTestId('legal-draft')).toHaveText(t.draft);
    await expect(page.getByTestId('legal-english-only')).toHaveText(t.englishOnly);
    // The English text is marked as English (screen readers read it as English).
    await expect(page.locator('[lang="en"]').getByText(legalDocument('privacy', 'en').text.intro)).toBeVisible();
  }
});

test('the operator is named — or a marked gap while the company is not registered', async ({ page }) => {
  await page.goto('/en/contact');
  await expect(page.getByText('Operator: [company name — added once the company is registered]')).toBeVisible();
  await expect(page.getByText('Email: [contact email — added once MoversHub has its own address]')).toBeVisible();
});

test('every page links to them in the footer; sign-in links to the terms and the privacy policy', async ({ page }) => {
  await page.goto('/en');
  const footer = page.getByRole('contentinfo');
  for (const doc of LEGAL_DOCS) {
    await expect(footer.getByRole('link', { name: en.legal.titles[doc], exact: true })).toHaveAttribute('href', `/en/${doc}`);
  }
  await footer.getByRole('link', { name: en.legal.titles['mover-terms'], exact: true }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(en.legal.titles['mover-terms']);
  // From one legal page to another.
  await page.getByRole('article').getByRole('link', { name: en.legal.titles.privacy, exact: true }).click();
  await expect(page).toHaveURL(/\/en\/privacy$/);

  await page.goto('/en/login');
  const legal = page.getByRole('navigation', { name: en.legal.heading });
  for (const doc of ['terms', 'mover-terms', 'privacy'] as const) {
    await expect(legal.getByRole('link', { name: en.legal.titles[doc], exact: true })).toHaveAttribute('href', `/en/${doc}`);
  }
});
