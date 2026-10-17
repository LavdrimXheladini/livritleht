import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Button, DarkPanel, LanguageButton, Screen, Wordmark, announce, useAnnouncement, useAuth } from '@movershub/mobile';

import { clearJobPhotoQueue, hasPendingPhotos } from '@/lib/job-photos';

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
  const { t: tj } = useTranslation('job');
  const { signOut, signingOut } = useAuth();
  useAnnouncement(notice);
  // Photos of a move not sent yet are asked about first: signing out deletes them from the phone.
  const [photosPending, setPhotosPending] = useState(false);
  const leave = () => {
    if (hasPendingPhotos() && !photosPending) {
      setPhotosPending(true);
      announce(tj('mover.signOutPending'));
      return;
    }
    clearJobPhotoQueue();
    void signOut();
  };

  return (
    <Screen tone="dark">
      <StatusBar style="light" />
      {/* Wraps (button below, right-aligned) when a long label does not fit a narrow phone. */}
      <View className="flex-row flex-wrap items-center gap-2">
        <Wordmark tone="dark" partner={t('common.partner')} />
        <View className="ml-auto flex-row items-center">
          <LanguageButton tone="dark" />
          {/* Copper link (readable on night), at least 44 x 44 pt. */}
          <Button
            testID="mover-sign-out"
            variant="link-dark"
            title={t('common.signOut')}
            loading={signingOut}
            onPress={leave}
          />
        </View>
      </View>

      {photosPending ? (
        <DarkPanel className="gap-3">
          <Text role="alert" className="font-sans text-sm leading-5 text-night-50">
            {tj('mover.signOutPending')}
          </Text>
          <Button testID="mover-sign-out-anyway" variant="outline-dark" className="self-start" title={tj('mover.signOutAnyway')} loading={signingOut} onPress={leave} />
        </DarkPanel>
      ) : null}

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

      <View className="items-center">
        {/* Appeal a decision about the account, or complain about anything else (COMPLIANCE §3). */}
        <Button testID="open-appeals" variant="link-dark" title={t('mover.appeals.title')} onPress={() => router.push('/mover/appeals')} />
        {/* Download the account's data, or delete it (COMPLIANCE §9). */}
        <Button testID="open-account" variant="link-dark" title={t('account.open')} onPress={() => router.push('/account')} />
      </View>
    </Screen>
  );
}
