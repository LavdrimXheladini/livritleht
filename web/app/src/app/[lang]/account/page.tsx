import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';

import { isLocale, type Locale } from '@movershub/i18n';

import { getT } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';

import { SignOutButton } from './sign-out-button';

export default async function AccountPage({ params }: PageProps<'/[lang]/account'>) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getT(lang);

  return (
    <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-4 px-4 py-16">
      <h1 className="text-2xl font-bold text-ink-900">{t('customer.homeTitle')}</h1>
      <Suspense fallback={<p className="text-ink-500">{t('common.loading')}</p>}>
        <AccountDetails locale={lang} />
      </Suspense>
    </main>
  );
}

async function AccountDetails({ locale }: { locale: Locale }) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims.sub;
  if (!userId) redirect(`/${locale}/login`);

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, phone, role')
    .eq('id', userId)
    .single();

  const t = getT(locale);
  return (
    <>
      <p className="text-ink-500">{t('customer.homeSubtitle')}</p>
      <p className="text-ink-700">{profile?.name ?? profile?.phone ?? claims?.claims.email}</p>
      <SignOutButton locale={locale} />
    </>
  );
}
