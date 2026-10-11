import type { Locale } from '@ranktrip/i18n';
import { SectionTitle, Sheet, StatCard } from '@ranktrip/ui/web';

import { getT } from '@/lib/i18n';

export function WhySection({ locale }: { locale: Locale }) {
  const t = getT(locale);
  const cards = (['pricing', 'tracking', 'payment'] as const).map((k) => ({
    key: k,
    tag: t(`landing.why.${k}.tag`),
    word: t(`landing.why.${k}.word`),
    line: t(`landing.why.${k}.line`),
    note: t(`landing.why.${k}.note`),
  }));

  return (
    <Sheet id="how" tone="sand" className="scroll-mt-5">
      <SectionTitle title={t('landing.why.title')} subtitle={t('landing.why.subtitle')} />
      <div className="mx-auto mt-14 grid max-w-[1000px] grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-4.5">
        {cards.map(({ key, ...card }) => (
          <StatCard key={key} {...card} />
        ))}
      </div>
    </Sheet>
  );
}
