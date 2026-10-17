import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Button, Card, announce, currentLocale, formatClockTime, formatMoveDay, useAnnouncement } from '@movershub/mobile';
import {
  CANCELLABLE_AFTER_ACCEPTANCE,
  MOVER_LATE_FREE_CANCEL_MINUTES,
  cancellationNow,
  cancellationTerms,
  formatMoney,
  freeCancellationUntil,
  localDay,
  type JobRow,
  type JobStatus,
} from '@movershub/shared';

import { useJobStep } from '@/lib/jobs';

import { ExternalLink } from '../external-link';

const AFTER_ACCEPTANCE: readonly JobStatus[] = CANCELLABLE_AFTER_ACCEPTANCE;
const clock = () => Date.now();

/**
 * The time of the first pickup photo: a time, null (there is none), or undefined (not known yet — the
 * photos are loading or couldn't be read). Unknown never counts as "no photo": the cost is then worked
 * out as if there were one, the higher of the two; the server takes no more, and less if the mover was late.
 */
type PhotoTime = string | null | undefined;

/** The move's cancellation under the mover's terms at a moment (null before acceptance or once loaded). */
function costAt(job: JobRow, firstPickupPhotoAt: PhotoTime, at: number) {
  const quote = job.quotes[0];
  const terms = quote ? cancellationTerms(quote) : null;
  if (!quote || !terms) return null;
  return cancellationNow({
    status: job.status,
    scheduledAt: job.scheduled_at,
    moverPrice: quote.mover_price,
    currency: quote.currency,
    terms,
    firstPickupPhotoAt: firstPickupPhotoAt === undefined ? job.scheduled_at : firstPickupPhotoAt,
    now: new Date(at),
  });
}

/** The time now, again at each moment the cost of cancelling can change (the free time ends; the mover is an hour late). */
function useCancelClock(job: JobRow) {
  const [now, setNow] = useState(clock);
  const quote = job.quotes[0];
  const terms = quote ? cancellationTerms(quote) : null;
  const boundaries = terms
    ? [freeCancellationUntil(job.scheduled_at, terms.freeHours).getTime() + 1, Date.parse(job.scheduled_at) + MOVER_LATE_FREE_CANCEL_MINUTES * 60_000]
    : [];
  const next = boundaries.filter((b) => b > now).sort((a, b) => a - b)[0];
  useEffect(() => {
    if (next === undefined) return;
    const timer = setTimeout(() => setNow(clock()), Math.min(Math.max(next - clock(), 0) + 250, 2 ** 31 - 1));
    return () => clearTimeout(timer);
  }, [next]);
  return now;
}

/**
 * What cancelling costs now, under the cancellation card (design/DECISIONS.md #36): free until …, the
 * cost now, or free because the mover is late; from loading on, that the move can't be cancelled in the app.
 */
export function CancelLine({ job, firstPickupPhotoAt, moverName }: { job: JobRow; firstPickupPhotoAt: PhotoTime; moverName: string }) {
  const { t: tj } = useTranslation('job');
  const locale = currentLocale();
  const now = useCancelClock(job);
  if (job.status === 'IN_TRANSIT' || job.status === 'AT_DROPOFF') {
    return (
      <Text testID="move-cancel-line" className="font-sans text-[13.5px] leading-5 text-ink-900">
        {tj('customer.onBoardNote', { name: moverName })}
      </Text>
    );
  }
  // While the photos aren't known after the arrival time, nothing is said about the cost yet.
  const unknown = firstPickupPhotoAt === undefined && now >= Date.parse(job.scheduled_at) + MOVER_LATE_FREE_CANCEL_MINUTES * 60_000;
  const cost = AFTER_ACCEPTANCE.includes(job.status) && !unknown ? costAt(job, firstPickupPhotoAt, now) : null;
  const quote = job.quotes[0];
  if (!cost || !quote) return null;
  const text =
    cost.rule === 'free_period' && quote.cancel_late_pct > 0
      ? tj('customer.cancelFreeUntil', { date: formatMoveDay(localDay(cost.freeUntil), locale), time: formatClockTime(cost.freeUntil.toISOString(), locale) })
      : cost.rule === 'late' && cost.fee > 0
        ? tj('customer.cancelCostsNow', { amount: formatMoney(cost.fee, quote.currency, locale), name: moverName })
        : cost.rule === 'mover_late'
          ? tj('customer.cancelFreeMoverLate', { name: moverName })
          : null;
  if (!text) return null;
  return (
    <Text testID="move-cancel-line" className="font-sans text-[13.5px] leading-5 text-ink-900">
      {text}
    </Text>
  );
}

/**
 * "Cancel this move" (design/DECISIONS.md #28, #35, #36; COMPLIANCE §8): before a mover accepts, free;
 * after, until the things are loaded, under the mover's terms kept with the booking. The cost is shown
 * first and the customer agrees to at most that: the server decides with its own clock and, if it costs
 * more by then, nothing happens and the new cost is shown. Nothing is charged before card payments.
 */
