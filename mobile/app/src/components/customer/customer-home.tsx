import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StatusBar, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  ArrowUpRightIcon,
  Button,
  Card,
  CheckIcon,
  Display,
  HomeIcon,
  LanguageButton,
  ListIcon,
  Pill,
  SignOutIcon,
  UserIcon,
  VanIcon,
  currentLocale,
  cx,
  formatMoveDay,
  useAnnouncement,
  useAuth,
  type IconProps,
} from '@movershub/mobile';
import { jobPlaces, localDay, moveState, routeLabel, type JobRow, type MoveState } from '@movershub/shared';
import { colors } from '@movershub/ui';

import { useMyMoves } from '@/lib/moves';

import { BOOKING_STEPS, firstOpenStep, useBooking } from '../booking/booking-frame';
import { hourText } from '../booking/when-screen';
import { SwitchSideButton } from '../switch-side';
import { UpcomingTerms } from '../terms';
import { MyMoves } from './my-moves';
import { QuoteCard } from './quote-card';

type Tab = 'home' | 'moves' | 'account';

/**
 * The customer's home: a deep-green header (greeting, the move under way or the headline), live prices
 * for any route from movers' own rate cards on a card over its edge, their moves, and a floating tab
 * bar — Home, Moves, Account (the way to the mover side, the account's data). `notice`: a one-time
 * message after signing in (e.g. this email already had a customer account). `admin`: no terms to
 * accept (an admin can look at either side; their role is set by the platform).
 */
export function CustomerHome({ notice, admin }: { notice: string | null; admin: boolean }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('home');
  useAnnouncement(notice);
  // Light status-bar text over the green header — only while this screen is the one in front.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );

  return (
    <View className="flex-1 bg-stone-100">
      {focused ? <StatusBar barStyle="dark-content" /> : null}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        // Room for the floating tab bar under the last card.
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        <Header tab={tab} />
        <View className={cx('gap-5 px-4', tab === 'home' ? '-mt-9' : 'mt-5')}>
          {tab === 'home' ? (
            <>
              {notice ? (
                <Card variant="paper">
                  <Text testID="home-notice" className="font-sans text-sm leading-5 text-ink-700">
                    {notice}
                  </Text>
                </Card>
              ) : null}
              <QuoteCard />
              {/* New terms coming (design/DECISIONS.md #34) — admins have none. */}
              {admin ? null : <UpcomingTerms audience="customer" />}
              <DraftMove />
              <MyMoves strip onViewAll={() => setTab('moves')} />
            </>
          ) : tab === 'moves' ? (
            <>
              <DraftMove />
              <MyMoves emptyText={t('customer.movesNone')} />
            </>
          ) : (
            <Account />
          )}
        </View>
      </ScrollView>
      <TabBar tab={tab} onChange={setTab} />
    </View>
  );
}

const greetingKey = (hour: number) => (hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening');

/** Round button on the sage header. */
const HEADER_BUTTON = 'size-11 items-center justify-center rounded-full bg-sage-300 active:bg-stone-50';

function Header({ tab }: { tab: Tab }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session, signOut, signingOut } = useAuth();
  const email = session?.user.email ?? '';
  const name = email.split('@')[0] ?? '';
  const moves = useMyMoves();
  const current = moves.data?.find((job) => stageOf(moveState(job)) !== null);
  // The headline: 34 pt, a little less on narrow phones so "wherever home is." keeps to two lines.
  const heroSize = Math.min(34, Math.floor((width - 32) / 9.3));

  return (
    <View className={cx('rounded-b-[28px] bg-sage-550 px-4', tab === 'home' ? 'pb-14' : 'pb-6')} style={{ paddingTop: insets.top + 8 }}>
      <View className="min-h-12 flex-row items-center gap-3">
        <View aria-hidden className="size-11 items-center justify-center rounded-full bg-brand-500">
          <Text className="font-sans-semibold text-lg text-stone-50">{name.charAt(0).toUpperCase()}</Text>
        </View>
        <View className="flex-1">
          <Text className="font-sans text-[13px] text-ink-700">{t(`customer.greeting.${greetingKey(new Date().getHours())}`)}</Text>
          <Text className="font-sans-semibold text-base text-ink-900" numberOfLines={1}>
            {name}
          </Text>
        </View>
        <LanguageButton />
        <Pressable
          testID="home-sign-out"
          accessibilityRole="button"
          accessibilityLabel={t('common.signOut')}
          accessibilityState={{ disabled: signingOut, busy: signingOut }}
          disabled={signingOut}
          onPress={() => void signOut()}
          className={cx(HEADER_BUTTON, signingOut && 'opacity-60')}
        >
          <SignOutIcon size={20} color={colors.ink[900]} />
        </Pressable>
      </View>

      {tab !== 'home' ? (
        <Display size={28} className="mt-5">
          {tab === 'moves' ? t('customer.moves.title') : t('account.open')}
        </Display>
      ) : current ? (
        <CurrentMove job={current} />
      ) : (
        <View className="mt-5 gap-2">
          <Display size={heroSize}>
            {t('landing.hero.title')}
          </Display>
          <Text className="font-sans text-[15px] leading-[22px] text-ink-700">{t('landing.hero.subtitle')}</Text>
        </View>
      )}
    </View>
  );
}

