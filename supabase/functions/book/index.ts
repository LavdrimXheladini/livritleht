// `book` — the customer's booking request (design/DECISIONS.md #26): their move and the van of the
// mover they chose, priced AGAIN here from that mover's own card (COMPLIANCE §1.1, §13 — the client
// never sends a price) and saved as a job (status QUOTED) with its quote, valid 15 minutes.
//   POST BookRequest (packages/shared: stops, items, helpers, scheduledAt, vehicleClass, vehicleId, jobId?)
//   → BookResponse { jobId, distanceKm, quote, mover }   (the mover's details, COMPLIANCE §4)
//   401 sign_in_required · 403 customers_only · 400 invalid_request | invalid_date
//   409 mover_unavailable (the van is no longer offered for this move) · 429 rate_limited
// `jobId`: the request saved earlier for this move — updated (still QUOTED, the customer's own)
// instead of saved again. Nothing goes to movers: the job is BOOKED with the saved card (Stripe,
// later), then offered. Run `pnpm functions:build` before serving or deploying.

import { jobColumns, moverFactsFromRow, priceBooking, quoteColumns } from '../_shared/movershub/pricing/index.ts';
import { BOOKING_FEE_RULE, BOOKING_QUOTE_MINUTES, type BookResponse } from '../_shared/movershub/shared/index.ts';
import { caller, type Caller } from '../_shared/auth.ts';
import { failure, json, preflight } from '../_shared/http.ts';
import { quotableVehicles, routeKm } from '../_shared/quote-data.ts';
import { rateLimited } from '../_shared/rate-limit.ts';
import { serviceRows } from '../_shared/service.ts';

type CompanyRow = {
  legal_name: string;
  is_business: boolean;
  registration_no: string | null;
  address: string | null;
  country: string;
  contact_phone: string | null;
  contact_email: string | null;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return preflight(req);
  if (req.method !== 'POST') return json(req, { error: 'method_not_allowed' }, 405, { Allow: 'POST, OPTIONS' });
  let who: Caller;
  try {
    who = await caller(req);
  } catch (e) {
    console.error('book: sign-in check failed', failure(e));
    return json(req, { error: 'unavailable' }, 503);
  }
  if (who.kind !== 'user') return json(req, { error: 'sign_in_required' }, 401);
  const limited = await rateLimited(req, 'book', who);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return json(req, { error: 'invalid_json' }, 400);
  }

  try {
    // The customer side books (admins use it too); a mover's or a new account's side doesn't.
    const [profile] = await serviceRows<{ role: string | null }>('GET', `profiles?id=eq.${who.userId}&select=role`);
    if (profile?.role !== 'customer' && profile?.role !== 'admin') return json(req, { error: 'customers_only' }, 403);

    const priced = await priceBooking(body, { routeKm, quotableVehicles, bookingFee: BOOKING_FEE_RULE, now: new Date() });
    if (!priced.ok) {
      return priced.error === 'mover_unavailable'
        ? json(req, { error: priced.error }, 409)
        : json(req, { error: priced.error, ...('issues' in priced ? { issues: priced.issues } : {}) }, 400);
    }
    const { booking } = priced;
    const cancellation = moverFactsFromRow(booking.row).cancellation;
    if (!cancellation) return json(req, { error: 'mover_unavailable' }, 409); // priceBooking already checked

    // The request saved earlier for this move — only the customer's own, and only while not booked.
    const columns = jobColumns(booking, who.userId);
    const updated = booking.request.jobId
      ? await serviceRows<{ id: string }>('PATCH', `jobs?id=eq.${booking.request.jobId}&customer_id=eq.${who.userId}&status=eq.QUOTED&select=id`, columns)
      : [];
    const [job] = updated.length ? updated : await serviceRows<{ id: string }>('POST', 'jobs?select=id', columns);
    if (!job) throw new Error('jobs: no row returned');

    const expiresAt = new Date(Date.now() + BOOKING_QUOTE_MINUTES * 60_000);
    const [quote] = await serviceRows<{ id: string; expires_at: string }>('POST', 'quotes?select=id,expires_at', quoteColumns(booking, job.id, expiresAt));
    if (!quote) throw new Error('quotes: no row returned');

    const [company] = await serviceRows<CompanyRow>(
      'GET',
      `mover_companies?id=eq.${booking.row.company_id}&select=legal_name,is_business,registration_no,address,country,contact_phone,contact_email`,
    );
    if (!company) throw new Error('mover_companies: no row');

    const q = booking.quote;
    const answer: BookResponse = {
      jobId: job.id,
      distanceKm: booking.distanceKm,
      quote: {
        id: quote.id,
        expiresAt: quote.expires_at,
        currency: q.currency,
        lines: q.lines,
        estLaborMin: q.estLaborMin,
        moverPrice: q.moverPrice,
        bookingFee: q.bookingFee,
        total: q.total,
      },
      mover: {
        companyId: booking.row.company_id,
        name: company.legal_name,
        isBusiness: company.is_business,
        registrationNo: company.is_business ? company.registration_no : null,
        address: company.address,
        country: company.country,
        phone: company.contact_phone,
        email: company.contact_email,
        insuranceUntil: booking.row.insurance_until,
        cancellation,
      },
    };
    return json(req, answer);
  } catch (e) {
    console.error('book failed', failure(e));
    return json(req, { error: 'book_failed' }, 500);
  }
});
