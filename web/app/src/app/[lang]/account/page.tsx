import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';

import { isLocale, type Locale } from '@movershub/i18n';
import { Sheet } from '@movershub/ui/web';

import { Nav } from '@/components/landing/nav';
import { PASSWORD_OWED_COOKIE, parseOwed } from '@/lib/auth/password-owed';
import { getT } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';

import { RoleChooser, SwitchSide } from './role-forms';
import { SignOutButton } from './sign-out-button';

export async function generateMetadata({ params }: PageProps<'/[lang]/account'>): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getT(lang);
  return { title: `${t('account.title')} · ${t('common.appName')}`, robots: { index: false } };
}

/**
 * The signed-in person's account on the website (design/DECISIONS.md #29): who is signed in, which
 * side they are on (chosen after the first code, switchable between customer and mover), and that
 * booking and the mover setup happen in the app.
 */
export default async function AccountPage({ params, searchParams }: PageProps<'/[lang]/account'>) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getT(lang);

  return (
    <div className="flex flex-1 flex-col px-3 pt-3 pb-10 sm:px-5 sm:pt-5">
      <Sheet tone="cream" padding="none" className="overflow-hidden">
        <Nav locale={lang} onHome={false} />
        <main className="mx-auto flex w-full max-w-md flex-col gap-5 px-5 pt-8 pb-16">
          <h1 className="type-display m-0 text-[clamp(32px,8vw,40px)] text-ink-900">{t('account.title')}</h1>
          <Suspense fallback={<p className="m-0 text-ink-600">{t('common.loading')}</p>}>
            <AccountDetails locale={lang} searchParams={searchParams} />
          </Suspense>
        </main>
      </Sheet>
    </div>
  );
}

async function AccountDetails({ locale, searchParams }: { locale: Locale; searchParams: PageProps<'/[lang]/account'>['searchParams'] }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) redirect(`/${locale}/login`);
  // Signed in by a code without a password yet: that first (the sign-in page asks for it).
  if (parseOwed((await cookies()).get(PASSWORD_OWED_COOKIE)?.value)) redirect(`/${locale}/login`);

  const { data: profile } = await supabase.from('profiles').select('role').eq('id', userId).maybeSingle<{ role: string | null }>();
  const role = profile?.role ?? null;
  const existing = (await searchParams).notice === 'existing';
  const t = getT(locale);

  return (
    <>
      <p data-testid="account-email" className="m-0 text-ink-700">
        {t('account.signedInAs', { email: String(claims?.claims.email ?? '') })}
      </p>
      {existing && (role === 'customer' || role === 'mover') ? (
        <p role="status" data-testid="account-notice" className="m-0 rounded-input bg-stone-200 px-4 py-3 text-sm text-ink-900">
          {role === 'mover' ? t('auth.existingMover') : t('auth.existingCustomer')}
        </p>
      ) : null}
      {role === 'customer' || role === 'mover' ? (
        <div className="flex flex-col gap-3">
          <p data-testid="account-side" className="m-0 text-ink-900">
            {role === 'mover' ? t('account.mover') : t('account.customer')}
          </p>
          <SwitchSide to={role === 'mover' ? 'customer' : 'mover'} />
        </div>
      ) : role === 'admin' ? (
        <p className="m-0 text-ink-900">
          <Link href={`/${locale}/admin`} className="text-ink-900 underline">
            {t('account.admin')}
          </Link>
        </p>
      ) : (
        <RoleChooser />
      )}
      <p className="m-0 text-sm text-ink-600">{t('account.getApp')}</p>
      <SignOutButton locale={locale} />
    </>
  );
}
