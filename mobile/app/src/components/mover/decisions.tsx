import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Button, DarkPanel, WarningIcon } from '@movershub/mobile';
import { appealsNewestFirst, canAppeal, decisionState, decisionsToShow, formatLocalDay, type DecisionRow } from '@movershub/shared';
import { colors } from '@movershub/ui';

import { useDecisions } from '@/lib/decisions';

/**
 * On the mover's home (COMPLIANCE §3; design/DECISIONS.md #32): a decision about their account that
 * applies or is coming — with MoversHub's reasons and the way to appeal — or one lifted this week.
 */
export function DecisionNotices() {
  const { t } = useTranslation();
  const decisions = useDecisions();
  const shown = decisionsToShow(decisions.data ?? []);
  if (shown.length === 0) return null;
  return (
    <View testID="decisions" className="gap-3">
      {shown.map((decision) => (
        <DecisionCard key={decision.id} decision={decision}>
          {canAppeal(decision) ? (
            <Button
              testID={`decision-${decision.id}-appeal`}
              variant="accent"
              size="sm"
              className="self-start"
              title={decision.mover_appeals.length ? t('mover.decisions.appealAgain') : t('mover.decisions.appeal')}
              onPress={() => router.push({ pathname: '/mover/appeals', params: { decision: decision.id } })}
            />
          ) : null}
        </DecisionCard>
      ))}
    </View>
  );
}

/** One decision: what it is and from when, what it means, the reasons, and where its appeal stands. */
export function DecisionCard({ decision, children }: { decision: DecisionRow; children?: ReactNode }) {
  const { t } = useTranslation();
  const state = decisionState(decision);
  const lifted = state === 'lifted';
  const title =
    state === 'lifted'
      ? t(`mover.decisions.lifted.${decision.kind}`, { date: formatLocalDay(decision.lifted_at ?? '') })
      : state === 'coming'
        ? t(`mover.decisions.coming.${decision.kind}`, { date: formatLocalDay(decision.effective_at ?? '') })
        : t(`mover.decisions.inForce.${decision.kind}`);
  const appeal = appealsNewestFirst(decision)[0];

  return (
    <DarkPanel className="gap-3">
      <View testID={`decision-${decision.id}`} accessible className="flex-row items-start gap-3">
        <WarningIcon size={18} color={lifted ? colors.sage[400] : colors['danger-on-dark']} />
        <View className="flex-1 gap-1.5">
          <Text className="font-sans-semibold text-[15px] text-night-50">{title}</Text>
          {lifted ? null : (
            <Text className="font-sans text-[13.5px] leading-5 text-night-50">
              {t(`mover.decisions.what.${decision.kind}`)}
              {decision.kind === 'termination' && decision.is_serious_violation ? ` ${t('mover.decisions.serious')}` : ''}
            </Text>
          )}
          <Text className="font-sans text-[13px] text-sage-400">{t('mover.decisions.reasons', { date: formatLocalDay(decision.notice_sent_at) })}</Text>
          <Text testID={`decision-${decision.id}-reasons`} className="font-sans text-[13.5px] leading-5 text-night-50">
            “{decision.reason_text}”
          </Text>
          {appeal ? (
            <Text testID={`decision-${decision.id}-appeal-status`} className="font-sans text-[13.5px] leading-5 text-sage-400">
              {appeal.status === 'open' || appeal.status === 'under_review'
                ? t('mover.decisions.appealWaiting', { date: formatLocalDay(appeal.created_at) })
                : `${t(appeal.status === 'upheld' ? 'mover.decisions.appealUpheld' : 'mover.decisions.appealRejected', { date: formatLocalDay(appeal.resolved_at ?? '') })} “${appeal.decision_reason ?? ''}”`}
            </Text>
          ) : null}
        </View>
      </View>
      {children}
    </DarkPanel>
  );
}
