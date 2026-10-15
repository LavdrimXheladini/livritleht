import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { notFound, redirect } from 'next/navigation';
import { Suspense } from 'react';

import { isLocale, type Locale } from '@movershub/i18n';
import { Sheet } from '@movershub/ui/web';

import { Nav } from '@/components/landing/nav';
import { PASSWORD_OWED_COOKIE, parseOwed } from '@/lib/auth/password-owed';
import { getT } from '@/lib/i18n';
import { createClient } from '@/lib/supabase/server';

import { AuthPanel } from './auth-panel';

export async function generateMetadata({ params }: PageProps<'/[lang]/login'>): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getT(lang);
  return { title: `${t('auth.title')} · ${t('common.appName')}`, robots: { index: false } };
}

/** Sign in / create account (design/DECISIONS.md #29): email + password, like the app. */
export default async function LoginPage({ params }: PageProps<'/[lang]/login'>) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  return (
    <div className="flex flex-1 flex-col px-3 pt-3 pb-10 sm:px-5 sm:pt-5">
      <Sheet tone="cream" padding="none" className="overflow-hidden">
        <Nav locale={lang} onHome={false} />
        <main className="mx-auto flex w-full max-w-md flex-col px-5 pt-8 pb-16">
          {/* The session and the cookie are read per request: inside Suspense (Cache Components). */}
          <Suspense fallback={null}>
            <Auth locale={lang} />
          </Suspense>
        </main>
      </Sheet>
    </div>
  );
}

async function Auth({ locale }: { locale: Locale }) {
  const owed = parseOwed((await cookies()).get(PASSWORD_OWED_COOKIE)?.value);
  const { data } = await (await createClient()).auth.getClaims();
  const signedIn = Boolean(data?.claims.sub);
  // Signed in with a password already: nothing to do here.
  if (signedIn && !owed) redirect(`/${locale}/account`);
  return <AuthPanel locale={locale} owed={signedIn ? owed : null} />;
}
