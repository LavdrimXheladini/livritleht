import type { ReactNode } from 'react';

import type { Locale } from '@ranktrip/i18n';
import { Button, Card, Pill, SectionTitle, Sheet, type PillProps } from '@ranktrip/ui/web';

import { getT } from '@/lib/i18n';

// Launch dates per market. COMPLIANCE-TODO: §14 — fill when decided; null shows "Date to be announced".
const MARKET_DATES: Record<'kosovo' | 'albania' | 'poland' | 'diaspora', string | null> = {
  kosovo: null,
  albania: null,
  poland: null,
  diaspora: null,
};

const MAPS: Record<keyof typeof MARKET_DATES, ReactNode> = {
  kosovo: (
    <>
      <path d="M0 120 L290 90 M80 0 L110 170 M0 40 L290 70 M210 0 L190 170" className="stroke-night-600" strokeWidth="6" />
      <circle cx="150" cy="80" r="26" className="fill-accent-500/15" />
      <circle cx="150" cy="80" r="7" className="fill-accent-500" />
    </>
  ),
  albania: (
    <>
      <path d="M0 60 L290 120 M140 0 L120 170 M0 150 L290 20" className="stroke-night-600" strokeWidth="6" />
      <circle cx="90" cy="70" r="6" className="fill-stone-50" />
      <circle cx="200" cy="110" r="6" className="fill-stone-50" />
      <path d="M90 70 Q150 40 200 110" className="stroke-accent-500" strokeWidth="3" fill="none" />
    </>
  ),
  poland: (
    <>
      <path d="M0 100 L290 100 M145 0 L145 170 M0 0 L290 170 M290 0 L0 170" className="stroke-night-600" strokeWidth="5" />
      <circle cx="145" cy="100" r="34" fill="none" className="stroke-accent-500/35" strokeWidth="2" />
      <circle cx="145" cy="100" r="7" className="fill-accent-500" />
    </>
  ),
  diaspora: (
    <>
      <circle cx="50" cy="40" r="6" className="fill-stone-50" />
      <circle cx="90" cy="30" r="6" className="fill-stone-50" />
      <circle cx="130" cy="45" r="6" className="fill-stone-50" />
      <circle cx="240" cy="135" r="7" className="fill-accent-500" />
      <path
        d="M50 40 C120 60 180 100 240 135 M90 30 C150 60 200 100 240 135 M130 45 C170 70 210 110 240 135"
        className="stroke-accent-500/70"
        strokeWidth="2"
        fill="none"
        strokeDasharray="4 5"
      />
    </>
  ),
};

const TONES: Record<keyof typeof MARKET_DATES, PillProps['tone']> = {
  kosovo: 'brand',
  albania: 'neutral',
  poland: 'neutral',
  diaspora: 'accent',
};

export function MarketsSection({ locale }: { locale: Locale }) {
  const t = getT(locale);
  const markets = Object.keys(MARKET_DATES) as (keyof typeof MARKET_DATES)[];

  return (
    <Sheet id="markets" padding="flush" className="scroll-mt-5">
      <SectionTitle className="px-6" title={t('landing.markets.title')} subtitle={t('landing.markets.subtitle')} />
      <div
        role="region"
        aria-label={t('landing.markets.rail')}
        tabIndex={0}
        className="flex snap-x snap-mandatory gap-4 overflow-x-auto px-6 pt-13 pb-3 outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {markets.map((m) => (
          <Card key={m} as="article" variant="outline" lift className="flex w-[290px] shrink-0 snap-start flex-col">
            <div className="relative h-[170px] overflow-hidden rounded-input bg-night-700">
              <svg viewBox="0 0 290 170" className="absolute inset-0 size-full" aria-hidden="true">
                {MAPS[m]}
              </svg>
            </div>
            <div className="flex flex-1 flex-col gap-2 px-2.5 pt-4 pb-2.5">
              <Pill tone={TONES[m]} className="text-[11.5px]">
                {t(`landing.markets.${m}.tag`)}
              </Pill>
              <h3 className="m-0 text-lg font-semibold">{t(`landing.markets.${m}.title`)}</h3>
              <p className="m-0 text-[13.5px] leading-[1.45] text-ink-600">{t(`landing.markets.${m}.text`)}</p>
              <span className="mt-auto text-xs text-ink-500">{MARKET_DATES[m] ?? t('landing.markets.dateTbc')}</span>
            </div>
          </Card>
        ))}
      </div>
      <div className="mt-7 flex flex-wrap justify-center gap-2 px-6">
        <Button asChild>
          <a href="#join">{t('landing.markets.waitlist')}</a>
        </Button>
        <Button asChild variant="secondary">
          <a href="#movers">{t('landing.markets.haveVan')}</a>
        </Button>
      </div>
    </Sheet>
  );
}
