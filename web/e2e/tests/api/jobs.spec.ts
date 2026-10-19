import { expect, test } from '@playwright/test';

import { cleanUp, key, moverWithVan, nothingMade, person, projectUrl, quoteUrl, savedRequest, secret, service, stepUrl, type Person } from './live-jobs';

// API tests for the deployed `job-transition` function and the mover's view of their requests
// (design/DECISIONS.md #35; COMPLIANCE §2, §9.1). Live, against the cloud project: a throwaway
// customer, a test mover and a real mover, each with a van, and saved requests written by the platform.
// Needs QUOTE_API_URL, QUOTE_API_KEY and SUPABASE_SECRET_KEY; removes everything afterwards.
test.skip(!quoteUrl || !key || !secret, 'set QUOTE_API_URL, QUOTE_API_KEY and SUPABASE_SECRET_KEY to test the deployed functions');

// What the test made: removed after it, also when it times out.
let made = nothingMade();
test.afterEach(async ({ request }) => {
  await cleanUp(request, made);
  made = nothingMade();
});

test('book (test movers only), the mover sees the area, accepts and then sees the address; declining, cancelling', async ({ request }) => {
  test.setTimeout(120_000);
  {
    const customer = await person(request, 'customer', made.customers);
    const testMover = await person(request, 'mover', made.movers);
    const realMover = await person(request, 'mover', made.movers);
    const testCo = await moverWithVan(request, testMover, true, made);
    const realCo = await moverWithVan(request, realMover, false, made);
    const step = (who: Person, data: object) => request.post(stepUrl, { headers: who.headers, data });
    // The phone for the move day, given with every booking (design/DECISIONS.md #37).
    const phone = { contactPhone: '+38344000111', contactName: 'Arben' };
    const myJobs = async (who: Person) =>
      (await (await request.post(`${projectUrl}/rest/v1/rpc/my_mover_jobs`, { headers: who.headers, data: {} })).json()) as {
        offer_id: string;
        pickup_area: string;
        pickup_label: string | null;
        pickup_details: string | null;
        contact_phone: string | null;
        contact_name: string | null;
      }[];

    // A real mover is booked with a card (Stripe, next) — never as a test.
    const withReal = await savedRequest(request, customer, realCo);
    const refused = await step(customer, { action: 'book_test', jobId: withReal, ...phone });
    expect(refused.status()).toBe(409);
    expect((await refused.json()).error).toBe('card_required');
    // Movers don't book; nobody books someone else's request.
    expect((await step(testMover, { action: 'book_test', jobId: withReal, ...phone })).status()).toBe(403);

    // A test mover: booked — never without a phone for the move day — and sent to that mover only.
    const withTest = await savedRequest(request, customer, testCo);
    const noPhone = await step(customer, { action: 'book_test', jobId: withTest });
    expect(noPhone.status()).toBe(400);
    expect((await noPhone.json()).error).toBe('invalid_request');
    const booked = await step(customer, { action: 'book_test', jobId: withTest, ...phone });
    expect(booked.status(), await booked.text()).toBe(200);
    const { offerId } = (await booked.json()) as { offerId: string };
    expect(await myJobs(realMover)).toEqual([]);
    const [offered] = await myJobs(testMover);
    expect(offered).toMatchObject({ offer_id: offerId, pickup_area: 'Prishtina', pickup_label: null, pickup_details: null, contact_phone: null, contact_name: null });

    // Only the mover it went to answers; accepted, the exact place.
    expect((await step(realMover, { action: 'accept', offerId })).status()).toBe(404);
    const accepted = await step(testMover, { action: 'accept', offerId });
    expect(await accepted.json()).toEqual({ status: 'ACCEPTED' });
    const [mine] = await myJobs(testMover);
    expect(mine).toMatchObject({ pickup_label: 'Rr. Agim Ramadani 12, Prishtina', pickup_details: 'Ring twice', contact_phone: '+38344000111', contact_name: 'Arben' });
    // Once accepted, cancelling follows the mover's terms: in the free time (until 48 hours before) it
    // costs nothing — an app that sends no amount agrees to nothing more (design/DECISIONS.md #36).
    expect(await (await step(customer, { action: 'cancel', jobId: withTest })).json()).toEqual({ status: 'CANCELLED', fee: 0 });

    // Accepting checks the mover again for the move day (COMPLIANCE §5): insurance nobody has
    // checked any more → not accepted, and the request stays open.
    const checked = await savedRequest(request, customer, testCo);
    const third = (await (await step(customer, { action: 'book_test', jobId: checked, ...phone })).json()) as { offerId: string };
    const insurance = `${projectUrl}/rest/v1/mover_documents?id=eq.${testCo.insuranceId}`;
    expect((await request.patch(insurance, { headers: service(), data: { verified_at: null } })).ok()).toBe(true);
    const notEligible = await step(testMover, { action: 'accept', offerId: third.offerId });
    expect(notEligible.status()).toBe(409);
    expect((await notEligible.json()).error).toBe('not_eligible');
    expect((await request.patch(insurance, { headers: service(), data: { verified_at: new Date().toISOString() } })).ok()).toBe(true);
    expect(await (await step(testMover, { action: 'decline', offerId: third.offerId })).json()).toEqual({ status: 'QUOTED' });

    // Declined: back to the customer, who cancels it for free.
    const another = await savedRequest(request, customer, testCo);
    const second = (await (await step(customer, { action: 'book_test', jobId: another, ...phone })).json()) as { offerId: string };
    expect(await (await step(testMover, { action: 'decline', offerId: second.offerId })).json()).toEqual({ status: 'QUOTED' });
    expect(await (await step(customer, { action: 'cancel', jobId: another })).json()).toEqual({ status: 'CANCELLED', fee: 0 });
    const events = (await (await request.get(`${projectUrl}/rest/v1/job_events?job_id=eq.${another}&select=event&order=id`, { headers: customer.headers })).json()) as { event: string }[];
    expect(events.map((e) => e.event)).toEqual(['booked', 'offered', 'declined', 'cancelled']);
  }
});
