import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isLocale } from '@movershub/i18n';
import { INTL_LOCALES, OPERATOR } from '@movershub/shared';
import { SectionTitle, Sheet } from '@movershub/ui/web';

import { Nav } from '@/components/landing/nav';
import { SiteFooter } from '@/components/landing/site-footer';
import { getT } from '@/lib/i18n';

/**
 * When this page last changed. Update it with every change of the rules below — and the rules with
 * every change of who is quoted (`public.quotable_vehicles`) or of the order (packages/pricing).
 */
const UPDATED = '2026-10-15';

/** The conditions of `public.quotable_vehicles` (migration 20261015130000), in that order. */
const WHO = ['verified', 'van', 'area', 'country', 'insurance', 'crossBorder', 'terms', 'payouts', 'standing'] as const;
const NEVER = ['paid', 'declining', 'location', 'commission'] as const;

export async function generateMetadata({ params }: PageProps<'/[lang]/ranking'>): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getT(lang);
  return { title: `${t('ranking.title')} · ${t('common.appName')}`, description: t('ranking.subtitle') };
}

/**
 * "How ranking works" (COMPLIANCE §3, design/DECISIONS.md #27): the main parameters that decide which
 * movers a customer sees and in what order, public for customers. The same rules belong in the mover
 * terms. Ranking today: the mover's own price, lowest first — nothing else.
 */
export default async function RankingPage({ params }: PageProps<'/[lang]/ranking'>) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getT(lang);
  const [y, m, d] = UPDATED.split('-').map(Number) as [number, number, number];
  const updated = new Intl.DateTimeFormat(INTL_LOCALES[lang], { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(y, m - 1, d));
  const email = OPERATOR.email;

  return (
    <>
      <div className="flex flex-col gap-5 px-3 pt-3 sm:px-5 sm:pt-5">
        <Sheet tone="cream" padding="none" className="overflow-hidden">
          <Nav locale={lang} onHome={false} />
          <header className="px-6 pt-14 pb-12">
            <SectionTitle as="h1" title={t('ranking.title')} subtitle={t('ranking.subtitle')} />
          </header>
        </Sheet>

        <Sheet>
          <article className="mx-auto flex max-w-[720px] flex-col gap-10 text-[16px] leading-relaxed text-ink-700">
            <section aria-labelledby="ranking-who" className="flex flex-col gap-3">
              <h2 id="ranking-who" className="type-display m-0 text-[28px] text-ink-900">
                {t('ranking.whoTitle')}
              </h2>
              <p className="m-0">{t('ranking.whoText')}</p>
              <ul className="m-0 flex list-disc flex-col gap-2 pl-5">
                {WHO.map((key) => (
                  <li key={key}>{t(`ranking.who.${key}`)}</li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="ranking-order" className="flex flex-col gap-3">
              <h2 id="ranking-order" className="type-display m-0 text-[28px] text-ink-900">
                {t('ranking.orderTitle')}
              </h2>
              <p className="m-0">{t('ranking.orderText')}</p>
            </section>

            <section aria-labelledby="ranking-never" className="flex flex-col gap-3">
              <h2 id="ranking-never" className="type-display m-0 text-[28px] text-ink-900">
                {t('ranking.neverTitle')}
              </h2>
              <ul className="m-0 flex list-disc flex-col gap-2 pl-5">
                {NEVER.map((key) => (
                  <li key={key}>{t(`ranking.never.${key}`)}</li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="ranking-reviews" className="flex flex-col gap-3">
              <h2 id="ranking-reviews" className="type-display m-0 text-[28px] text-ink-900">
                {t('ranking.reviewsTitle')}
              </h2>
              <p className="m-0">{t('ranking.reviewsText')}</p>
            </section>

            <footer className="flex flex-col gap-1 border-t border-stone-300 pt-5 text-[14px] text-ink-600">
              <p className="m-0">{t('ranking.updated', { date: updated })}</p>
              {email ? (
                <p className="m-0">
                  {t('ranking.contact')}{' '}
                  <a href={`mailto:${email}`} className="text-ink-900 underline hover:text-ink-600">
                    {email}
                  </a>
                </p>
              ) : null}
            </footer>
          </article>
        </Sheet>
      </div>
      <div className="px-3 sm:px-5">
        <SiteFooter locale={lang} onHome={false} />
      </div>
    </>
  );
}
