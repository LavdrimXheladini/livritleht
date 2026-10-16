'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { LEGAL_UPDATED, isLocale, legalDocument } from '@movershub/i18n';
import { TERMS_AUDIENCES, TERMS_DOC } from '@movershub/shared';

import { createClient } from '@/lib/supabase/server';

/** What a decision came to: done, or Postgres's reason (e.g. company_incomplete with what is missing). */
export type ReviewResult = { ok: true } | { ok: false; error: string; missing?: string[] };

const inputSchema = z.object({
  lang: z.string().refine(isLocale),
  kind: z.enum(['company', 'document', 'vehicle']),
  id: z.uuid(),
  companyId: z.uuid(),
  verified: z.enum(['true', 'false']).transform((v) => v === 'true'),
  note: z.string().max(1000).default(''),
});

const FUNCTIONS = {
  company: ['admin_review_company', 'p_company_id'],
  document: ['admin_review_document', 'p_document_id'],
  vehicle: ['admin_review_vehicle', 'p_vehicle_id'],
} as const;

/**
 * An admin's decision on a company, a document or a van. Runs with the admin's own session: Postgres
 * checks they are an admin, that the thing waits for a check, that a company is complete, and logs it.
 */
export async function review(_previous: ReviewResult | null, formData: FormData): Promise<ReviewResult> {
  const parsed = inputSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'invalid_request' };
  const { lang, kind, id, companyId, verified, note } = parsed.data;
  const [fn, idParam] = FUNCTIONS[kind];
  const supabase = await createClient();
  const { error } = await supabase.rpc(fn, { [idParam]: id, p_verified: verified, p_note: note });
  if (error) {
    const known = ['admins_only', 'not_found', 'not_waiting_for_check', 'company_incomplete', 'review_note_required', 'document_expired'];
    return {
      ok: false,
      error: known.includes(error.message) ? error.message : 'failed',
      ...(error.message === 'company_incomplete' && error.details ? { missing: error.details.split(',') } : {}),
    };
  }
  revalidatePath(`/${lang}/admin/movers/${companyId}`);
  revalidatePath(`/${lang}/admin`);
  return { ok: true };
}

/** What a decision about a mover, lifting it, or answering an appeal came to. */
export type DecisionResult = { ok: true } | { ok: false; error: string };

const DECISION_ERRORS = [
  'admins_only',
  'not_found',
  'reason_required',
  'kind_not_available',
  'notice_too_short',
  'effective_in_past',
  'note_required',
  'not_in_force',
  'already_decided',
];

async function decided(lang: string, companyId: string, error: { message: string } | null): Promise<DecisionResult> {
  if (error) return { ok: false, error: DECISION_ERRORS.includes(error.message) ? error.message : 'failed' };
  revalidatePath(`/${lang}/admin/movers/${companyId}`);
  revalidatePath(`/${lang}/admin`);
  return { ok: true };
}

const suspendSchema = z.object({
  lang: z.string().refine(isLocale),
  companyId: z.uuid(),
  kind: z.enum(['suspension', 'termination']),
  reason: z.string().trim().max(4000),
  serious: z.literal('on').optional(),
});

/**
 * Suspends a mover or ends their account (COMPLIANCE §3): reviewed by this admin, with the reasons the
 * mover reads in the app at once. A suspension applies now; an account ends 30 days after this notice,
 * or now for a serious violation. Postgres checks the admin, the reasons and the notice, and logs it.
 */
export async function suspend(_previous: DecisionResult | null, formData: FormData): Promise<DecisionResult> {
  const parsed = suspendSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'invalid_request' };
  const { lang, companyId, kind, reason, serious } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_decide_suspension', {
    p_company_id: companyId,
    p_kind: kind,
    p_reason: reason,
    p_serious: kind === 'termination' && serious === 'on',
  });
  return decided(lang, companyId, error);
}

const liftSchema = z.object({
  lang: z.string().refine(isLocale),
  companyId: z.uuid(),
  suspensionId: z.uuid(),
  note: z.string().trim().max(1000),
});

/** Lifts a decision now, with a note for the record. */
export async function lift(_previous: DecisionResult | null, formData: FormData): Promise<DecisionResult> {
  const parsed = liftSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'invalid_request' };
  const { lang, companyId, suspensionId, note } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_lift_suspension', { p_suspension_id: suspensionId, p_note: note });
  return decided(lang, companyId, error);
}

const answerSchema = z.object({
  lang: z.string().refine(isLocale),
  companyId: z.uuid(),
  appealId: z.uuid(),
  upheld: z.enum(['true', 'false']).transform((v) => v === 'true'),
  reason: z.string().trim().max(4000),
});

/** Answers an appeal or a complaint with reasons the mover reads; upholding an appeal lifts its decision. */
export async function answerAppeal(_previous: DecisionResult | null, formData: FormData): Promise<DecisionResult> {
  const parsed = answerSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'invalid_request' };
  const { lang, companyId, appealId, upheld, reason } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_decide_appeal', { p_appeal_id: appealId, p_upheld: upheld, p_reason: reason });
  return decided(lang, companyId, error);
}

const publishSchema = z.object({
  lang: z.string().refine(isLocale),
  audience: z.enum(TERMS_AUDIENCES),
  effective: z.union([z.literal(''), z.iso.date()]),
  summary: z.string().trim().max(2000),
});

/**
 * Publishes the terms in the app's code (packages/i18n/src/legal) as the next version for customers
 * or movers (design/DECISIONS.md #34), applying from the chosen day (at once when empty). Postgres
 * checks the admin, the 15 days' notice for movers, what changed, and tells movers in the app.
 */
export async function publishTerms(_previous: DecisionResult | null, formData: FormData): Promise<DecisionResult> {
  const parsed = publishSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'invalid_request' };
  const { lang, audience, effective, summary } = parsed.data;
  const doc = TERMS_DOC[audience];
  const content = { doc, locale: 'en', updated: LEGAL_UPDATED, text: legalDocument(doc, 'en').text };
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_publish_terms', {
    p_audience: audience,
    p_content: content,
    p_summary: summary || null,
    p_effective_at: effective ? `${effective}T00:00:00Z` : null,
  });
  if (error) {
    const known = ['admins_only', 'content_required', 'upcoming_exists', 'unchanged', 'summary_required'];
    return { ok: false, error: error.message === 'notice_too_short' ? 'terms_notice_too_short' : known.includes(error.message) ? error.message : 'failed' };
  }
  revalidatePath(`/${lang}/admin/terms`);
  return { ok: true };
}

const withdrawSchema = z.object({ lang: z.string().refine(isLocale), versionId: z.uuid(), note: z.string().trim().max(1000) });

/** Withdraws a version that doesn't apply yet, with a note for the record. */
export async function withdrawTerms(_previous: DecisionResult | null, formData: FormData): Promise<DecisionResult> {
  const parsed = withdrawSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: 'invalid_request' };
  const { lang, versionId, note } = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.rpc('admin_withdraw_terms', { p_version_id: versionId, p_note: note });
  if (error) return { ok: false, error: ['admins_only', 'note_required', 'already_in_effect'].includes(error.message) ? error.message : 'failed' };
  revalidatePath(`/${lang}/admin/terms`);
  return { ok: true };
}
