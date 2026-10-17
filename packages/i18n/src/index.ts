import type { InitOptions } from 'i18next';

import { DEFAULT_LOCALE, LOCALES, isLocale, resolveLocale, type Locale } from '@movershub/shared';

import deFile from '../locales/de.json' with { type: 'json' };
import enFile from '../locales/en.json' with { type: 'json' };
import plFile from '../locales/pl.json' with { type: 'json' };
import sqFile from '../locales/sq.json' with { type: 'json' };
import srFile from '../locales/sr.json' with { type: 'json' };

/**
 * Each language file holds everything; the admin page's texts load as their own namespace `admin`, and
 * the app's move-day texts (the mover's steps, photos, cancelling after acceptance) as `job`. Typed keys
 * stay the size the website and the app need: every `t` is checked against the `translation` keys only
 * (too many keys in one union make TypeScript give up, "excessively deep"), and the admin page and the
 * move day ask for their own namespace (getAdminT, useTranslation('admin'), useTranslation('job')).
 */
const { admin: enAdmin, job: enJob, ...enTranslation } = enFile;
const { admin: sqAdmin, job: sqJob, ...sqTranslation } = sqFile;
const { admin: plAdmin, job: plJob, ...plTranslation } = plFile;
const { admin: srAdmin, job: srJob, ...srTranslation } = srFile;
const { admin: deAdmin, job: deJob, ...deTranslation } = deFile;

export const resources = {
  en: { translation: enTranslation, admin: enAdmin, job: enJob },
  sq: { translation: sqTranslation, admin: sqAdmin, job: sqJob },
  pl: { translation: plTranslation, admin: plAdmin, job: plJob },
  sr: { translation: srTranslation, admin: srAdmin, job: srJob },
  de: { translation: deTranslation, admin: deAdmin, job: deJob },
} as const satisfies Record<Locale, { translation: typeof enTranslation; admin: typeof enAdmin; job: typeof enJob }>;

export const NAMESPACES = ['translation', 'admin', 'job'] as const;

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

export * from './legal';
