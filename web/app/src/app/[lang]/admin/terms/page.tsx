import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense, type ReactNode } from 'react';

import { LEGAL_UPDATED, isLocale, legalDocument, type Locale } from '@movershub/i18n';
import { TERMS_AUDIENCES, TERMS_DOC, earliestTermsStart, sameJson, termsStatus, type TermsAudience } from '@movershub/shared';

import { getAdminT, getT } from '@/lib/i18n';

import { AdminFrame, AdminGate } from '../admin-frame';
import type { AdminSupabase } from '../admin-session';
import { PublishTermsForm, WithdrawTermsForm } from '../terms-forms';

export const metadata: Metadata = { robots: { index: false, follow: false } };

/** The terms: what is published for each side, and publishing the text in the app (design/DECISIONS.md #34). */
export default async function AdminTermsPage({ params }: PageProps<'/[lang]/admin/terms'>) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getT(lang);
  const ta = getAdminT(lang);
  return (
    <AdminFrame locale={lang} title={ta('terms.title')}>
      <Suspense fallback={<p className="text-ink-500">{t('common.loading')}</p>}>
        <AdminGate locale={lang}>{(supabase) => <TermsAdmin locale={lang} supabase={supabase} />}</AdminGate>
      </Suspense>
    </AdminFrame>
  );
}

type Version = {
  id: string;
  audience: TermsAudience;
  version: number;
  summary: string | null;
  published_at: string;
  effective_at: string;
  withdrawn_at: string | null;
  content: unknown;
  terms_acceptances: { count: number }[];
};

const day = (iso: string) => iso.slice(0, 10);

async function TermsAdmin({ locale, supabase }: { locale: Locale; supabase: AdminSupabase }) {
  const t = getT(locale);
  const ta = getAdminT(locale);
  const { data, error } = await supabase
    .from('terms_versions')
    .select('id, audience, version, summary, published_at, effective_at, withdrawn_at, content, terms_acceptances(count)')
    .order('version', { ascending: false });
  if (error) return <p className="text-danger">{t('common.errorGeneric')}</p>;
  const versions = (data ?? []) as Version[];

  return (
    <div className="flex flex-col gap-6">
      <p className="text-ink-700">{ta('terms.intro')}</p>
      {TERMS_AUDIENCES.map((audience) => {
        const doc = TERMS_DOC[audience];
        const all = versions.filter((v) => v.audience === audience);
        const active = all.filter((v) => !v.withdrawn_at);
        const { current, upcoming } = termsStatus(active, []);
        const latest = active[0];
        const inApp = { doc, locale: 'en', updated: LEGAL_UPDATED, text: legalDocument(doc, 'en').text };
        const same = latest !== undefined && sameJson(latest.content, inApp);
        const count = (v: Version) => v.terms_acceptances[0]?.count ?? 0;
        return (
          <section key={audience} data-testid={`terms-${audience}`} className="flex flex-col gap-3 rounded-card border border-stone-300 bg-stone-50 p-5">
            <h2 className="text-lg font-semibold text-ink-900">{ta(`terms.audience.${audience}`)}</h2>
            {all.length === 0 ? <p className="text-sm text-ink-600">{ta('terms.none')}</p> : null}
            <ul className="flex flex-col gap-2 text-sm text-ink-700">
              {all.map((v) => (
                <li key={v.id} data-testid={`terms-version-${audience}-${v.version}`} className="flex flex-col gap-1">
                  <span className={v.id === current?.id || v.id === upcoming?.id ? 'font-medium text-ink-900' : ''}>
                    {v.withdrawn_at
                      ? ta('terms.withdrawn', { version: v.version })
                      : ta(v.id === upcoming?.id ? 'terms.upcoming' : v.id === current?.id ? 'terms.current' : 'terms.past', {
                          version: v.version,
                          date: day(v.effective_at),
                          count: count(v),
                        })}
                  </span>
                  {v.summary ? <span className="text-ink-600">“{v.summary}”</span> : null}
                  {v.id === upcoming?.id ? <WithdrawTermsForm lang={locale} versionId={v.id} /> : null}
                </li>
              ))}
            </ul>
            <Block>
              <p className="m-0 text-sm text-ink-900">
                {ta('terms.appText', { date: LEGAL_UPDATED })} ·{' '}
                <Link href={`/${locale}/${doc}`} className="underline">
                  {ta('terms.read')}
                </Link>
              </p>
              {latest ? <p className="m-0 text-sm text-ink-600">{same ? ta('terms.same') : ta('terms.differs')}</p> : null}
              {!same && !upcoming ? (
                <PublishTermsForm lang={locale} audience={audience} minDate={earliestTermsStart(audience, latest !== undefined)} first={latest === undefined} />
              ) : null}
            </Block>
          </section>
        );
      })}
    </div>
  );
}

function Block({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 border-t border-stone-300 pt-3">{children}</div>;
}
