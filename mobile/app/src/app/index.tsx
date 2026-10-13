import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import type { UserRole } from '@movershub/shared';
import {
  Button,
  ChooseRoleScreen,
  Screen,
  pendingSignInFor,
  setPendingSignIn,
  useAnnouncement,
  useAuth,
  useProfile,
} from '@movershub/mobile';
import { colors } from '@movershub/ui';

import { CustomerHome } from '@/components/customer/customer-home';
import { MoverHome } from '@/components/mover/mover-home';

/**
 * Home (signed in only): the customer or the mover side, by the account's role. An account without
 * a role yet (new, or created through "Sign in") chooses it first; later it can switch sides.
 */
export default function Home() {
  const { t } = useTranslation();
  const { session, signOut, signingOut } = useAuth();
  const profile = useProfile();
  const email = session?.user.email;
  const failed = profile.isError && !profile.data;
  useAnnouncement(failed ? t('common.errorGeneric') : null, profile.errorUpdatedAt);

  // A home that has loaded stays, even if a later refresh of the profile fails.
  if (profile.data) {
    const { role } = profile.data;
    return role === null ? (
      <ChooseRoleScreen preselected={pendingSignInFor(email)?.role ?? null} />
    ) : (
      <SignedInHome role={role} email={email} />
    );
  }
  if (failed) {
    return (
      <Screen contentClassName="flex-1 justify-center">
        <Text className="font-sans text-base text-ink-700">{t('common.errorGeneric')}</Text>
        <Button
          testID="profile-retry"
          variant="primary"
          title={t('common.retry')}
          loading={profile.isFetching}
          onPress={() => void profile.refetch()}
        />
        <Button variant="link" title={t('common.signOut')} loading={signingOut} onPress={() => void signOut()} />
      </Screen>
    );
  }
  return (
    <View className="flex-1 items-center justify-center bg-stone-100">
      <ActivityIndicator color={colors.brand[500]} accessibilityLabel={t('common.loading')} />
    </View>
  );
}

function SignedInHome({ role, email }: { role: UserRole; email: string | undefined }) {
  const { t } = useTranslation();
  // Asked for one role (on "Create account" or the chooser) for an email that already had an account
  // of the other kind: the code signed them in to that account. Say so once and point to the switch
  // below — never switch sides without being asked.
  const [notice] = useState(() => {
    const asked = pendingSignInFor(email)?.role;
    if (!asked || asked === role || role === 'admin') return null;
    return role === 'mover' ? t('auth.existingMover') : t('auth.existingCustomer');
  });
  useEffect(() => setPendingSignIn(null), []);
  // After a switch the sign-in notice is done, and the side the person is on now is read out.
  const [firstRole] = useState(role);
  const [switched, setSwitched] = useState(false);
  if (!switched && role !== firstRole) setSwitched(true);
  useAnnouncement(switched ? (role === 'mover' ? t('mover.nowHere') : t('customer.nowHere')) : null);

  const shown = switched ? null : notice;
  return role === 'mover' ? <MoverHome notice={shown} /> : <CustomerHome notice={shown} canSwitch={role !== 'admin'} />;
}
