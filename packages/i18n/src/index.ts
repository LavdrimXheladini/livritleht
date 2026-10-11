import type { InitOptions } from 'i18next';

import { DEFAULT_LOCALE, LOCALES, isLocale, resolveLocale, type Locale } from '@ranktrip/shared';

import de from '../locales/de.json';
import en from '../locales/en.json';
import pl from '../locales/pl.json';
import sq from '../locales/sq.json';
import sr from '../locales/sr.json';

export const resources = {
  en: { translation: en },
  sq: { translation: sq },
  pl: { translation: pl },
  sr: { translation: sr },
  de: { translation: de },
} as const satisfies Record<Locale, { translation: typeof en }>;

declare module 'i18next' {
  interface CustomTypeOptions {
    resources: (typeof resources)['en'];
  }
}

export function i18nOptions(lng: Locale): InitOptions {
  return {
    lng,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...LOCALES],
    resources,
    interpolation: { escapeValue: false }, // React escapes already
    initAsync: false, // resources are bundled — init synchronously
  };
}

export { LOCALES, DEFAULT_LOCALE, isLocale, resolveLocale, type Locale };
