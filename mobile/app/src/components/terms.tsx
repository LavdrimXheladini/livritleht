import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Button, Card, Checkbox, DarkPanel, Display, Screen, useAuth } from '@movershub/mobile';
import { TERMS_DOC, formatLocalDay, type TermsAudience, type TermsVersionRow } from '@movershub/shared';

import { useAcceptTerms, useTermsStatus } from '@/lib/terms';

const openVersion = (audience: TermsAudience, version: TermsVersionRow) =>
  router.push({ pathname: '/legal/[doc]', params: { doc: TERMS_DOC[audience], version: version.id } });

/**
 * Before anything else, the terms in effect for the person's side (design/DECISIONS.md #34): read
 * them (the published version), tick the box — never ticked for them — and accept. The first time
 * "Before you start"; after a change "New terms", with what changed. Disagreeing: delete the account.
 */
export function AcceptTermsScreen({ audience, version, firstTime }: { audience: TermsAudience; version: TermsVersionRow; firstTime: boolean }) {
  const { t } = useTranslation();
  const { signOut, signingOut } = useAuth();
  const accept = useAcceptTerms();
  const [ticked, setTicked] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dark = audience === 'mover';

  const submit = async () => {
    if (!ticked) {
      setError(t('terms.tickFirst'));
      return;
    }
    try {
      await accept.mutateAsync(version.id);
    } catch {
      setError(t('common.errorGeneric'));
    }
  };

  const text = dark ? 'text-night-50' : 'text-ink-900';
  const link = dark ? 'link-dark' : 'link';
  return (
    <Screen tone={dark ? 'dark' : 'light'}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <Display tone={dark ? 'dark' : 'light'}>{firstTime ? t('terms.acceptTitle') : t('terms.newTitle')}</Display>
      <View testID="accept-terms" className="gap-3">
        <Text className={`font-sans text-base leading-6 ${text}`}>
          {firstTime ? t(`terms.acceptText.${audience}`) : t(`terms.changedText.${audience}`, { version: version.version, date: formatLocalDay(version.effective_at) })}
        </Text>
        {!firstTime && version.summary ? (
          <Text testID="accept-terms-summary" className={`font-sans text-[15px] leading-[22px] ${text}`}>
            {t('terms.whatChanged', { summary: version.summary })}
          </Text>
        ) : null}
        <View className="items-start">
          <Button testID="accept-terms-read" variant={link} className="-ml-2" title={t(`terms.read.${audience}`)} onPress={() => openVersion(audience, version)} />
          <Button
            testID="accept-terms-privacy"
            variant={link}
            className="-ml-2"
            title={t('terms.readPrivacy')}
            onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}
          />
        </View>
        <Checkbox
          testID="accept-terms-tick"
          tone={dark ? 'dark' : 'light'}
          checked={ticked}
          onChange={(next) => {
            setTicked(next);
            setError(null);
          }}
          label={t(`terms.checkbox.${audience}`)}
          error={error ?? undefined}
        />
        <Button testID="accept-terms-accept" variant={dark ? 'accent' : 'primary'} title={t('terms.accept')} loading={accept.isPending} onPress={() => void submit()} />
      </View>
      <View className="items-start gap-1">
        <Text className={`font-sans text-[13.5px] leading-5 ${dark ? 'text-sage-400' : 'text-ink-600'}`}>{t('terms.disagree')}</Text>
        <Button testID="accept-terms-account" variant={link} className="-ml-2" title={t('account.open')} onPress={() => router.push('/account')} />
        <Button variant={link} className="-ml-2" title={t('common.signOut')} loading={signingOut} onPress={() => void signOut()} />
      </View>
    </Screen>
  );
}

/**
 * On the home: new terms published to apply later (design/DECISIONS.md #34) — from when, what
 * changed, read them, accept now; movers are reminded they can leave before then (P2B Art. 3).
 */
export function TermsNotice({ audience, version }: { audience: TermsAudience; version: TermsVersionRow }) {
  const { t } = useTranslation();
  const accept = useAcceptTerms();
  const dark = audience === 'mover';
  const body = (
    <View testID="terms-notice" className="gap-2">
      <Text className={`font-sans-semibold text-[15px] ${dark ? 'text-night-50' : 'text-ink-900'}`}>
        {t(`terms.upcomingTitle.${audience}`, { date: formatLocalDay(version.effective_at) })}
      </Text>
      {version.summary ? (
        <Text className={`font-sans text-[13.5px] leading-5 ${dark ? 'text-night-50' : 'text-ink-700'}`}>{t('terms.whatChanged', { summary: version.summary })}</Text>
      ) : null}
      <Text className={`font-sans text-[13.5px] leading-5 ${dark ? 'text-sage-400' : 'text-ink-600'}`}>{t(`terms.upcomingText.${audience}`)}</Text>
      <View className="flex-row flex-wrap items-center gap-2">
        <Button testID="terms-notice-accept" variant={dark ? 'accent' : 'primary'} size="sm" title={t('terms.acceptNow')} loading={accept.isPending} onPress={() => accept.mutate(version.id)} />
        <Button testID="terms-notice-read" variant={dark ? 'link-dark' : 'link'} title={t('terms.readNew')} onPress={() => openVersion(audience, version)} />
      </View>
      {accept.isError ? <Text className={`font-sans text-[13px] ${dark ? 'text-danger-on-dark' : 'text-danger'}`}>{t('common.errorGeneric')}</Text> : null}
    </View>
  );
  return dark ? <DarkPanel>{body}</DarkPanel> : <Card variant="widget">{body}</Card>;
}

/** The notice of new terms for this side, when some are coming and not accepted yet (else nothing). */
export function UpcomingTerms({ audience }: { audience: TermsAudience }) {
  const { status } = useTermsStatus(audience);
  return status?.upcoming ? <TermsNotice key={status.upcoming.id} audience={audience} version={status.upcoming} /> : null;
}
