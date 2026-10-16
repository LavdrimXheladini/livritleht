'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

import { isLocale } from '@movershub/i18n';

import { callAccount } from '@/lib/account/call';
import { PASSWORD_OWED_COOKIE } from '@/lib/auth/password-owed';
import { createClient } from '@/lib/supabase/server';

/** Why the account wasn't deleted (the `account` function's answer, or no answer). */
export type DeleteResult = { error: 'password_required' | 'wrong_password' | 'records_kept' | 'admins_only_by_platform' | 'failed' } | null;

/**
 * "Delete my account" (COMPLIANCE §9; design/DECISIONS.md #31): the password typed again, then the
 * `account` function deletes the account and its data. This browser then forgets the session and the
 * sign-in page says the account is deleted.
 */
export async function deleteAccount(_previous: DeleteResult, form: FormData): Promise<DeleteResult> {
  const lang = String(form.get('lang') ?? '');
  const password = String(form.get('password') ?? '');
  if (!isLocale(lang)) return { error: 'failed' };
  if (!password) return { error: 'password_required' };
  const answer = await callAccount({ action: 'delete', password }).catch(() => undefined);
  if (answer === null) redirect(`/${lang}/login`);
  if (!answer?.ok) {
    const { error } = ((await answer?.json().catch(() => ({}))) ?? {}) as { error?: string };
    return { error: error === 'wrong_password' || error === 'records_kept' || error === 'admins_only_by_platform' ? error : 'failed' };
  }
  // The login is gone on the server: only this browser's copy of the session is left to drop.
  await (await createClient()).auth.signOut({ scope: 'local' });
  (await cookies()).delete(PASSWORD_OWED_COOKIE);
  redirect(`/${lang}/login?deleted=1`);
}
