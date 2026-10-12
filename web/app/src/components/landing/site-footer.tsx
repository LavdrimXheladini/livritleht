import { cacheLife } from 'next/cache';

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

export async function SiteFooter({ locale }: { locale: Locale }) {
  const t = getT(locale);
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
      <div
        aria-hidden="true"
        className="type-wordmark mt-20 mb-8 text-[clamp(64px,15vw,220px)] leading-[0.8] tracking-[-0.05em] whitespace-nowrap text-brand-400"
      >
        MOVERSHUB
      </div>
      <div className="flex flex-wrap justify-between gap-4 border-t border-brand-400 pt-5.5 text-[13px] text-sage-400">
        <span>{t('landing.footer.legal', { year })}</span>
        <span className="flex flex-wrap gap-5.5">
          <a href="#how" className="text-sage-400 underline hover:text-night-50">
            {t('landing.nav.how')}
          </a>
          <a href="#movers" className="text-sage-400 underline hover:text-night-50">
            {t('landing.nav.movers')}
          </a>
        </span>
      </div>
    </Sheet>
  );
}
