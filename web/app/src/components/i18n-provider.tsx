'use client';

import { createInstance } from 'i18next';
import { useState, type ReactNode } from 'react';
import { I18nextProvider, initReactI18next } from 'react-i18next';

import { i18nOptions, type Locale } from '@movershub/i18n';

export function I18nProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  const [i18n] = useState(() => {
    const instance = createInstance();
    void instance.use(initReactI18next).init(i18nOptions(locale));
    return instance;
  });
  return <I18nextProvider i18n={i18n}>{children}</I18nextProvider>;
}