/** Where a move stands on the header's line: sent, accepted, under way, done. Null: nothing going on. */
function stageOf(state: MoveState): 0 | 1 | 2 | null {
  if (state === 'BOOKED' || state === 'OFFERED') return 0;
  if (state === 'ACCEPTED') return 1;
  if (state === 'EN_ROUTE_TO_PICKUP' || state === 'AT_PICKUP' || state === 'IN_TRANSIT' || state === 'AT_DROPOFF') return 2;
  return null;
}

/** The move going on, in the header: route, day, where it stands — and the way to its screen. */
function CurrentMove({ job }: { job: JobRow }) {
  const { t } = useTranslation();
  const locale = currentLocale();
  const [pickup, dropoff] = jobPlaces(job);
  const at = new Date(job.scheduled_at);
  const route = routeLabel(pickup, dropoff, (city) => t('landing.quote.withinCity', { city }));
  const state = moveState(job);
  const stage = stageOf(state) ?? 0;
  const status = t(`customer.moves.status.${state}`);
  const when = `${formatMoveDay(localDay(at), locale)}, ${hourText(at.getHours(), at.getMinutes())}`;
  return (
    <View testID="header-move" className="mt-5 gap-3">
      <View className="flex-row items-center gap-3">
        <View className="flex-1 gap-1.5">
          <View className="flex-row flex-wrap items-center gap-2">
            <Text className="font-sans text-[13px] text-ink-700">{t('customer.currentMove')}</Text>
            <Pill size="sm" tone="brand">
              {status}
            </Pill>
          </View>
          <Display size={26}>
            {route}
          </Display>
          <Text className="font-sans text-[13px] text-ink-700">{when}</Text>
        </View>
        <Pressable
          testID="header-move-open"
          accessibilityRole="button"
          accessibilityLabel={`${t('customer.openMove')}: ${route}, ${status}`}
          onPress={() => router.push({ pathname: '/moves/[id]', params: { id: job.id } })}
          className="size-12 items-center justify-center rounded-full bg-brand-500 active:opacity-80"
        >
          <ArrowUpRightIcon size={22} color={colors.stone[50]} />
        </Pressable>
      </View>
      {/* Decorative: the status pill above says the same in words. */}
      <View aria-hidden className="flex-row items-center">
        {[0, 1, 2, 3].map((i) => (
          <View key={i} className={cx('flex-row items-center', i < 3 && 'flex-1')}>
            <View
              className={cx(
                'size-7 items-center justify-center rounded-full',
                i < stage ? 'bg-brand-500' : i === stage ? 'bg-accent-500' : 'border border-brand-400',
              )}
            >
              {i < stage ? <CheckIcon size={14} strokeWidth={2.5} color={colors.stone[50]} /> : null}
              {i === stage ? <VanIcon size={15} color={colors.ink[900]} /> : null}
            </View>
            {i < 3 ? <View className={cx('mx-1.5 h-0.5 flex-1 rounded-full', i < stage ? 'bg-brand-500' : 'bg-brand-300')} /> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

/** A move being put together (kept on the device): where it goes, and back to where it was left. */
function DraftMove() {
  const { t } = useTranslation();
  const { draft } = useBooking();
  if (!draft) return null;
  return (
    <Card variant="paper" className="gap-3">
      <View className="gap-1">
        <Text accessibilityRole="header" className="font-sans-semibold text-base text-ink-900">
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

/** The Account tab: who is signed in, the way to the mover side, and the account's data. */
function Account() {
  const { t } = useTranslation();
  const { session } = useAuth();
  return (
    <>
      <Card variant="paper">
        <Text testID="account-tab-email" className="font-sans-medium text-[15px] text-ink-900">
          {session?.user.email}
        </Text>
      </Card>
      <Card variant="paper" className="gap-3">
        <Text accessibilityRole="header" className="font-sans-semibold text-base text-ink-900">
          {t('customer.switchTitle')}
        </Text>
        <Text className="font-sans text-sm leading-5 text-ink-700">{t('customer.switchText')}</Text>
        <SwitchSideButton to="mover" testID="switch-to-mover" />
      </Card>
      {/* Download the account's data, or delete it (COMPLIANCE §9). */}
      <Button testID="open-account" variant="outline" title={t('account.open')} onPress={() => router.push('/account')} />
    </>
  );
}

const TABS: readonly { tab: Tab; icon: (p: IconProps) => ReactNode }[] = [
  { tab: 'home', icon: HomeIcon },
  { tab: 'moves', icon: ListIcon },
  { tab: 'account', icon: UserIcon },
];

/** The floating pill at the bottom: Home, Moves, Account. */
function TabBar({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" className="absolute inset-x-0 items-center" style={{ bottom: Math.max(insets.bottom - 14, 8) }}>
      <View
        accessibilityRole="tablist"
        accessibilityLabel={t('customer.tabs.label')}
        className="flex-row gap-1 rounded-full border border-stone-300 bg-stone-50 p-1.5 shadow-lift"
      >
        {TABS.map(({ tab: key, icon: TabIcon }) => {
          const on = key === tab;
          return (
            <Pressable
              key={key}
              testID={`tab-${key}`}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(key)}
              className={cx('min-h-12 min-w-[84px] items-center justify-center gap-0.5 rounded-full px-4', on ? 'bg-brand-500' : 'active:bg-stone-200')}
            >
              <TabIcon size={20} color={on ? colors.stone[50] : colors.ink[600]} />
              <Text className={cx('text-[11.5px]', on ? 'font-sans-semibold text-stone-50' : 'font-sans-medium text-ink-600')}>
                {t(`customer.tabs.${key}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
