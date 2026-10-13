import { useTranslation } from 'react-i18next';
import { Text, View, useWindowDimensions } from 'react-native';

import { Button, Card, Display, Screen, Wordmark, useAnnouncement, useAuth } from '@movershub/mobile';

import { SwitchSideButton } from '../switch-side';
import { QuoteCard } from './quote-card';

/**
 * The customer's home: live prices for any route, from movers' own rate cards, and the way to the
 * mover side. `notice`: a one-time message after signing in (e.g. this email already had a
 * customer account). `canSwitch`: false for admins (their role is set by the platform).
 */
export function CustomerHome({ notice, canSwitch }: { notice: string | null; canSwitch: boolean }) {
  const { t } = useTranslation();
  const { signOut, signingOut } = useAuth();
  const { width } = useWindowDimensions();
  // 40 pt, a little less on narrow phones so "wherever home is." (≈9.3 em) keeps the design's two
  // lines inside Screen's 16-pt gutters — like the website's viewport-based clamp.
  const heroSize = Math.min(40, Math.floor((width - 32) / 9.3));
  useAnnouncement(notice);

  return (
    <Screen>
      <View className="min-h-14 flex-row items-center justify-between">
        <Wordmark />
        <Button
          testID="home-sign-out"
          variant="link"
          title={t('common.signOut')}
          loading={signingOut}
          onPress={() => void signOut()}
        />
      </View>

      {notice ? (
        <Card variant="inset">
          <Text testID="home-notice" className="font-sans text-sm leading-5 text-ink-700">
            {notice}
          </Text>
        </Card>
      ) : null}

      <View className="gap-3">
        <Display size={heroSize}>{t('landing.hero.title')}</Display>
        <Text className="font-sans text-base leading-6 text-ink-600">{t('landing.hero.subtitle')}</Text>
      </View>

      <QuoteCard />

      {canSwitch ? (
        <Card variant="inset" className="gap-3">
          <Text accessibilityRole="header" className="font-sans-medium text-base text-ink-900">
            {t('customer.switchTitle')}
          </Text>
          <Text className="font-sans text-sm leading-5 text-ink-700">{t('customer.switchText')}</Text>
          <SwitchSideButton to="mover" testID="switch-to-mover" />
        </Card>
      ) : null}
    </Screen>
  );
}
