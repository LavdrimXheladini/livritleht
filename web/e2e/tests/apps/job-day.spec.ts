import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test, type Page, type Route } from '@playwright/test';

import { resources } from '@movershub/i18n';

import { appUrl, cors, fakeMoverCompany, fitScreenToPage, serveFixtures, signInAs, stored } from './app';

// The move day in the app (design/DECISIONS.md #36; COMPLIANCE §2, §4, §7, §8, §9.1): the mover's job
// screen — one step at a time, photos at each stop, cancelling for free — and the customer's move —
// the steps with their times, the photos, cancelling with the cost shown first, another mover when the
// mover cancelled, confirming. The server is faked: it answers like job-transition, PostgREST and
// Supabase Storage do.

const url = appUrl();
const en = resources.en.translation;
const jm = resources.en.job.mover;
const jc = resources.en.job.customer;
const app = (page: Page) => page.locator('#root');
const PHOTO = fileURLToPath(new URL('../../fixtures/job-photo.jpg', import.meta.url));
const photoBytes = readFileSync(PHOTO);

const JOB = '00000000-0000-4000-8000-0000000e5d01';
const OFFER = '00000000-0000-4000-8000-0000000f5d01';
/** Thursday 22 October 2026, 09:00 on this computer's clock. */
const AT = new Date(2026, 9, 22, 9);
const at = (h: number, m = 0, day = 22) => new Date(2026, 9, day, h, m).toISOString();

const STEPS = ['EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT', 'AT_DROPOFF', 'COMPLETED'] as const;
const nextOf = (s: string) => (s === 'ACCEPTED' ? STEPS[0] : (STEPS[STEPS.indexOf(s as (typeof STEPS)[number]) + 1] ?? null));

const preflight = (route: Route) => route.fulfill({ status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': '*' } });
const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: cors, body: JSON.stringify(body) });

/* ── The mover side ─────────────────────────────────────────────────────── */

type MoverRow = Record<string, unknown> & { job_id: string; status: string };

/** An accepted job as public.my_mover_jobs answers it: Prishtina → Prizren, 09:00, EUR 50 (payout 40). */
function moverRow(status: string, changes: Record<string, unknown> = {}, id = JOB): MoverRow {
  const exact = status !== 'CANCELLED';
  return {
    offer_id: id.replace('-0000000e', '-0000000f'),
    offer_status: 'accepted',
    offer_expires_at: at(20, 0, 21),
    job_id: id,
    status,
    type: 'SMALL_MOVE',
    vehicle_class: 'VAN',
    helpers: 2,
    scheduled_at: AT.toISOString(),
    items: [
      { key: 'sofa3', qty: 1, assembly: false },
      { key: 'box', qty: 10, assembly: false },
    ],
    distance_km: 83.2,
    est_labor_min: 75,
    pickup_area: 'Prishtina',
    pickup_district: 'Dardania',
    pickup_country: 'XK',
    pickup_floor: 3,
    pickup_has_lift: false,
    dropoff_area: 'Prizren',
    dropoff_district: null,
    dropoff_country: 'XK',
    dropoff_floor: 0,
    dropoff_has_lift: false,
    currency: 'EUR',
    line_items: [{ kind: 'base', amount: 5000 }],
    mover_price: 5000,
    take_rate_pct: 20,
    platform_commission: 1000,
    mover_payout: 4000,
    cancel_free_hours: 48,
    cancel_late_pct: 50,
    pickup_label: exact ? 'Rr. Agim Ramadani 12, Prishtina' : null,
    pickup_street: exact ? 'Rr. Agim Ramadani' : null,
    pickup_house_number: exact ? '12' : null,
    pickup_details: exact ? 'Ring twice' : null,
    pickup_lat: exact ? 42.6629 : null,
    pickup_lon: exact ? 21.1655 : null,
    dropoff_label: exact ? 'Prizren' : null,
    dropoff_street: null,
    dropoff_house_number: null,
    dropoff_details: exact ? '' : null,
    dropoff_lat: exact ? 42.2139 : null,
    dropoff_lon: exact ? 20.7397 : null,
    on_my_way_from: at(3),
    last_event_at: at(7),
    ended_at: null,
    cancelled_by: null,
    cancel_reason: null,
    cancellation_fee: null,
    fee_rule: null,
    confirmed_at: null,
    absent_reason_from: null,
    ...changes,
  };
}

type Answer = { status: number; body: unknown } | 'abort';

/**
 * The server behind the mover's job day: their list (my_mover_jobs: ended moves only when the app asks
 * for them, as Postgres does), the steps (job-transition: one at a time, a repeat answers the same,
 * leaving a stop needs its photo; the mover's cancel), the photo files (storage) and rows (job_photos),
 * and links to them. `abort`: answers to drop, by kind, once each; `uploadAnswers` / `rowAnswers`: the
 * next answers of storage / job_photos, in turn, before the normal ones; `hang`: steps get no answer.
 */
