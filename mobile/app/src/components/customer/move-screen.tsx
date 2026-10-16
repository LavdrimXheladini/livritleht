import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button, Card, Display, Pill, Screen, announce, currentLocale, formatClockTime, formatMoveDay, startBooking, useAnnouncement, useAuth } from '@movershub/mobile';
import {
  ITEM_CATALOGUE,
  cancellationTerms,
  formatMoney,
  formatNumber,
  localDay,
  moveState,
  safeDraftFromJob,
  type JobRow,
  type MoveState,
} from '@movershub/shared';
import { colors } from '@movershub/ui';

import { useJobStep } from '@/lib/jobs';
import { useMyMoves } from '@/lib/moves';

import { BOOKING_STEPS, firstOpenStep } from '../booking/booking-frame';
import { useCancellationText } from '../booking/cancellation';
import { PriceLines } from '../booking/movers-screen';
import { MoverCard, Row } from '../booking/review-screen';
import { MoveSummary } from '../booking/size-screen';
import { QUIET_STATES } from './my-moves';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/**
 * One of the customer's moves (`/moves/[id]`, design/DECISIONS.md #28): where it stands, the move
 * (route, day, people, addresses with directions, things), whom the contract is with as the customer
 * saw them (COMPLIANCE §4), the price as last checked and the mover's cancellation terms. A request
 * not booked yet can be continued: it becomes the move being put together, reviewed again. Booked, it
 * says whether the mover has answered (#35); declined or unanswered, the customer chooses another
 * mover; until a mover accepts, it can be cancelled for free.
 */
export function MoveScreen({ id }: { id: string | undefined }) {
  const { t } = useTranslation();
  const moves = useMyMoves();
  const job = moves.data?.find((j) => j.id === id);

  return (
    <Screen>
      <Button testID="move-back" variant="link" className="-ml-2 self-start" title={`‹ ${t('common.back')}`} accessibilityLabel={t('common.back')} onPress={goBack} />
      <Display>{t('customer.moves.detailTitle')}</Display>
      {job ? (
        <Move job={job} />
      ) : moves.isError ? (
        <View className="items-start gap-3">
          <Text className="font-sans text-sm text-ink-700">{t('common.errorGeneric')}</Text>
          <Button variant="outline" size="md" title={t('common.retry')} loading={moves.isFetching} onPress={() => void moves.refetch()} />
        </View>
      ) : moves.isPending ? (
        <ActivityIndicator color={colors.brand[500]} accessibilityLabel={t('common.loading')} />
      ) : (
        <Text testID="move-not-found" className="font-sans text-sm text-ink-700">
          {t('customer.moves.notFound')}
        </Text>
      )}
    </Screen>
  );
}

