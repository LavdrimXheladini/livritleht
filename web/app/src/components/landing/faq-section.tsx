import type { Locale } from '@ranktrip/i18n';
import { Accordion, AccordionItem, SectionTitle, Sheet } from '@ranktrip/ui/web';

import { getT } from '@/lib/i18n';
import { lines, richText } from '@/lib/rich-text';

const ITEMS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7'] as const;

export function FaqSection({ locale, contactEmail }: { locale: Locale; contactEmail?: string }) {
  const t = getT(locale);
  return (
    <Sheet>
      <div className="mx-auto flex max-w-[1080px] flex-wrap gap-12">
        <div className="flex-[1_1_min(300px,100%)]">
          <SectionTitle align="left" title={lines(t('landing.faq.title'))} />
          <p className="mt-7 mb-0 max-w-[260px] text-sm leading-normal text-ink-600">
            {richText(t('landing.faq.contact'), {
              link: (text) =>
                // COMPLIANCE §8: complaint/contact channel. Without a configured address, show plain text.
                contactEmail ? (
                  <a href={`mailto:${contactEmail}`} className="text-ink-900 underline hover:text-ink-600">
                    {text}
                  </a>
                ) : (
                  text
                ),
            })}
          </p>
        </div>
        <Accordion defaultValue="q1" className="flex-[1.4_1_min(420px,100%)]">
          {ITEMS.map((q) => (
            <AccordionItem key={q} value={q} question={t(`landing.faq.items.${q}.q`)}>
              {t(`landing.faq.items.${q}.a`)}
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </Sheet>
  );
}
