import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Button, ChipGroup, announce, formatClockTime, useAnnouncement } from '@movershub/mobile';
import { MOVER_CANCEL_REASONS, resolveLocale, type MoverCancelReason, type MoverJobRow } from '@movershub/shared';

import { useJobStep } from '@/lib/jobs';

type Choice = MoverCancelReason | 'none';

const clock = () => Date.now();

/**
 * "Cancel this job", until the things are loaded (design/DECISIONS.md #36; COMPLIANCE §2, §3): free for
 * the mover, never counted against them, and nobody else is sent — the customer books another mover. A
 * reason is optional and from fixed choices the customer sees; "Nobody is at the pickup" only at the
 * pickup, 15 minutes after the later of the arrival time and their arrival.
 */
export function CancelJob({ row }: { row: MoverJobRow }) {
  const { t: tj, i18n } = useTranslation('job');
  const locale = resolveLocale(i18n.language);
  const step = useJobStep();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Choice>('none');
  const [problem, setProblem] = useState<string | null>(null);
  const sending = useRef(false);
  useAnnouncement(problem);

  // "Nobody is at the pickup" opens at its time while the screen stays open (the clock is state, with a timer).
  const absentFrom = row.status === 'AT_PICKUP' ? row.absent_reason_from : null;
  const fromMs = absentFrom ? Date.parse(absentFrom) : 0;
  const [now, setNow] = useState(clock);
  useEffect(() => {
    if (!fromMs) return;
    const timer = setTimeout(() => setNow(clock()), Math.min(Math.max(fromMs - clock(), 0) + 500, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [fromMs]);
  const absentOpen = absentFrom !== null && fromMs <= now;
  const choices = (['none', ...MOVER_CANCEL_REASONS] as const).filter((r) => r !== 'customer_absent' || absentOpen);

  const send = async () => {
    if (sending.current) return;
    sending.current = true;
    try {
      const result = await step.mutateAsync({ action: 'mover_cancel', jobId: row.job_id, ...(reason === 'none' ? {} : { reason }) });
      if (result.ok) {
        setOpen(false);
        announce(tj('mover.cancelledDone'));
        return;
      }
      const from = typeof result.body.from === 'string' ? result.body.from : null;
      const known = ['not_cancellable', 'job_cancelled', 'invalid_reason', 'reason_too_early', 'network'] as const;
      const key = (known as readonly string[]).includes(result.error) ? (result.error as (typeof known)[number]) : 'network';
      setProblem(tj(`mover.errors.${key}`, from ? { time: formatClockTime(from, locale) } : {}));
    } finally {
      sending.current = false;
    }
  };

  if (!open) {
    return (
      <Button
        testID="mover-job-cancel"
        variant="link-dark"
        className="self-start"
        title={tj('mover.cancel')}
        onPress={() => {
          setProblem(null);
          setNow(clock());
          setOpen(true);
          announce(tj('mover.cancelConfirm'));
        }}
      />
    );
  }
  return (
    <View testID="mover-job-cancel-card" className="gap-3 rounded-panel border border-night-600 p-3.5">
      <Text className="font-sans text-[14px] leading-5 text-night-50">{tj('mover.cancelConfirm')}</Text>
      <ChipGroup<Choice>
        testID="mover-job-cancel-reason"
        variant="dark-pill"
        label={tj('mover.cancelReasonLabel')}
        accessibilityLabel={tj('mover.cancelReasonLabel')}
        value={reason}
        onChange={setReason}
        options={choices.map((r) => ({ value: r, label: tj(`mover.cancelReason.${r}`) }))}
      />
      {absentFrom && !absentOpen ? (
        <Text className="font-sans text-[12.5px] text-sage-400">{tj('mover.absentFrom', { time: formatClockTime(absentFrom, locale) })}</Text>
      ) : null}
      <View className="flex-row flex-wrap gap-2.5">
        <Button testID="mover-job-cancel-keep" variant="outline-dark" className="flex-1" title={tj('mover.cancelKeep')} disabled={step.isPending} onPress={() => setOpen(false)} />
        <Button testID="mover-job-cancel-yes" variant="danger" className="flex-[1.4]" title={tj('mover.cancelYes')} loading={step.isPending} onPress={() => void send()} />
      </View>
      {problem ? (
        <Text role="alert" className="font-sans text-[13px] text-danger-on-dark">
          {problem}
        </Text>
      ) : null}
    </View>
  );
}
