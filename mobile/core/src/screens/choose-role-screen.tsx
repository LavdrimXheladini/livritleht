import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import type { SelfSignupRole } from '@movershub/shared';
import { colors } from '@movershub/ui';

import { useAnnouncement } from '../a11y';
import { useAuth } from '../auth-provider';
import { Button } from '../components/ui';
import { rememberRequestedRole } from '../pending-sign-in';
import { useChooseRole } from '../profile';
import { AuthFrame, AuthTitle } from './auth-screen';
import { RoleChoice } from './role-choice';

/**
 * After the first sign-in, an account without a role chooses one (`public.choose_role`; the home
 * screens switch sides later). `preselected`: the role picked on "Create account", saved straight
 * away now that the code has proven the email. If that fails, the person sees the choice again,
 * with Retry and Sign out.
 */
export function ChooseRoleScreen({ preselected }: { preselected: SelfSignupRole | null }) {
  const { t } = useTranslation();
  const { session, signOut, signingOut } = useAuth();
  const choose = useChooseRole();
  // The role picked before the code, as it was when this screen opened (saved once, automatically).
  const [picked] = useState(preselected);
  const [role, setRole] = useState<SelfSignupRole | null>(picked);
  const [attempts, setAttempts] = useState(0);
  const autoSaved = useRef(false);

  const save = (next: SelfSignupRole) => {
    // For the "already has an account" notice: compare with what the person asked for last.
    rememberRequestedRole(next);
    choose.mutate(next);
  };

  useEffect(() => {
    if (picked && !autoSaved.current) {
      autoSaved.current = true;
      rememberRequestedRole(picked);
      choose.mutate(picked);
    }
  }, [picked, choose]);

  const missing = attempts > 0 && role === null ? t('auth.errors.choose_role') : undefined;
  const failed = choose.isError ? t('common.errorGeneric') : null;
  // Read out again on every attempt: each Continue, and each save request that fails.
  useAnnouncement(missing ?? failed, `${attempts}:${choose.submittedAt}`);

  // Saving the role picked before the code: a moment, then the home screen.
  if (picked && attempts === 0 && (choose.isIdle || choose.isPending)) {
    return (
      <View className="flex-1 items-center justify-center bg-stone-100">
        <ActivityIndicator color={colors.brand[500]} accessibilityLabel={t('common.loading')} />
      </View>
    );
  }

  return (
    <AuthFrame>
      <View className="gap-2">
        <AuthTitle>{t('auth.roleLabel')}</AuthTitle>
        {/* Which account this is: "Sign in" with an address that had no account creates one. */}
        <Text className="font-sans text-base text-ink-600">{t('auth.signedInAs', { email: session?.user.email ?? '' })}</Text>
      </View>
      <RoleChoice value={role} onChange={setRole} error={missing} showLabel={false} />
      {failed ? <Text className="font-sans text-sm text-danger">{failed}</Text> : null}
      <Button
        testID="role-continue"
        variant="primary"
        title={t('common.continue')}
        loading={choose.isPending}
        onPress={() => {
          setAttempts((n) => n + 1);
          if (role) save(role);
        }}
      />
      <Button variant="link" title={t('common.signOut')} loading={signingOut} onPress={() => void signOut()} />
    </AuthFrame>
  );
}
