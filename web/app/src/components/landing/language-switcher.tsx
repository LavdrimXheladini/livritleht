'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { DropdownMenu } from 'radix-ui';

import { LOCALES, LOCALE_NAMES as NAMES, type Locale } from '@movershub/i18n';
import { Button } from '@movershub/ui/web';

/** "EN ▾" — switches the /[lang] segment, keeping the rest of the path. */
export function LanguageSwitcher({ locale, label }: { locale: Locale; label: string }) {
  const pathname = usePathname();
  const rest = pathname.split('/').slice(2).join('/');

  return (
    <DropdownMenu.Root modal={false}>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="md" aria-label={`${label}: ${NAMES[locale]}`} className="px-2">
          {locale.toUpperCase()} <span aria-hidden="true">▾</span>
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-40 rounded-input border border-stone-300 bg-stone-50 p-1.5 font-sans shadow-sheet"
        >
          {LOCALES.map((l) => (
            <DropdownMenu.Item key={l} asChild>
              <Link
                href={`/${l}${rest ? `/${rest}` : ''}`}
                hrefLang={l}
                lang={l}
                aria-current={l === locale ? 'true' : undefined}
                className="flex min-h-10 items-center justify-between gap-6 rounded-md px-3 text-sm text-ink-900 outline-none data-highlighted:bg-stone-200"
              >
                {NAMES[l]}
                <span className="font-mono text-xs text-ink-500">{l.toUpperCase()}</span>
              </Link>
            </DropdownMenu.Item>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
