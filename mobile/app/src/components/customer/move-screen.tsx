import { useQueryClient } from '@tanstack/react-query';
import { router, useIsFocused } from 'expo-router';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button, Card, Display, Pill, Screen, announce, currentLocale, formatClockTime, formatMoveDay, startBooking, useAuth } from '@movershub/mobile';
import {
  CANCELLABLE_AFTER_ACCEPTANCE,
  ITEM_CATALOGUE,
  cancellationTerms,
  formatMoney,
  formatNumber,
  jobDay,
  localDay,
  moveState,
  safeDraftFromJob,
  type JobDay,
  type JobRow,
  type JobStatus,
  type MoveState,
} from '@movershub/shared';
import { colors } from '@movershub/ui';

import { jobPhotosKey, useJobPhotos } from '@/lib/job-photos';
import { useMyMoves } from '@/lib/moves';

import { BOOKING_STEPS, firstOpenStep } from '../booking/booking-frame';
import { useCancellationText } from '../booking/cancellation';
import { PriceLines } from '../booking/movers-screen';
import { MoverCard, Row } from '../booking/review-screen';
import { MoveSummary } from '../booking/size-screen';
import { ExternalLink } from '../external-link';
import { CancelLine, CancelMove } from './cancel-move';
import { ConfirmMove } from './confirm-move';
import { MoveDayContactCard } from './move-day-contact';
import { MovePhotos } from './move-photos';
import { MoveSteps, stepTime } from './move-steps';
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
 * mover; until a mover accepts, it can be cancelled for free. Accepted (#36): the move day's steps with
 * their times, the photos of the things, calling the mover, cancelling under the mover's terms until
 * loaded, booking another mover if the mover cancelled, and confirming once it's done.
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
  const { t: tj } = useTranslation('job');
  const locale = currentLocale();
  const { session } = useAuth();
  const describeCancellation = useCancellationText();
  const draft = safeDraftFromJob(job);
  const quote = job.quotes[0];
  const terms = quote ? cancellationTerms(quote) : null;
  const money = (cents: number) => formatMoney(cents, quote?.currency ?? 'EUR', locale);
  const checked = quote ? new Date(quote.created_at) : null;

  const state = moveState(job);
  const moverName = quote?.mover?.name ?? '';
  // The mover said no or didn't answer: the same move, another mover (nobody is assigned automatically).
  const another = state === 'DECLINED' || state === 'EXPIRED';
  // From the mover's acceptance: the move day.
  const day = jobDay(job.job_events);
  const photos = useJobPhotos(day ? job.id : undefined, { poll: job.status === 'AT_PICKUP' || job.status === 'AT_DROPOFF' });
  // The photos are read again whenever the move moves on (the last ones are often added just before the step).
  const queryClient = useQueryClient();
  const hasDay = day !== null;
  useEffect(() => {
    if (hasDay) void queryClient.invalidateQueries({ queryKey: jobPhotosKey(job.id) });
  }, [queryClient, hasDay, job.id, job.status]);
  // undefined while the photos aren't known (loading, or failed): never read as "no photo".
  const firstPickupPhotoAt = photos.data ? (photos.data.filter((p) => p.stage === 'pickup').map((p) => p.taken_at).sort()[0] ?? null) : undefined;
  const phone = quote?.mover?.phone ?? null;
  // Calling stays possible while the move is on — and after the customer cancelled it, until its day has passed.
  const callable = CALL_STATES.includes(job.status) || (state === 'CANCELLED' && job.job_cancellations !== null && !dayPassed(job.scheduled_at));

  // A step the mover took while this screen is in front is read out (the browser keeps it mounted behind
  // others) — not the customer's own steps, which their screens read out themselves.
  const focused = useIsFocused();
  const seen = useRef<MoveState | null>(null);
  const status = t(`customer.moves.status.${state}`);
  const byCustomer = job.job_events.at(-1)?.actor_role === 'customer';
  useEffect(() => {
    if (focused && seen.current !== null && seen.current !== state && !byCustomer) announce(status);
    seen.current = state;
  }, [state, status, focused, byCustomer]);

  const continueBooking = () => {
    if (!draft || !session) return;
    const next = another ? { ...draft, choice: null } : draft;
    startBooking(session.user.id, next);
    router.push(BOOKING_STEPS[firstOpenStep(next)]!);
  };

  // The mover cancelled: the same move as a new request, another mover (or another day if it was today).
  const bookAnother = () => {
    if (!draft || !session) return;
    const next = { ...draft, choice: null, jobId: null };
    startBooking(session.user.id, next);
    router.replace(BOOKING_STEPS[firstOpenStep(next)]!);
  };

  const note = useStateNote(job, state, day, moverName);

  return (
    <>
      <View className="gap-2">
        <View className="self-start">
          <Pill tone={QUIET_STATES.includes(state) ? 'neutral' : 'brand'}>{status}</Pill>
        </View>
        {note ? (
          <Text testID="move-state-note" className="font-sans text-[13.5px] leading-5 text-ink-700">
            {note}
          </Text>
        ) : null}
        {phone && callable ? <ExternalLink testID="move-call" tone="light" href={telHref(phone)} title={tj('customer.call', { name: moverName })} /> : null}
      </View>

      {day ? <MoveSteps day={day} /> : null}
      {day && ((photos.data ?? []).length > 0 || PHOTO_STATES.includes(job.status) || photos.isError) ? (
        <MovePhotos rows={photos.data ?? []} moverName={moverName} failed={photos.isError && !photos.data} onRetry={() => void photos.refetch()} />
      ) : null}

      {draft ? <MoveSummary draft={draft} testIDPrefix="move-summary" /> : null}

      <Card variant="widget" className="gap-3">
        <Text accessibilityRole="header" className="font-sans-semibold text-base text-ink-900">
          {t('customer.moves.stopsTitle')}
        </Text>
        <Stop label={t('landing.quote.pickup')} place={job.pickup_label} details={job.pickup_details} floor={job.pickup_floor} lift={job.pickup_has_lift} testID="move-pickup" />
        <Stop label={t('landing.quote.dropoff')} place={job.dropoff_label} details={job.dropoff_details} floor={job.dropoff_floor} lift={job.dropoff_has_lift} testID="move-dropoff" />
      </Card>

      <MoveDayContactCard job={job} moverName={moverName} />

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
          <CancelLine job={job} firstPickupPhotoAt={firstPickupPhotoAt} moverName={moverName} />
        </Card>
      ) : null}

      {(state === 'QUOTED' || another) && draft ? (
        <Button testID="move-continue" title={another ? t('booking.review.chooseAnother') : t('booking.continueMove')} onPress={continueBooking} />
      ) : null}
      {state === 'CANCELLED_BY_MOVER' && draft ? <Button testID="move-book-another" title={tj('customer.bookAnother')} onPress={bookAnother} /> : null}
      {job.status === 'COMPLETED' ? <ConfirmMove job={job} confirmedAt={day?.confirmedAt ?? null} moverName={moverName} /> : null}
      {CANCELLABLE.includes(state) || AFTER_ACCEPTANCE.includes(job.status) ? (
        <CancelMove job={job} firstPickupPhotoAt={firstPickupPhotoAt} moverName={moverName} phone={phone} />
      ) : null}
    </>
  );
}

