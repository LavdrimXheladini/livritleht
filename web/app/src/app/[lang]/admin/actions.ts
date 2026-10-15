'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { isLocale } from '@movershub/i18n';

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