async function fakeMoverDay(
  page: Page,
  clock: Date,
  rows: MoverRow[],
  { abort = [] as ('step' | 'row')[], uploadAnswers = [] as Answer[], rowAnswers = [] as Answer[] } = {},
) {
  // The app's clock in this test (the server's answers carry its time, not this computer's).
  const nowIso = () => clock.toISOString();
  // `offline`: every step, upload and row write fails as without network, until the test sets it back.
  const state = { rows, photos: [] as Record<string, unknown>[], offline: false, hang: false };
  const calls = {
    steps: [] as Record<string, unknown>[],
    uploads: [] as { path: string; contentType: string | null; bytes: number; body: Buffer }[],
    rowWrites: [] as Record<string, unknown>[],
    deletes: [] as string[],
  };
  const dropped = new Set<string>();
  const dropOnce = (kind: 'step' | 'row') => {
    if (!abort.includes(kind) || dropped.has(kind)) return false;
    dropped.add(kind);
    return true;
  };
  await page.route('**/rest/v1/rpc/my_mover_jobs*', (route) => {
    if (route.request().method() === 'OPTIONS') return preflight(route);
    const args = (route.request().postDataJSON() ?? {}) as { p_include_ended?: boolean };
    return json(route, state.rows.filter((r) => args.p_include_ended === true || r.ended_at === null));
  });
  await page.route('**/functions/v1/job-transition', (route) => {
    if (route.request().method() === 'OPTIONS') return preflight(route);
    const body = route.request().postDataJSON() as { action: string; jobId: string; to?: string; reason?: string };
    calls.steps.push(body);
    // No answer at all (a stalled connection): the request is left open.
    if (state.hang) return;
    if (state.offline || (body.action === 'step' && dropOnce('step'))) return route.abort('failed');
    const row = state.rows.find((r) => r.job_id === body.jobId);
    if (!row) return json(route, { error: 'not_found' }, 404);
    const now = nowIso();
    if (body.action === 'step') {
      if (row.status === body.to) return json(route, { status: body.to });
      if (nextOf(row.status) !== body.to) return json(route, { error: 'wrong_step', current: row.status }, 409);
      const stage = body.to === 'IN_TRANSIT' ? 'pickup' : body.to === 'COMPLETED' ? 'dropoff' : null;
      if (stage && !state.photos.some((p) => p.job_id === row.job_id && p.stage === stage)) return json(route, { error: 'photos_required' }, 409);
      Object.assign(row, { status: body.to, last_event_at: now, ...(body.to === 'COMPLETED' ? { ended_at: now } : {}) });
      return json(route, { status: body.to });
    }
    if (body.action === 'mover_cancel') {
      Object.assign(row, moverRow('CANCELLED', { ended_at: now, cancelled_by: 'mover', cancel_reason: body.reason ?? null, cancellation_fee: 0, fee_rule: 'mover_cancelled' }, row.job_id));
      return json(route, { status: 'CANCELLED' });
    }
    return json(route, { error: 'unavailable' }, 500);
  });
  await page.route('**/storage/v1/object/job-photos**', (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return preflight(route);
    if (request.method() === 'DELETE') {
      calls.deletes.push(request.url());
      return json(route, []);
    }
    if (state.offline) return route.abort('failed');
    const path = decodeURIComponent(new URL(request.url()).pathname.split('/storage/v1/object/job-photos/')[1] ?? '');
    const body = request.postDataBuffer() ?? Buffer.alloc(0);
    calls.uploads.push({ path, contentType: request.headers()['content-type'] ?? null, bytes: body.length, body });
    const scripted = uploadAnswers.shift();
    if (scripted === 'abort') return route.abort('failed');
    if (scripted) return json(route, scripted.body, scripted.status);
    return json(route, { Key: `job-photos/${path}`, Id: 'stand-in' });
  });
  await page.route('**/rest/v1/job_photos*', (route) => {
    const request = route.request();
    if (request.method() === 'OPTIONS') return preflight(route);
    if (request.method() === 'GET') return json(route, state.photos);
    if (state.offline) return route.abort('failed');
    const body = request.postDataJSON() as Record<string, unknown>;
    calls.rowWrites.push(body);
    if (dropOnce('row')) return route.abort('failed');
    const scripted = rowAnswers.shift();
    if (scripted === 'abort') return route.abort('failed');
    if (scripted) return json(route, scripted.body, scripted.status);
    const row = { id: `00000000-0000-4000-8000-0000000a${String(state.photos.length + 1).padStart(4, '0')}`, ...body, taken_at: nowIso() };
    state.photos.push(row);
    // `.single()` asks for one object.
    return json(route, (request.headers()['accept'] ?? '').includes('vnd.pgrst.object') ? row : [row], 201);
  });
  await servePhotoLinks(page);
  return { state, calls };
}

/** Links to photos (one batch request), and the photos behind them (the fixture). */
async function servePhotoLinks(page: Page) {
  await page.route('**/storage/v1/object/sign/job-photos', (route) => {
    if (route.request().method() === 'OPTIONS') return preflight(route);
    const { paths } = route.request().postDataJSON() as { paths: string[] };
    return json(
      route,
      paths.map((path) => ({ path, signedURL: `/object/sign/job-photos/${path}?token=e2e`, error: null })),
    );
  });
  await page.route('**/storage/v1/object/sign/job-photos/**', (route) =>
    route.request().method() === 'OPTIONS' ? preflight(route) : route.fulfill({ status: 200, contentType: 'image/jpeg', headers: cors, body: photoBytes }),
  );
}

/** Takes a photo at the stop: in the browser, the camera is a file picker. */
async function takePhoto(page: Page, file: string | { name: string; mimeType: string; buffer: Buffer } = PHOTO) {
  const chooser = page.waitForEvent('filechooser');
  await page.getByTestId('mover-job-photo-add').click();
  await (await chooser).setFiles(file);
}

/** Marks the next step: the button, then "Yes" in the question that opens. */
async function step(page: Page, question: string) {
  await page.getByTestId('mover-job-step').click();
  await expect(app(page).getByText(question, { exact: true })).toBeVisible();
  await page.getByTestId('mover-job-confirm-yes').click();
}

test.beforeEach(async ({ page }) => {
  await serveFixtures(page);
});