export function CancelMove({
  job,
  firstPickupPhotoAt,
  moverName,
  phone,
}: {
  job: JobRow;
  firstPickupPhotoAt: PhotoTime;
  moverName: string;
  phone: string | null;
}) {
  const { t } = useTranslation();
  const { t: tj } = useTranslation('job');
  const locale = currentLocale();
  const step = useJobStep();
  const quote = job.quotes[0];
  const after = AFTER_ACCEPTANCE.includes(job.status);
  // The cost as shown when the customer asked (kept while they decide), or the server's newer one.
  const [shown, setShown] = useState<{ fee: number; rule: string; freeUntil: Date } | null>(null);
  const [asking, setAsking] = useState(false);
  const [changed, setChanged] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const sending = useRef(false);
  useAnnouncement(problem);
  const money = (fee: number) => formatMoney(fee, quote?.currency ?? 'EUR', locale);
  const now = useCancelClock(job);

  const open = () => {
    setProblem(null);
    setChanged(false);
    const cost = after ? costAt(job, firstPickupPhotoAt, clock()) : null;
    setShown(cost ? { fee: cost.fee, rule: cost.rule, freeUntil: cost.freeUntil } : null);
    setAsking(true);
  };

  // A mover accepted while the question was open: it now asks with the mover's terms.
  const accepted = asking && after && shown === null ? costAt(job, firstPickupPhotoAt, now) : null;
  const current = shown ?? (accepted ? { fee: accepted.fee, rule: accepted.rule, freeUntil: accepted.freeUntil } : null);

  const cancel = async () => {
    if (sending.current) return;
    sending.current = true;
    setProblem(null);
    try {
      const result = await step.mutateAsync({ action: 'cancel', jobId: job.id, ...(current && current.fee > 0 ? { maxFee: current.fee } : {}) });
      if (result.ok) {
        setAsking(false);
        const fee = result.data.fee ?? 0;
        announce(
          fee > 0
            ? tj('customer.cancelledByYouFee', { name: moverName, amount: money(fee), ...nowText(locale) })
            : after
              ? tj('customer.cancelledByYouFree', nowText(locale))
              : t('customer.moves.cancelledNote'),
        );
        return;
      }
      if (result.error === 'fee_changed' && typeof result.body.fee === 'number') {
        // A mover accepted meanwhile, or the free time ended: the new cost, asked again.
        const freeUntil = typeof result.body.freeUntil === 'string' ? new Date(result.body.freeUntil) : (current?.freeUntil ?? new Date(clock()));
        setShown({ fee: result.body.fee, rule: 'late', freeUntil });
        setChanged(true);
        announce(tj('customer.feeChanged', { amount: money(result.body.fee) }));
        return;
      }
      setProblem(
        result.error === 'not_cancellable' ? tj('customer.errors.not_cancellable') : result.error === 'network' ? tj('customer.errors.network') : t('common.errorGeneric'),
      );
    } finally {
      sending.current = false;
    }
  };

  if (!asking) {
    return <Button testID="move-cancel" variant="link" className="-ml-2 self-start" title={t('customer.moves.cancel')} onPress={open} />;
  }
  const fee = current?.fee ?? 0;
  const pct = quote?.cancel_late_pct ?? 0;
  const free = current ? { date: formatMoveDay(localDay(current.freeUntil), locale), time: formatClockTime(current.freeUntil.toISOString(), locale) } : null;
  const text = !current
    ? t('customer.moves.cancelConfirm')
    : fee > 0 && free
      ? tj('customer.cancelConfirmFee', { name: moverName, amount: money(fee), ...free })
      : current.rule === 'mover_late'
        ? tj('customer.cancelConfirmMoverLate', { name: moverName })
        : pct === 0 || !free
          ? tj('customer.cancelConfirmFreeTerms', { name: moverName })
          : tj('customer.cancelConfirmFree', { name: moverName, ...free });
  return (
    <Card variant="widget" className="gap-3">
      {changed ? (
        <Text role="alert" className="font-sans-medium text-[13.5px] leading-5 text-danger">
          {tj('customer.feeChanged', { amount: money(fee) })}
        </Text>
      ) : null}
      <Text testID="move-cancel-text" className="font-sans text-[13.5px] leading-5 text-ink-900">
        {text}
      </Text>
      {/* The mover sees a cancellation only in the app: calling them is one tap away. */}
      {after && phone ? (
        <ExternalLink
          testID="move-cancel-call"
          tone="light"
          href={`tel:${phone.replace(/[^\d+]/g, '')}`}
          title={tj('customer.call', { name: moverName })}
        />
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        <Button
          testID="move-cancel-yes"
          variant="danger"
          size="md"
          title={!current ? t('customer.moves.cancelYes') : fee > 0 ? tj('customer.cancelYesFee', { amount: money(fee) }) : tj('customer.cancelYesFree')}
          loading={step.isPending}
          onPress={() => void cancel()}
        />
        <Button variant="outline" size="md" title={t('customer.moves.cancelKeep')} disabled={step.isPending} onPress={() => setAsking(false)} />
      </View>
      {problem ? (
        <Text role="alert" className="font-sans text-[13px] text-danger">
          {problem}
        </Text>
      ) : null}
    </Card>
  );
}

function nowText(locale: ReturnType<typeof currentLocale>) {
  const at = new Date(clock());
  return { date: formatMoveDay(localDay(at), locale), time: formatClockTime(at.toISOString(), locale) };
}
