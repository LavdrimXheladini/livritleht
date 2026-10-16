'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';

import {
  emailSchema,
  isPerAddressResendLimit,
  otpCodeSchema,
  passwordErrorKey,
  passwordSchema,
  signInPasswordSchema,
  type Locale,
  type SelfSignupRole,
  type SignupMetadata,
} from '@movershub/shared';
import { Button } from '@movershub/ui/web';

import { owePassword, settlePassword, type OwedPurpose } from '@/lib/auth/password-owed';
import { createClient } from '@/lib/supabase/client';

import { RoleRadios } from './role-radios';

// The website's sign-in, the same as the app's (design/DECISIONS.md #17, #29): email + password. A
// 6-digit email code only proves the email ("Create account") or resets a forgotten password, and
// every sign-in by a code ends with choosing a password. Every address gets the same answers (no
// account check). The role picked on "Create account" is saved only after the code proved the
// address (`public.choose_role`) — and never switches an existing account's side unasked.

type View =
  | { kind: 'signIn' }
  | { kind: 'register' }
  | { kind: 'forgot' }
  | { kind: 'code'; email: string; purpose: OwedPurpose; role: SelfSignupRole | null }
  | { kind: 'password'; purpose: OwedPurpose; role: SelfSignupRole | null };

const ERROR_KEYS = [
  'invalid_email',
  'invalid_code',
  'wrong_code',
  'choose_role',
  'link_invalid',
  'password_required',
  'wrong_credentials',
  'password_too_short',
  'password_too_long',
  'password_weak',
  'same_password',
  'too_many_attempts',
] as const;
type ErrorKey = (typeof ERROR_KEYS)[number];
const isErrorKey = (key: string | undefined): key is ErrorKey => (ERROR_KEYS as readonly string[]).includes(key ?? '');

/** An error key as text (anything unknown: "Something went wrong"); nothing for no error. */
function useErrorText() {
  const { t } = useTranslation();
  return (key: string | undefined): string | undefined => (key === undefined ? undefined : isErrorKey(key) ? t(`auth.errors.${key}`) : t('common.errorGeneric'));
}

/** Where an emailed link lands (the cloud project sends links until it has its own email provider). */
const confirmUrl = (locale: Locale, purpose: OwedPurpose) => `${window.location.origin}/${locale}/auth/confirm?purpose=${purpose}`;

export function AuthPanel({ locale, owed }: { locale: Locale; owed: OwedPurpose | null }) {
  const { t } = useTranslation();
  // Signed in by a code (or its link) without a password yet: that first, also after a reload.
  const [view, setView] = useState<View>(owed ? { kind: 'password', purpose: owed, role: null } : { kind: 'signIn' });
  const [email, setEmail] = useState('');

  const heading: Record<View['kind'], [string, string]> = {
    signIn: [t('auth.title'), t('auth.passwordSubtitle')],
    register: [t('auth.registerTitle'), t('auth.registerSubtitle')],
    forgot: [t('auth.forgotTitle'), t('auth.forgotSubtitle')],
    code: [t('auth.verifyTitle'), ''],
    password:
      view.kind === 'password' && view.purpose === 'recovery'
        ? [t('auth.newPasswordTitle'), t('auth.newPasswordSubtitle')]
        : [t('auth.createPasswordTitle'), t('auth.createPasswordSubtitle')],
  };
  const [title, subtitle] = heading[view.kind];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="type-display m-0 text-[clamp(32px,8vw,40px)] text-ink-900">{title}</h1>
        {subtitle ? <p className="m-0 text-ink-600">{subtitle}</p> : null}
      </div>
      <LinkError />

      {view.kind === 'signIn' || view.kind === 'register' ? (
        <div role="tablist" className="grid grid-cols-2 gap-1 rounded-full bg-stone-200 p-1">
          {(['signIn', 'register'] as const).map((kind) => (
            <button
              key={kind}
              role="tab"
              type="button"
              aria-selected={view.kind === kind}
              onClick={() => setView({ kind })}
              className="min-h-11 rounded-full px-3 text-sm font-medium text-ink-600 aria-selected:bg-brand-500 aria-selected:text-stone-50"
            >
              {kind === 'signIn' ? t('auth.signIn') : t('auth.registerTab')}
            </button>
          ))}
        </div>
      ) : null}

      {view.kind === 'signIn' ? (
        <SignInForm key="signIn" locale={locale} email={email} onEmail={setEmail} onForgot={() => setView({ kind: 'forgot' })} />
      ) : view.kind === 'register' ? (
        <RegisterForm key="register" locale={locale} email={email} onEmail={setEmail} onSent={(sent) => setView({ kind: 'code', ...sent })} />
      ) : view.kind === 'forgot' ? (
        <ForgotForm
          locale={locale}
          email={email}
          onEmail={setEmail}
          onSent={(sent) => setView({ kind: 'code', ...sent })}
          onBack={() => setView({ kind: 'signIn' })}
        />
      ) : view.kind === 'code' ? (
        <CodeForm
          sent={view}
          onBack={() => setView({ kind: view.purpose === 'recovery' ? 'forgot' : 'register' })}
          onVerified={() => setView({ kind: 'password', purpose: view.purpose, role: view.role })}
        />
      ) : (
        <PasswordForm locale={locale} purpose={view.purpose} role={view.role} onSignedOut={() => setView({ kind: 'signIn' })} />
      )}
    </div>
  );
}

