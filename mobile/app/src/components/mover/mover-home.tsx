import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, ScrollView, StatusBar, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  Button,
  DarkPanel,
  Display,
  HomeIcon,
  LanguageButton,
  SignOutIcon,
  UserIcon,
  announce,
  cx,
  useAnnouncement,
  useAuth,
  useSide,
  type IconProps,
} from '@movershub/mobile';
import { colors } from '@movershub/ui';

import { clearJobPhotoQueue, hasPendingPhotos } from '@/lib/job-photos';

import { SwitchSideButton } from '../switch-side';
import { ExampleRequest } from './example-request';
import { SampleDashboard } from './sample-dashboard';
import { SetupChecklist } from './setup-checklist';

type Tab = 'home' | 'account';

/**
 * The mover's home (the dark "Partner" side): a header with who is signed in, the setup checklist and
 * an example job request priced by the live server quote, and a floating tab bar — Home, Account (the
 * way back to the customer side, appeals and complaints, the account's data). `notice`: a one-time
 * message after signing in (e.g. this email already had a mover account).
 */
export function MoverHome({ notice }: { notice: string | null }) {
  const { t } = useTranslation();
  const { t: tj } = useTranslation('job');
  const insets = useSafeAreaInsets();
  const { session, signOut, signingOut } = useAuth();
  const [tab, setTab] = useState<Tab>('home');
  // An admin has no company of their own: they can look at the dashboard of a set-up mover, with sample data.
  const { admin } = useSide();
  const [sample, setSample] = useState(false);
  useAnnouncement(notice);
  // Light status-bar text on the night background — only while this screen is the one in front.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      return () => setFocused(false);
    }, []),
  );
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
  const name = (session?.user.email ?? '').split('@')[0] ?? '';

  return (
    <View className="flex-1 bg-night-900">
      {focused ? <StatusBar barStyle="light-content" /> : null}
      <ScrollView
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
        // Room for the floating tab bar under the last card.
        contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}
      >
        {/* The header: who is signed in, on the Partner side; language and sign out. */}
        <View className="rounded-b-[28px] bg-night-800 px-4 pb-6" style={{ paddingTop: insets.top + 8 }}>
          <View className="min-h-12 flex-row items-center gap-3">
            <View aria-hidden className="size-11 items-center justify-center rounded-full bg-accent-500">
              <Text className="font-sans-semibold text-lg text-ink-900">{name.charAt(0).toUpperCase()}</Text>
            </View>
            <View className="flex-1">
              <Text className="font-sans text-[13px] text-accent-300">{`MoversHub ${t('common.partner')}`}</Text>
              <Text className="font-sans-semibold text-base text-night-50" numberOfLines={1}>
                {name}
              </Text>
            </View>
            <LanguageButton tone="dark" />
            <Pressable
              testID="mover-sign-out"
              accessibilityRole="button"
              accessibilityLabel={t('common.signOut')}
              accessibilityState={{ disabled: signingOut, busy: signingOut }}
              disabled={signingOut}
              onPress={leave}
              className={cx('size-11 items-center justify-center rounded-full bg-night-600 active:bg-night-500', signingOut && 'opacity-60')}
            >
              <SignOutIcon size={20} color={colors.night[50]} />
            </Pressable>
          </View>
          {tab === 'account' ? (
            <Display size={28} tone="dark" className="mt-5">
              {t('account.open')}
            </Display>
          ) : null}
        </View>

        <View className="mt-5 gap-5 px-4">
          {photosPending ? (
            <DarkPanel className="gap-3">
              <Text role="alert" className="font-sans text-sm leading-5 text-night-50">
                {tj('mover.signOutPending')}
              </Text>
              <Button testID="mover-sign-out-anyway" variant="outline-dark" className="self-start" title={tj('mover.signOutAnyway')} loading={signingOut} onPress={leave} />
            </DarkPanel>
          ) : null}

          {tab === 'home' ? (
            <>
              {notice ? (
                <DarkPanel>
                  <Text testID="home-notice" className="font-sans text-sm leading-5 text-night-50">
                    {notice}
                  </Text>
                </DarkPanel>
              ) : null}
              {admin ? (
                <Button
                  testID="sample-dashboard-toggle"
                  variant="accent"
                  title={sample ? t('mover.sample.back') : t('mover.sample.open')}
                  onPress={() => setSample(!sample)}
                />
              ) : null}
              {admin && sample ? (
                <SampleDashboard />
              ) : (
                <>
                  <SetupChecklist />
                  <ExampleRequest />
                </>
              )}
            </>
          ) : (
            <>
              <DarkPanel>
                <Text testID="account-tab-email" className="font-sans-medium text-[15px] text-night-50">
                  {session?.user.email}
                </Text>
              </DarkPanel>
              <DarkPanel className="gap-3">
                <Text accessibilityRole="header" className="font-sans-semibold text-base text-night-50">
                  {t('mover.switchTitle')}
                </Text>
                <SwitchSideButton to="customer" testID="switch-to-customer" dark />
              </DarkPanel>
              {/* Appeal a decision about the account, or complain about anything else (COMPLIANCE §3). */}
              <Button testID="open-appeals" variant="outline-dark" title={t('mover.appeals.title')} onPress={() => router.push('/mover/appeals')} />
              {/* Download the account's data, or delete it (COMPLIANCE §9). */}
              <Button testID="open-account" variant="outline-dark" title={t('account.open')} onPress={() => router.push('/account')} />
            </>
          )}
        </View>
      </ScrollView>
      <TabBar tab={tab} onChange={setTab} />
    </View>
  );
}

const TABS: readonly { tab: Tab; icon: (p: IconProps) => ReactNode }[] = [
  { tab: 'home', icon: HomeIcon },
  { tab: 'account', icon: UserIcon },
];

/** The floating pill at the bottom, in the night palette: Home, Account. */
function TabBar({ tab, onChange }: { tab: Tab; onChange: (tab: Tab) => void }) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  return (
    <View pointerEvents="box-none" className="absolute inset-x-0 items-center" style={{ bottom: Math.max(insets.bottom - 14, 8) }}>
      <View
        accessibilityRole="tablist"
        accessibilityLabel={t('customer.tabs.label')}
        className="flex-row gap-1 rounded-full border border-night-500 bg-night-800 p-1.5 shadow-lift"
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
              className={cx('min-h-12 min-w-[96px] items-center justify-center gap-0.5 rounded-full px-4', on ? 'bg-accent-500' : 'active:bg-night-600')}
            >
              <TabIcon size={20} color={on ? colors.ink[900] : colors.sage[400]} />
              <Text className={cx('text-[11.5px]', on ? 'font-sans-semibold text-ink-900' : 'font-sans-medium text-sage-400')}>
                {t(`customer.tabs.${key}`)}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
