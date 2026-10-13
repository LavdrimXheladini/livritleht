import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { BuildingIcon, CardIcon, DarkPanel, Display, DocumentIcon, PinIcon, TagIcon, VanIcon } from '@movershub/mobile';
import { colors } from '@movershub/ui';

import { IconRow } from './icon-row';

// What a mover sets up before taking jobs (COMPLIANCE §5). Not pressable yet: each step becomes a
// screen with mover onboarding.
const STEPS = [
  ['company', BuildingIcon],
  ['documents', DocumentIcon],
  ['vehicles', VanIcon],
  ['rates', TagIcon],
  ['payouts', CardIcon],
] as const;

/** Signed in: welcome, the setup checklist and when location is shared. */
export function SetupChecklist() {
  const { t } = useTranslation();
  return (
    <View className="gap-5">
      <View className="gap-2">
        <Display tone="dark">{t('mover.homeTitle')}</Display>
        <Text className="font-sans text-[15px] leading-[22px] text-sage-400">{t('mover.homeSubtitle')}</Text>
      </View>
      <DarkPanel className="gap-4">
        <Display size={22} tone="dark">
          {t('mover.checklistTitle')}
        </Display>
        <View accessibilityRole="list" className="gap-4">
          {STEPS.map(([key, icon]) => (
            <IconRow
              key={key}
              icon={icon}
              title={t(`mover.steps.${key}.title`)}
              text={t(`mover.steps.${key}.text`)}
              badge={t('mover.comingSoon')}
            />
          ))}
        </View>
      </DarkPanel>
      <View accessible className="flex-row items-start gap-2.5">
        <PinIcon size={16} color={colors.sage[400]} />
        <Text className="flex-1 font-sans text-[13px] leading-[18px] text-sage-400">{t('mover.trackingNotice')}</Text>
      </View>
    </View>
  );
}
