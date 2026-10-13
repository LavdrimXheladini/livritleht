import { StatusBar } from 'expo-status-bar';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Button, DarkPanel, Screen, Wordmark, useAnnouncement, useAuth } from '@movershub/mobile';

import { SwitchSideButton } from '../switch-side';
import { ExampleRequest } from './example-request';
import { SetupChecklist } from './setup-checklist';

/**
 * The mover's home (the dark "Partner" side): the setup checklist, an example job request priced by
 * the live server quote, and the way back to the customer side. `notice`: a one-time message after
 * signing in (e.g. this email already had a mover account).
 */
export function MoverHome({ notice }: { notice: string | null }) {
  const { t } = useTranslation();
  const { signOut, signingOut } = useAuth();
  useAnnouncement(notice);

  return (
    <Screen tone="dark">
      <StatusBar style="light" />
      {/* Wraps (button below, right-aligned) when a long label does not fit a narrow phone. */}
      <View className="flex-row flex-wrap items-center gap-2">
        <Wordmark tone="dark" partner={t('common.partner')} />
        {/* Copper link (readable on night), at least 44 x 44 pt. */}
        <Button
          testID="mover-sign-out"
          variant="link-dark"
          className="ml-auto"
          title={t('common.signOut')}
          loading={signingOut}
          onPress={() => void signOut()}
        />
      </View>

      {notice ? (
        <DarkPanel>
          <Text testID="home-notice" className="font-sans text-sm leading-5 text-night-50">
            {notice}
          </Text>
        </DarkPanel>
      ) : null}

      <SetupChecklist />
      <ExampleRequest />

      <View className="gap-3">
        <Text accessibilityRole="header" className="font-sans-medium text-base text-night-50">
          {t('mover.switchTitle')}
        </Text>
        <SwitchSideButton to="customer" testID="switch-to-customer" dark />
      </View>
    </Screen>
  );
}
