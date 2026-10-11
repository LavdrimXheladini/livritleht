import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { isLocale } from '@ranktrip/i18n';

import { LiveDashboard } from '@/components/dashboard/live-dashboard';
import { getT } from '@/lib/i18n';
import { liveDemoJobs } from '@/lib/live-demo';

export async function generateMetadata({ params }: PageProps<'/[lang]/live'>): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getT(lang);
  // Demo on simulated data: keep it out of search results.
  return { title: `${t('dashboard.title')} · ${t('common.appName')}`, robots: { index: false } };
}

/**
 * "Live moves" dashboard (design: Tracking.dc.html) on SIMULATED jobs. The real ops view lives
 * under /admin (build order step 9) and customer tracking under /t/[token] (step 7).
 */
export default async function LiveMovesPage({ params }: PageProps<'/[lang]/live'>) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const jobs = await liveDemoJobs(getT(lang));
  return <LiveDashboard locale={lang} jobs={jobs} homeHref={`/${lang}`} />;
}
