import type { InitOptions } from 'i18next';

import { DEFAULT_LOCALE, LOCALES, isLocale, resolveLocale, type Locale } from '@movershub/shared';

import deFile from '../locales/de.json';
import enFile from '../locales/en.json';
import plFile from '../locales/pl.json';
import sqFile from '../locales/sq.json';
import srFile from '../locales/sr.json';

/**
 * Each language file holds everything; the admin page's texts load as their own namespace `admin`.
 * Typed keys stay the size the website and the app need: every `t` is checked against the
 * `translation` keys only (too many keys in one union make TypeScript give up, "excessively deep"),
 * and the admin page asks for `admin` itself (getAdminT, useTranslation('admin')).
 */
const { admin: enAdmin, ...enTranslation } = enFile;
const { admin: sqAdmin, ...sqTranslation } = sqFile;
const { admin: plAdmin, ...plTranslation } = plFile;
const { admin: srAdmin, ...srTranslation } = srFile;
const { admin: deAdmin, ...deTranslation } = deFile;

export const resources = {
  en: { translation: enTranslation, admin: enAdmin },
  sq: { translation: sqTranslation, admin: sqAdmin },
  pl: { translation: plTranslation, admin: plAdmin },
  sr: { translation: srTranslation, admin: srAdmin },
  de: { translation: deTranslation, admin: deAdmin },
} as const satisfies Record<Locale, { translation: typeof enTranslation; admin: typeof enAdmin }>;

export const NAMESPACES = ['translation', 'admin'] as const;

declare module 'i18next' {
  interface CustomTypeOptions {
    defaultNS: 'translation';
    resources: (typeof resources)['en'];
  }
}

export function i18nOptions(lng: Locale): InitOptions {
  return {
    lng,
    fallbackLng: DEFAULT_LOCALE,
    supportedLngs: [...LOCALES],
    resources,
    ns: [...NAMESPACES],
    defaultNS: 'translation',
    interpolation: { escapeValue: false }, // React escapes already
    initAsync: false, // resources are bundled — init synchronously
  };
}

/** Each language in its own name, for language menus (the website's and the app's). */
export const LOCALE_NAMES: Record<Locale, string> = { en: 'English', sq: 'Shqip', pl: 'Polski', sr: 'Srpski', de: 'Deutsch' };

export { LOCALES, DEFAULT_LOCALE, isLocale, resolveLocale, type Locale };