/**
 * Shown after /[lang]/auth/confirm refused an emailed link (?error=link_invalid), or after the account
 * was deleted (?deleted=1).
 */
function LinkError() {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const query = useSearchParams();
  if (query.get('deleted') === '1') {
    return (
      <p role="status" data-testid="auth-notice" className="m-0 rounded-input bg-stone-200 px-4 py-3 text-sm text-ink-900">
        {t('account.deleted')}
      </p>
    );
  }
  const error = query.get('error');
  if (error !== 'link_invalid') return null;
  return (
    <p role="alert" className="m-0 text-sm text-danger">
      {errorText(error)}
    </p>
  );
}

function Field({ label, error, children, hint }: { label: string; error?: string | undefined; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm text-ink-600">{label}</span>
      {children}
      {hint ? <span className="text-[13px] text-ink-600">{hint}</span> : null}
      {error ? <span className="text-sm text-danger">{error}</span> : null}
    </label>
  );
}

const inputClass = 'min-h-12 rounded-input border border-stone-300 bg-stone-50 px-4 text-base text-ink-900 outline-none focus:border-brand-500';

function Alert({ children }: { children: ReactNode }) {
  return (
    <p role="alert" data-testid="auth-error" className="m-0 text-sm text-danger">
      {children}
    </p>
  );
}

const signInSchema = z.object({ email: emailSchema, password: signInPasswordSchema });

/** Sign in with email and password. A wrong address and a wrong password get the same answer. */
function SignInForm({ locale, email, onEmail, onForgot }: { locale: Locale; email: string; onEmail: (email: string) => void; onForgot: () => void }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const router = useRouter();
  const form = useForm<z.input<typeof signInSchema>, unknown, z.output<typeof signInSchema>>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email, password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ email: address, password }) => {
    // A code asked for earlier and never used is over: this sign-in needs no new password.
    settlePassword();
    const { error } = await createClient().auth.signInWithPassword({ email: address, password });
    if (error) {
      form.setError('root', { message: passwordErrorKey(error) });
      return;
    }
    router.replace(`/${locale}/account`);
    router.refresh();
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field label={t('auth.emailLabel')} error={errorText(errors.email?.message)}>
        <input
          {...form.register('email', { onChange: (e: { target: { value: string } }) => onEmail(e.target.value) })}
          type="email"
          autoComplete="username"
          placeholder={t('auth.emailPlaceholder')}
          aria-invalid={Boolean(errors.email)}
          className={inputClass}
        />
      </Field>
      <Field label={t('auth.passwordLabel')} error={errorText(errors.password?.message)}>
        <input {...form.register('password')} type="password" autoComplete="current-password" aria-invalid={Boolean(errors.password)} className={inputClass} />
      </Field>
      {errors.root ? <Alert>{errorText(errors.root.message)}</Alert> : null}
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? t('common.loading') : t('auth.signIn')}
      </Button>
      <Button type="button" variant="link" className="self-center" onClick={onForgot}>
        {t('auth.forgotPassword')}
      </Button>
    </form>
  );
}

