import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { expect, test, type APIRequestContext } from '@playwright/test';

import { JOB_PHOTO_BUCKET, JOB_PHOTO_COLUMNS } from '@movershub/shared';

import { PASSWORD, accountUrl, cleanUp, key, moverWithVan, nothingMade, person, projectUrl, quoteUrl, savedRequest, secret, service, stepUrl, type Mover, type Person } from './live-jobs';

// API tests for the move day on the deployed project (design/DECISIONS.md #36; COMPLIANCE §2, §7, §8,
// §9, §9.1): the accepted mover's steps, photos as evidence (storage + job_photos under RLS), the
// customer's confirmation, cancelling after acceptance (the fee shown first, the mover free), who sees
// what, and the data export. Throwaway customers and test movers; removes everything afterwards.
test.skip(!quoteUrl || !key || !secret, 'set QUOTE_API_URL, QUOTE_API_KEY and SUPABASE_SECRET_KEY to test the deployed functions');

// What the test made: removed after it, also when it times out.
let made = nothingMade();
test.afterEach(async ({ request }) => {
  test.setTimeout(120_000);
  await cleanUp(request, made);
  made = nothingMade();
});

/** A small photo of boxes (web/e2e/fixtures). */
const JPEG = readFileSync(fileURLToPath(new URL('../../fixtures/job-photo.jpg', import.meta.url)));

type MoverRow = {
  job_id: string;
  status: string;
  pickup_label: string | null;
  ended_at: string | null;
  cancelled_by: string | null;
  cancellation_fee: number | null;
  fee_rule: string | null;
  contact_phone: string | null;
  contact_name: string | null;
};

