import { readFile } from 'node:fs/promises';

import { expect, test } from '@playwright/test';

import { resources } from '@movershub/i18n';

// The website's account page (design/DECISIONS.md #31; COMPLIANCE §9): download my data, delete my
// account. Live, against the cloud project the website uses (the pages need a real session): a
// throwaway customer with a password. Needs QUOTE_API_URL (the project's functions URL) and
// SUPABASE_SECRET_KEY.
const en = resources.en.translation;
const quoteUrl = process.env.QUOTE_API_URL ?? '';
const secret = process.env.SUPABASE_SECRET_KEY ?? '';
const projectUrl = quoteUrl.replace(/\/functions\/v1\/quote$/, '');
const admin = () => ({ apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' });

test.skip(!quoteUrl || !secret, 'set QUOTE_API_URL and SUPABASE_SECRET_KEY to use the cloud project');

test('download my data, then delete the account: the password again, and signed out with a note', async ({ page, request }) => {
  const email = `e2e-web-account-${crypto.randomUUID()}@example.com`;
  const res = await request.post(`${projectUrl}/auth/v1/admin/users`, { headers: admin(), data: { email, password: 'movers2027', email_confirm: true } });
  expect(res.ok(), await res.text()).toBe(true);
  const id = ((await res.json()) as { id: string }).id;
  try {
    await request.patch(`${projectUrl}/rest/v1/profiles?id=eq.${id}`, { headers: admin(), data: { role: 'customer' } });
    await page.goto('/en/login');
    await page.getByLabel(en.auth.emailLabel).fill(email);
    await page.getByLabel(en.auth.passwordLabel).fill('movers2027');
    await page.getByRole('button', { name: en.auth.signIn, exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account$/);

    // The data, as a file.
    const download = page.waitForEvent('download');
    await page.getByTestId('account-download').click();
    const file = await download;
    expect(file.suggestedFilename()).toMatch(/^movershub-data-\d{4}-\d{2}-\d{2}\.json$/);
    const data = JSON.parse(await readFile((await file.path())!, 'utf8')) as { account: { email: string }; profile: { role: string } };
    expect(data.account.email).toBe(email);
    expect(data.profile.role).toBe('customer');

    // Delete: a wrong password says so; the right one deletes, signs out and says so.
    await page.getByLabel(en.auth.passwordLabel).fill('wrong-password-1');
    await page.getByRole('button', { name: en.account.deleteButton }).click();
    await expect(page.getByTestId('delete-error')).toHaveText(en.account.wrongPassword);
    await page.getByLabel(en.auth.passwordLabel).fill('movers2027');
    await page.getByRole('button', { name: en.account.deleteButton }).click();
    await expect(page).toHaveURL(/\/en\/login\?deleted=1$/);
    await expect(page.getByTestId('auth-notice')).toHaveText(en.account.deleted);
    expect((await request.get(`${projectUrl}/auth/v1/admin/users/${id}`, { headers: admin() })).status()).toBe(404);
  } finally {
    await request.delete(`${projectUrl}/auth/v1/admin/users/${id}`, { headers: admin() });
  }
});
