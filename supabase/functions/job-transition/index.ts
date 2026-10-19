// `job-transition` — every step of a job goes through here (CLAUDE.md §5; design/DECISIONS.md #35, #36;
// COMPLIANCE §2, §7, §9.1). It checks who is asking; Postgres checks the step itself, atomically, and logs
// it (public.job_book, job_answer_offer, job_cancel, job_step, job_mover_cancel, job_confirm → job_events).
//   POST { action: 'book_test', jobId, contactPhone, contactName? } → { status: 'OFFERED', offerId } — a
//     customer books their saved request with a test mover, without a card, with the phone for the move
//     day (design/DECISIONS.md #37); real movers need the card (Stripe, next)
//   POST { action: 'contact', jobId, contactPhone, contactName? } → { contactPhone, contactName } — the
//     customer changes the phone for the move day until the mover is on the way (409 contact_locked)
//   POST { action: 'accept' | 'decline', offerId } → { status: 'ACCEPTED' | 'QUOTED' } — the mover answers
//   POST { action: 'cancel', jobId, maxFee? } → { status: 'CANCELLED', fee } — the customer: free before a
//     mover accepted; after, until loaded, under the mover's terms, never above maxFee (the amount they
//     were shown; missing = 0) — else 409 { error: 'fee_changed', fee, currency, freeUntil }, nothing done
//   POST { action: 'step', jobId, to } → { status: to } — the accepted mover's next step on the move day;
//     the step the move is already at answers the same (a retry). 409 too_early { from } before "On my way"
//     may be marked, photos_required before leaving a stop without a photo, wrong_step { current }
//   POST { action: 'mover_cancel', jobId, reason? } → { status: 'CANCELLED' } — the accepted mover, before
//     loading, for free; nobody else is assigned (409 reason_too_early { from } for "nobody at the pickup")
//   POST { action: 'confirm', jobId } → { status: 'COMPLETED', confirmedAt } — the customer: the move is done
//   401 sign_in_required · 400 invalid_request · 403 customers_only | movers_only · 404 not_found ·
//   409 the step isn't possible now (quote_expired, card_required, offer_expired, not_eligible,
//   not_cancellable, wrong_step, too_early, photos_required, fee_changed …) · 429 rate_limited
// STRIPE (build step 8): `step` to COMPLETED charges the booked quote off-session (total + approved
// adjustments, application_fee_amount = commission + booking fee, to the mover's account); `cancel` with
// a fee charges it to the mover's account once CANCELLATION_FEES_CHARGED; `confirm` releases the payout.
// Never for test movers. Photos don't pass through here: the app adds them to storage and job_photos.

import {
  JOB_STATUSES,
  JOB_TRANSITION_ERRORS,
  isCustomerAction,
  jobTransitionSchema,
  type JobTransitionError,
} from '../_shared/movershub/shared/index.ts';
import { caller, type Caller } from '../_shared/auth.ts';
import { failure, json, preflight } from '../_shared/http.ts';
import { rateLimited } from '../_shared/rate-limit.ts';
import { RpcError, serviceRows, serviceRpc } from '../_shared/service.ts';

const isKnown = (reason: string): reason is JobTransitionError => (JOB_TRANSITION_ERRORS as readonly string[]).includes(reason);

/** What Postgres adds to a refusal (its DETAIL): the fee now, from when a step is possible, where the move is. */
function refusalDetails(e: RpcError): Record<string, unknown> {
  if (e.reason === 'wrong_step') return (JOB_STATUSES as readonly string[]).includes(e.details) ? { current: e.details } : {};
  if (e.reason !== 'fee_changed' && e.reason !== 'too_early' && e.reason !== 'reason_too_early') return {};
  try {
    const detail = JSON.parse(e.details) as Record<string, unknown>;
    return Object.fromEntries(['fee', 'currency', 'freeUntil', 'from'].filter((k) => k in detail).map((k) => [k, detail[k]]));
  } catch {
    return {};
  }
}

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
    // The side the person is on: customers book, cancel and confirm; movers answer offers and take the steps.
    const [profile] = await serviceRows<{ role: string | null }>('GET', `profiles?id=eq.${who.userId}&select=role`);
    const asCustomer = isCustomerAction(step.action);
    if (asCustomer && profile?.role !== 'customer') return json(req, { error: 'customers_only' }, 403);
    if (!asCustomer && profile?.role !== 'mover') return json(req, { error: 'movers_only' }, 403);

    switch (step.action) {
      case 'book_test': {
        const offerId = await serviceRpc<string>('job_book', {
          p_job_id: step.jobId,
          p_customer_id: who.userId,
          p_without_card: true,
          p_contact_phone: step.contactPhone,
          p_contact_name: step.contactName || null,
        });
        return json(req, { status: 'OFFERED', offerId });
      }
      case 'contact': {
        const contactName = step.contactName || null;
        await serviceRpc<null>('job_set_contact', { p_job_id: step.jobId, p_customer_id: who.userId, p_phone: step.contactPhone, p_name: contactName });
        return json(req, { contactPhone: step.contactPhone, contactName });
      }
      case 'accept':
      case 'decline': {
        const status = await serviceRpc<string>('job_answer_offer', { p_offer_id: step.offerId, p_mover_id: who.userId, p_accept: step.action === 'accept' });
        return json(req, { status });
      }
      case 'cancel': {
        const fee = await serviceRpc<number>('job_cancel', { p_job_id: step.jobId, p_customer_id: who.userId, p_max_fee: step.maxFee ?? 0 });
        return json(req, { status: 'CANCELLED', fee });
      }
      case 'step': {
        const status = await serviceRpc<string>('job_step', { p_job_id: step.jobId, p_mover_id: who.userId, p_to: step.to });
        return json(req, { status });
      }
      case 'mover_cancel': {
        await serviceRpc<string>('job_mover_cancel', { p_job_id: step.jobId, p_mover_id: who.userId, p_reason: step.reason ?? null });
        return json(req, { status: 'CANCELLED' });
      }
      case 'confirm': {
        const confirmedAt = await serviceRpc<string>('job_confirm', { p_job_id: step.jobId, p_customer_id: who.userId });
        return json(req, { status: 'COMPLETED', confirmedAt });
      }
    }
  } catch (e) {
    if (e instanceof RpcError && isKnown(e.reason)) {
      return json(req, { error: e.reason, ...refusalDetails(e) }, e.reason === 'not_found' ? 404 : 409);
    }
    console.error(`job-transition ${step.action} failed`, failure(e));
    return json(req, { error: 'unavailable' }, 500);
  }
});