test('the move day: steps, photos, confirming; cancelling after acceptance; the data export', async ({ request }) => {
  test.setTimeout(180_000);
  const step = (who: Person, data: object) => request.post(stepUrl, { headers: who.headers, data });
  const upload = (who: Person, path: string) =>
    request.post(`${projectUrl}/storage/v1/object/${JOB_PHOTO_BUCKET}/${path}`, { headers: { apikey: key, Authorization: `Bearer ${who.token}`, 'Content-Type': 'image/jpeg' }, data: JPEG });
  const addRow = (who: Person, jobId: string, stage: 'pickup' | 'dropoff', path: string) =>
    request.post(`${projectUrl}/rest/v1/job_photos?select=${JOB_PHOTO_COLUMNS}`, { headers: { ...who.headers, Prefer: 'return=representation' }, data: { job_id: jobId, stage, path } });
  const photo = async (who: Person, jobId: string, stage: 'pickup' | 'dropoff') => {
    const path = `${jobId}/${stage}/${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}.jpg`;
    const sent = await upload(who, path);
    expect(sent.ok(), await sent.text()).toBe(true);
    const row = await addRow(who, jobId, stage, path);
    expect(row.status(), await row.text()).toBe(201);
    return { path, row: ((await row.json()) as { id: string; taken_at: string }[])[0]! };
  };
  const myJobs = async (who: Person, includeEnded: boolean) =>
    (await (await request.post(`${projectUrl}/rest/v1/rpc/my_mover_jobs`, { headers: who.headers, data: includeEnded ? { p_include_ended: true } : {} })).json()) as MoverRow[];
  /** Booked with the test mover and accepted by them; the move in `inHours`. */
  const accepted = async (customer: Person, mover: Person, co: Mover, inHours: number) => {
    const jobId = await savedRequest(request, customer, co, inHours);
    const booked = await step(customer, { action: 'book_test', jobId, contactPhone: '+383 44 000 111' });
    expect(booked.status(), await booked.text()).toBe(200);
    const { offerId } = (await booked.json()) as { offerId: string };
    expect(await (await step(mover, { action: 'accept', offerId })).json()).toEqual({ status: 'ACCEPTED' });
    return jobId;
  };
  const refused = async (res: Awaited<ReturnType<APIRequestContext['post']>>) => {
    expect(res.ok()).toBe(false);
    return `${res.status()} ${await res.text()}`;
  };

  {
    const customer = await person(request, 'customer', made.customers);
    const stranger = await person(request, 'customer', made.customers);
    const m1 = await person(request, 'mover', made.movers);
    const m2 = await person(request, 'mover', made.movers);
    const co1 = await moverWithVan(request, m1, true, made);
    const co2 = await moverWithVan(request, m2, true, made);

    // The move in two hours: "On my way" is possible from 6 hours before.
    const jobId = await accepted(customer, m1, co1, 2);

    await test.step('the steps: one at a time, in order, only by the mover who accepted', async () => {
      const skipped = await step(m1, { action: 'step', jobId, to: 'AT_PICKUP' });
      expect(skipped.status()).toBe(409);
      expect(await skipped.json()).toEqual({ error: 'wrong_step', current: 'ACCEPTED' });
      // The phone for the move day changes until the mover is on the way (design/DECISIONS.md #37)…
      expect(await (await step(customer, { action: 'contact', jobId, contactPhone: '+38344000222', contactName: 'Arben' })).json()).toEqual({
        contactPhone: '+38344000222',
        contactName: 'Arben',
      });
      expect((await step(stranger, { action: 'contact', jobId, contactPhone: '+38344000333' })).status()).toBe(404);
      expect(await (await step(m1, { action: 'step', jobId, to: 'EN_ROUTE_TO_PICKUP' })).json()).toEqual({ status: 'EN_ROUTE_TO_PICKUP' });
      // …then stays as it is.
      const locked = await step(customer, { action: 'contact', jobId, contactPhone: '+38344000333' });
      expect(locked.status()).toBe(409);
      expect((await locked.json()).error).toBe('contact_locked');
      expect((await myJobs(m1, false)).find((r) => r.job_id === jobId)).toMatchObject({ contact_phone: '+38344000222', contact_name: 'Arben' });
      // A retry of the same step changes nothing.
      expect(await (await step(m1, { action: 'step', jobId, to: 'EN_ROUTE_TO_PICKUP' })).json()).toEqual({ status: 'EN_ROUTE_TO_PICKUP' });
      expect((await step(m2, { action: 'step', jobId, to: 'AT_PICKUP' })).status()).toBe(404);
      expect((await step(customer, { action: 'step', jobId, to: 'AT_PICKUP' })).status()).toBe(403);
      expect(await (await step(m1, { action: 'step', jobId, to: 'AT_PICKUP' })).json()).toEqual({ status: 'AT_PICKUP' });
      const noPhoto = await step(m1, { action: 'step', jobId, to: 'IN_TRANSIT' });
      expect(noPhoto.status()).toBe(409);
      expect((await noPhoto.json()).error).toBe('photos_required');
    });

    let pickupPath = '';
    await test.step('photos at the pickup: only the mover who accepted, only into this stop, kept as evidence (COMPLIANCE §7)', async () => {
      const name = `${jobId}/pickup/e2eother1.jpg`;
      expect(await refused(await upload(m2, name))).toMatch(/row-level security|Unauthorized|403/i);
      expect(await refused(await upload(customer, name))).toMatch(/row-level security|Unauthorized|403/i);
      expect(await refused(await upload(m1, `${jobId}/dropoff/e2eearly1.jpg`))).toMatch(/row-level security|Unauthorized|403/i);
      const before = Date.now();
      const { path, row } = await photo(m1, jobId, 'pickup');
      pickupPath = path;
      // A second file reaches storage, but its row is never sent (an answer lost at the stop).
      const orphan = await upload(m1, `${jobId}/pickup/e2eorphan1.jpg`);
      expect(orphan.ok(), await orphan.text()).toBe(true);
      expect(Math.abs(Date.parse(row.taken_at) - before)).toBeLessThan(60_000);
      // Who added it is kept by MoversHub (not shown to the customer).
      const [kept] = (await (await request.get(`${projectUrl}/rest/v1/job_photos?id=eq.${row.id}&select=uploaded_by,offer_id`, { headers: service() })).json()) as { uploaded_by: string }[];
      expect(kept!.uploaded_by).toBe(m1.id);
      expect((await request.get(`${projectUrl}/rest/v1/job_photos?id=eq.${row.id}&select=uploaded_by`, { headers: customer.headers })).status()).toBe(403);
      // A file is never replaced: the same name again is refused.
      expect(await refused(await upload(m1, path))).toMatch(/Duplicate|already exists|409/i);
      // The customer sees it and opens it; another customer sees nothing.
      const mine = (await (await request.get(`${projectUrl}/rest/v1/job_photos?job_id=eq.${jobId}&select=${JOB_PHOTO_COLUMNS}`, { headers: customer.headers })).json()) as unknown[];
      expect(mine).toHaveLength(1);
      const signed = await request.post(`${projectUrl}/storage/v1/object/sign/${JOB_PHOTO_BUCKET}/${path}`, { headers: customer.headers, data: { expiresIn: 60 } });
      expect(signed.ok(), await signed.text()).toBe(true);
      const file = await request.get(`${projectUrl}/storage/v1${((await signed.json()) as { signedURL: string }).signedURL}`);
      expect(file.status()).toBe(200);
      expect(await (await request.get(`${projectUrl}/rest/v1/job_photos?job_id=eq.${jobId}&select=id`, { headers: stranger.headers })).json()).toEqual([]);
      expect((await request.post(`${projectUrl}/storage/v1/object/sign/${JOB_PHOTO_BUCKET}/${path}`, { headers: stranger.headers, data: { expiresIn: 60 } })).ok()).toBe(false);
    });

    await test.step('the rest of the day: loaded, the drop-off with a photo, done, confirmed once', async () => {
      expect(await (await step(m1, { action: 'step', jobId, to: 'IN_TRANSIT' })).json()).toEqual({ status: 'IN_TRANSIT' });
      // The pickup is closed: no more photo files there, and no row for a file that did get there…
      expect(await refused(await upload(m1, `${jobId}/pickup/e2elate01.jpg`))).toMatch(/row-level security|Unauthorized|403/i);
      const late = await addRow(m1, jobId, 'pickup', `${jobId}/pickup/e2eorphan1.jpg`);
      expect(late.status()).toBe(400);
      expect(((await late.json()) as { message: string }).message).toBe('photo_stage_closed');
      // …while a row saved before, sent again (its answer lost), is the duplicate it is: the app counts it as saved.
      const again = await addRow(m1, jobId, 'pickup', pickupPath);
      expect(again.status()).toBe(409);
      expect(((await again.json()) as { code: string }).code).toBe('23505');
      expect(await (await step(m1, { action: 'step', jobId, to: 'AT_DROPOFF' })).json()).toEqual({ status: 'AT_DROPOFF' });
      expect((await (await step(m1, { action: 'step', jobId, to: 'COMPLETED' })).json()).error).toBe('photos_required');
      await photo(m1, jobId, 'dropoff');
      expect(await (await step(m1, { action: 'step', jobId, to: 'COMPLETED' })).json()).toEqual({ status: 'COMPLETED' });
      const first = (await (await step(customer, { action: 'confirm', jobId })).json()) as { status: string; confirmedAt: string };
      expect(first.status).toBe('COMPLETED');
      expect(await (await step(customer, { action: 'confirm', jobId })).json()).toEqual(first);
      expect((await step(m1, { action: 'confirm', jobId })).status()).toBe(403);
      // Done: the mover still sees the move for 7 days, with the place (for questions about it).
      const done = (await myJobs(m1, true)).find((r) => r.job_id === jobId);
      expect(done).toMatchObject({ status: 'COMPLETED', pickup_label: 'Rr. Agim Ramadani 12, Prishtina' });
      // …but not the phone for the move day: it was for the move only.
      expect(done).toMatchObject({ contact_phone: null, contact_name: null });
      expect(done!.ended_at).not.toBeNull();
      expect((await myJobs(m1, false)).some((r) => r.job_id === jobId)).toBe(false);
    });

    await test.step('"On my way" only from 6 hours before the arrival time', async () => {
      const later = await accepted(customer, m1, co1, 72);
      const early = await step(m1, { action: 'step', jobId: later, to: 'EN_ROUTE_TO_PICKUP' });
      expect(early.status()).toBe(409);
      const body = (await early.json()) as { error: string; from: string };
      expect(body.error).toBe('too_early');
      expect(Math.abs(Date.parse(body.from) - (Date.now() + 66 * 3_600_000))).toBeLessThan(5 * 60_000);
    });

    await test.step('the customer cancels late: the fee is shown first, never more than agreed, nothing charged', async () => {
      const late = await accepted(customer, m1, co1, 2);
      const unseen = await step(customer, { action: 'cancel', jobId: late });
      expect(unseen.status()).toBe(409);
      const changed = (await unseen.json()) as { error: string; fee: number; currency: string; freeUntil: string };
      expect(changed).toMatchObject({ error: 'fee_changed', fee: 2500, currency: 'EUR' });
      expect(Date.parse(changed.freeUntil)).toBeLessThan(Date.now());
      expect(await (await step(customer, { action: 'cancel', jobId: late, maxFee: 2500 })).json()).toEqual({ status: 'CANCELLED', fee: 2500 });
      const record = `${projectUrl}/rest/v1/job_cancellations?job_id=eq.${late}&select=cancelled_by,fee,fee_rule,currency`;
      const expected = [{ cancelled_by: 'customer', fee: 2500, fee_rule: 'late', currency: 'EUR' }];
      expect(await (await request.get(record, { headers: customer.headers })).json()).toEqual(expected);
      expect(await (await request.get(record, { headers: m1.headers })).json()).toEqual(expected);
      // Cancelled: the mover no longer sees the place.
      expect((await myJobs(m1, true)).find((r) => r.job_id === late)).toMatchObject({ pickup_label: null, cancelled_by: 'customer', cancellation_fee: 2500, fee_rule: 'late' });
    });

    await test.step('the mover cancels before loading: free, a fixed reason, nobody else is assigned', async () => {
      const dropped = await accepted(customer, m1, co1, 72);
      // "Nobody at the pickup" only at the pickup.
      expect((await (await step(m1, { action: 'mover_cancel', jobId: dropped, reason: 'customer_absent' })).json()).error).toBe('invalid_reason');
      expect(await (await step(m1, { action: 'mover_cancel', jobId: dropped, reason: 'cannot_do' })).json()).toEqual({ status: 'CANCELLED' });
      const [record] = (await (await request.get(`${projectUrl}/rest/v1/job_cancellations?job_id=eq.${dropped}&select=cancelled_by,fee,fee_rule,reason`, { headers: customer.headers })).json()) as object[];
      expect(record).toEqual({ cancelled_by: 'mover', fee: 0, fee_rule: 'mover_cancelled', reason: 'cannot_do' });
      expect((await (await step(customer, { action: 'cancel', jobId: dropped })).json()).error).toBe('not_cancellable');
      const offers = (await (await request.get(`${projectUrl}/rest/v1/job_offers?job_id=eq.${dropped}&select=status`, { headers: service() })).json()) as { status: string }[];
      expect(offers).toEqual([{ status: 'accepted' }]);
    });

    await test.step('the data export: the customer gets the photos (links) and cancellations; the mover their steps, never the photos', async () => {
      const exportFor = async (who: Person) => {
        const res = await request.post(accountUrl, { headers: { apikey: key, Authorization: `Bearer ${who.token}` }, data: { action: 'export' } });
        expect(res.ok(), await res.text()).toBe(true);
        return (await res.json()) as Record<string, unknown>;
      };
      const mine = await exportFor(customer);
      const moves = mine.moves as { id: string; contact_phone: string | null; job_photos: { downloadUrl: string | null }[]; job_cancellations: unknown }[];
      const day = moves.find((m) => m.id === jobId)!;
      expect(day.contact_phone).toBe('+38344000222');
      expect(day.job_photos).toHaveLength(2);
      expect((await request.get(day.job_photos[0]!.downloadUrl!)).status()).toBe(200);
      expect(moves.filter((m) => m.job_cancellations)).toHaveLength(2);
      const theirs = await exportFor(m1);
      expect((theirs.jobSteps as { event: string }[]).map((e) => e.event)).toEqual(expect.arrayContaining(['en_route_to_pickup', 'at_pickup', 'in_transit', 'at_dropoff', 'completed']));
      const added = theirs.photosAdded as Record<string, unknown>[];
      expect(added).toHaveLength(2);
      for (const p of added) expect(Object.keys(p).sort()).toEqual(['job_id', 'stage', 'taken_at']);
      expect(theirs.cancellations as unknown[]).toHaveLength(2);
      expect(JSON.stringify(theirs)).not.toContain('+38344000');
      // Moves that happened are records: neither account can be deleted yet (COMPLIANCE-TODO §14).
      for (const who of [customer, m1]) {
        const res = await request.post(accountUrl, { headers: { apikey: key, Authorization: `Bearer ${who.token}` }, data: { action: 'delete', password: PASSWORD } });
        expect(res.status()).toBe(409);
        expect((await res.json()).error).toBe('records_kept');
      }
    });
  }
});
