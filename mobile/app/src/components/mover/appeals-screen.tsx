import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button, DarkPanel, Display, Screen, TextField, announce } from '@movershub/mobile';
import { REASON_MAX, appealFormSchema, appealWaiting, canAppeal, formatLocalDay, type AppealRow } from '@movershub/shared';
import { colors } from '@movershub/ui';

import { useComplaints, useDecisions, useSendAppeal } from '@/lib/decisions';
import { useMoverCompany } from '@/lib/mover-company';

import { DecisionCard } from './decisions';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * "Appeals and complaints" (mover side; COMPLIANCE §3, design/DECISIONS.md #32): every decision about
 * the mover's account with MoversHub's reasons, and an appeal of each that still applies; below, a
 * complaint about anything else. A person at MoversHub answers each, with reasons, shown here.
 */
export function AppealsScreen() {
  const { t } = useTranslation();
  const { decision: focus } = useLocalSearchParams<{ decision?: string }>();
  const company = useMoverCompany();
  const decisions = useDecisions();
  const complaints = useComplaints();
  const companyId = company.data?.id;

  const loading = company.isPending || decisions.isPending || complaints.isPending;
  const failed = company.isError || decisions.isError || complaints.isError;

  return (
    <Screen tone="dark">
      <StatusBar style="light" />
      <Button testID="appeals-back" variant="link-dark" className="self-start" title={`‹ ${t('common.back')}`} accessibilityLabel={t('common.back')} onPress={goBack} />
      <View className="gap-2">
        <Display tone="dark">{t('mover.appeals.title')}</Display>
        <Text className="font-sans text-[15px] leading-[22px] text-sage-400">{t('mover.appeals.subtitle')}</Text>
      </View>

      {failed ? (
        <Text className="font-sans text-sm text-danger-on-dark">{t('common.errorGeneric')}</Text>
      ) : loading ? (
        <ActivityIndicator color={colors.accent[300]} />
      ) : !companyId ? (
        <Text testID="appeals-no-company" className="font-sans text-[15px] leading-[22px] text-night-50">
          {t('mover.appeals.noCompany')}
        </Text>
      ) : (
        <>
          {(decisions.data ?? []).length ? (
            <View className="gap-3">
              <Text accessibilityRole="header" className="font-sans-medium text-base text-night-50">
                {t('mover.decisions.title')}
              </Text>
              {(decisions.data ?? []).map((decision) => (
                <DecisionCard key={decision.id} decision={decision}>
                  {canAppeal(decision) ? <AppealForm companyId={companyId} suspensionId={decision.id} autoFocus={focus === decision.id} /> : null}
                </DecisionCard>
              ))}
            </View>
          ) : null}

          <DarkPanel className="gap-3">
            <Text accessibilityRole="header" className="font-sans-semibold text-base text-night-50">
              {t('mover.appeals.complaintTitle')}
            </Text>
            <Text className="font-sans text-[13.5px] leading-5 text-sage-400">{t('mover.appeals.complaintText')}</Text>
            <AppealForm companyId={companyId} suspensionId={null} autoFocus={false} />
          </DarkPanel>

          {(complaints.data ?? []).length ? (
            <View testID="complaints" className="gap-3">
              <Text accessibilityRole="header" className="font-sans-medium text-base text-night-50">
                {t('mover.appeals.yourComplaints')}
              </Text>
              {(complaints.data ?? []).map((complaint) => (
                <Complaint key={complaint.id} complaint={complaint} />
              ))}
            </View>
          ) : null}
        </>
      )}
    </Screen>
  );
}

/** The text of an appeal (`suspensionId`) or of a complaint (null), and sending it. */
function AppealForm({ companyId, suspensionId, autoFocus }: { companyId: string; suspensionId: string | null; autoFocus: boolean }) {
  const { t } = useTranslation();
  const send = useSendAppeal();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const id = suspensionId ?? 'complaint';

  const submit = async () => {
    const parsed = appealFormSchema.safeParse({ text });
    if (!parsed.success) {
      setError(t(`mover.appeals.errors.${parsed.error.issues[0]?.message === 'appeal_too_long' ? 'appeal_too_long' : 'appeal_too_short'}`));
      return;
    }
    let problem: Awaited<ReturnType<typeof send.mutateAsync>>;
    try {
      problem = await send.mutateAsync({ companyId, suspensionId, text: parsed.data.text });
    } catch {
      problem = 'failed';
    }
    if (problem) {
      setError(problem === 'failed' ? t('common.errorGeneric') : t(`mover.appeals.errors.${problem}`));
      return;
    }
    setText('');
    setSent(true);
    announce(t('mover.appeals.sent'));
  };

  return (
    <View className="gap-3">
      <TextField
        testID={`appeal-text-${id}`}
        tone="dark"
        label={suspensionId ? t('mover.appeals.appealLabel') : t('mover.appeals.complaintLabel')}
        hint={t('mover.appeals.hint')}
        multiline
        textAlignVertical="top"
        style={{ minHeight: 120, paddingTop: 12, paddingBottom: 12 }}
        maxLength={REASON_MAX}
        autoFocus={autoFocus}
        value={text}
        onChangeText={(value) => {
          setText(value);
          setError(null);
          setSent(false);
        }}
        error={error ?? undefined}
      />
      <Button
        testID={`appeal-send-${id}`}
        variant="accent"
        size="sm"
        className="self-start"
        title={suspensionId ? t('mover.appeals.sendAppeal') : t('mover.appeals.sendComplaint')}
        loading={send.isPending}
        onPress={() => void submit()}
      />
      {sent ? (
        <Text testID={`appeal-sent-${id}`} className="font-sans text-[13.5px] leading-5 text-night-50">
          {t('mover.appeals.sent')}
        </Text>
      ) : null}
    </View>
  );
}

/** A complaint: when it was sent, what it said, and MoversHub's answer once there is one. */
function Complaint({ complaint }: { complaint: AppealRow }) {
  const { t } = useTranslation();
  return (
    <DarkPanel className="gap-1.5">
      <View testID={`complaint-${complaint.id}`} accessible className="gap-1.5">
        <Text className="font-sans text-[13px] text-sage-400">{t('mover.appeals.sentOn', { date: formatLocalDay(complaint.created_at) })}</Text>
        <Text className="font-sans text-[13.5px] leading-5 text-night-50">“{complaint.text}”</Text>
        <Text testID={`complaint-${complaint.id}-status`} className="font-sans text-[13.5px] leading-5 text-sage-400">
          {appealWaiting(complaint)
            ? t('mover.appeals.waiting')
            : `${t('mover.appeals.answered', { date: formatLocalDay(complaint.resolved_at ?? '') })} “${complaint.decision_reason ?? ''}”`}
        </Text>
      </View>
    </DarkPanel>
  );
}
