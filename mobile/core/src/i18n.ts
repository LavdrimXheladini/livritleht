import { getLocales } from 'expo-localization';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { i18nOptions, resolveLocale, type Locale } from '@ranktrip/i18n';

/** Initialise i18next once with the device language. Call at the top of the root layout. */
export function initI18n(): Locale {
  const locale = resolveLocale(getLocales()[0]?.languageTag);
  if (!i18next.isInitialized) {
    void i18next.use(initReactI18next).init(i18nOptions(locale));
  }
  return locale;
}

export function currentLocale(): Locale {
  return resolveLocale(i18next.language);
}
