import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Button, Card, announce, currentLocale, formatClockTime, formatMoveDay, useAnnouncement } from '@movershub/mobile';
import { localDay, type JobRow } from '@movershub/shared';

import { useJobStep } from '@/lib/jobs';

/**
 * Once the mover marked the move done (design/DECISIONS.md #36): the customer can confirm it — once card
 * payments start, that will release the mover's payout; it never takes away the right to report damage
 * or loss (COMPLIANCE §7, §8). Below it, what to do about damage: tell the mover and MoversHub, as the
 * customer terms say.
 */
export function ConfirmMove({ job, confirmedAt, moverName }: { job: JobRow; confirmedAt: string | null; moverName: string }) {
  const { t } = useTranslation();
  const { t: tj } = useTranslation('job');
  const locale = currentLocale();
  const step = useJobStep();
  const [problem, setProblem] = useState<string | null>(null);
  const sending = useRef(false);
  useAnnouncement(problem);
  const at = (iso: string) => ({ date: formatMoveDay(localDay(new Date(iso)), locale), time: formatClockTime(iso, locale) });

  const confirm = async () => {
    if (sending.current) return;
    sending.current = true;
    setProblem(null);
    try {
      const result = await step.mutateAsync({ action: 'confirm', jobId: job.id });
      if (result.ok && result.data.confirmedAt) announce(tj('customer.confirmedNote', at(result.data.confirmedAt)));
      else if (!result.ok)
        setProblem(result.error === 'not_confirmable' ? tj('customer.errors.not_confirmable') : result.error === 'network' ? tj('customer.errors.network') : t('common.errorGeneric'));
    } finally {
      sending.current = false;
    }
  };

  return (
    <>
      <Card variant="widget" className="gap-3">
        {confirmedAt ? (
          <Text testID="move-confirmed" className="font-sans text-[13.5px] leading-5 text-ink-900">
            {tj('customer.confirmedNote', at(confirmedAt))}
          </Text>
        ) : (
          <>
            <Text accessibilityRole="header" className="font-sans-semibold text-base text-ink-900">
              {tj('customer.confirmTitle')}
            </Text>
            <Button testID="move-confirm" title={tj('customer.confirm')} loading={step.isPending} onPress={() => void confirm()} />
            <Text className="font-sans text-[12.5px] leading-[18px] text-ink-600">{tj('customer.confirmNote', { name: moverName })}</Text>
          </>
        )}
        {problem ? (
          <Text role="alert" className="font-sans text-[13px] text-danger">
            {problem}
          </Text>
        ) : null}
      </Card>
      <View testID="move-problem" className="gap-1">
        <Text className="font-sans text-[13px] leading-[19px] text-ink-700">{tj('customer.problemNote', { name: moverName })}</Text>
        <Button testID="move-contact" variant="link" className="-ml-2 self-start" title={tj('customer.contact')} onPress={() => router.push('/legal/contact')} />
      </View>
    </>
  );
}
