import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Button, DarkPanel, announce, useAnnouncement } from '@movershub/mobile';
import { formatMoney, nextMoverStep, resolveLocale, type JobPhotoRow, type MoverJobRow, type MoverStep } from '@movershub/shared';

import { onArrivalSent, setPendingArrival, stopGateFor, usePendingArrival, useQueuedPhotos } from '@/lib/job-photos';
import { useJobStep } from '@/lib/jobs';

import { dateTime } from './job-parts';
import { SavedPhotos, StopPhotos } from './job-photos';

const ARRIVALS: readonly MoverStep[] = ['AT_PICKUP', 'AT_DROPOFF'];

/**
 * What's next on the move day (design/DECISIONS.md #36): the one step the mover can mark now, asked once
 * more inline before it is sent ("Yes" / "Not yet"); at a stop, its photos first. The server checks it all
 * again: one step at a time, "On my way" from 6 hours before the arrival time, a photo before leaving a
 * stop. If "Arrived" can't reach the server (no connection), the phone keeps it and sends it again — the
 * photos can be taken meanwhile and follow it.
 */
export function NextStep({ row, photos }: { row: MoverJobRow; photos: readonly JobPhotoRow[] }) {
  const { t: tj, i18n } = useTranslation('job');
  const locale = resolveLocale(i18n.language);
  const step = useJobStep();
  const queued = useQueuedPhotos(row.job_id);
  const pending = usePendingArrival(row.job_id);
  const [confirming, setConfirming] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const sending = useRef(false);
  useAnnouncement(problem);

  // While "Arrived" waits for a connection, the move is at that stop on this phone.
  const at = pending ?? row.status;
  const to = nextMoverStep(at);
  const stage = at === 'AT_PICKUP' ? 'pickup' : at === 'AT_DROPOFF' ? 'dropoff' : null;
  const gate = stage ? stopGateFor(photos, queued, stage) : null;

  // "On my way" opens at on_my_way_from: the button turns on by itself then.
  const startsAt = row.status === 'ACCEPTED' && row.on_my_way_from ? Date.parse(row.on_my_way_from) : 0;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startsAt <= now) return;
    const timer = setTimeout(() => {
      setNow(Date.now());
      announce(tj('mover.startsNow'));
    }, Math.min(Math.max(startsAt - Date.now(), 0) + 500, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [startsAt, now, tj]);
  const tooEarly = startsAt > now;

  // Leaving a stop waits for its "Arrived" to reach the server, and for its photos.
  const blocked = tooEarly || pending !== null || (gate !== null && gate.gate !== 'ok');

  // A photo added (or failed) while "Yes" is asked hides the question: the step waits for the photos.
  const asking = confirming && !blocked;

  // Read out when the last photo of the stop is sent (the way on opens), and when a late "Arrived" got through.
  const gateState = gate?.gate ?? null;
  const lastGate = useRef(gateState);
  useEffect(() => {
    if (lastGate.current !== null && lastGate.current !== 'ok' && gateState === 'ok' && to) announce(tj('mover.photos.allSent', { step: tj(`mover.step.${to}`) }));
    lastGate.current = gateState;
  }, [gateState, to, tj]);
  useEffect(
    () =>
      onArrivalSent((jobId, arrived) => {
        if (jobId === row.job_id) announce(tj(`mover.done.${arrived}`));
      }),
    [row.job_id, tj],
  );

  if (!to) return <Ended row={row} photos={photos} />;
  const reason = tooEarly
    ? tj('mover.startsFrom', dateTime(row.on_my_way_from ?? '', locale))
    : gate && gate.gate !== 'ok'
      ? gate.gate === 'need_photo'
        ? tj('mover.photos.needOne')
        : gate.gate === 'uploading'
          ? tj('mover.photos.waitForUpload', { count: gate.pending })
          : tj('mover.photos.fixFailed')
      : null;

  const open = () => {
    setProblem(null);
    setConfirming(true);
    announce(tj(`mover.confirm.${to}`));
  };

  const send = async () => {
    if (sending.current || blocked) return;
    sending.current = true;
    try {
      const result = await step.mutateAsync({ action: 'step', jobId: row.job_id, to });
      setConfirming(false);
      if (result.ok) {
        announce(tj(`mover.done.${to}`));
        return;
      }
      if (result.error === 'network' && ARRIVALS.includes(to)) {
        // Kept on the phone and sent again until it gets through; the stop's photos can be taken now.
        setPendingArrival(row.job_id, to as 'AT_PICKUP' | 'AT_DROPOFF');
        announce(tj('mover.arrivalWaiting'));
        return;
      }
      const from = typeof result.body.from === 'string' ? result.body.from : null;
      const known = ['wrong_step', 'too_early', 'photos_required', 'job_cancelled', 'network'] as const;
      const key = (known as readonly string[]).includes(result.error) ? (result.error as (typeof known)[number]) : null;
      setProblem(key ? tj(`mover.errors.${key}`, from ? dateTime(from, locale) : {}) : tj('mover.errors.network'));
    } finally {
      sending.current = false;
    }
  };

  return (
    <DarkPanel className="gap-4">
      <View testID="mover-job-next" className="gap-3">
        {pending ? (
          <Text testID="mover-job-arrival-waiting" className="font-sans text-[13px] leading-[18px] text-accent-300">
            {tj('mover.arrivalWaiting')}
          </Text>
        ) : null}
        {at === 'EN_ROUTE_TO_PICKUP' ? <Text className="font-sans-medium text-[15px] text-night-50">{tj('mover.nextPickup')}</Text> : null}
        {at === 'IN_TRANSIT' ? (
          <>
            <Text className="font-sans-medium text-[15px] text-night-50">{tj('mover.nextDropoff')}</Text>
            <Text className="font-sans text-[13px] leading-[18px] text-sage-400">{tj('mover.onBoardNote')}</Text>
          </>
        ) : null}
        {stage ? <StopPhotos jobId={row.job_id} stage={stage} rows={photos} queued={queued} waitingForArrival={pending !== null} /> : null}
        {at === 'AT_DROPOFF' ? <SavedPhotos rows={photos} stage="pickup" /> : null}
      </View>

      {asking ? (
        <View className="gap-3 rounded-panel border border-accent-500 p-3">
          <Text className="font-sans text-[14px] leading-5 text-night-50">{tj(`mover.confirm.${to}`)}</Text>
          <View className="flex-row gap-2.5">
            <Button testID="mover-job-confirm-no" variant="outline-dark" className="flex-1" title={tj('mover.confirmNo')} disabled={step.isPending} onPress={() => setConfirming(false)} />
            <Button
              testID="mover-job-confirm-yes"
              variant="accent"
              className="flex-[1.4]"
              title={tj(`mover.confirmYes.${to}`)}
              loading={step.isPending}
              disabled={blocked}
              onPress={() => void send()}
            />
          </View>
        </View>
      ) : (
        <Button
          testID="mover-job-step"
          variant="accent"
          size="lg"
          title={tj(`mover.step.${to}`)}
          disabled={blocked}
          accessibilityHint={reason ?? tj(`mover.hint.${to}`)}
          onPress={open}
        />
      )}
      {reason ? (
        <Text testID={tooEarly ? 'mover-job-start-from' : 'mover-job-photos-gate'} className="font-sans text-[13px] leading-[18px] text-sage-400">
          {reason}
        </Text>
      ) : null}
      {gate?.gate === 'uploading' ? <Text className="font-sans text-[12.5px] text-sage-400">{tj('mover.photos.keepOpen')}</Text> : null}
      {problem ? (
        <Text testID="mover-job-step-problem" role="alert" className="font-sans text-[13px] text-danger-on-dark">
          {problem}
        </Text>
      ) : null}
    </DarkPanel>
  );
}

