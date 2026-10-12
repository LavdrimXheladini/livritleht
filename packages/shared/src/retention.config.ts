// Single source of truth for data retention (COMPLIANCE §9, §9.1). Read by the scheduled
// cleanup function. Data linked to an open dispute or claim is never deleted.

export type RetentionAnchor = 'job_completed' | 'expired' | 'account_closed' | 'created';

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
  // Per-IP request counters (public.rate_limits, hashed addresses): useless once their window is
  // over. public.hit_rate_limit() itself deletes them a day after their window started.
  rate_limits: { keepDays: 1, from: 'created', holdIfDisputeOpen: false },
};
