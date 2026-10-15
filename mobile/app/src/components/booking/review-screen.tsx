import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button, Card, CheckIcon, Display, Pill, currentLocale, formatClockTime, useAnnouncement } from '@movershub/mobile';
import { formatExpiryDate, formatMoney, type BookResponse, type BookedMover, type BookingDraft } from '@movershub/shared';
import { colors } from '@movershub/ui';

import { BookError, useBookRequest } from '@/lib/booking';

import { BookingFrame, type UpdateBooking } from './booking-frame';
import { useCancellationText } from './cancellation';
import { PriceLines } from './movers-screen';
import { MoveSummary } from './size-screen';

/**
 * Step 6: the booking request, checked on the server (design/DECISIONS.md #26). The `book` function
 * prices the chosen van again from the mover's own card and saves the request; this screen shows that
 * price (valid 15 minutes), who the contract is with and their full details (COMPLIANCE §4), their
 * cancellation terms and the note on the right of withdrawal (§8). Paying — saving the card, which
 * books the move — waits for Stripe; until then the request stays saved and nothing goes to the mover.
 */
export function ReviewScreen() {
  const { t } = useTranslation();
  return (
    <BookingFrame step={5} title={t('booking.review.title')} subtitle={t('booking.review.subtitle')}>
      {(draft, update) => <Review draft={draft} update={update} />}
    </BookingFrame>
  );
}

/** True once `expiresAt` has passed (re-rendered at that moment). */
function useExpired(expiresAt: string | undefined): boolean {
  const [expiredFor, setExpiredFor] = useState<string | null>(null);
  useEffect(() => {
    if (!expiresAt) return;
    const timer = setTimeout(() => setExpiredFor(expiresAt), Math.max(0, Date.parse(expiresAt) - Date.now()));
    return () => clearTimeout(timer);
  }, [expiresAt]);
  return expiresAt !== undefined && expiredFor === expiresAt;
}

function Review({ draft, update }: { draft: BookingDraft; update: UpdateBooking }) {
  const { t } = useTranslation();
  const book = useBookRequest(draft);
  const error = book.error instanceof BookError ? book.error.code : book.error ? 'unavailable' : null;
  const expired = useExpired(book.data?.quote.expiresAt);
  useAnnouncement(expired ? t('booking.review.expired') : null);

  return (
    <>
      <MoveSummary draft={draft} testIDPrefix="review-summary" />
      {book.isFetching ? (
        <View accessibilityLiveRegion="polite" className="min-h-[120px] flex-row items-center justify-center gap-3">
          <ActivityIndicator color={colors.brand[500]} />
          <Text className="font-sans text-sm text-ink-600">{t('customer.priceLoading')}</Text>
        </View>
      ) : error === 'mover_unavailable' ? (
        // The last answer may still be kept: a newer refusal wins over it.
        <Problem
          testID="review-unavailable"
          text={t('booking.review.unavailable')}
          action={t('booking.review.chooseAnother')}
          onPress={() => {
            update((d) => ({ ...d, choice: null }));
            router.replace('/book/movers');
          }}
        />
      ) : error === 'invalid_date' ? (
        <Problem
          testID="review-invalid-date"
          text={t('booking.review.invalidDate')}
          action={t('booking.review.chooseDay')}
          onPress={() => {
            update((d) => ({ ...d, day: null, hour: null }));
            router.replace('/book/when');
          }}
        />
      ) : error ? (
        <Problem testID="review-error" text={t('booking.review.error')} action={t('common.retry')} onPress={() => void book.refetch()} />
      ) : book.data ? (
        <Booked answer={book.data} expired={expired} onPriceAgain={() => void book.refetch()} />
      ) : null}
    </>
  );
}

function Problem({ text, action, onPress, testID }: { text: string; action: string; onPress: () => void; testID: string }) {
  useAnnouncement(text);
  return (
    <View className="items-start gap-3">
      <Text testID={testID} className="font-sans text-[13.5px] leading-5 text-danger">
        {text}
      </Text>
      <Button variant="outline" size="md" title={action} onPress={onPress} />
    </View>
  );
}