const registerSchema = z
  .object({ email: emailSchema, role: z.custom<SelfSignupRole | null>() })
  .refine((v) => v.role !== null, { message: 'choose_role', path: ['role'] });

/** "Create account": the role and the email; a code confirms the email. */
function RegisterForm({
  locale,
  email,
  onEmail,
  onSent,
}: {
  locale: Locale;
  email: string;
  onEmail: (email: string) => void;
  onSent: (sent: { email: string; purpose: 'register'; role: SelfSignupRole }) => void;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const form = useForm<z.input<typeof registerSchema>, unknown, z.output<typeof registerSchema>>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email, role: null },
  });
  const { errors, isSubmitting } = form.formState;
  const role = useWatch({ control: form.control, name: 'role' });

  const submit = form.handleSubmit(async ({ email: address, role: picked }) => {
    // Same request for every address (a new one gets an account). The role is not sent: anyone could
    // send one for any email, so it is saved only after the code proves the address.
    const { error } = await createClient().auth.signInWithOtp({
      email: address,
      options: { shouldCreateUser: true, data: { locale } satisfies SignupMetadata, emailRedirectTo: confirmUrl(locale, 'register') },
    });
    if (error && !isPerAddressResendLimit(error)) {
      // Every address gets these answers (a new one sends an email too), so they can be shown.
      form.setError('root', { message: error.status === 429 ? 'too_many_attempts' : 'generic' });
      return;
    }
    onSent({ email: address, purpose: 'register', role: picked as SelfSignupRole });
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <RoleRadios value={role} onChange={(r) => form.setValue('role', r, { shouldValidate: form.formState.isSubmitted })} error={errorText(errors.role?.message)} />
      <Field label={t('auth.emailLabel')} error={errorText(errors.email?.message)}>
        <input
          {...form.register('email', { onChange: (e: { target: { value: string } }) => onEmail(e.target.value) })}
          type="email"
          autoComplete="email"
          placeholder={t('auth.emailPlaceholder')}
          aria-invalid={Boolean(errors.email)}
          className={inputClass}
        />
      </Field>
      {errors.root ? <Alert>{errorText(errors.root.message)}</Alert> : null}
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? t('common.loading') : t('auth.sendCode')}
      </Button>
    </form>
  );
}

const forgotSchema = z.object({ email: emailSchema });

/** "Forgot password?": a code by email, then a new password. Every address gets the same answer. */
function ForgotForm({
  locale,
  email,
  onEmail,
  onSent,
  onBack,
}: {
  locale: Locale;
  email: string;
  onEmail: (email: string) => void;
  onSent: (sent: { email: string; purpose: 'recovery'; role: null }) => void;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const form = useForm<z.input<typeof forgotSchema>, unknown, z.output<typeof forgotSchema>>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ email: address }) => {
    const { error } = await createClient().auth.resetPasswordForEmail(address, { redirectTo: confirmUrl(locale, 'recovery') });
    // Supabase Auth answers "sent" for an address without an account before trying to send; every
    // other answer concerns an existing account. Only "no answer at all" and the limit per network
    // (the same for every address) are shown; anything else looks sent.
    if (error && (isAuthRetryableFetchError(error) || error.code === 'over_request_rate_limit')) {
      form.setError('root', { message: error.status === 429 ? 'too_many_attempts' : 'generic' });
      return;
    }
    onSent({ email: address, purpose: 'recovery', role: null });
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field label={t('auth.emailLabel')} error={errorText(errors.email?.message)}>
        <input
          {...form.register('email', { onChange: (e: { target: { value: string } }) => onEmail(e.target.value) })}
          type="email"
          autoComplete="email"
          placeholder={t('auth.emailPlaceholder')}
          aria-invalid={Boolean(errors.email)}
          className={inputClass}
        />
      </Field>
      {errors.root ? <Alert>{errorText(errors.root.message)}</Alert> : null}
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? t('common.loading') : t('auth.sendCode')}
      </Button>
      <Button type="button" variant="link" className="self-center" onClick={onBack}>
        {t('auth.backToSignIn')}
      </Button>
    </form>
  );
}