test.describe('the move day, mover side', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'mover');
    await fakeMoverCompany(page);
  });

  test('on my way, arrived, a pickup photo, loaded, arrived, a drop-off photo, done (COMPLIANCE §7)', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 22, 7, 30));
    const { calls } = await fakeMoverDay(page, new Date(2026, 9, 22, 7, 30), [moverRow('ACCEPTED')]);
    await page.goto(url);
    await page.getByTestId(`my-job-${JOB}`).click();
    await expect(page.getByTestId('mover-job-status')).toContainText(jm.state.ACCEPTED);

    await step(page, jm.confirm.EN_ROUTE_TO_PICKUP);
    await expect(page.getByTestId('mover-job-status')).toContainText(jm.state.EN_ROUTE_TO_PICKUP);
    await step(page, jm.confirm.AT_PICKUP);
    await expect(page.getByTestId('mover-job-status')).toContainText(jm.state.AT_PICKUP);

    // Leaving needs a photo of the things — which ones is up to the mover.
    await expect(page.getByTestId('mover-job-photos-pickup')).toContainText(jm.photos.pickupText);
    await expect(page.getByTestId('mover-job-step')).toBeDisabled();
    await expect(page.getByTestId('mover-job-photos-gate')).toHaveText(jm.photos.needOne);
    await takePhoto(page);
    await expect.poll(() => calls.rowWrites.length).toBe(1);
    expect(calls.uploads).toHaveLength(1);
    expect(calls.uploads[0]!.path).toMatch(new RegExp(`^${JOB}/pickup/[a-z0-9]+\\.jpg$`));
    expect(calls.uploads[0]!.contentType).toBe('image/jpeg');
    // Only these three: Postgres sets who added it and when.
    expect(calls.rowWrites[0]).toEqual({ job_id: JOB, stage: 'pickup', path: calls.uploads[0]!.path });
    await expect(page.getByTestId('mover-job-step')).toBeEnabled();
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('mover-job-pickup.png');

    await step(page, jm.confirm.IN_TRANSIT);
    await expect(page.getByTestId('mover-job-status')).toContainText(jm.state.IN_TRANSIT);
    await expect(page.getByTestId('mover-job-next')).toContainText(jm.onBoardNote);
    await step(page, jm.confirm.AT_DROPOFF);
    await takePhoto(page);
    await expect.poll(() => calls.rowWrites.length).toBe(2);
    expect(calls.rowWrites[1]).toMatchObject({ job_id: JOB, stage: 'dropoff' });
    await step(page, jm.confirm.COMPLETED);
    await expect(page.getByTestId('mover-job-ended')).toContainText(jm.doneNote.replace('{{date}}', 'Thu 22 Oct').replace('{{time}}', '07:30'));
    await expect(page.getByTestId('mover-job-ended')).toContainText(jm.payoutLater);
    await expect(page.getByTestId('mover-job-cancel')).toHaveCount(0);
    expect(calls.steps).toEqual(STEPS.map((to) => ({ action: 'step', jobId: JOB, to })));
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('mover-job-done.png');
  });

  test('a double tap on Yes sends one step; with no answer it says so, and the same step goes again', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 22, 7, 30));
    const { state, calls } = await fakeMoverDay(page, new Date(2026, 9, 22, 7, 30), [moverRow('ACCEPTED')], { abort: ['step'] });
    await page.goto(`${url}mover/jobs/${JOB}`);
    await page.getByTestId('mover-job-step').click();
    await page.getByTestId('mover-job-confirm-yes').dblclick();
    await expect(page.getByTestId('mover-job-step-problem')).toHaveText(jm.errors.network);
    expect(calls.steps).toHaveLength(1);
    await step(page, jm.confirm.EN_ROUTE_TO_PICKUP);
    await expect(page.getByTestId('mover-job-status')).toContainText(jm.state.EN_ROUTE_TO_PICKUP);
    expect(calls.steps).toEqual([
      { action: 'step', jobId: JOB, to: 'EN_ROUTE_TO_PICKUP' },
      { action: 'step', jobId: JOB, to: 'EN_ROUTE_TO_PICKUP' },
    ]);
    expect(state.rows[0]!.status).toBe('EN_ROUTE_TO_PICKUP');
  });

  test('a photo whose row got no answer: only the row is sent again, the file once', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 22, 8, 5));
    const { calls } = await fakeMoverDay(page, new Date(2026, 9, 22, 8, 5), [moverRow('AT_PICKUP')], { abort: ['row'] });
    await page.goto(`${url}mover/jobs/${JOB}`);
    await takePhoto(page);
    await expect(page.getByTestId('mover-job-photos-gate')).toHaveText(jm.photos.fixFailed);
    await expect(page.getByTestId('mover-job-step')).toBeDisabled();
    await page.getByRole('button', { name: jm.photos.retry }).click();
    await expect(page.getByTestId('mover-job-step')).toBeEnabled();
    expect(calls.uploads).toHaveLength(1);
    expect(calls.rowWrites).toHaveLength(2);
    expect(calls.rowWrites[1]).toEqual(calls.rowWrites[0]);
  });

  test('a file that is not a photo every browser shows is refused before anything is sent', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 22, 8, 5));
    const { calls } = await fakeMoverDay(page, new Date(2026, 9, 22, 8, 5), [moverRow('AT_PICKUP')]);
    await page.goto(`${url}mover/jobs/${JOB}`);
    // Real picture bytes labelled HEIC: only the app's own check stops it (the browser could decode it).
    await takePhoto(page, { name: 'IMG_0001.HEIC', mimeType: 'image/heic', buffer: photoBytes });
    await expect(app(page).getByText(jm.photos.errors.file_type, { exact: true })).toBeVisible();
    expect(calls.uploads).toEqual([]);
    await takePhoto(page, { name: 'scan.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 stand-in') });
    await expect(app(page).getByText(jm.photos.errors.file_type, { exact: true })).toBeVisible();
    expect(calls.uploads).toEqual([]);
    expect(calls.rowWrites).toEqual([]);
  });

  test('a large photo is re-saved small before sending: a JPEG of at most 1600 px, as the owner chose', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 22, 8, 5));
    const { calls } = await fakeMoverDay(page, new Date(2026, 9, 22, 8, 5), [moverRow('AT_PICKUP')]);
    await page.goto(`${url}mover/jobs/${JOB}`);
    // A 2400 × 1800 PNG, drawn in the browser.
    const png = Buffer.from(
      await page.evaluate(() => {
        const canvas = document.createElement('canvas');
        canvas.width = 2400;
        canvas.height = 1800;
        const g = canvas.getContext('2d')!;
        g.fillStyle = '#b98a52';
        g.fillRect(0, 0, 2400, 1800);
        g.fillStyle = '#7a5530';
        g.fillRect(300, 400, 900, 700);
        return canvas.toDataURL('image/png').split(',')[1]!;
      }),
      'base64',
    );
    await takePhoto(page, { name: 'big.png', mimeType: 'image/png', buffer: png });
    await expect.poll(() => calls.uploads.length).toBe(1);
    const sent = calls.uploads[0]!.body;
    expect(sent.subarray(0, 2).toString('hex')).toBe('ffd8');
    expect(calls.uploads[0]!.path).toMatch(/\.jpg$/);
    // The size in the JPEG's frame header (SOF0/SOF2): the long side is 1600.
    let i = 2;
    let size: { width: number; height: number } | null = null;
    while (i < sent.length - 9 && !size) {
      const marker = sent[i + 1]!;
      const length = sent.readUInt16BE(i + 2);
      if (marker === 0xc0 || marker === 0xc2) size = { height: sent.readUInt16BE(i + 5), width: sent.readUInt16BE(i + 7) };
      i += 2 + length;
    }
    expect(size).toEqual({ width: 1600, height: 1200 });
  });

  test('an upload whose answer got lost: sent again, storage says it already has it, and it counts as sent', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 22, 8, 5));
    const { calls } = await fakeMoverDay(page, new Date(2026, 9, 22, 8, 5), [moverRow('AT_PICKUP')], {
      uploadAnswers: ['abort', { status: 400, body: { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' } }],
    });
    await page.goto(`${url}mover/jobs/${JOB}`);
    await takePhoto(page);
    await expect(page.getByTestId('mover-job-photos-gate')).toHaveText(jm.photos.fixFailed);
    await page.getByRole('button', { name: jm.photos.retry }).click();
    await expect(page.getByTestId('mover-job-step')).toBeEnabled();
    expect(calls.uploads).toHaveLength(2);
    expect(calls.uploads[1]!.path).toBe(calls.uploads[0]!.path);
    expect(calls.rowWrites).toHaveLength(1);
  });

  test('storage refuses a photo while the move is still at the stop: the limit, not "moved on"', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 22, 8, 5));
    const { calls } = await fakeMoverDay(page, new Date(2026, 9, 22, 8, 5), [moverRow('AT_PICKUP')], {
      uploadAnswers: [{ status: 400, body: { statusCode: '403', error: 'Unauthorized', message: 'new row violates row-level security policy' } }],
    });
    await page.goto(`${url}mover/jobs/${JOB}`);
    await takePhoto(page);
    await expect(page.getByTestId('mover-job-photos-pickup')).toContainText(jm.photos.errors.limit.replace('{{max}}', '20'));
    expect(calls.rowWrites).toEqual([]);
  });

  test('a photo the database refuses: "Not sent" with the reason; Remove takes it off the phone, nothing is deleted on the server', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 22, 8, 5));
    const { calls } = await fakeMoverDay(page, new Date(2026, 9, 22, 8, 5), [moverRow('AT_PICKUP')], {
      rowAnswers: [{ status: 500, body: { code: 'P0002', message: 'not_found' } }],
    });
    await page.goto(`${url}mover/jobs/${JOB}`);
    await takePhoto(page);
    const block = page.getByTestId('mover-job-photos-pickup');
    await expect(block).toContainText(jm.photos.notSent);
    await expect(block).toContainText(jm.photos.errors.refused);
    await expect(page.getByTestId('mover-job-photos-gate')).toHaveText(jm.photos.fixFailed);
    await page.getByRole('button', { name: jm.photos.remove }).click();
    await expect(block).not.toContainText(jm.photos.notSent);
    await expect(page.getByTestId('mover-job-photos-gate')).toHaveText(jm.photos.needOne);
    expect(calls.deletes).toEqual([]);
  });

  test('signing out with a photo not sent asks first', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 22, 8, 5));
    const { state } = await fakeMoverDay(page, new Date(2026, 9, 22, 8, 5), [moverRow('AT_PICKUP')]);
    await page.goto(`${url}mover/jobs/${JOB}`);
    state.offline = true;
    await takePhoto(page);
    await expect(page.getByTestId('mover-job-photos-gate')).toHaveText(jm.photos.fixFailed);
    await page.getByTestId('mover-job-back').click();
    await page.getByTestId('mover-sign-out').click();
    await expect(app(page).getByText(jm.signOutPending, { exact: true })).toBeVisible();
    await expect(page.getByTestId('mover-sign-out-anyway')).toBeVisible();
    await page.getByTestId('mover-sign-out-anyway').click();
    await expect(page.getByTestId('auth-email')).toBeVisible();
  });

  test('a step that gets no answer stops spinning after 15 seconds and can be sent again', async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 9, 22, 7, 30) });
    const { state, calls } = await fakeMoverDay(page, new Date(2026, 9, 22, 7, 30), [moverRow('ACCEPTED')]);
    await page.goto(`${url}mover/jobs/${JOB}`);
    state.hang = true;
    await step(page, jm.confirm.EN_ROUTE_TO_PICKUP);
    await page.clock.runFor(18_000);
    await expect(page.getByTestId('mover-job-step-problem')).toHaveText(jm.errors.network);
    state.hang = false;
    await step(page, jm.confirm.EN_ROUTE_TO_PICKUP);
    await expect(page.getByTestId('mover-job-status')).toContainText(jm.state.EN_ROUTE_TO_PICKUP);
    expect(calls.steps).toHaveLength(2);
  });

  test('"On my way" opens 6 hours before the arrival time — the button turns on by itself', async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 9, 22, 2, 0) });
    await fakeMoverDay(page, new Date(2026, 9, 22, 2, 0), [moverRow('ACCEPTED')]);
    await page.goto(`${url}mover/jobs/${JOB}`);
    await expect(page.getByTestId('mover-job-step')).toBeDisabled();
    await expect(page.getByTestId('mover-job-start-from')).toHaveText(jm.startsFrom.replace('{{date}}', 'Thu 22 Oct').replace('{{time}}', '03:00'));
    await page.clock.fastForward('01:01:00');
    await expect(page.getByTestId('mover-job-step')).toBeEnabled();
    await expect(page.getByTestId('mover-job-start-from')).toHaveCount(0);
  });

  test('no connection when arriving: the photos are taken anyway and follow "Arrived" once it gets through', async ({ page }) => {
    test.setTimeout(90_000);
    await page.clock.setFixedTime(new Date(2026, 9, 22, 8, 5));
    const { state, calls } = await fakeMoverDay(page, new Date(2026, 9, 22, 8, 5), [moverRow('EN_ROUTE_TO_PICKUP')]);
    await page.goto(`${url}mover/jobs/${JOB}`);
    state.offline = true;
    await step(page, jm.confirm.AT_PICKUP);
    await expect(page.getByTestId('mover-job-arrival-waiting')).toHaveText(jm.arrivalWaiting);
    await takePhoto(page);
    await expect(page.getByTestId('mover-job-photos-pickup')).toContainText(jm.photos.waiting);
    await expect(page.getByTestId('mover-job-step')).toBeDisabled();
    expect(calls.uploads).toEqual([]);
    // Back online: sent again by itself (every 15 seconds) — "Arrived" first, then the photo.
    state.offline = false;
    await expect.poll(() => calls.rowWrites.length, { timeout: 30_000 }).toBe(1);
    expect(state.rows[0]!.status).toBe('AT_PICKUP');
    await expect(page.getByTestId('mover-job-arrival-waiting')).toHaveCount(0);
    await expect(page.getByTestId('mover-job-step')).toBeEnabled();
  });

  test('cancelling at the pickup when nobody is there: free, a fixed reason; the addresses go (COMPLIANCE §2, §9.1)', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 22, 9, 20));
    const { calls } = await fakeMoverDay(page, new Date(2026, 9, 22, 9, 20), [moverRow('AT_PICKUP', { absent_reason_from: at(9, 15) })]);
    await page.goto(`${url}mover/jobs/${JOB}`);
    await page.getByTestId('mover-job-cancel').click();
    await expect(page.getByTestId('mover-job-cancel-card')).toContainText(jm.cancelConfirm);
    await page.getByTestId('mover-job-cancel-reason-customer_absent').click();
    await page.getByTestId('mover-job-cancel-yes').click();
    await expect(page.getByTestId('mover-job-ended')).toContainText(jm.cancelledByYou.replace('{{date}}', 'Thu 22 Oct').replace('{{time}}', '09:20'));
    await expect(page.getByTestId('mover-job-ended')).toContainText(jm.addressesHidden);
    expect(calls.steps).toEqual([{ action: 'mover_cancel', jobId: JOB, reason: 'customer_absent' }]);
    await page.getByTestId('mover-job-back').click();
    await expect(page.getByTestId(`recent-job-${JOB}`)).toContainText(jm.state.cancelledByYou);
    await expect(app(page).getByText('Rr. Agim Ramadani', { exact: false })).toHaveCount(0);
  });

  test('"Nobody is at the pickup" only after waiting 15 minutes there — it appears by itself; any other reason, or none, at once', async ({ page }) => {
    await page.clock.install({ time: new Date(2026, 9, 22, 9, 5) });
    await fakeMoverDay(page, new Date(2026, 9, 22, 9, 5), [moverRow('AT_PICKUP', { absent_reason_from: at(9, 15) })]);
    await page.goto(`${url}mover/jobs/${JOB}`);
    await page.getByTestId('mover-job-cancel').click();
    await expect(page.getByTestId('mover-job-cancel-reason-customer_absent')).toHaveCount(0);
    await expect(page.getByTestId('mover-job-cancel-card')).toContainText(jm.absentFrom.replace('{{time}}', '09:15'));
    // The mover's free way out before loading doesn't wait (COMPLIANCE §2).
    await expect(page.getByTestId('mover-job-cancel-reason-cannot_do')).toBeVisible();
    await expect(page.getByTestId('mover-job-cancel-yes')).toBeEnabled();
    await page.clock.fastForward('00:11:00');
    await expect(page.getByTestId('mover-job-cancel-reason-customer_absent')).toBeVisible();
    await expect(page.getByTestId('mover-job-cancel-card')).not.toContainText(jm.absentFrom.replace('{{time}}', '09:15'));
  });

  test('the home: a move under way first, then requests, jobs, and the last 7 days (areas only)', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 22, 7, 30));
    const id = (n: number) => `00000000-0000-4000-8000-0000000e5d0${n}`;
    await fakeMoverDay(page, new Date(2026, 9, 22, 7, 30), [
      moverRow('EN_ROUTE_TO_PICKUP', {}, id(2)),
      { ...moverRow('OFFERED', { offer_status: 'offered', pickup_label: null, pickup_street: null, pickup_house_number: null, pickup_details: null, pickup_lat: null, pickup_lon: null, dropoff_label: null, dropoff_details: null, dropoff_lat: null, dropoff_lon: null }, id(3)) },
      moverRow('ACCEPTED', { scheduled_at: at(9, 0, 24) }, id(4)),
      moverRow('COMPLETED', { ended_at: at(18, 0, 20) }, id(5)),
      moverRow('CANCELLED', { ended_at: at(12, 0, 21), cancelled_by: 'customer', cancellation_fee: 2500, fee_rule: 'late' }, id(6)),
    ]);
    await page.goto(url);
    const top = async (testId: string) => (await page.getByTestId(testId).boundingBox())!.y;
    await expect(page.getByTestId(`mover-now-${id(2)}`)).toContainText(jm.state.EN_ROUTE_TO_PICKUP);
    expect(await top('jobs-in-progress')).toBeLessThan(await top('job-requests'));
    expect(await top('job-requests')).toBeLessThan(await top('my-jobs'));
    expect(await top('my-jobs')).toBeLessThan(await top('recent-jobs'));
    await expect(page.getByTestId(`recent-job-${id(5)}`)).toContainText(jm.state.COMPLETED);
    await expect(page.getByTestId(`recent-job-${id(6)}`)).toContainText(jm.state.cancelledByCustomer);
    await expect(page.getByTestId(`recent-job-${id(6)}`)).toContainText(jm.feeShort.replace('{{amount}}', '€25'));
    await expect(page.getByTestId('recent-jobs')).not.toContainText('Rr. Agim Ramadani');
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('mover-home-job-day.png');
  });

  test('open in maps: the stop as the destination only; a stop the map knows by town says so', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 22, 7, 30));
    await fakeMoverDay(page, new Date(2026, 9, 22, 7, 30), [moverRow('EN_ROUTE_TO_PICKUP')]);
    await page.goto(`${url}mover/jobs/${JOB}`);
    await expect(page.getByTestId('mover-job-pickup-maps')).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=42.662900%2C21.165500&travelmode=driving');
    await expect(page.getByTestId('mover-job-pickup')).toContainText(en.mover.jobs.directions.replace('{{text}}', 'Ring twice'));
    await expect(page.getByTestId('mover-job-dropoff')).toContainText(jm.townOnly);
    await expect(page.getByTestId('mover-job-pickup')).not.toContainText(jm.townOnly);
  });

  test.describe('in Albanian', () => {
    test.use({ locale: 'sq-XK' });

    test('the job screen at the pickup', async ({ page }) => {
      await page.clock.setFixedTime(new Date(2026, 9, 22, 8, 5));
      await fakeMoverDay(page, new Date(2026, 9, 22, 8, 5), [moverRow('AT_PICKUP')]);
      await page.goto(`${url}mover/jobs/${JOB}`);
      await expect(page.getByTestId('mover-job-photos-pickup')).toContainText(resources.sq.job.mover.photos.pickupText);
      await fitScreenToPage(page);
      await expect(page).toHaveScreenshot('mover-job-sq.png');
    });
  });
});

