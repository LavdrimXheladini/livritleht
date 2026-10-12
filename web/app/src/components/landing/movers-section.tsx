import type { Locale } from '@movershub/i18n';
import { Button, CardIcon, CheckIcon, PinIcon, SectionTitle, Sheet, VanIcon } from '@movershub/ui/web';

import { getT } from '@/lib/i18n';
import { lines } from '@/lib/rich-text';

import { MoverPhone } from './mover-phone';

const FEATURES = [
  ['rates', VanIcon],
  ['freedom', CheckIcon],
  ['payouts', CardIcon],
  ['corridors', PinIcon],
] as const;

export function MoversSection({ locale }: { locale: Locale }) {
  const t = getT(locale);
  return (
    <Sheet id="movers" className="scroll-mt-5">
      <div className="mx-auto flex max-w-[1080px] flex-wrap items-center gap-14">
        <div className="flex flex-[1_1_min(380px,100%)] flex-col gap-7.5">
          <SectionTitle align="left" title={lines(t('landing.movers.title'))} />
          {FEATURES.map(([key, Icon]) => (
            <div key={key} className="flex gap-3.5">
              <Icon size={20} className="mt-0.5 shrink-0 text-ink-900" />
              <div>
                <div className="text-base font-semibold">{t(`landing.movers.${key}.title`)}</div>
                <div className="mt-1 text-sm leading-normal text-ink-600">{t(`landing.movers.${key}.text`)}</div>
              </div>
            </div>
          ))}
          <Button asChild className="self-start" size="lg">
            <a href="#join">{t('landing.movers.cta')}</a>
          </Button>
        </div>
        <MoverPhone locale={locale} />
      </div>
    </Sheet>
  );
}
