import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocales } from 'expo-localization';
import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';

import { i18nOptions, isLocale, resolveLocale, type Locale } from '@movershub/i18n';

/** The language chosen in the app, on this device (a preference, not personal data: kept on sign-out). */
const LOCALE_KEY = 'movershub.locale';

/** The browser version's page language follows the app's, for screen readers and translation tools. */
function syncDocumentLanguage(lng: string) {
  if (typeof document !== 'undefined') document.documentElement.lang = lng;
}

/** Initialise i18next once with the device language. Call at the top of the root layout. */
export function initI18n(): Locale {
  const locale = resolveLocale(getLocales()[0]?.languageTag);
  if (!i18next.isInitialized) {
    void i18next.use(initReactI18next).init(i18nOptions(locale));
    i18next.on('languageChanged', syncDocumentLanguage);
    syncDocumentLanguage(locale);
  }
  return locale;
}

export function currentLocale(): Locale {
  return resolveLocale(i18next.language);
}

/** At launch: the language chosen in the app earlier, if any (else the device's stays). */
export async function restoreLocale(): Promise<void> {
  if (typeof window === 'undefined') return; // Expo web pre-rendering in Node
  try {
    const saved = await AsyncStorage.getItem(LOCALE_KEY);
    if (saved && isLocale(saved) && saved !== i18next.language) await i18next.changeLanguage(saved);
  } catch {
    // The device language stays.
  }
}

/** Switches the app's language now and remembers it on this device. */
export async function setLocale(locale: Locale): Promise<void> {
  await i18next.changeLanguage(locale);
  try {
    await AsyncStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // Only this session then.
  }
}