/* ── The customer side ──────────────────────────────────────────────────── */

const event = (e: string, status: string, role: string, iso: string) => ({ event: e, status, actor_role: role, created_at: iso });
const ACCEPTED_LOG = [
  event('booked', 'BOOKED', 'customer', at(10, 0, 15)),
  event('offered', 'OFFERED', 'system', at(10, 0, 15)),
  event('accepted', 'ACCEPTED', 'mover', at(11, 0, 15)),
];
const MOVER = {
  companyId: '7e570000-0000-4000-8000-000000000002',
  name: 'Prizren Movers',
  isBusiness: true,
  registrationNo: '810000002',
  address: 'Rruga e Shkronjave 2, Prizren',
  country: 'XK',
  phone: '+383 44 000 902',
  email: 'test-prizren@example.com',
  insuranceUntil: '2027-12-31',
  cancellation: { freeHours: 24, latePct: 50 },
};

/** A customer's move as `jobs` (RLS) answers it, with its quote, offers, log and cancellation. */
function customerJob(status: string, changes: Record<string, unknown> = {}) {
  return {
    id: JOB,
    status,
    type: 'SMALL_MOVE',
    vehicle_class: 'VAN',
    helpers: 2,
    scheduled_at: new Date(2026, 9, 16, 9).toISOString(),
    pickup_area: 'Prishtina',
    pickup_district: null,
    pickup_country: 'XK',
    pickup_label: 'Rr. Agim Ramadani 12, Prishtina',
    pickup_street: 'Rr. Agim Ramadani',
    pickup_house_number: '12',
    pickup_details: 'Ring twice',
    pickup_floor: 2,
    pickup_has_lift: false,
    pickup_lat: 42.6629,
    pickup_lon: 21.1655,
    dropoff_area: 'Prizren',
    dropoff_district: null,
    dropoff_country: 'XK',
    dropoff_label: 'Prizren',
    dropoff_street: null,
    dropoff_house_number: null,
    // The map knew only the town: the customer said where (as booking requires).
    dropoff_details: 'Blue gate next to the school',
    dropoff_floor: 0,
    dropoff_has_lift: false,
    dropoff_lat: 42.2139,
    dropoff_lon: 20.7397,
    items: [{ key: 'box', qty: 10, assembly: false }],
    distance_km: 83.2,
    chosen_mover_company_id: MOVER.companyId,
    chosen_vehicle_id: '7e57a000-0000-4000-8000-000000000201',
    created_at: at(9, 50, 15),
    quotes: [
      {
        id: '00000000-0000-4000-8000-0000000c5d01',
        currency: 'EUR',
        line_items: [{ kind: 'base', amount: 5000 }],
        mover_price: 5000,
        booking_fee: null,
        total: 5000,
        cancel_free_hours: 24,
        cancel_late_pct: 50,
        expires_at: at(10, 5, 15),
        created_at: at(9, 50, 15),
        mover: MOVER,
      },
    ],
    job_offers: [{ status: 'accepted', expires_at: at(22, 0, 15), created_at: at(10, 0, 15) }],
    job_events: ACCEPTED_LOG,
    job_cancellations: null,
    ...changes,
  };
}

