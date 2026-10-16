import Link from 'next/link';
import type { ReactNode } from 'react';

import type { Locale } from '@movershub/i18n';

import { getAdminT } from '@/lib/i18n';

import { SignOutButton } from '../account/sign-out-button';
import { adminSession, type AdminSupabase } from './admin-session';
import { AdminSignInForm } from './sign-in-form';

/** The admin pages' frame: title and a way back to the list. */
export function AdminFrame({ locale, title, children }: { locale: Locale; title: string; children: ReactNode }) {
  const ta = getAdminT(locale);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-10">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="font-display text-3xl text-ink-900">{title}</h1>
        <span className="flex gap-4">
          <Link href={`/${locale}/admin`} className="text-sm text-ink-700 underline">
            {ta('allMovers')}
          </Link>
          <Link href={`/${locale}/admin/terms`} className="text-sm text-ink-700 underline">
            {ta('termsNav')}
          </Link>
        </span>
      </div>
      {children}
    </main>
  );
}

/**
 * Only for admins: a sign-in form when nobody is signed in, "not allowed" for anyone else. Reads the
 * session (cookies), so it renders inside a Suspense boundary.
 */
export async function AdminGate({ locale, children }: { locale: Locale; children: (supabase: AdminSupabase) => ReactNode }) {
  const ta = getAdminT(locale);
  const session = await adminSession();
  if (session.state === 'signed-out') {
    return (
      <section className="flex max-w-sm flex-col gap-4">
        <p className="text-ink-600">{ta('signInFirst')}</p>
        <AdminSignInForm />
      </section>
    );
  }
  if (session.state === 'not-admin') {
    return (
      <section className="flex flex-col gap-4">
        <p className="text-ink-700">{ta('notAllowed')}</p>
        <SignOutButton locale={locale} />
      </section>
    );
  }
  return (
    <>
      {children(session.supabase)}
      <div className="border-t border-stone-300 pt-4">
        <SignOutButton locale={locale} />
      </div>
    </>
  );
}
