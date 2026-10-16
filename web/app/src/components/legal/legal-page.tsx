import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { LEGAL_UPDATED, isLocale, legalDocument, type LegalDocId, type Locale } from '@movershub/i18n';
import { INTL_LOCALES } from '@movershub/shared';
import { SectionTitle, Sheet } from '@movershub/ui/web';

import { Nav } from '@/components/landing/nav';
import { SiteFooter } from '@/components/landing/site-footer';
import { getT } from '@/lib/i18n';

/** Each legal page's title and description (the page's own language). */
export async function legalMetadata(doc: LegalDocId, params: Promise<{ lang: string }>): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const t = getT(lang);
  return { title: `${t(`legal.titles.${doc}`)} · ${t('common.appName')}`, description: legalDocument(doc, lang).text.intro };
}

function formatDay(day: string, locale: Locale) {
  const [y, m, d] = day.split('-').map(Number) as [number, number, number];
  return new Intl.DateTimeFormat(INTL_LOCALES[locale], { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(y, m - 1, d));
}

/**
 * A legal page — privacy policy, terms for customers, terms for movers, contact and legal notice
 * (design/DECISIONS.md #33). The text comes from packages/i18n (the same in the app): a DRAFT until a
 * lawyer has checked it, and in English until it is translated — the page says both in its language.
 */
export async function LegalPage({ doc, params }: { doc: LegalDocId; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const t = getT(lang);
  const { text, locale: textLocale } = legalDocument(doc, lang);

  return (
    <>
      <div className="flex flex-col gap-5 px-3 pt-3 sm:px-5 sm:pt-5">
        <Sheet tone="cream" padding="none" className="overflow-hidden">
          <Nav locale={lang} onHome={false} />
          <header className="px-6 pt-14 pb-12">
            <SectionTitle as="h1" title={t(`legal.titles.${doc}`)} />
          </header>
        </Sheet>

        <Sheet>
          <article className="mx-auto flex max-w-[720px] flex-col gap-8 text-[16px] leading-relaxed text-ink-700">
            <div className="flex flex-col gap-2">
              <p role="note" data-testid="legal-draft" className="m-0 rounded-md bg-accent-200 px-4 py-3 text-[15px] text-ink-900">
                {t('legal.draft')}
              </p>
              {textLocale !== lang ? (
                <p role="note" data-testid="legal-english-only" className="m-0 rounded-md bg-stone-150 px-4 py-3 text-[15px] text-ink-900">
                  {t('legal.englishOnly')}
                </p>
              ) : null}
            </div>

            <div lang={textLocale} className="flex flex-col gap-8">
              <p className="m-0 text-[18px] text-ink-900">{text.intro}</p>

              <nav aria-labelledby="legal-contents" className="flex flex-col gap-2">
                <h2 id="legal-contents" lang={lang} className="m-0 text-[15px] font-semibold text-ink-900">
                  {t('legal.contents')}
                </h2>
                <ol className="m-0 flex list-decimal flex-col gap-1 pl-5 text-[15px]">
                  {text.sections.map((s) => (
                    <li key={s.id}>
                      <a href={`#${s.id}`} className="text-ink-900 underline hover:text-ink-600">
                        {s.heading}
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>

              {text.sections.map((s) => (
                <section key={s.id} id={s.id} aria-labelledby={`${s.id}-heading`} className="flex scroll-mt-5 flex-col gap-3">
                  <h2 id={`${s.id}-heading`} className="type-display m-0 text-[26px] text-ink-900">
                    {s.heading}
                  </h2>
                  {s.blocks.map((block, i) =>
                    typeof block === 'string' ? (
                      <p key={i} className="m-0">
                        {block}
                      </p>
                    ) : 'list' in block ? (
                      <ul key={i} className="m-0 flex list-disc flex-col gap-2 pl-5">
                        {block.list.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    ) : (
                      <p key={i} lang={lang} className="m-0">
                        <Link href={`/${lang}/${block.see}`} className="text-ink-900 underline hover:text-ink-600">
                          {t(`legal.titles.${block.see}`)}
                        </Link>
                      </p>
                    ),
                  )}
                </section>
              ))}
            </div>

            <footer className="border-t border-stone-300 pt-5 text-[14px] text-ink-600">
              <p className="m-0">{t('legal.updated', { date: formatDay(LEGAL_UPDATED, lang) })}</p>
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
