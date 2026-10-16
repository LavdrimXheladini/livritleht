import { expect, test, type APIRequestContext } from '@playwright/test';

import { resources } from '@movershub/i18n';

// Decisions about a mover and their appeals (design/DECISIONS.md #32; COMPLIANCE §3), end to end on
// the website's admin page. Live, against the cloud project the website uses: a throwaway admin and a
// throwaway mover with a company. The admin suspends with reasons; the mover (their own session, as
// the app does) reads them and appeals; the admin finds the appeal, upholds it, and the suspension is
// lifted. Needs QUOTE_API_URL (the project's functions URL), QUOTE_API_KEY and SUPABASE_SECRET_KEY.
const en = resources.en.translation;
const ta = resources.en.admin;
const quoteUrl = process.env.QUOTE_API_URL ?? '';
const key = process.env.QUOTE_API_KEY ?? '';
const secret = process.env.SUPABASE_SECRET_KEY ?? '';
const projectUrl = quoteUrl.replace(/\/functions\/v1\/quote$/, '');
const service = () => ({ apikey: secret, Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' });
const PASSWORD = 'movers2027';

test.skip(!quoteUrl || !key || !secret, 'set QUOTE_API_URL, QUOTE_API_KEY and SUPABASE_SECRET_KEY to use the cloud project');

async function account(request: APIRequestContext, role: 'admin' | 'mover', created: string[]) {
  const email = `e2e-decisions-${role}-${crypto.randomUUID()}@example.com`;
  const res = await request.post(`${projectUrl}/auth/v1/admin/users`, { headers: service(), data: { email, password: PASSWORD, email_confirm: true } });
  expect(res.ok(), await res.text()).toBe(true);
  const id = ((await res.json()) as { id: string }).id;
  created.push(id);
  expect((await request.patch(`${projectUrl}/rest/v1/profiles?id=eq.${id}`, { headers: service(), data: { role } })).ok()).toBe(true);
  return { id, email };
}

test('an admin suspends a mover with reasons; the mover appeals; upholding it lifts the suspension', async ({ page, request }) => {
  const created: string[] = [];
  let companyId = '';
  try {
    const admin = await account(request, 'admin', created);
    const mover = await account(request, 'mover', created);
    const company = await request.post(`${projectUrl}/rest/v1/mover_companies`, {
      headers: { ...service(), Prefer: 'return=representation' },
      data: { owner_id: mover.id, legal_name: 'E2E Suspended Movers', country: 'XK' },
    });
    expect(company.ok(), await company.text()).toBe(true);
    companyId = ((await company.json()) as { id: string }[])[0]!.id;

    // The mover's own session, as the app has it. A mover can't decide anything.
    const session = await request.post(`${projectUrl}/auth/v1/token?grant_type=password`, { headers: { apikey: key }, data: { email: mover.email, password: PASSWORD } });
    expect(session.ok(), await session.text()).toBe(true);
    const asMover = { apikey: key, Authorization: `Bearer ${((await session.json()) as { access_token: string }).access_token}`, 'Content-Type': 'application/json' };
    const refused = await request.post(`${projectUrl}/rest/v1/rpc/admin_decide_suspension`, {
      headers: asMover,
      data: { p_company_id: companyId, p_kind: 'suspension', p_reason: 'Suspending myself for a test.' },
    });
    expect(refused.status()).toBe(403);

    // The admin signs in on the website and suspends, with reasons.
    await page.goto('/en/login');
    await page.getByLabel(en.auth.emailLabel).fill(admin.email);
    await page.getByLabel(en.auth.passwordLabel).fill(PASSWORD);
    await page.getByRole('button', { name: en.auth.signIn, exact: true }).click();
    await expect(page).toHaveURL(/\/en\/account$/);
    await page.goto(`/en/admin/movers/${companyId}`);
    await page.getByTestId('decide-open').click();
    const reasons = 'Three customers reported damaged furniture this month.';
    await page.getByTestId('decide-reason').fill(reasons);
    await page.getByTestId('decide-send').click();
    await expect(page.getByText(ta.decisionState.in_force, { exact: true })).toBeVisible();
    // As the mover reads them (the history below repeats them).
    await expect(page.getByText(`${ta.reasonsToMover}: ${reasons}`)).toBeVisible();

    // The mover reads it at once (RLS) and appeals.
    const decisions = await request.get(`${projectUrl}/rest/v1/suspensions?select=id,kind,reason_text,lifted_at`, { headers: asMover });
    const [decision] = (await decisions.json()) as { id: string; kind: string; reason_text: string; lifted_at: string | null }[];
    expect(decision).toMatchObject({ kind: 'suspension', reason_text: reasons, lifted_at: null });
    const appealed = await request.post(`${projectUrl}/rest/v1/mover_appeals`, {
      headers: { ...asMover, Prefer: 'return=representation' },
      data: { company_id: companyId, suspension_id: decision!.id, subject: 'suspension', text: 'The damage was there before pickup: my photos show it.' },
    });
    expect(appealed.status(), await appealed.text()).toBe(201);
    const appealId = ((await appealed.json()) as { id: string }[])[0]!.id;

    // The admin finds it among the appeals waiting, and upholds it with reasons.
    await page.goto('/en/admin?status=appeals');
    await page.getByTestId(`admin-waiting-appeal-${appealId}`).click();
    const answer = 'Your pickup photos show the damage was there before.';
    await page.getByTestId(`answer-reason-${appealId}`).fill(answer);
    await page.getByTestId(`answer-uphold-${appealId}`).click();
    await expect(page.getByTestId(`admin-appeal-${appealId}`)).toContainText(ta.appealStatus.upheld);
    await expect(page.getByText(new RegExp(`^${ta.decisionState.lifted.replace('{{date}}', '\\d{4}-\\d{2}-\\d{2}')}$`))).toBeVisible();

    // The mover reads the answer; the suspension no longer applies.
    const after = await request.get(`${projectUrl}/rest/v1/suspensions?id=eq.${decision!.id}&select=lifted_at,mover_appeals(status,decision_reason)`, { headers: asMover });
    expect(((await after.json()) as unknown[])[0]).toMatchObject({ lifted_at: expect.any(String), mover_appeals: [{ status: 'upheld', decision_reason: answer }] });
  } finally {
    // The company takes its decisions and appeals with it; then the log entries and the logins.
    if (companyId) {
      const suspensions = await request.get(`${projectUrl}/rest/v1/suspensions?company_id=eq.${companyId}&select=id,mover_appeals(id)`, { headers: service() });
      const ids = ((await suspensions.json()) as { id: string; mover_appeals: { id: string }[] }[]).flatMap((s) => [s.id, ...s.mover_appeals.map((a) => a.id)]);
      await request.delete(`${projectUrl}/rest/v1/mover_companies?id=eq.${companyId}`, { headers: service() });
      if (ids.length) await request.delete(`${projectUrl}/rest/v1/audit_log?entity_id=in.(${ids.join(',')})`, { headers: service() });
    }
    for (const id of created) await request.delete(`${projectUrl}/auth/v1/admin/users/${id}`, { headers: service() });
  }
});
