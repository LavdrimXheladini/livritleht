import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Button, Card, Display, Screen, TextField, announce, setSignedOutNotice, useAnnouncement, useAuth, useProfile } from '@movershub/mobile';

import { useAccount } from '@/lib/account';

import { LegalLinks } from './legal-screen';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * "Your account" (design/DECISIONS.md #31; COMPLIANCE §9): download a copy of everything MoversHub keeps
 * about the account, or delete it — with the password typed again, and saying plainly what goes. Records
 * the law requires (booked moves, tax, disputes) stop the deletion until they may be removed.
 */
export function AccountScreen() {
  const { t } = useTranslation();
  const { session, signOut } = useAuth();
  const account = useAccount();
  const profile = useProfile();
  const [downloading, setDownloading] = useState(false);
  const [downloadFailed, setDownloadFailed] = useState(false);
  const [password, setPassword] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  useAnnouncement(deleteError);

  const download = async () => {
    setDownloading(true);
    setDownloadFailed(false);
    try {
      setDownloadFailed(!(await account.downloadData()));
    } catch {
      setDownloadFailed(true);
    } finally {
      setDownloading(false);
    }
  };

  const remove = async () => {
    if (!password) {
      setDeleteError(t('auth.errors.password_required'));
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    const result = await account.deleteAccount(password);
    if (result === 'deleted') {
      // Gone on the server: this device forgets it too, and the sign-in screen says so.
      const done = t('account.deleted');
      setSignedOutNotice(done);
      announce(done);
      await signOut();
      return;
    }
    setDeleting(false);
    setDeleteError(
      result === 'wrong_password'
        ? t('account.wrongPassword')
        : result === 'records_kept'
          ? t('account.recordsKept')
          : result === 'admins_only_by_platform'
            ? t('account.adminNo')
            : t('common.errorGeneric'),
    );
  };

  return (
    <Screen>
      <Button testID="account-back" variant="link" className="-ml-2 self-start" title={`‹ ${t('common.back')}`} accessibilityLabel={t('common.back')} onPress={goBack} />
      <View className="gap-2">
        <Display>{t('account.open')}</Display>
        <Text testID="account-email" className="font-sans text-[15px] text-ink-700">
          {t('account.signedInAs', { email: session?.user.email ?? '' })}
        </Text>
      </View>

      <Card variant="widget" className="gap-3">
        <Text accessibilityRole="header" className="font-sans-semibold text-base text-ink-900">
          {t('account.dataTitle')}
        </Text>
        <Text className="font-sans text-[13.5px] leading-5 text-ink-700">{t('account.dataText')}</Text>
        <Button testID="account-download" variant="outline" size="md" title={t('account.download')} loading={downloading} onPress={() => void download()} />
        {downloadFailed ? (
          <Text testID="account-download-error" className="font-sans text-[13px] text-danger">
            {t('account.downloadError')}
          </Text>
        ) : null}
      </Card>

      <Card variant="widget" className="gap-3">
        <Text accessibilityRole="header" className="font-sans-semibold text-base text-ink-900">
          {t('account.deleteTitle')}
        </Text>
        <Text className="font-sans text-[13.5px] leading-5 text-ink-700">{t('account.deleteText')}</Text>
        <TextField
          testID="account-password"
          label={t('auth.passwordLabel')}
          hint={t('account.deleteHint')}
          secureTextEntry
          autoComplete="current-password"
          textContentType="password"
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            setDeleteError(null);
          }}
          error={deleteError ?? undefined}
          announceError={false}
        />
        <Button testID="account-delete" variant="danger" size="md" title={t('account.deleteButton')} loading={deleting} onPress={() => void remove()} />
      </Card>

      <Card variant="widget" className="gap-1">
        <Text accessibilityRole="header" className="font-sans-semibold text-base text-ink-900">
          {t('legal.heading')}
        </Text>
        {/* The terms for this side, the privacy policy and the contact (design/DECISIONS.md #33). */}
        <LegalLinks testID="account-legal" docs={[profile.data?.role === 'mover' ? 'mover-terms' : 'terms', 'privacy', 'contact']} />
      </Card>
    </Screen>
  );
}
