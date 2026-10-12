import Link from 'next/link';

import type { Locale } from '@movershub/i18n';
import { Button, LogoMark } from '@movershub/ui/web';

import { getT } from '@/lib/i18n';

import { LanguageSwitcher } from './language-switcher';

export function Nav({ locale }: { locale: Locale }) {
  const t = getT(locale);
  const links = [
    ['#how', t('landing.nav.how')],
    ['#movers', t('landing.nav.movers')],
    ['#markets', t('landing.nav.markets')],
    ['#live', t('landing.nav.demo')],
  ] as const;

  return (
    <nav aria-label={t('landing.nav.main')} className="flex items-center justify-between gap-4 px-5 py-5.5 sm:px-8">
      <div className="hidden flex-[1_1_200px] flex-wrap items-center gap-7 text-sm md:flex">
        {links.map(([href, label]) => (
          <a key={href} href={href} className="text-ink-900 no-underline hover:text-ink-600">
            {label}
          </a>
        ))}
      </div>
      <Link
        href={`/${locale}`}
        aria-label={t('landing.nav.home')}
        className="flex flex-col items-center gap-0.75 text-ink-900 no-underline md:flex-none"
      >
        <LogoMark />
        <span className="type-wordmark text-[11px]">MOVERSHUB</span>
      </Link>
      <div className="flex flex-[1_1_200px] items-center justify-end gap-2.5">
        <LanguageSwitcher locale={locale} label={t('landing.nav.language')} />
        <Button asChild size="md">
          <a href="#quote">{t('landing.nav.getPrice')}</a>
        </Button>
      </div>
    </nav>
  );
}
