'use client';

import { useActionState } from 'react';
import { useTranslation } from 'react-i18next';

import type { Locale } from '@movershub/shared';
import { Button } from '@movershub/ui/web';

import { joinWaitlist, type WaitlistState } from '@/app/[lang]/waitlist-action';

export function WaitlistForm({ locale }: { locale: Locale }) {
  const { t } = useTranslation();
  const [state, action, pending] = useActionState<WaitlistState, FormData>(joinWaitlist, { status: 'idle' });

  if (state.status === 'joined') {
    return (
      <div role="status" className="rounded-full border border-night-500 bg-night-800 px-5.5 py-4 text-[15px]">
        <span className="text-accent-300" aria-hidden="true">
          ✓
        </span>{' '}
        {t('landing.footer.joined')}
      </div>
    );
  }

  const message =
    state.status === 'invalid' ? t('landing.footer.invalid') : state.status === 'error' ? t('landing.footer.error') : null;

  return (
    <form action={action} noValidate>
      <div className="flex gap-2 rounded-full border border-night-500 bg-night-800 p-1.5 focus-within:ring-2 focus-within:ring-accent-500">
        <label htmlFor="waitlist-email" className="sr-only">
          {t('landing.footer.emailLabel')}
        </label>
        <input
          id="waitlist-email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder={t('landing.footer.placeholder')}
          aria-invalid={state.status === 'invalid' || undefined}
          aria-describedby="waitlist-help"
          className="min-h-11 min-w-0 flex-1 border-0 bg-transparent px-4 text-[15px] text-night-50 outline-none placeholder:text-sage-400"
        />
        {/* Honeypot — hidden from people and assistive tech. */}
        <input name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
        <input type="hidden" name="locale" value={locale} />
        <Button type="submit" variant="accent" disabled={pending} className="px-5.5">
          {pending ? t('landing.footer.joining') : t('landing.footer.join')}
        </Button>
      </div>
      <p id="waitlist-help" role={message ? 'alert' : undefined} className="mt-2.5 mb-0 px-4 text-xs text-sage-400">
        {message ?? t('landing.footer.consent')}
      </p>
    </form>
  );
}
