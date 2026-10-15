'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { createClient } from '@/lib/supabase/client';

/** Email + password, for MoversHub's admins (the website's own sign-in by code follows in its step 2). */
export function AdminSignInForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setBusy(true);
        const { error } = await createClient().auth.signInWithPassword({ email: email.trim(), password });
        setBusy(false);
        setFailed(Boolean(error));
        if (!error) router.refresh();
      }}
    >
      <label className="flex flex-col gap-1 text-sm text-ink-600">
        {t('auth.emailLabel')}
        <input
          type="email"
          autoComplete="username"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="rounded-input border border-stone-300 bg-stone-50 px-3 py-2.5 text-base text-ink-900"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm text-ink-600">
        {t('auth.passwordLabel')}
        <input
          type="password"
          autoComplete="current-password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="rounded-input border border-stone-300 bg-stone-50 px-3 py-2.5 text-base text-ink-900"
        />
      </label>
      {failed ? (
        <p role="alert" className="text-sm text-danger">
          {t('auth.errors.wrong_credentials')}
        </p>
      ) : null}
      <button type="submit" disabled={busy} className="rounded-full bg-brand-500 px-5 py-3 font-medium text-stone-50 disabled:opacity-60">
        {t('auth.signIn')}
      </button>
    </form>
  );
}