/** Done or cancelled: how it ended; once done, the photos stay to look at. */
function Ended({ row, photos }: { row: MoverJobRow; photos: readonly JobPhotoRow[] }) {
  const { t: tj, i18n } = useTranslation('job');
  const locale = resolveLocale(i18n.language);
  if (row.status === 'COMPLETED') {
    return (
      <DarkPanel className="gap-3">
        <View testID="mover-job-ended" className="gap-2">
          {row.ended_at ? <Text className="font-sans text-[14px] leading-5 text-night-50">{tj('mover.doneNote', dateTime(row.ended_at, locale))}</Text> : null}
          {row.confirmed_at ? <Text className="font-sans text-[14px] leading-5 text-night-50">{tj('mover.confirmedNote', dateTime(row.confirmed_at, locale))}</Text> : null}
          <Text className="font-sans text-[13px] leading-[18px] text-sage-400">{tj('mover.payoutLater')}</Text>
        </View>
        <SavedPhotos rows={photos} stage="pickup" />
        <SavedPhotos rows={photos} stage="dropoff" />
      </DarkPanel>
    );
  }
  // Cancelled: by the mover, or by the customer under the mover's terms (the rule that set the charge).
  const at = dateTime(row.ended_at ?? row.last_event_at ?? row.scheduled_at, locale);
  const text =
    row.cancelled_by === 'mover'
      ? tj('mover.cancelledByYou', at)
      : row.fee_rule === 'late'
        ? tj('mover.cancelledByCustomerFee', { ...at, amount: formatMoney(row.cancellation_fee ?? 0, row.currency, locale) })
        : row.fee_rule === 'terms_free'
          ? tj('mover.cancelledByCustomerTermsFree', at)
          : row.fee_rule === 'mover_late'
            ? tj('mover.cancelledByCustomerMoverLate', at)
            : tj('mover.cancelledByCustomerFree', at);
  return (
    <DarkPanel className="gap-2">
      <View testID="mover-job-ended" className="gap-2">
        <Text className="font-sans text-[14px] leading-5 text-night-50">{text}</Text>
        <Text className="font-sans text-[13px] leading-[18px] text-sage-400">{tj('mover.addressesHidden')}</Text>
      </View>
    </DarkPanel>
  );
}
