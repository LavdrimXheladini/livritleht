// Single source of truth for data retention (COMPLIANCE §9, §9.1). Read by the scheduled
// cleanup function. Data linked to an open dispute or claim is never deleted.

/**
 * `job_ended`: the move's `completed` or `cancelled` event — for a move that never got either (a mover
 * who never marked "done"), its arrival time instead, plus the same period (design/DECISIONS.md #36).
 */
export type RetentionAnchor = 'job_completed' | 'job_ended' | 'expired' | 'account_closed' | 'created' | 'last_code_sent';

export interface RetentionRule {
  /** Retention period in days after `from`. `null` = not decided yet; cleanup skips it. */
  keepDays: number | null;
  from: RetentionAnchor;
  holdIfDisputeOpen: boolean;
}

export const RETENTION_CATEGORIES = [
  'job_photos',
  'job_photo_files_unused',
  'job_events',
  'job_cancellations',
  'move_day_contacts',
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
  // Photos of the things at the pickup and the drop-off (public.job_photos + the private bucket
  // `job-photos`; COMPLIANCE §7): evidence for damage claims. Proposed: about 13 months after the move
  // ended — claims about carried goods generally run a year — unless a claim is open.
  job_photos: { keepDays: null, from: 'job_ended', holdIfDisputeOpen: true },
  // Files in `job-photos` that no row points to (a photo whose row was never saved, then removed in the
  // app): to be removed through the Storage API by a cleanup that doesn't exist yet (deleting
  // storage.objects rows directly would leave the files behind). Proposed: a day after upload.
  job_photo_files_unused: { keepDays: null, from: 'created', holdIfDisputeOpen: false },
  // The move's log (public.job_events: booked, offered, answered, each step, cancelled, confirmed —
  // with who and when): evidence of what happened, kept like the photos.
  job_events: { keepDays: null, from: 'job_ended', holdIfDisputeOpen: true },
  // Cancellations after acceptance (public.job_cancellations) — the terms, the fee and the rule that
  // set it. Once card payments charge a fee, it is an accounting record (kept like `payments`).
  job_cancellations: { keepDays: null, from: 'created', holdIfDisputeOpen: true },
  // The phone for the move day and who to ask for (public.jobs.contact_phone, contact_name): the mover
  // stops seeing them when the move ends; the customer keeps them with the move. Proposed: cleared a
  // month after the move ended, unless a claim is open. The cleanup needs its own way past the frozen-move
  // trigger (it refuses a change from "On my way" on), like erase_jobs.
  move_day_contacts: { keepDays: null, from: 'job_ended', holdIfDisputeOpen: true },
  location_breadcrumbs: { keepDays: null, from: 'job_ended', holdIfDisputeOpen: true },
  tracking_links: { keepDays: null, from: 'expired', holdIfDisputeOpen: false },
  price_adjustment_photos: { keepDays: null, from: 'job_ended', holdIfDisputeOpen: true },
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
  // Booking requests never booked (public.jobs still QUOTED, with their quotes — never a move a mover
  // accepted): the customer's addresses for a move that didn't happen — delete some time after the last
  // quote expired.
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