function Move({ job }: { job: JobRow }) {
  const { t } = useTranslation();
  const locale = currentLocale();
  const { session } = useAuth();
  const describeCancellation = useCancellationText();
  const draft = safeDraftFromJob(job);
  const quote = job.quotes[0];
  const terms = quote ? cancellationTerms(quote) : null;
  const money = (cents: number) => formatMoney(cents, quote?.currency ?? 'EUR', locale);
  const checked = quote ? new Date(quote.created_at) : null;

  const state = moveState(job);
  const offer = job.job_offers[0];
  const moverName = quote?.mover?.name ?? '';
  // The mover said no or didn't answer: the same move, another mover (nobody is assigned automatically).
  const another = state === 'DECLINED' || state === 'EXPIRED';

  const continueBooking = () => {
    if (!draft || !session) return;
    const next = another ? { ...draft, choice: null } : draft;
    startBooking(session.user.id, next);
    router.push(BOOKING_STEPS[firstOpenStep(next)]!);
  };

  const note =
    state === 'QUOTED'
      ? t('customer.moves.quotedNote')
      : state === 'OFFERED' && offer
        ? t('customer.moves.offeredNote', {
            name: moverName,
            date: formatMoveDay(localDay(new Date(offer.expires_at)), locale),
            time: formatClockTime(offer.expires_at, locale),
          })
        : state === 'ACCEPTED'
          ? t('customer.moves.acceptedNote', { name: moverName })
          : state === 'DECLINED'
            ? t('customer.moves.declinedNote', { name: moverName })
            : state === 'EXPIRED'
              ? t('customer.moves.expiredNote', { name: moverName })
              : state === 'CANCELLED'
                ? t('customer.moves.cancelledNote')
                : null;

  return (
    <>
      <View className="gap-2">
        <View className="self-start">
          <Pill tone={QUIET_STATES.includes(state) ? 'neutral' : 'brand'}>{t(`customer.moves.status.${state}`)}</Pill>
        </View>
        {note ? (
          <Text testID="move-state-note" className="font-sans text-[13.5px] leading-5 text-ink-700">
            {note}
          </Text>
        ) : null}
      </View>

      {draft ? <MoveSummary draft={draft} testIDPrefix="move-summary" /> : null}

      <Card variant="widget" className="gap-3">
        <Text accessibilityRole="header" className="font-sans-semibold text-base text-ink-900">
          {t('customer.moves.stopsTitle')}
        </Text>
        <Stop label={t('landing.quote.pickup')} place={job.pickup_label} details={job.pickup_details} floor={job.pickup_floor} lift={job.pickup_has_lift} testID="move-pickup" />
        <Stop label={t('landing.quote.dropoff')} place={job.dropoff_label} details={job.dropoff_details} floor={job.dropoff_floor} lift={job.dropoff_has_lift} testID="move-dropoff" />
      </Card>

      <Card variant="widget" className="gap-2">
        <Text accessibilityRole="header" className="font-sans-semibold text-base text-ink-900">
          {t('customer.moves.itemsTitle')}
        </Text>
        <View testID="move-items" className="gap-1">
          {job.items.map((it) => (
            <Text key={it.key} className="font-sans text-[13.5px] leading-5 text-ink-700">
              {`${t(`items.${it.key}`)} × ${formatNumber(it.qty, locale)}`}
              {it.assembly && ITEM_CATALOGUE[it.key].assemblable ? ` · ${t('booking.items.assembly')}` : ''}
            </Text>
          ))}
        </View>
      </Card>

      {quote?.mover ? (
        <>
          <Card variant="inset">
            <Text testID="move-contract" className="font-sans-semibold text-[15px] leading-[22px] text-ink-900">
              {t('booking.review.contract', { name: quote.mover.name })}
            </Text>
          </Card>
          <MoverCard mover={quote.mover} testIDPrefix="move" />
        </>
      ) : null}

      {quote && checked ? (
        <Card variant="widget" className="gap-3">
          <Text accessibilityRole="header" className="font-sans-semibold text-base text-ink-900">
            {t('booking.review.priceTitle')}
          </Text>
          <PriceLines lines={quote.line_items} currency={quote.currency} locale={locale} testID="move-lines" />
          <Row label={t('booking.movers.moverPrice')} value={money(quote.mover_price)} testID="move-mover-price" strong />
          <Row label={t('booking.review.fee')} value={quote.booking_fee === null ? t('booking.review.feeTba') : money(quote.booking_fee)} />
          {job.status === 'QUOTED' ? (
            <Text testID="move-price-checked" className="font-sans text-[13px] leading-[19px] text-ink-600">
              {t('customer.moves.priceChecked', {
                date: formatMoveDay(localDay(checked), locale, { long: true }),
                time: formatClockTime(quote.created_at, locale),
              })}
            </Text>
          ) : null}
        </Card>
      ) : null}

      {terms ? (
        <Card variant="widget" className="gap-2">
          <Text accessibilityRole="header" className="font-sans-semibold text-base text-ink-900">
            {t('booking.review.cancelTitle')}
          </Text>
          <Text testID="move-cancellation" className="font-sans text-[13.5px] leading-5 text-ink-700">
            {describeCancellation(terms)}
          </Text>
        </Card>
      ) : null}

      {(state === 'QUOTED' || another) && draft ? (
        <Button testID="move-continue" title={another ? t('booking.review.chooseAnother') : t('booking.continueMove')} onPress={continueBooking} />
      ) : null}
      {CANCELLABLE.includes(state) ? <CancelMove jobId={job.id} /> : null}
    </>
  );
}

/** Until a mover has accepted, the customer cancels for free (after that: the mover's terms — build step 6). */
const CANCELLABLE: readonly MoveState[] = ['QUOTED', 'OFFERED', 'DECLINED', 'EXPIRED'];

/** "Cancel this move": asked once more, then done; nothing is charged. */
function CancelMove({ jobId }: { jobId: string }) {
  const { t } = useTranslation();
  const step = useJobStep();
  const [asking, setAsking] = useState(false);
  const [failed, setFailed] = useState(false);
  useAnnouncement(failed ? t('common.errorGeneric') : null);

  const cancel = async () => {
    setFailed(false);
    const result = await step.mutateAsync({ action: 'cancel', jobId });
    if (result.ok) {
      announce(t('customer.moves.cancelledNote'));
      setAsking(false);
    } else setFailed(true);
  };

  if (!asking) {
    return <Button testID="move-cancel" variant="link" className="-ml-2 self-start" title={t('customer.moves.cancel')} onPress={() => setAsking(true)} />;
  }
  return (
    <Card variant="widget" className="gap-3">
      <Text className="font-sans text-[13.5px] leading-5 text-ink-900">{t('customer.moves.cancelConfirm')}</Text>
      <View className="flex-row flex-wrap gap-2">
        <Button testID="move-cancel-yes" variant="danger" size="md" title={t('customer.moves.cancelYes')} loading={step.isPending} onPress={() => void cancel()} />
        <Button variant="outline" size="md" title={t('customer.moves.cancelKeep')} onPress={() => setAsking(false)} />
      </View>
      {failed ? <Text className="font-sans text-[13px] text-danger">{t('common.errorGeneric')}</Text> : null}
    </Card>
  );
}

function Stop({ label, place, details, floor, lift, testID }: { label: string; place: string; details: string; floor: number; lift: boolean; testID: string }) {
  const { t } = useTranslation();
  const level = floor === 0 ? t('booking.stops.ground') : `${t('booking.stops.floorN', { n: floor })} · ${lift ? t('booking.stops.liftYes') : t('booking.stops.liftNo')}`;
  return (
    <View testID={testID} className="gap-0.5">
      <Text className="font-sans text-[12.5px] text-ink-600">{label}</Text>
      <Text className="font-sans-medium text-[15px] text-ink-900">{place}</Text>
      {details ? <Text className="font-sans text-[13px] text-ink-700">{details}</Text> : null}
      <Text className="font-sans text-[13px] text-ink-600">{level}</Text>
    </View>
  );
}