function Booked({ answer, expired, onPriceAgain }: { answer: BookResponse; expired: boolean; onPriceAgain: () => void }) {
  const { t } = useTranslation();
  const locale = currentLocale();
  const describeCancellation = useCancellationText();
  const { mover, quote } = answer;
  const money = (cents: number) => formatMoney(cents, quote.currency, locale);
  return (
    <>
      {/* COMPLIANCE §4: before payment, who the contract is with. */}
      <Card variant="inset">
        <Text testID="review-contract" className="font-sans-semibold text-[15px] leading-[22px] text-ink-900">
          {t('booking.review.contract', { name: mover.name })}
        </Text>
      </Card>

      <MoverCard mover={mover} testIDPrefix="review" />

      <Card variant="widget" className="gap-3">
        <Text accessibilityRole="header" className="font-sans-semibold text-base text-ink-900">
          {t('booking.review.priceTitle')}
        </Text>
        <PriceLines lines={quote.lines} currency={quote.currency} locale={locale} testID="review-lines" />
        <Row label={t('booking.movers.moverPrice')} value={money(quote.moverPrice)} testID="review-mover-price" strong />
        <Row label={t('booking.review.fee')} value={quote.bookingFee === null ? t('booking.review.feeTba') : money(quote.bookingFee)} />
        {quote.bookingFee === null ? (
          <Text className="font-sans text-[12.5px] leading-[18px] text-ink-600">{t('booking.review.feeNote')}</Text>
        ) : (
          <Row label={t('booking.review.total')} value={money(quote.total)} testID="review-total" strong />
        )}
        <Text testID="review-valid" className={expired ? 'font-sans text-[13px] text-danger' : 'font-sans text-[13px] text-ink-600'}>
          {expired ? t('booking.review.expired') : t('booking.review.validUntil', { time: formatClockTime(quote.expiresAt, locale) })}
        </Text>
        {expired ? <Button testID="review-price-again" variant="outline" size="md" title={t('booking.review.priceAgain')} onPress={onPriceAgain} /> : null}
      </Card>

      <Card variant="widget" className="gap-2">
        <Text accessibilityRole="header" className="font-sans-semibold text-base text-ink-900">
          {t('booking.review.cancelTitle')}
        </Text>
        <Text testID="review-cancellation" className="font-sans text-[13.5px] leading-5 text-ink-700">
          {describeCancellation(mover.cancellation)}
        </Text>
        {/* COMPLIANCE-TODO: §14 — the withdrawal-right wording per country, to be confirmed by the lawyer (COMPLIANCE §8). */}
        <Text className="font-sans text-[12.5px] leading-[18px] text-ink-600">{t('booking.review.withdrawal')}</Text>
      </Card>

      {/* Saving the card books the move (COMPLIANCE §6) — Stripe isn't set up yet. */}
      <Button testID="review-pay" title={t('booking.review.pay')} disabled onPress={() => undefined} />
      <Text testID="review-pay-note" className="font-sans text-[13px] leading-[19px] text-ink-600">
        {t('booking.review.payNote')}
      </Text>
    </>
  );
}

function Detail({ text }: { text: string }) {
  return <Text className="font-sans text-[13px] leading-[18px] text-ink-700">{text}</Text>;
}

export function Row({ label, value, strong, testID }: { label: string; value: string; strong?: boolean; testID?: string }) {
  return (
    <View testID={testID} className="flex-row items-baseline justify-between gap-3">
      <Text className={strong ? 'flex-1 font-sans-semibold text-[15px] text-ink-900' : 'flex-1 font-sans text-[13.5px] text-ink-700'}>{label}</Text>
      {strong ? (
        <Display size={22} accessibilityRole="text">
          {value}
        </Display>
      ) : (
        <Text className="font-sans-medium text-[13.5px] text-ink-900">{value}</Text>
      )}
    </View>
  );
}

/** Who the mover is (COMPLIANCE §4): name, business or private person, registration number, address, contact, insurance. */
export function MoverCard({ mover, testIDPrefix }: { mover: BookedMover; testIDPrefix: string }) {
  const { t } = useTranslation();
  return (
    <Card variant="widget" className="gap-1.5">
      <Text accessibilityRole="header" className="font-sans text-[12.5px] text-ink-600">
        {t('booking.review.moverTitle')}
      </Text>
      <View className="flex-row flex-wrap items-center gap-2">
        <Text testID={`${testIDPrefix}-mover`} className="font-sans-semibold text-base text-ink-900">
          {mover.name}
        </Text>
        <Pill size="sm" tone={mover.isBusiness ? 'brand' : 'neutral'}>
          {mover.isBusiness ? t('booking.movers.business') : t('booking.movers.private')}
        </Pill>
      </View>
      {mover.isBusiness ? null : <Text className="font-sans text-[12.5px] leading-[18px] text-ink-600">{t('booking.movers.privateNote')}</Text>}
      <View testID={`${testIDPrefix}-mover-details`} className="gap-1">
        {mover.registrationNo ? <Detail text={t('booking.movers.regNo', { no: mover.registrationNo })} /> : null}
        {mover.address ? <Detail text={t('booking.review.address', { address: mover.address })} /> : null}
        {mover.phone ? <Detail text={t('booking.review.phone', { phone: mover.phone })} /> : null}
        {mover.email ? <Detail text={t('booking.review.email', { email: mover.email })} /> : null}
      </View>
      {mover.insuranceUntil ? (
        <View className="flex-row items-center gap-1.5">
          <CheckIcon size={14} strokeWidth={2.4} color={colors.brand[500]} />
          <Text className="flex-1 font-sans text-[13px] text-ink-700">
            {t('booking.movers.insurance', { date: formatExpiryDate(mover.insuranceUntil) })}
          </Text>
        </View>
      ) : null}
    </Card>
  );
}
