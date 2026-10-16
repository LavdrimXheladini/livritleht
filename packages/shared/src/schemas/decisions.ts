import { z } from 'zod';

// Decisions about a mover's account and their appeals (COMPLIANCE §3; design/DECISIONS.md #32). An
// admin suspends a mover or ends their account with written reasons; the mover reads them in the app
// at once and appeals there, or sends a complaint about anything else. A person at MoversHub answers
// each with reasons. Written by Postgres functions (admins) and by the mover (the appeal's text only).

export const SUSPENSION_KINDS = ['restriction', 'suspension', 'termination'] as const;
export type SuspensionKind = (typeof SUSPENSION_KINDS)[number];
export const APPEAL_SUBJECTS = ['restriction', 'suspension', 'termination', 'document_rejection', 'other'] as const;
export const APPEAL_STATUSES = ['open', 'under_review', 'upheld', 'rejected'] as const;
export type AppealStatus = (typeof APPEAL_STATUSES)[number];

/** An appeal's or a decision's written reasons: 10 to 4000 characters (the database checks the same). */
export const REASON_MIN = 10;
export const REASON_MAX = 4000;
/** How many appeals and complaints may wait for an answer at once (the database refuses a fourth). */
export const MAX_OPEN_APPEALS = 3;
/** A lifted decision stays on the mover's home this many days, with why it was lifted. */
export const LIFTED_SHOWN_DAYS = 7;

export const appealRowSchema = z.object({
  id: z.uuid(),
  suspension_id: z.uuid().nullable(),
  subject: z.enum(APPEAL_SUBJECTS),
  text: z.string(),
  status: z.enum(APPEAL_STATUSES),
  decision_reason: z.string().nullable(),
  created_at: z.string(),
  resolved_at: z.string().nullable(),
});
export type AppealRow = z.infer<typeof appealRowSchema>;
export const APPEAL_COLUMNS = Object.keys(appealRowSchema.shape).join(',');

/** A decision as its mover reads it (RLS: their own, once they were told), with their appeals. */
export const decisionRowSchema = z.object({
  id: z.uuid(),
  kind: z.enum(SUSPENSION_KINDS),
  reason_text: z.string(),
  is_serious_violation: z.boolean(),
  notice_sent_at: z.string(),
  effective_at: z.string().nullable(),
  lifted_at: z.string().nullable(),
  mover_appeals: appealRowSchema.array(),
});
export type DecisionRow = z.infer<typeof decisionRowSchema>;
export const DECISION_COLUMNS = `${Object.keys(decisionRowSchema.shape)
  .filter((k) => k !== 'mover_appeals')
  .join(',')},mover_appeals(${APPEAL_COLUMNS})`;

/** The text of an appeal or a complaint. */
export const appealFormSchema = z.object({
  text: z
    .string()
    .trim()
    .min(REASON_MIN, 'appeal_too_short')
    .max(REASON_MAX, 'appeal_too_long'),
});
export type AppealForm = z.infer<typeof appealFormSchema>;

/** Where a decision stands: coming (from a date), in force, or lifted. */
export type DecisionState = 'coming' | 'in_force' | 'lifted';
export function decisionState(decision: Pick<DecisionRow, 'effective_at' | 'lifted_at'>, now: Date = new Date()): DecisionState {
  if (decision.lifted_at !== null && new Date(decision.lifted_at) <= now) return 'lifted';
  if (decision.effective_at !== null && new Date(decision.effective_at) > now) return 'coming';
  return 'in_force';
}

/** The decision's appeals, newest first. */
export function appealsNewestFirst(decision: Pick<DecisionRow, 'mover_appeals'>): AppealRow[] {
  return [...decision.mover_appeals].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

/** An appeal waits for an answer (open or under review). */
export const appealWaiting = (appeal: Pick<AppealRow, 'status'>) => appeal.status === 'open' || appeal.status === 'under_review';

/** The mover may appeal: the decision still applies and no appeal of it waits for an answer. */
export function canAppeal(decision: DecisionRow, now: Date = new Date()): boolean {
  return decisionState(decision, now) !== 'lifted' && !decision.mover_appeals.some(appealWaiting);
}

/**
 * The decisions the mover's home shows: those that apply or are coming, and those lifted in the last
 * LIFTED_SHOWN_DAYS days. Ones that apply first, newest first.
 */
export function decisionsToShow(rows: readonly DecisionRow[], now: Date = new Date()): DecisionRow[] {
  const since = now.getTime() - LIFTED_SHOWN_DAYS * 86_400_000;
  const order: Record<DecisionState, number> = { in_force: 0, coming: 1, lifted: 2 };
  return rows
    .filter((d) => decisionState(d, now) !== 'lifted' || new Date(d.lifted_at ?? 0).getTime() >= since)
    .sort((a, b) => order[decisionState(a, now)] - order[decisionState(b, now)] || b.notice_sent_at.localeCompare(a.notice_sent_at));
}

/** A moment as the day on this device's calendar, written like the app's other dates: "16.10.2026". */
export function formatLocalDay(iso: string): string {
  const date = new Date(iso);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${two(date.getDate())}.${two(date.getMonth() + 1)}.${date.getFullYear()}`;
}
