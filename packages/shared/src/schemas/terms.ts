import { z } from 'zod';

import { LEGAL_DOCS, legalTextSchema, type LegalDocId } from '../legal';

// Versions of the terms, and accepting them (COMPLIANCE §3, §8; P2B Art. 3; design/DECISIONS.md #34).
// An admin publishes the text in the app's code as a numbered version for customers or for movers
// (public.admin_publish_terms); once a version applies, people accept it before they book or are
// shown to customers (public.accept_terms). With nothing published there is nothing to accept.

export const TERMS_AUDIENCES = ['customer', 'mover'] as const;
export type TermsAudience = (typeof TERMS_AUDIENCES)[number];

/** Each audience's terms page. */
export const TERMS_DOC: Record<TermsAudience, LegalDocId> = { customer: 'terms', mover: 'mover-terms' };

/** New terms for movers apply at least this many days after they are published (P2B Art. 3). */
export const MOVER_TERMS_NOTICE_DAYS = 15;

/** A published version, without its text (RLS: published and not withdrawn, for everyone). */
export const termsVersionRowSchema = z.object({
  id: z.uuid(),
  audience: z.enum(TERMS_AUDIENCES),
  version: z.number().int().positive(),
  summary: z.string().nullable(),
  published_at: z.string(),
  effective_at: z.string(),
});
export type TermsVersionRow = z.infer<typeof termsVersionRowSchema>;
export const TERMS_VERSION_COLUMNS = Object.keys(termsVersionRowSchema.shape).join(',');

/** What a published version holds: the text as it was in the app's code when it was published. */
export const publishedTermsSchema = z.object({
  doc: z.enum(LEGAL_DOCS),
  locale: z.string(),
  updated: z.string(),
  text: legalTextSchema,
});
export type PublishedTerms = z.infer<typeof publishedTermsSchema>;

export type TermsStatus = {
  /** The version in effect now (null before the first). */
  current: TermsVersionRow | null;
  /** The version in effect, if it isn't accepted yet: the app asks for it before anything else. */
  mustAccept: TermsVersionRow | null;
  /** A version published to apply later, if it isn't accepted yet: shown as a notice. */
  upcoming: TermsVersionRow | null;
  /** Nothing accepted yet for this side ("Before you start" rather than "New terms"). */
  firstTime: boolean;
};

/** Where someone stands with one side's terms, from its published versions and their acceptances. */
export function termsStatus(versions: readonly TermsVersionRow[], acceptedIds: readonly string[], now: Date = new Date()): TermsStatus {
  const accepted = new Set(acceptedIds);
  const at = now.getTime();
  const byStart = [...versions].sort((a, b) => Date.parse(a.effective_at) - Date.parse(b.effective_at) || a.version - b.version);
  const current = byStart.filter((v) => Date.parse(v.effective_at) <= at).at(-1) ?? null;
  const next = byStart.find((v) => Date.parse(v.effective_at) > at) ?? null;
  return {
    current,
    mustAccept: current && !accepted.has(current.id) ? current : null,
    upcoming: next && !accepted.has(next.id) ? next : null,
    firstTime: !versions.some((v) => accepted.has(v.id)),
  };
}

/**
 * The first day (YYYY-MM-DD, UTC) a new version may apply from: today — for movers, once there is an
 * earlier version, 16 days on (the 15 days' notice counted from publishing, whatever the hour).
 */
export function earliestTermsStart(audience: TermsAudience, hasEarlier: boolean, now: Date = new Date()): string {
  const days = audience === 'mover' && hasEarlier ? MOVER_TERMS_NOTICE_DAYS + 1 : 0;
  return new Date(now.getTime() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Two JSON values hold the same data (object keys in any order) — e.g. a published text and the app's. */
export function sameJson(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => sameJson((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}
