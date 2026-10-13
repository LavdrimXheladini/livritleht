import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import type { UserRole } from '@movershub/shared';
import type { CodePurpose } from '@movershub/mobile';
import {
  Button,
  ChooseRoleScreen,
  PasswordScreen,
  Screen,
  passwordOwedBy,
  pendingSignInFor,
  setPendingSignIn,
  settlePassword,
  useAnnouncement,
  useAuth,
  useProfile,
} from '@movershub/mobile';
import { colors } from '@movershub/ui';

import { CustomerHome } from '@/components/customer/customer-home';
import { MoverHome } from '@/components/mover/mover-home';

/**
 * Home (signed in only): the customer or the mover side, by the account's role. Before that, an
 * account signed in by a code chooses its password, and an account without a role yet chooses it;
 * later it can switch sides.
 */
export default function Home() {
  const { t } = useTranslation();
  const { session, signOut, signingOut } = useAuth();
  const profile = useProfile();
  const email = session?.user.email;
  // Signed in by a code (to confirm a new account, after "Forgot password?", or "Create account" with an
  // address that already had an account): a password before anything else — also after a restart.
  const [owes, setOwes] = useState<CodePurpose | null>(() => pendingSignInFor(email)?.purpose ?? passwordOwedBy(email));
  const failed = profile.isError && !profile.data;
  useAnnouncement(failed && !owes ? t('common.errorGeneric') : null, profile.errorUpdatedAt);

  if (owes) {
    return (
      <PasswordScreen
        purpose={owes === 'recovery' ? 'reset' : 'create'}
        onSaved={() => {
          settlePassword();
          // The role picked on "Create account" is still needed next; a reset has nothing more.
          if (owes === 'recovery') setPendingSignIn(null);
          setOwes(null);
        }}
      />
    );
  }

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
