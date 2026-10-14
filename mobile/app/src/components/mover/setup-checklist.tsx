import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { BuildingIcon, CardIcon, DarkPanel, Display, DocumentIcon, PinIcon, TagIcon, VanIcon, type PillTone } from '@movershub/mobile';
import { colors } from '@movershub/ui';

import { useMoverCompany } from '@/lib/mover-company';

import { IconRow } from './icon-row';

// What a mover sets up before taking jobs (COMPLIANCE §5). The company step is built; the others
// follow one by one ("Coming next").
const LATER_STEPS = [
  ['documents', DocumentIcon],
  ['vehicles', VanIcon],
  ['rates', TagIcon],
  ['payouts', CardIcon],
] as const;

type StepStatus = 'todo' | 'saved' | 'verified' | 'rejected';
const STATUS_TONE: Record<StepStatus, PillTone> = { todo: 'accent', saved: 'dark-muted', verified: 'dark', rejected: 'accent' };

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
          <CompanyStep />
          {LATER_STEPS.map(([key, icon]) => (
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

/** "Your company": opens the form; its badge says where it stands (none while it loads). */
function CompanyStep() {
  const { t } = useTranslation();
  const company = useMoverCompany();
  const status: StepStatus | undefined =
    company.data === undefined ? undefined : company.data === null ? 'todo' : company.data.verification_status === 'pending' ? 'saved' : company.data.verification_status;
  return (
    <IconRow
      testID="step-company"
      icon={BuildingIcon}
      title={t('mover.steps.company.title')}
      text={t('mover.steps.company.text')}
      badge={status ? t(`mover.stepStatus.${status}`) : undefined}
      badgeTone={status ? STATUS_TONE[status] : undefined}
      onPress={() => router.push('/mover/company')}
    />
  );
}
