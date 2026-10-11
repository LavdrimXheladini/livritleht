'use server';

import { emailSchema, isLocale } from '@ranktrip/shared';

import { createClient } from '@/lib/supabase/server';

export type WaitlistState = { status: 'idle' | 'joined' | 'invalid' | 'error' };

/**
 * Adds an email to the launch waitlist (public.waitlist: insert-only via RLS).
 * Duplicates count as success so the form never reveals whether an address is already listed.
 */
export async function joinWaitlist(_prev: WaitlistState, form: FormData): Promise<WaitlistState> {
  // Honeypot: real people never fill this hidden field.
  if (form.get('company')) return { status: 'joined' };

  const email = emailSchema.safeParse(form.get('email'));
  if (!email.success) return { status: 'invalid' };
  const rawLocale = String(form.get('locale') ?? '');
  const locale = isLocale(rawLocale) ? rawLocale : 'en';

  const supabase = await createClient();
  const { error } = await supabase.from('waitlist').insert({ email: email.data, locale });
  if (error && error.code !== '23505') {
    console.error('waitlist insert failed', error.code, error.message);
    return { status: 'error' };
  }
  return { status: 'joined' };
}