/** Until a mover has accepted, the customer cancels for free; after, until loaded, under the mover's terms. */
const CANCELLABLE: readonly MoveState[] = ['QUOTED', 'OFFERED', 'DECLINED', 'EXPIRED'];
const AFTER_ACCEPTANCE: readonly JobStatus[] = CANCELLABLE_AFTER_ACCEPTANCE;
/** While the mover can be called about the move (their phone, as the customer saw them when booking). */
const CALL_STATES: readonly JobStatus[] = ['ACCEPTED', 'EN_ROUTE_TO_PICKUP', 'AT_PICKUP', 'IN_TRANSIT', 'AT_DROPOFF', 'COMPLETED'];
/** From the pickup on, the photos have a place on the screen even before the first one. */
const PHOTO_STATES: readonly JobStatus[] = ['AT_PICKUP', 'IN_TRANSIT', 'AT_DROPOFF', 'COMPLETED'];

const isTodayOrPast = (iso: string) => localDay(new Date(iso)) <= localDay(new Date());
const dayPassed = (iso: string) => localDay(new Date(iso)) < localDay(new Date());
/** A phone number as a dialler link. */
export const telHref = (phone: string) => `tel:${phone.replace(/[^\d+]/g, '')}`;

/** The line under the status: what is happening now, with the time it happened (design/DECISIONS.md #36). */
function useStateNote(job: JobRow, state: MoveState, day: JobDay | null, name: string): string | null {
  const { t } = useTranslation();
  const { t: tj } = useTranslation('job');
  const locale = currentLocale();
  const offer = job.job_offers[0];
  const stepAt = (status: string) => day?.steps.find((s) => s.status === status)?.at ?? null;
  const time = (iso: string | null) => (iso ? stepTime(iso, locale) : '');
  const dateTime = (iso: string) => ({ date: formatMoveDay(localDay(new Date(iso)), locale), time: formatClockTime(iso, locale) });
  const cancellation = job.job_cancellations;
  switch (state) {
    case 'QUOTED':
      return t('customer.moves.quotedNote');
    case 'OFFERED':
      return offer
        ? t('customer.moves.offeredNote', {
            name,
            date: formatMoveDay(localDay(new Date(offer.expires_at)), locale),
            time: formatClockTime(offer.expires_at, locale),
          })
        : null;
    case 'ACCEPTED':
      return t('customer.moves.acceptedNote', { name });
    case 'EN_ROUTE_TO_PICKUP':
      return tj('customer.enRouteNote', { name, time: time(stepAt('EN_ROUTE_TO_PICKUP')) });
    case 'AT_PICKUP':
      return tj('customer.atPickupNote', { name, time: time(stepAt('AT_PICKUP')) });
    case 'IN_TRANSIT':
      return tj('customer.inTransitNote', { name, time: time(stepAt('IN_TRANSIT')) });
    case 'AT_DROPOFF':
      return tj('customer.atDropoffNote', { name, time: time(stepAt('AT_DROPOFF')) });
    case 'COMPLETED': {
      const done = stepAt('COMPLETED');
      return done ? tj('customer.completedNote', { name, ...dateTime(done) }) : null;
    }
    case 'DECLINED':
      return t('customer.moves.declinedNote', { name });
    case 'EXPIRED':
      return t('customer.moves.expiredNote', { name });
    case 'CANCELLED_BY_MOVER': {
      if (!cancellation) return null;
      const text = tj(isTodayOrPast(job.scheduled_at) ? 'customer.cancelledByMoverToday' : 'customer.cancelledByMoverNote', { name, ...dateTime(cancellation.created_at) });
      return cancellation.reason ? `${text} ${tj(`customer.moverReason.${cancellation.reason}`)}` : text;
    }
    case 'CANCELLED':
      if (!cancellation) return t('customer.moves.cancelledNote');
      return cancellation.fee > 0
        ? tj('customer.cancelledByYouFee', { name, amount: formatMoney(cancellation.fee, cancellation.currency, locale), ...dateTime(cancellation.created_at) })
        : tj('customer.cancelledByYouFree', dateTime(cancellation.created_at));
    default:
      return null;
  }
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
