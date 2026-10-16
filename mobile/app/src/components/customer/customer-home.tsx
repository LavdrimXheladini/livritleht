import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Text, View, useWindowDimensions } from 'react-native';

import { Button, Card, Display, LanguageButton, Screen, Wordmark, useAnnouncement, useAuth } from '@movershub/mobile';
import { routeLabel } from '@movershub/shared';

import { BOOKING_STEPS, firstOpenStep, useBooking } from '../booking/booking-frame';

import { SwitchSideButton } from '../switch-side';
import { UpcomingTerms } from '../terms';
import { MyMoves } from './my-moves';
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
      <View className="min-h-14 flex-row items-center">
        <Wordmark />
        <View className="ml-auto flex-row items-center">
          <LanguageButton />
          <Button
            testID="home-sign-out"
            variant="link"
            title={t('common.signOut')}
            loading={signingOut}
            onPress={() => void signOut()}
          />
        </View>
      </View>

      {notice ? (
        <Card variant="inset">
          <Text testID="home-notice" className="font-sans text-sm leading-5 text-ink-700">
            {notice}
          </Text>
        </Card>
      ) : null}
      {/* New terms coming (design/DECISIONS.md #34) — admins have none. */}
      {canSwitch ? <UpcomingTerms audience="customer" /> : null}

      <View className="gap-3">
        <Display size={heroSize}>{t('landing.hero.title')}</Display>
        <Text className="font-sans text-base leading-6 text-ink-600">{t('landing.hero.subtitle')}</Text>
      </View>

      <CurrentMove />
      <MyMoves />
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

      {/* Download the account's data, or delete it (COMPLIANCE §9). */}
      <Button testID="open-account" variant="link" className="self-center" title={t('account.open')} onPress={() => router.push('/account')} />
    </Screen>
  );
}

/** A move being put together (kept on the device): where it goes, and back to where it was left. */
function CurrentMove() {
  const { t } = useTranslation();
  const { draft } = useBooking();
  if (!draft) return null;
  return (
    <Card variant="inset" className="gap-3">
      <View className="gap-1">
        <Text accessibilityRole="header" className="font-sans-medium text-base text-ink-900">
          {t('booking.current')}
        </Text>
        <Text testID="current-move" className="font-sans text-sm text-ink-700">
          {routeLabel(draft.pickup.place, draft.dropoff.place, (city) => t('landing.quote.withinCity', { city }))}
        </Text>
      </View>
      <Button
        testID="booking-continue"
        variant="outline"
        size="md"
        title={t('booking.continueMove')}
        onPress={() => router.push(BOOKING_STEPS[firstOpenStep(draft)]!)}
      />
    </Card>
  );
}
