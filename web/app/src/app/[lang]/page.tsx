import { notFound } from 'next/navigation';

import { isLocale } from '@ranktrip/i18n';
import { SectionTitle, Sheet } from '@ranktrip/ui/web';

import { FaqSection } from '@/components/landing/faq-section';
import { LandingStateProvider } from '@/components/landing/landing-state';
import { LiveMapDevice } from '@/components/landing/live-map-device';
import { MarketsSection } from '@/components/landing/markets-section';
import { MoversSection } from '@/components/landing/movers-section';
import { Nav } from '@/components/landing/nav';
import { PricingChart } from '@/components/landing/pricing-chart';
import { QuoteWidget } from '@/components/landing/quote-widget';
import { SiteFooter } from '@/components/landing/site-footer';
import { Story } from '@/components/landing/story';
import { WhySection } from '@/components/landing/why-section';
import { getT } from '@/lib/i18n';
import { demoPlace } from '@/lib/geo/types';
import { CHART_MAX_KM, CHART_STEP_KM, CORRIDORS, exampleCurves, sampleQuote } from '@/lib/landing-example';
import { lines } from '@/lib/rich-text';

export default async function HomePage({ params }: PageProps<'/[lang]'>) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getT(lang);
  // Starting quote (design default: Prishtina → Prizren). Sample prices + road route are computed
  // on the server (design/DECISIONS.md #4); later address changes go through the quote action.
  const pickup = demoPlace('prishtina', t('places.prishtina'));
  const dropoff = demoPlace('prizren', t('places.prizren'));
  const initialRoute = await sampleQuote(pickup, dropoff);

  return (
    <LandingStateProvider initialPickup={pickup} initialDropoff={dropoff} initialRoute={initialRoute}>
      <div className="flex flex-col gap-5 px-3 pt-3 sm:px-5 sm:pt-5">
        {/* Hero sheet: nav, headline, quote widget, live map device */}
        <Sheet tone="cream" padding="none" className="overflow-hidden">
          <Nav locale={lang} />
          <header className="px-6 pt-18 pb-10">
            <SectionTitle as="h1" size="hero" title={lines(t('landing.hero.title'))} subtitle={t('landing.hero.subtitle')} />
          </header>
          <section id="quote" aria-label={t('landing.nav.getPrice')} className="scroll-mt-5 px-3 pb-14 sm:px-6">
            <QuoteWidget locale={lang} />
          </section>
          <section id="live" aria-label={t('landing.nav.demo')} className="scroll-mt-5 px-3 pb-6 sm:px-6">
            <LiveMapDevice dashboardHref={`/${lang}/live`} />
          </section>
        </Sheet>

        <WhySection locale={lang} />
        <Story />

        <Sheet>
          <SectionTitle title={lines(t('landing.pricing.title'))} subtitle={t('landing.pricing.subtitle')} />
          <PricingChart
            locale={lang}
            curves={exampleCurves()}
            stepKm={CHART_STEP_KM}
            maxKm={CHART_MAX_KM}
            corridors={CORRIDORS}
          />
        </Sheet>

        <MoversSection locale={lang} />
        <MarketsSection locale={lang} />
        <FaqSection locale={lang} contactEmail={process.env.CONTACT_EMAIL} />
      </div>
      <div className="px-3 sm:px-5">
        <SiteFooter locale={lang} />
      </div>
    </LandingStateProvider>
  );
}
