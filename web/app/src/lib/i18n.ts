import { createInstance, type TFunction } from 'i18next';

import { i18nOptions, type Locale } from '@movershub/i18n';

/** Server-side translator. Resources are bundled, so init is synchronous. */
export function getT(locale: Locale): TFunction {
  const instance = createInstance();
  void instance.init(i18nOptions(locale));
  return instance.t;
}
