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
};
