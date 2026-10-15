import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { isLocale, type Locale } from '@movershub/i18n';

import { getAdminT, getT } from '@/lib/i18n';

import { AdminFrame, AdminGate } from './admin-frame';
import type { AdminSupabase } from './admin-session';

export const metadata: Metadata = { robots: { index: false, follow: false } };

const TABS = ['pending', 'rejected', 'verified'] as const;
type Tab = (typeof TABS)[number];

/** MoversHub's admin page: movers by where their check stands (design/DECISIONS.md #23). */
export default async function AdminPage({ params, searchParams }: PageProps<'/[lang]/admin'>) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getT(lang);
  const ta = getAdminT(lang);
  return (
    <AdminFrame locale={lang} title={ta('title')}>
      <Suspense fallback={<p className="text-ink-500">{t('common.loading')}</p>}>
        <AdminGate locale={lang}>
          {(supabase) => <MoverList locale={lang} supabase={supabase} searchParams={searchParams} />}
        </AdminGate>
      </Suspense>
    </AdminFrame>
  );
}

type Row = {
  id: string;
  legal_name: string;
  country: string;
  verification_status: Tab;
  updated_at: string;
  mover_documents: { verified_at: string | null }[];
  vehicles: { verified_at: string | null; active: boolean }[];
};

async function MoverList({
  locale,
  supabase,
  searchParams,
}: {
  locale: Locale;
  supabase: AdminSupabase;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const t = getT(locale);
  const ta = getAdminT(locale);
  const requested = (await searchParams).status;
  const tab: Tab = TABS.includes(requested as Tab) ? (requested as Tab) : 'pending';
  const { data, error } = await supabase
    .from('mover_companies')
    .select('id, legal_name, country, verification_status, updated_at, mover_documents(verified_at), vehicles(verified_at, active)')
    .eq('is_test', false)
    .eq('verification_status', tab)
    .order('updated_at', { ascending: true });
  const rows = (data ?? []) as Row[];

  return (
    <div className="flex flex-col gap-5">
      <nav className="flex flex-wrap gap-2" aria-label={ta('title')}>
        {TABS.map((s) => (
          <Link
            key={s}
            href={`/${locale}/admin?status=${s}`}
            aria-current={s === tab ? 'page' : undefined}
            className={`rounded-full px-4 py-2 text-sm font-medium ${s === tab ? 'bg-brand-500 text-stone-50' : 'border border-stone-300 text-ink-900'}`}
          >
            {ta(`tabs.${s}`)}
          </Link>
        ))}
      </nav>
      {error ? <p className="text-danger">{t('common.errorGeneric')}</p> : null}
      {rows.length === 0 && !error ? <p className="text-ink-500">{ta('empty')}</p> : null}
      <ul className="flex flex-col gap-3">
        {rows.map((r) => {
          const docsWaiting = r.mover_documents.filter((d) => !d.verified_at).length;
          const vansWaiting = r.vehicles.filter((v) => v.active && !v.verified_at).length;
          return (
            <li key={r.id}>
              <Link
                href={`/${locale}/admin/movers/${r.id}`}
                data-testid={`admin-mover-${r.id}`}
                className="flex flex-col gap-1 rounded-card border border-stone-300 bg-stone-50 p-4 hover:border-ink-300"
              >
                <span className="font-semibold text-ink-900">
                  {r.legal_name} · {r.country}
                </span>
                <span className="text-sm text-ink-600">
                  {ta('waitingCounts', { documents: docsWaiting, vans: vansWaiting })} · {ta('updated', { date: r.updated_at.slice(0, 10) })}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
