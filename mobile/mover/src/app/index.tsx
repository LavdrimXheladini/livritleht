import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Button, Screen, Wordmark, useAuth } from '@movershub/mobile';

import { ExampleRequest } from '@/components/example-request';
import { PartnerIntro } from '@/components/partner-intro';
import { SetupChecklist } from '@/components/setup-checklist';

/**
 * Home (public, see _layout.tsx): signed out it introduces MoversHub Partner, signed in it is the
 * mover's start page. Both end with an example job request priced by the live server quote.
 */
export default function Home() {
  const { t } = useTranslation();
  const { supabase, session } = useAuth();
  const signIn = () => router.push('/login');

  return (
    <Screen tone="dark">
      {/* Wraps (button below, right-aligned) when a long label does not fit a narrow phone. */}
      <View className="flex-row flex-wrap items-center gap-2">
        <Wordmark tone="dark" partner={t('common.partner')} />
        {/* Copper link (readable on night), at least 44 x 44 pt. */}
        {session ? (
          <Button
            testID="mover-sign-out"
            variant="link-dark"
            className="ml-auto"
            title={t('common.signOut')}
            onPress={() => void supabase.auth.signOut()}
          />
        ) : (
          <Button
            testID="mover-header-sign-in"
            variant="link-dark"
            className="ml-auto"
            title={t('auth.title')}
            onPress={signIn}
          />
        )}
      </View>

      {session ? <SetupChecklist /> : <PartnerIntro onSignIn={signIn} />}
      <ExampleRequest />
    </Screen>
  );
}
