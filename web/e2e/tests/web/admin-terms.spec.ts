import { expect, test, type APIRequestContext } from '@playwright/test';

import { resources } from '@movershub/i18n';

// Terms versions (design/DECISIONS.md #34; COMPLIANCE §3, §8), end to end on the website's admin
// page. Live, against the cloud project the website uses: a throwaway admin and customer. The admin
// publishes the terms for customers; the `book` function refuses the customer until they accept; a
// version waiting to apply is withdrawn. Everything it publishes is removed afterwards — and it
// doesn't run if the project already publishes terms for customers. Needs QUOTE_API_URL, QUOTE_API_KEY
// and SUPABASE_SECRET_KEY.
const en = resources.en.translation;
const ta = resources.en.admin;
const quoteUrl = process.env.QUOTE_API_URL ?? '';
const key = process.env.QUOTE_API_KEY ?? '';
const secret = process.env.SUPABASE_SECRET_KEY ?? '';
const projectUrl = quoteUrl.replace(/\/functions\/v1\/quote$/, '');
const bookUrl = quoteUrl.replace(/\/quote$/, '/book');
const service = () => ({ apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' });
const PASSWORD = 'movers2027';

test.skip(!quoteUrl || !key || !secret, 'set QUOTE_API_URL, QUOTE_API_KEY and SUPABASE_SECRET_KEY to use the cloud project');

async function account(request: APIRequestContext, role: 'admin' | 'customer', created: string[]) {
  const email = `e2e-terms-${role}-${crypto.randomUUID()}@example.com`;
  const res = await request.post(`${projectUrl}/auth/v1/admin/users`, { headers: service(), data: { email, password: PASSWORD, email_confirm: true } });
  expect(res.ok(), await res.text()).toBe(true);
  const id = ((await res.json()) as { id: string }).id;
  created.push(id);
  expect((await request.patch(`${projectUrl}/rest/v1/profiles?id=eq.${id}`, { headers: service(), data: { role } })).ok()).toBe(true);
  const session = await request.post(`${projectUrl}/auth/v1/token?grant_type=password`, { headers: { apikey: key }, data: { email, password: PASSWORD } });
  expect(session.ok(), await session.text()).toBe(true);
  const token = ((await session.json()) as { access_token: string }).access_token;
  return { id, email, headers: { apikey: key, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } };
}

test('an admin publishes the terms for customers; booking waits for them to be accepted; a waiting version is withdrawn', async ({ page, request }) => {
  const existing = await request.get(`${projectUrl}/rest/v1/terms_versions?audience=eq.customer&select=id`, { headers: service() });
  test.skip(((await existing.json()) as unknown[]).length > 0, 'the project already publishes terms for customers');

  const created: string[] = [];
  try {
    const admin = await account(request, 'admin', created);
    const customer = await account(request, 'customer', created);

    // Nothing published: nothing to accept — the request is checked, not the terms.
    expect((await request.post(bookUrl, { headers: customer.headers, data: {} })).status()).toBe(400);

    // The admin publishes the text in the app, at once.
    await page.goto('/en/login');
    await page.getByLabel(en.auth.emailLabel).fill(admin.email);
    await page.getByLabel(en.auth.passwordLabel).fill(PASSWORD);
    await page.getByRole('button', { name: en.auth.signIn, exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account$/);
    await page.goto('/en/admin/terms');
    const section = page.getByTestId('terms-customer');
    await expect(section).toContainText(ta.terms.none);
    await page.getByTestId('publish-customer-send').click();
    await expect(page.getByTestId('terms-version-customer-1')).toContainText(/^In effect: version 1 since \d{4}-\d{2}-\d{2} · accepted by 0/);
    await expect(section).toContainText(ta.terms.same);

    // The customer can't book until they accept it; then the request itself is checked again.
    const refused = await request.post(bookUrl, { headers: customer.headers, data: {} });
    expect(refused.status()).toBe(403);
    expect((await refused.json()).error).toBe('terms_not_accepted');
    const [v1] = (await (await request.get(`${projectUrl}/rest/v1/terms_versions?audience=eq.customer&select=id`, { headers: customer.headers })).json()) as { id: string }[];
    expect((await request.post(`${projectUrl}/rest/v1/rpc/accept_terms`, { headers: customer.headers, data: { p_version_id: v1!.id } })).ok()).toBe(true);
    expect((await request.post(bookUrl, { headers: customer.headers, data: {} })).status()).toBe(400);
    await page.reload();
    await expect(page.getByTestId('terms-version-customer-1')).toContainText('accepted by 1');

    // A second version waiting to apply (another text, through the admin's own session) is withdrawn.
    const waiting = await request.post(`${projectUrl}/rest/v1/rpc/admin_publish_terms`, {
      headers: { ...admin.headers },
      data: { p_audience: 'customer', p_content: { doc: 'terms', text: { intro: 'E2E', sections: [] } }, p_summary: 'A clearer cancellation section.', p_effective_at: '2099-01-01T00:00:00Z' },
    });
    expect(waiting.ok(), await waiting.text()).toBe(true);
    const v2 = (await waiting.json()) as string;
    await page.reload();
    await expect(page.getByTestId('terms-version-customer-2')).toContainText('Waiting: version 2 from 2099-01-01');
    await page.getByTestId(`withdraw-open-${v2}`).click();
    await page.getByTestId(`withdraw-note-${v2}`).fill('Published by a test.');
    await page.getByTestId(`withdraw-send-${v2}`).click();
    await expect(page.getByTestId('terms-version-customer-2')).toContainText('Withdrawn: version 2');
  } finally {
    // Everything published for customers in this test, its acceptances and log lines; then the logins.
    const versions = (await (await request.get(`${projectUrl}/rest/v1/terms_versions?audience=eq.customer&select=id`, { headers: service() })).json()) as { id: string }[];
    const ids = versions.map((v) => v.id).join(',');
    if (ids) {
      await request.delete(`${projectUrl}/rest/v1/terms_acceptances?terms_version_id=in.(${ids})`, { headers: service() });
      await request.delete(`${projectUrl}/rest/v1/audit_log?entity_id=in.(${ids})`, { headers: service() });
      await request.delete(`${projectUrl}/rest/v1/terms_versions?id=in.(${ids})`, { headers: service() });
    }
    for (const id of created) await request.delete(`${projectUrl}/auth/v1/admin/users/${id}`, { headers: service() });
  }
});
