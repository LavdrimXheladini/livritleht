import { cacheLife } from 'next/cache';
import Link from 'next/link';

import type { Locale } from '@movershub/i18n';
import { Sheet } from '@movershub/ui/web';

import { getT } from '@/lib/i18n';
import { lines } from '@/lib/rich-text';

import { WaitlistForm } from './waitlist-form';

async function currentYear() {
  'use cache';
  cacheLife('days');
  return new Date().getFullYear();
}

/** The site's footer. `onHome` false (another page): the section links lead to the landing page's sections. */
export async function SiteFooter({ locale, onHome = true }: { locale: Locale; onHome?: boolean }) {
  const t = getT(locale);
  const base = onHome ? '' : `/${locale}`;
  const year = await currentYear();

  return (
    <Sheet as="footer" id="join" tone="brand" corners="top" padding="none" className="mt-5 scroll-mt-5 overflow-hidden px-5 pt-20 pb-8 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-10">
        <div className="flex-[1_1_min(380px,100%)]">
          <h2 className="type-display m-0 text-[clamp(30px,3.6vw,44px)] leading-[1.05]">{lines(t('landing.footer.title'))}</h2>
          <p className="mt-3.5 mb-0 text-[15px] text-sage-400">{t('landing.footer.subtitle')}</p>
        </div>
        <div className="w-full max-w-[480px] flex-[1_1_min(380px,100%)]">
          <WaitlistForm locale={locale} />
        </div>
      </div>
      {/* Sized to the footer's width (container units): the word is ~8× as wide as its font size,
          so 12.3cqi fills ~98% of the width at every screen size without being cut off. */}
      <div aria-hidden="true" className="@container mt-20 mb-8">
        <div className="type-wordmark text-[min(12.3cqi,220px)] leading-[0.8] tracking-[-0.05em] whitespace-nowrap text-brand-400">
          MOVERSHUB
        </div>
      </div>
      <div className="flex flex-wrap justify-between gap-4 border-t border-brand-400 pt-5.5 text-[13px] text-sage-400">
        <span>{t('landing.footer.legal', { year })}</span>
        <span className="flex flex-wrap gap-5.5">
          <a href={`${base}#how`} className="text-sage-400 underline hover:text-night-50">
            {t('landing.nav.how')}
          </a>
          <a href={`${base}#movers`} className="text-sage-400 underline hover:text-night-50">
            {t('landing.nav.movers')}
          </a>
          {/* COMPLIANCE §3: the main ranking parameters, public. */}
          <Link href={`/${locale}/ranking`} className="text-sage-400 underline hover:text-night-50">
            {t('landing.footer.ranking')}
          </Link>
        </span>
      </div>
    </Sheet>
  );
}
