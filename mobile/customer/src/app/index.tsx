import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View, useWindowDimensions } from 'react-native';

import { Button, Display, Screen, Wordmark, useAuth } from '@movershub/mobile';

import { QuoteCard } from '@/components/quote-card';

/** Home: live prices for any route. Public like the website — signing in is needed only to book. */
export default function Home() {
  const { t } = useTranslation();
  const { supabase, session } = useAuth();
  const { width } = useWindowDimensions();
  // 40 pt, a little less on narrow phones so "wherever home is." (≈9.3 em) keeps the design's two
  // lines inside Screen's 16-pt gutters — like the website's viewport-based clamp.
  const heroSize = Math.min(40, Math.floor((width - 32) / 9.3));

  return (
    <Screen>
      <View className="min-h-14 flex-row items-center justify-between">
        <Wordmark />
        {session ? (
          <Button testID="home-sign-out" variant="link" title={t('common.signOut')} onPress={() => void supabase.auth.signOut()} />
        ) : (
          <Button testID="home-sign-in" variant="link" title={t('auth.title')} onPress={() => router.push('/login')} />
        )}
      </View>

      <View className="gap-3">
        <Display size={heroSize}>{t('landing.hero.title')}</Display>
        <Text className="font-sans text-base leading-6 text-ink-600">{t('landing.hero.subtitle')}</Text>
      </View>

      <QuoteCard />
    </Screen>
  );
}
