// `job-transition` — every step of a job goes through here (CLAUDE.md §5; design/DECISIONS.md #35;
// COMPLIANCE §2, §9.1). It checks who is asking; Postgres checks the step itself, atomically, and logs it
// (public.job_book, job_answer_offer, job_cancel → job_events).
//   POST { action: 'book_test', jobId } → { status: 'OFFERED', offerId } — a customer books their saved
//     request with a test mover, without a card; real movers need the card (Stripe, next)
//   POST { action: 'accept' | 'decline', offerId } → { status: 'ACCEPTED' | 'QUOTED' } — the mover answers
//   POST { action: 'cancel', jobId } → { status: 'CANCELLED' } — the customer, before a mover accepted
//   401 sign_in_required · 400 invalid_request · 403 customers_only | movers_only · 404 not_found ·
//   409 the step isn't possible now (quote_expired, card_required, offer_expired, not_cancellable …) ·
//   429 rate_limited

import { JOB_TRANSITION_ERRORS, jobTransitionSchema, type JobTransitionError } from '../_shared/movershub/shared/index.ts';
import { caller, type Caller } from '../_shared/auth.ts';
import { failure, json, preflight } from '../_shared/http.ts';
import { rateLimited } from '../_shared/rate-limit.ts';
import { RpcError, serviceRows, serviceRpc } from '../_shared/service.ts';

const isKnown = (reason: string): reason is JobTransitionError => (JOB_TRANSITION_ERRORS as readonly string[]).includes(reason);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405, { Allow: 'POST, OPTIONS' });
  let who: Caller;
  try {
    who = await caller(req);
  } catch (e) {
    console.error('job-transition: sign-in check failed', failure(e));
    return json(req, { error: 'unavailable' }, 503);
  }
  if (who.kind !== 'user') return json(req, { error: 'sign_in_required' }, 401);
  const limited = await rateLimited(req, 'jobTransition', who);
  if (limited) return limited;
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'invalid_json' }, 400);
  }
  const parsed = jobTransitionSchema.safeParse(body);
  if (!parsed.success) return json(req, { error: 'invalid_request' }, 400);
  const step = parsed.data;

  try {
    // The side the person is on: customers book and cancel, movers answer offers.
    const [profile] = await serviceRows<{ role: string | null }>('GET', `profiles?id=eq.${who.userId}&select=role`);
    const asCustomer = step.action === 'book_test' || step.action === 'cancel';
    if (asCustomer && profile?.role !== 'customer') return json(req, { error: 'customers_only' }, 403);
    if (!asCustomer && profile?.role !== 'mover') return json(req, { error: 'movers_only' }, 403);

    switch (step.action) {
      case 'book_test': {
        const offerId = await serviceRpc<string>('job_book', { p_job_id: step.jobId, p_customer_id: who.userId, p_without_card: true });
        return json(req, { status: 'OFFERED', offerId });
      }
      case 'accept':
      case 'decline': {
        const status = await serviceRpc<string>('job_answer_offer', { p_offer_id: step.offerId, p_mover_id: who.userId, p_accept: step.action === 'accept' });
        return json(req, { status });
      }
      case 'cancel': {
        await serviceRpc<null>('job_cancel', { p_job_id: step.jobId, p_customer_id: who.userId });
        return json(req, { status: 'CANCELLED' });
      }
    }
  } catch (e) {
    if (e instanceof RpcError && isKnown(e.reason)) return json(req, { error: e.reason }, e.reason === 'not_found' ? 404 : 409);
    console.error(`job-transition ${step.action} failed`, failure(e));
    return json(req, { error: 'unavailable' }, 500);
  }
});