/** The customer's moves (`jobs`), their photos, and job-transition: records each step; `answers` replies in turn. */
async function fakeCustomerDay(page: Page, job: () => Record<string, unknown>, { photos = [] as Record<string, unknown>[], answers = [] as { status: number; body: unknown }[] } = {}) {
  const steps: Record<string, unknown>[] = [];
  await page.route('**/rest/v1/jobs*', (route) => (route.request().method() === 'OPTIONS' ? preflight(route) : json(route, [job()])));
  await page.route('**/rest/v1/job_photos*', (route) => (route.request().method() === 'OPTIONS' ? preflight(route) : json(route, photos)));
  await page.route('**/functions/v1/job-transition', (route) => {
    if (route.request().method() === 'OPTIONS') return preflight(route);
    steps.push(route.request().postDataJSON() as Record<string, unknown>);
    const answer = answers[Math.min(steps.length - 1, answers.length - 1)];
    return answer ? json(route, answer.body, answer.status) : json(route, { error: 'unavailable' }, 500);
  });
  await servePhotoLinks(page);
  return steps;
}

const photoRow = (n: number, stage: string, iso: string) => ({
  id: `00000000-0000-4000-8000-0000000a${String(n).padStart(4, '0')}`,
  job_id: JOB,
  stage,
  path: `${JOB}/${stage}/photo${n}abc.jpg`,
  taken_at: iso,
});

