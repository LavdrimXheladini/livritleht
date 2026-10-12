'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import {
  emailSchema,
  otpCodeSchema,
  phoneSchema,
  type Locale,
  type SignupMetadata,
} from '@movershub/shared';

import { createClient } from '@/lib/supabase/client';

type Channel = 'phone' | 'email';
type Sent = { channel: Channel; target: string };

const AUTH_ERRORS = ['invalid_phone', 'invalid_email', 'invalid_code', 'wrong_code', 'link_invalid'] as const;
type AuthError = (typeof AUTH_ERRORS)[number];
const isAuthError = (m: string | undefined): m is AuthError =>
  (AUTH_ERRORS as readonly string[]).includes(m ?? '');

function useAuthErrorText() {
  const { t } = useTranslation();
  return (message: string | undefined) =>
    isAuthError(message) ? t(`auth.errors.${message}`) : t('common.errorGeneric');
}

export function LoginForm({ locale }: { locale: Locale }) {
  const { t } = useTranslation();
  const [channel, setChannel] = useState<Channel>('phone');
  const [sent, setSent] = useState<Sent | null>(null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-ink-900">{t('auth.title')}</h1>
        <p className="mt-1 text-ink-500">{t('auth.subtitle')}</p>
      </div>
      {/* useSearchParams needs a Suspense boundary under Cache Components */}
      <Suspense>
        <LinkError />
      </Suspense>

      {sent ? (
        <VerifyForm sent={sent} locale={locale} onBack={() => setSent(null)} />
      ) : (
        <>
          <div role="tablist" className="grid grid-cols-2 rounded-md bg-ink-100 p-1">
            {(['phone', 'email'] as const).map((c) => (
              <button
                key={c}
                role="tab"
                type="button"
                aria-selected={channel === c}
                onClick={() => setChannel(c)}
                className={`rounded px-3 py-2 text-sm font-medium ${
                  channel === c ? 'bg-white text-ink-900 shadow-sm' : 'text-ink-500'
                }`}
              >
                {c === 'phone' ? t('auth.usePhone') : t('auth.useEmail')}
              </button>
            ))}
          </div>
          {/* key remounts the form so the resolver matches the channel */}
          <RequestForm key={channel} channel={channel} locale={locale} onSent={setSent} />
        </>
      )}
    </div>
  );
}

/** Shown after /[lang]/auth/confirm rejected an email link (?error=link_invalid). */
function LinkError() {
  const errorText = useAuthErrorText();
  const error = useSearchParams().get('error');
  if (!isAuthError(error ?? undefined)) return null;
  return (
    <p role="alert" className="text-sm text-danger">
      {errorText(error ?? undefined)}
    </p>
  );
}

function RequestForm({
  channel,
  locale,
  onSent,
}: {
  channel: Channel;
  locale: Locale;
  onSent: (sent: Sent) => void;
}) {
  const { t } = useTranslation();
  const errorText = useAuthErrorText();
  const schema = z.object({ target: channel === 'phone' ? phoneSchema : emailSchema });
  const form = useForm<z.input<typeof schema>, unknown, z.output<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { target: '' },
  });

  const onSubmit = form.handleSubmit(async ({ target }) => {
    const supabase = createClient();
    // Web sign-ups are customers. Movers register in the mover app.
    const data: SignupMetadata = { role: 'customer', locale };
    const { error } =
      channel === 'phone'
        ? await supabase.auth.signInWithOtp({ phone: target, options: { data } })
        : await supabase.auth.signInWithOtp({
            email: target,
            options: {
              data,
              shouldCreateUser: true,
              // The email link lands here; it must be on the project's allowed redirect list.
              emailRedirectTo: `${window.location.origin}/${locale}/auth/confirm`,
            },
          });
    if (error) {
      form.setError('root', { message: error.message });
      return;
    }
    onSent({ channel, target });
  });

  const fieldError = form.formState.errors.target?.message;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-ink-700">
          {channel === 'phone' ? t('auth.phoneLabel') : t('auth.emailLabel')}
        </span>
        <input
          {...form.register('target')}
          type={channel === 'phone' ? 'tel' : 'email'}
          autoComplete={channel === 'phone' ? 'tel' : 'email'}
          placeholder={channel === 'phone' ? t('auth.phonePlaceholder') : t('auth.emailPlaceholder')}
          className="rounded-md border border-ink-300 px-3 py-2 text-ink-900 outline-none focus:border-brand-500"
        />
        {fieldError && <span className="text-sm text-danger">{errorText(fieldError)}</span>}
      </label>
      {form.formState.errors.root && (
        <p className="text-sm text-danger">{t('common.errorGeneric')}</p>
      )}
      <button
        type="submit"
        disabled={form.formState.isSubmitting}
        className="rounded-md bg-brand-500 px-4 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
      >
        {form.formState.isSubmitting ? t('common.loading') : t('auth.sendCode')}
      </button>
    </form>
  );
}

const verifySchema = z.object({ code: otpCodeSchema });

function VerifyForm({ sent, locale, onBack }: { sent: Sent; locale: Locale; onBack: () => void }) {
  const { t } = useTranslation();
  const errorText = useAuthErrorText();
  const router = useRouter();
  const form = useForm<z.input<typeof verifySchema>, unknown, z.output<typeof verifySchema>>({
    resolver: zodResolver(verifySchema),
    defaultValues: { code: '' },
  });

  const onSubmit = form.handleSubmit(async ({ code }) => {
    const supabase = createClient();
    const { error } =
      sent.channel === 'phone'
        ? await supabase.auth.verifyOtp({ phone: sent.target, token: code, type: 'sms' })
        : await supabase.auth.verifyOtp({ email: sent.target, token: code, type: 'email' });
    if (error) {
      form.setError('code', { message: 'wrong_code' });
      return;
    }
    router.replace(`/${locale}/account`);
    router.refresh();
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <p className="text-ink-700">
        {sent.channel === 'email'
          ? t('auth.linkSentTo', { target: sent.target })
          : t('auth.codeSentTo', { target: sent.target })}
      </p>
      <label className="flex flex-col gap-1">
        <span className="text-sm font-medium text-ink-700">
          {sent.channel === 'email' ? t('auth.orEnterCode') : t('auth.codeLabel')}
        </span>
        <input
          {...form.register('code')}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className="rounded-md border border-ink-300 px-3 py-2 text-center text-2xl tracking-[0.5em] text-ink-900 outline-none focus:border-brand-500"
        />
        {form.formState.errors.code && (
          <span className="text-sm text-danger">{errorText(form.formState.errors.code.message)}</span>
        )}
      </label>
      <button
        type="submit"
        disabled={form.formState.isSubmitting}
        className="rounded-md bg-brand-500 px-4 py-3 font-semibold text-white hover:bg-brand-600 disabled:opacity-60"
      >
        {form.formState.isSubmitting ? t('common.loading') : t('auth.verify')}
      </button>
      <button type="button" onClick={onBack} className="text-sm text-brand-600 hover:underline">
        {t('auth.changeTarget')}
      </button>
    </form>
  );
}
