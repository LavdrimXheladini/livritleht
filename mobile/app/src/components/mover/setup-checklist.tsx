import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { documentsStepStatus, vehiclesStepStatus } from '@movershub/shared';
import { BuildingIcon, CardIcon, DarkPanel, Display, DocumentIcon, PinIcon, TagIcon, VanIcon, type PillTone } from '@movershub/mobile';
import { colors } from '@movershub/ui';

import { useMoverCompany } from '@/lib/mover-company';
import { useMoverDocuments } from '@/lib/mover-documents';
import { useVehicles } from '@/lib/vehicles';

import { IconRow } from './icon-row';

// What a mover sets up before taking jobs (COMPLIANCE §5). The company, documents and vans steps are
// built; the others follow one by one ("Coming next").
const LATER_STEPS = [
  ['rates', TagIcon],
  ['payouts', CardIcon],
] as const;

type StepStatus = 'todo' | 'saved' | 'verified' | 'rejected' | 'expiring' | 'expired';
const STATUS_TONE: Record<StepStatus, PillTone> = {
  todo: 'accent',
  saved: 'dark-muted',
  verified: 'dark',
  rejected: 'accent',
  expiring: 'accent',
  expired: 'accent',
};

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
          <DocumentsStep />
          <VehiclesStep />
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

/** "Documents": opens the upload screen; its badge sums up the required documents (none while they load). */
function DocumentsStep() {
  const { t } = useTranslation();
  const company = useMoverCompany();
  const documents = useMoverDocuments(company.data?.id);
  const status: StepStatus | undefined =
    company.data === undefined
      ? undefined
      : company.data === null
        ? 'todo'
        : documents.data === undefined
          ? undefined
          : documentsStepStatus(documents.data, company.data.is_business, new Date());
  return (
    <IconRow
      testID="step-documents"
      icon={DocumentIcon}
      title={t('mover.steps.documents.title')}
      text={t('mover.steps.documents.text')}
      badge={status ? t(`mover.stepStatus.${status}`) : undefined}
      badgeTone={status ? STATUS_TONE[status] : undefined}
      onPress={() => router.push('/mover/documents')}
    />
  );
}

/** "Your vans": opens the list; its badge says whether a van is in use and checked (none while they load). */
function VehiclesStep() {
  const { t } = useTranslation();
  const company = useMoverCompany();
  const vehicles = useVehicles(company.data?.id);
  const status: StepStatus | undefined =
    company.data === undefined
      ? undefined
      : company.data === null
        ? 'todo'
        : vehicles.data === undefined
          ? undefined
          : vehiclesStepStatus(vehicles.data);
  return (
    <IconRow
      testID="step-vehicles"
      icon={VanIcon}
      title={t('mover.steps.vehicles.title')}
      text={t('mover.steps.vehicles.text')}
      badge={status ? t(`mover.stepStatus.${status}`) : undefined}
      badgeTone={status ? STATUS_TONE[status] : undefined}
      onPress={() => router.push('/mover/vehicles')}
    />
  );
}