test.describe('the move day, customer side', () => {
  test.beforeEach(async ({ page }) => {
    await signInAs(page, 'customer');
  });

  test('at the pickup: the steps with their times, the photos of the things, calling the mover (COMPLIANCE §4, §7)', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 16, 9, 10));
    const log = [...ACCEPTED_LOG, event('en_route_to_pickup', 'EN_ROUTE_TO_PICKUP', 'mover', at(8, 20, 16)), event('at_pickup', 'AT_PICKUP', 'mover', at(8, 58, 16))];
    await fakeCustomerDay(page, () => customerJob('AT_PICKUP', { job_events: log }), { photos: [photoRow(1, 'pickup', at(9, 2, 16)), photoRow(2, 'pickup', at(9, 3, 16))] });
    await page.goto(`${url}moves/${JOB}`);
    await expect(page.getByTestId('move-state-note')).toHaveText(jc.atPickupNote.replace('{{name}}', MOVER.name).replace('{{time}}', '08:58'));
    await expect(page.getByTestId('move-step-ACCEPTED')).toHaveAttribute('aria-label', jc.stepDone.replace('{{step}}', jc.steps.ACCEPTED).replace('{{time}}', 'Thu 15 Oct, 11:00'));
    await expect(page.getByTestId('move-step-AT_PICKUP')).toHaveAttribute('aria-label', jc.stepDone.replace('{{step}}', jc.steps.AT_PICKUP).replace('{{time}}', '08:58'));
    await expect(page.getByTestId('move-step-IN_TRANSIT')).toHaveAttribute('aria-label', jc.stepNotYet.replace('{{step}}', jc.steps.IN_TRANSIT));
    await expect(page.getByTestId('move-photo-pickup-2')).toBeVisible();
    await page.getByTestId('move-photo-pickup-1').click();
    await expect(page.getByTestId('move-photo-viewer')).toBeVisible();
    await page.getByRole('button', { name: en.common.close }).click();
    await expect(page.getByTestId('move-photo-viewer')).toHaveCount(0);
    await expect(page.getByTestId('move-call')).toHaveAttribute('href', 'tel:+38344000902');
    // Whom the contract is with stays on the screen (COMPLIANCE §4).
    await expect(page.getByTestId('move-contract')).toBeVisible();
    await fitScreenToPage(page);
    await expect(page).toHaveScreenshot('customer-move-at-pickup.png');
  });

  test('cancelling late: the cost is shown first and sent as the most the customer agreed to (COMPLIANCE §8)', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 15, 10));
    let cancelled = false;
    const steps = await fakeCustomerDay(
      page,
      () =>
        cancelled
          ? customerJob('CANCELLED', {
              job_events: [...ACCEPTED_LOG, event('cancelled', 'CANCELLED', 'customer', at(10, 0, 15))],
              job_cancellations: { cancelled_by: 'customer', status_before: 'ACCEPTED', reason: null, free_until: at(9, 0, 15), cancel_late_pct: 50, currency: 'EUR', fee: 2500, fee_rule: 'late', created_at: at(10, 0, 15) },
            })
          : customerJob('ACCEPTED'),
      { answers: [{ status: 200, body: { status: 'CANCELLED', fee: 2500 } }] },
    );
    await page.goto(`${url}moves/${JOB}`);
    await expect(page.getByTestId('move-cancel-line')).toHaveText(jc.cancelCostsNow.replace('{{amount}}', '€25').replace('{{name}}', MOVER.name));
    await page.getByTestId('move-cancel').click();
    await expect(page.getByTestId('move-cancel-text')).toHaveText(
      jc.cancelConfirmFee.replaceAll('{{name}}', MOVER.name).replace('{{date}}', 'Thu 15 Oct').replace('{{time}}', '09:00').replace('{{amount}}', '€25'),
    );
    cancelled = true;
    await page.getByTestId('move-cancel-yes').click();
    await expect(page.getByTestId('move-state-note')).toHaveText(
      jc.cancelledByYouFee.replace('{{date}}', 'Thu 15 Oct').replace('{{time}}', '10:00').replace('{{name}}', MOVER.name).replace('{{amount}}', '€25'),
    );
    expect(steps).toEqual([{ action: 'cancel', jobId: JOB, maxFee: 2500 }]);
  });

  test('cancelling in the free time: free until …; if it costs something by then, nothing happens and the new cost is asked about', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 15, 8));
    const steps = await fakeCustomerDay(page, () => customerJob('ACCEPTED'), {
      answers: [
        { status: 409, body: { error: 'fee_changed', fee: 2500, currency: 'EUR', freeUntil: at(9, 0, 15) } },
        { status: 200, body: { status: 'CANCELLED', fee: 2500 } },
      ],
    });
    await page.goto(`${url}moves/${JOB}`);
    await expect(page.getByTestId('move-cancel-line')).toHaveText(jc.cancelFreeUntil.replace('{{date}}', 'Thu 15 Oct').replace('{{time}}', '09:00'));
    await page.getByTestId('move-cancel').click();
    await expect(page.getByTestId('move-cancel-yes')).toHaveText(jc.cancelYesFree);
    await page.getByTestId('move-cancel-yes').click();
    await expect(app(page).getByText(jc.feeChanged.replace('{{amount}}', '€25'), { exact: true })).toBeVisible();
    await expect(page.getByTestId('move-cancel-yes')).toHaveText(jc.cancelYesFee.replace('{{amount}}', '€25'));
    await page.getByTestId('move-cancel-yes').click();
    await expect.poll(() => steps.length).toBe(2);
    expect(steps).toEqual([
      { action: 'cancel', jobId: JOB },
      { action: 'cancel', jobId: JOB, maxFee: 2500 },
    ]);
  });

  test('loaded: no cancelling in the app — call the mover', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 16, 10));
    const log = [...ACCEPTED_LOG, event('en_route_to_pickup', 'EN_ROUTE_TO_PICKUP', 'mover', at(8, 20, 16)), event('at_pickup', 'AT_PICKUP', 'mover', at(8, 58, 16)), event('in_transit', 'IN_TRANSIT', 'mover', at(9, 40, 16))];
    await fakeCustomerDay(page, () => customerJob('IN_TRANSIT', { job_events: log }), { photos: [photoRow(1, 'pickup', at(9, 2, 16))] });
    await page.goto(`${url}moves/${JOB}`);
    await expect(page.getByTestId('move-cancel-line')).toHaveText(jc.onBoardNote.replace('{{name}}', MOVER.name));
    await expect(page.getByTestId('move-cancel')).toHaveCount(0);
    await expect(page.getByTestId('move-call')).toBeVisible();
  });

  test('cancelled by the mover: their reason, nothing to pay, and the same move with another mover', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 14, 12));
    await fakeCustomerDay(page, () =>
      customerJob('CANCELLED', {
        job_events: [...ACCEPTED_LOG, event('cancelled', 'CANCELLED', 'mover', at(12, 0, 14))],
        job_cancellations: { cancelled_by: 'mover', status_before: 'ACCEPTED', reason: 'cannot_do', free_until: at(9, 0, 15), cancel_late_pct: 50, currency: 'EUR', fee: 0, fee_rule: 'mover_cancelled', created_at: at(12, 0, 14) },
      }),
    );
    await page.goto(url);
    await expect(page.getByTestId(`move-${JOB}`)).toContainText(en.customer.moves.status.CANCELLED_BY_MOVER);
    await page.getByTestId(`move-${JOB}`).click();
    await expect(page.getByTestId('move-state-note')).toHaveText(
      `${jc.cancelledByMoverNote.replace('{{name}}', MOVER.name).replace('{{date}}', 'Wed 14 Oct').replace('{{time}}', '12:00')} ${jc.moverReason.cannot_do}`,
    );
    await expect(page.getByTestId('move-contract')).toBeVisible();
    await page.getByTestId('move-book-another').click();
    await expect(page.getByText(en.booking.movers.title)).toBeVisible();
    const draft = JSON.parse((await stored(page, 'movershub.booking'))!).draft as { choice: unknown; jobId: unknown; day: string };
    expect(draft).toMatchObject({ choice: null, jobId: null, day: '2026-10-16' });
    // The cancelled move's screen is gone: one booking screen, no second move screen behind it.
    await expect(page.getByTestId('move-state-note')).toHaveCount(0);
  });

  test('done: confirmed once; damage is reported to the mover and MoversHub (COMPLIANCE §7, §8)', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 16, 12));
    let confirmed = false;
    const done = [
      ...ACCEPTED_LOG,
      event('en_route_to_pickup', 'EN_ROUTE_TO_PICKUP', 'mover', at(8, 20, 16)),
      event('at_pickup', 'AT_PICKUP', 'mover', at(8, 58, 16)),
      event('in_transit', 'IN_TRANSIT', 'mover', at(9, 40, 16)),
      event('at_dropoff', 'AT_DROPOFF', 'mover', at(11, 0, 16)),
      event('completed', 'COMPLETED', 'mover', at(11, 30, 16)),
    ];
    const steps = await fakeCustomerDay(
      page,
      () => customerJob('COMPLETED', { job_events: confirmed ? [...done, event('confirmed', 'COMPLETED', 'customer', at(12, 0, 16))] : done }),
      { answers: [{ status: 200, body: { status: 'COMPLETED', confirmedAt: at(12, 0, 16) } }], photos: [photoRow(1, 'pickup', at(9, 2, 16)), photoRow(2, 'dropoff', at(11, 20, 16))] },
    );
    await page.goto(`${url}moves/${JOB}`);
    await expect(page.getByTestId('move-state-note')).toHaveText(jc.completedNote.replaceAll('{{name}}', MOVER.name).replace('{{date}}', 'Fri 16 Oct').replace('{{time}}', '11:30'));
    confirmed = true;
    await page.getByTestId('move-confirm').click();
    await expect(page.getByTestId('move-confirmed')).toHaveText(jc.confirmedNote.replace('{{date}}', 'Fri 16 Oct').replace('{{time}}', '12:00'));
    expect(steps).toEqual([{ action: 'confirm', jobId: JOB }]);
    await expect(page.getByTestId('move-photos-dropoff')).toBeVisible();
    await expect(page.getByTestId('move-problem')).toContainText(jc.problemNote.replace('{{name}}', MOVER.name));
    await page.getByTestId('move-contact').click();
    await expect(page).toHaveURL(/\/legal\/contact$/);
  });

  test('the mover cancels on the move day: nothing to pay, and another mover on another day', async ({ page }) => {
    await page.clock.setFixedTime(new Date(2026, 9, 16, 8));
    await fakeCustomerDay(page, () =>
      customerJob('CANCELLED', {
        job_events: [...ACCEPTED_LOG, event('cancelled', 'CANCELLED', 'mover', at(7, 50, 16))],
        job_cancellations: { cancelled_by: 'mover', status_before: 'ACCEPTED', reason: null, free_until: at(9, 0, 15), cancel_late_pct: 50, currency: 'EUR', fee: 0, fee_rule: 'mover_cancelled', created_at: at(7, 50, 16) },
      }),
    );
    await page.goto(`${url}moves/${JOB}`);
    await expect(page.getByTestId('move-state-note')).toHaveText(
      jc.cancelledByMoverToday.replace('{{name}}', MOVER.name).replace('{{date}}', 'Fri 16 Oct').replace('{{time}}', '07:50'),
    );
    await page.getByTestId('move-book-another').click();
    await expect(page.getByText(en.booking.when.title)).toBeVisible();
  });

  test('a step the mover takes while the move is open: read out, and the new photos shown (COMPLIANCE §7)', async ({ page }) => {
    test.setTimeout(90_000);
    await page.clock.setFixedTime(new Date(2026, 9, 16, 11, 25));
    const log = [
      ...ACCEPTED_LOG,
      event('en_route_to_pickup', 'EN_ROUTE_TO_PICKUP', 'mover', at(8, 20, 16)),
      event('at_pickup', 'AT_PICKUP', 'mover', at(8, 58, 16)),
      event('in_transit', 'IN_TRANSIT', 'mover', at(9, 40, 16)),
      event('at_dropoff', 'AT_DROPOFF', 'mover', at(11, 0, 16)),
    ];
    let done = false;
    const photos = [photoRow(1, 'pickup', at(9, 2, 16))];
    await fakeCustomerDay(page, () => (done ? customerJob('COMPLETED', { job_events: [...log, event('completed', 'COMPLETED', 'mover', at(11, 30, 16))] }) : customerJob('AT_DROPOFF', { job_events: log })), { photos });
    await page.goto(`${url}moves/${JOB}`);
    await expect(page.getByTestId('move-state-note')).toHaveText(jc.atDropoffNote.replace('{{name}}', MOVER.name).replace('{{time}}', '11:00'));
    await expect(page.getByTestId('move-photos-dropoff')).toHaveCount(0);
    // The drop-off photo and "Move done", just before the next refresh (every 30 seconds while under way).
    photos.push(photoRow(2, 'dropoff', at(11, 29, 16)));
    done = true;
    await expect(page.locator('#a11y-announcer')).toHaveText(en.customer.moves.status.COMPLETED, { timeout: 45_000 });
    await expect(page.getByTestId('move-photos-dropoff')).toBeVisible();
  });
});