const codeSchema = z.object({ code: otpCodeSchema });

/** The code from the email: confirms a new account, or allows a new password. */
function CodeForm({ sent, onBack, onVerified }: { sent: { email: string; purpose: OwedPurpose }; onBack: () => void; onVerified: () => void }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const form = useForm<z.input<typeof codeSchema>, unknown, z.output<typeof codeSchema>>({
    resolver: zodResolver(codeSchema),
    defaultValues: { code: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ code }) => {
    // Owed before the sign-in happens: also if the page reloads before the password is chosen.
    owePassword(sent.purpose);
    const { error } = await createClient().auth.verifyOtp({ email: sent.email, token: code, type: sent.purpose === 'recovery' ? 'recovery' : 'email' });
    if (error) {
      settlePassword();
      form.setError('code', { message: 'wrong_code' });
      return;
    }
    onVerified();
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <p className="m-0 text-ink-700">
        {sent.purpose === 'recovery' ? t('auth.recoveryCodeSentTo', { target: sent.email }) : t('auth.codeSentTo', { target: sent.email })}
      </p>
      {sent.purpose === 'recovery' ? <p className="m-0 text-sm text-ink-600">{t('auth.recoveryNoCode')}</p> : null}
      <Field label={t('auth.codeLabel')} error={errorText(errors.code?.message)}>
        <input
          {...form.register('code')}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          aria-invalid={Boolean(errors.code)}
          className={`${inputClass} text-center text-2xl tracking-[0.5em]`}
        />
      </Field>
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? t('common.loading') : t('auth.verify')}
      </Button>
      <Button type="button" variant="link" className="self-center" onClick={onBack}>
        {t('auth.changeEmail')}
      </Button>
    </form>
  );
}

const passwordFormSchema = z.object({ password: passwordSchema });

/**
 * Signed in by a code: the password first. After "Create account", the role picked is saved now —
 * for an account without one; an existing account keeps its side, and the account page says so.
 */
function PasswordForm({ locale, purpose, role, onSignedOut }: { locale: Locale; purpose: OwedPurpose; role: SelfSignupRole | null; onSignedOut: () => void }) {
  const { t } = useTranslation();
  const errorText = useErrorText();
  const router = useRouter();
  const form = useForm<z.input<typeof passwordFormSchema>, unknown, z.output<typeof passwordFormSchema>>({
    resolver: zodResolver(passwordFormSchema),
    defaultValues: { password: '' },
  });
  const { errors, isSubmitting } = form.formState;

  const submit = form.handleSubmit(async ({ password }) => {
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    // "Create account" for an address that already has an account: typing its current password is
    // fine (the person knows it, and a password planted before the address was proven is gone).
    if (error && !(purpose === 'register' && error.code === 'same_password')) {
      form.setError('password', { message: passwordErrorKey(error) });
      return;
    }
    settlePassword();
    let notice = false;
    if (role) {
      const { data: profile } = await supabase.from('profiles').select('role').maybeSingle<{ role: string | null }>();
      if (profile && profile.role === null) await supabase.rpc('choose_role', { p_role: role });
      else notice = Boolean(profile?.role) && profile?.role !== role;
    }
    router.replace(`/${locale}/account${notice ? '?notice=existing' : ''}`);
    router.refresh();
  });

  const signOut = async () => {
    await createClient().auth.signOut();
    settlePassword();
    onSignedOut();
    router.refresh();
  };

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <Field label={t('auth.passwordLabel')} hint={t('auth.passwordHint')} error={errorText(errors.password?.message)}>
        <input {...form.register('password')} type="password" autoComplete="new-password" aria-invalid={Boolean(errors.password)} className={inputClass} />
      </Field>
      <Button type="submit" size="lg" disabled={isSubmitting}>
        {isSubmitting ? t('common.loading') : t('auth.savePassword')}
      </Button>
      <Button type="button" variant="link" className="self-center" onClick={() => void signOut()}>
        {t('common.signOut')}
      </Button>
    </form>
  );
}
