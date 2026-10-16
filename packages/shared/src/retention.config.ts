// Single source of truth for data retention (COMPLIANCE §9, §9.1). Read by the scheduled
// cleanup function. Data linked to an open dispute or claim is never deleted.

export type RetentionAnchor = 'job_completed' | 'expired' | 'account_closed' | 'created' | 'last_code_sent';

export interface RetentionRule {
  /** Retention period in days after `from`. `null` = not decided yet; cleanup skips it. */
  keepDays: number | null;
  from: RetentionAnchor;
  holdIfDisputeOpen: boolean;
}

export const RETENTION_CATEGORIES = [
  'job_photos',
  'location_breadcrumbs',
  'tracking_links',
  'price_adjustment_photos',
  'mover_documents',
  'audit_log',
  'payments',
  'dac7_quarterly_totals',
  'waitlist',
  'rate_limits',
  'unconfirmed_accounts',
  'auth_audit_log',
  'phone_verifications',
  'company_registry_checks',
  'booking_requests',
  'mover_reminders',
  'suspensions',
  'mover_appeals',
  'terms_acceptances',
] as const;
export type RetentionCategory = (typeof RETENTION_CATEGORIES)[number];

// COMPLIANCE-TODO: §14 — every `keepDays` must be confirmed by the lawyer before launch.
export const RETENTION: Record<RetentionCategory, RetentionRule> = {
  job_photos: { keepDays: null, from: 'job_completed', holdIfDisputeOpen: true },
  location_breadcrumbs: { keepDays: null, from: 'job_completed', holdIfDisputeOpen: true },
  tracking_links: { keepDays: null, from: 'expired', holdIfDisputeOpen: false },
  price_adjustment_photos: { keepDays: null, from: 'job_completed', holdIfDisputeOpen: true },
  mover_documents: { keepDays: null, from: 'account_closed', holdIfDisputeOpen: true },
  audit_log: { keepDays: null, from: 'created', holdIfDisputeOpen: true },
  // Tax / accounting records: kept for the legal minimum even after erasure requests.
  payments: { keepDays: null, from: 'created', holdIfDisputeOpen: true },
  dac7_quarterly_totals: { keepDays: null, from: 'created', holdIfDisputeOpen: false },
  // Launch-announcement emails: delete once the launch email for that market is sent.
  waitlist: { keepDays: null, from: 'created', holdIfDisputeOpen: false },
  // Request counters (public.rate_limits: SHA-256 of `scope:ip` for visitors and of
  // `scope:user:<id>` for signed-in app users): useless once their window is over.
  // public.hit_rate_limit() itself deletes them a day after their window started.
  rate_limits: { keepDays: 1, from: 'created', holdIfDisputeOpen: false },
  // Logins whose email code was never entered (an address typed by someone, maybe not its owner):
  // deleted with their profile and their audit-log rows 7 days after the last code was sent, by the
  // nightly public.delete_unconfirmed_accounts() (pg_cron; needs "Confirm email" on). Proposed
  // period, to be confirmed (see above).
  unconfirmed_accounts: { keepDays: 7, from: 'last_code_sent', holdIfDisputeOpen: false },
  // Supabase Auth's own audit log (auth.audit_log_entries: sign-ins, code requests, with the email).
  auth_audit_log: { keepDays: null, from: 'created', holdIfDisputeOpen: true },
  // Phone numbers a mover confirmed with a code (public.phone_verifications): needed while the
  // account exists (the company's contact phone); deleted with the account (on delete cascade).
  phone_verifications: { keepDays: null, from: 'account_closed', holdIfDisputeOpen: false },
  // Answers of the official company registers (public.company_registry_checks): evidence for the
  // mover's verification (COMPLIANCE §5); kept like the mover's documents.
  company_registry_checks: { keepDays: null, from: 'account_closed', holdIfDisputeOpen: true },
  // Booking requests never booked (public.jobs still QUOTED, with their quotes): the customer's
  // addresses for a move that didn't happen — delete some time after the last quote expired.
  booking_requests: { keepDays: null, from: 'expired', holdIfDisputeOpen: false },
  // Reminders before a mover's documents end (public.mover_reminders): useful until read and sent;
  // they go with the document or the account (on delete cascade).
  mover_reminders: { keepDays: null, from: 'created', holdIfDisputeOpen: false },
  // Decisions about a mover (public.suspensions) and their appeals and complaints (public.mover_appeals,
  // COMPLIANCE §3): the record of how each was handled. A company with a decision can't be deleted
  // by its owner (the account function refuses it) until these may go; complaints about anything
  // else go with the account.
  suspensions: { keepDays: null, from: 'account_closed', holdIfDisputeOpen: true },
  mover_appeals: { keepDays: null, from: 'account_closed', holdIfDisputeOpen: true },
  // Who accepted which version of the terms, and when (public.terms_acceptances; the published texts
  // themselves are kept in public.terms_versions): evidence of the contract. Today they go with the
  // account (on delete cascade) — the lawyer may want them kept longer.
  terms_acceptances: { keepDays: null, from: 'account_closed', holdIfDisputeOpen: true },
};
