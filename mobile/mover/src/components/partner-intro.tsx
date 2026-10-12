import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, CardIcon, CheckIcon, Display, PinIcon, TagIcon } from '@ranktrip/mobile';

import { IconRow } from './icon-row';

// The website's "Built for independent movers" section (landing/movers-section.tsx).
const FEATURES = [
  ['rates', TagIcon],
  ['freedom', CheckIcon],
  ['payouts', CardIcon],
  ['corridors', PinIcon],
] as const;

/** Signed out: what Ranktrip Partner offers, then sign in / sign up. */
export function PartnerIntro({ onSignIn }: { onSignIn: () => void }) {
  const { t } = useTranslation();
  return (
    <View className="gap-6">
      {/* 28 pt: the longest word ("Umzugsunternehmen.", de) still fits a 360 dp phone. */}
      <Display size={28} tone="dark">
        {t('landing.movers.title')}
      </Display>
      <View className="gap-5">
        {FEATURES.map(([key, icon]) => (
          <IconRow key={key} icon={icon} title={t(`landing.movers.${key}.title`)} text={t(`landing.movers.${key}.text`)} />
        ))}
      </View>
      <Button testID="mover-sign-in" variant="accent" title={t('mover.signInCta')} onPress={onSignIn} />
    </View>
  );
}
