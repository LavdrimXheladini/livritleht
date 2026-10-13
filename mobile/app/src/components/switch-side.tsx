import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import type { SelfSignupRole } from '@movershub/shared';
import { Button, useAnnouncement, useChooseRole } from '@movershub/mobile';

/**
 * Switches the signed-in person to the other side of the app (`public.choose_role`). Nothing is
 * lost: a mover's company, documents, vans and rates stay. The mover side opens on the setup
 * checklist — job requests come only once the company, documents, vans, rates and payouts are
 * filled in and verified (enforced in the database, public.quotable_vehicles).
 */
export function SwitchSideButton({ to, testID, dark = false }: { to: SelfSignupRole; testID: string; dark?: boolean }) {
  const { t } = useTranslation();
  const choose = useChooseRole();
  const failed = choose.isError ? t('common.errorGeneric') : null;
  useAnnouncement(failed, choose.submittedAt);

  return (
    <View className="gap-2">
      <Button
        testID={testID}
        variant={dark ? 'outline-dark' : 'outline'}
        title={to === 'mover' ? t('customer.switchToMover') : t('mover.switchToCustomer')}
        loading={choose.isPending}
        onPress={() => choose.mutate(to)}
      />
      {failed ? <Text className={dark ? 'font-sans text-[13px] text-danger-on-dark' : 'font-sans text-[13px] text-danger'}>{failed}</Text> : null}
    </View>
  );
}
