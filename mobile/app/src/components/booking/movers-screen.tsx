import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Button, Card, CheckIcon, Display, Pill, announce, currentLocale, cx, useMoveQuote } from '@movershub/mobile';
import type { Offer, Quote } from '@movershub/pricing';
import {
  MARKET_RATES,
  formatExpiryDate,
  formatMoney,
  formatNumber,
  formatTenths,
  moveQuoteRequest,
  type BookingDraft,
  type Currency,
  type Locale,
} from '@movershub/shared';
import { colors } from '@movershub/ui';

import { BookingSoon, PricesError, PricesLoading } from '../customer/quote-card';
import { BookingFrame, type UpdateBooking } from './booking-frame';
import { MoveSummary } from './size-screen';

/**
 * Step 5: the movers in the chosen size, each with their own fixed price for this move (from their
 * rate card, on the server — COMPLIANCE §1.1) and who they are: name, business or private person,
 * registration number, town, checked insurance (§4). Sorted by price, lowest first; nobody pays for a
 * better place (§3). "Book best offer" chooses the lowest. Next: the booking request with the mover's
 * full details and "Your contract is with…", before any payment.
 */
export function MoversScreen() {
  const { t } = useTranslation();
  return (
    <BookingFrame step={4} title={t('booking.movers.title')} subtitle={t('booking.movers.subtitle')}>
      {(draft, update) => <Movers draft={draft} update={update} />}
    </BookingFrame>
  );
}

/** The size's offers with the pickup country's currency first (within a currency, cheapest first, as the server sorts them). */
function offersInOrder(offers: readonly Offer[], local: Currency | undefined): Offer[] {
  return [...offers].sort((a, b) => Number(b.quote.currency === local) - Number(a.quote.currency === local));
}

function Movers({ draft, update }: { draft: BookingDraft; update: UpdateBooking }) {
  const { t } = useTranslation();
  const locale = currentLocale();
  const quote = useMoveQuote(moveQuoteRequest(draft));
  const data = quote.data;
  const local = MARKET_RATES[draft.pickup.place.countryCode as keyof typeof MARKET_RATES]?.currency;
  const offers = data ? offersInOrder(data.classes.find((c) => c.vehicleClass === draft.vehicleClass)?.offers ?? [], local) : [];
  // The choice counts while that mover still offers this move (it may change with the stops or items).
  const chosen = draft.choice === null ? null : (offers.find((o) => o.vehicleId === draft.choice?.vehicleId) ?? null);

  const choose = (offer: Offer) => {
    update((d) => ({ ...d, choice: { vehicleId: offer.vehicleId, companyId: offer.companyId } }));
    announce(`${t('booking.movers.yourMover', { name: offer.companyName })}. ${t('landing.quote.soonTitle')} ${t('customer.bookingSoon')}`);
  };

  return (
    <>
      <MoveSummary draft={draft} testIDPrefix="movers-summary" />
      {data ? (
        offers.length ? (
          <View className={cx('gap-4', quote.isPlaceholderData && 'opacity-60')}>
            <Button testID="movers-best" variant="accent" title={t('booking.movers.best')} onPress={() => choose(offers[0]!)} />
            <Text className="font-sans text-[13px] leading-[19px] text-ink-600">{t('booking.movers.order')}</Text>
            {offers.map((offer) => (
              <MoverOffer key={offer.vehicleId} offer={offer} chosen={chosen?.vehicleId === offer.vehicleId} onChoose={() => choose(offer)} locale={locale} />
            ))}
            {data.testMovers ? <Text className="font-sans text-xs leading-[18px] text-ink-500">{t('landing.quote.testNote')}</Text> : null}
          </View>
        ) : (
          <Text testID="movers-none" className="font-sans text-[13.5px] leading-5 text-ink-700">
            {t('booking.movers.none')}
          </Text>
        )
      ) : quote.isError ? (
        <PricesError retrying={quote.isFetching} onRetry={() => void quote.refetch()} />
      ) : (
        <PricesLoading />
      )}
    </>
  );
}

/** One mover's offer: who they are, their price for this move (itemised on demand), and Choose. */
function MoverOffer({ offer, chosen, onChoose, locale }: { offer: Offer; chosen: boolean; onChoose: () => void; locale: Locale }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { mover, quote } = offer;
  const id = `offer-${offer.companyId}`;
  const money = (cents: number) => formatMoney(cents, quote.currency, locale);
  const facts = [mover.town, mover.registrationNo ? t('booking.movers.regNo', { no: mover.registrationNo }) : null].filter(Boolean).join(' · ');
  return (
    <Card variant="widget" className="gap-3">
      <View testID={id} className="gap-1">
        <View className="flex-row flex-wrap items-center gap-2">
          <Text accessibilityRole="header" className="font-sans-semibold text-base text-ink-900">
            {offer.companyName}
          </Text>
          <Pill size="sm" tone={mover.isBusiness ? 'brand' : 'neutral'}>
            {mover.isBusiness ? t('booking.movers.business') : t('booking.movers.private')}
          </Pill>
          {chosen ? (
            <Pill size="sm" tone="accent">
              {t('booking.movers.chosen')}
            </Pill>
          ) : null}
        </View>
        {facts ? <Text className="font-sans text-[13px] text-ink-600">{facts}</Text> : null}
        {mover.insuranceUntil ? (
          <View className="flex-row items-center gap-1.5">
            <CheckIcon size={14} strokeWidth={2.4} color={colors.brand[500]} />
            <Text className="flex-1 font-sans text-[13px] text-ink-700">
              {t('booking.movers.insurance', { date: formatExpiryDate(mover.insuranceUntil) })}
            </Text>
          </View>
        ) : null}
        {mover.isBusiness ? null : <Text className="font-sans text-[12.5px] leading-[18px] text-ink-600">{t('booking.movers.privateNote')}</Text>}
      </View>

      <View className="gap-0.5">
        <Text className="font-sans text-[12.5px] text-ink-600">{t('booking.movers.moverPrice')}</Text>
        <View testID={`${id}-price`}>
          <Display size={26} accessibilityRole="text">
            {money(quote.moverPrice)}
          </Display>
        </View>
        <Text className="font-sans text-[12.5px] leading-[18px] text-ink-600">
          {quote.bookingFee === null
            ? t('booking.movers.feeTba')
            : `${t('booking.movers.fee', { fee: money(quote.bookingFee) })} · ${t('booking.movers.total', { total: money(quote.total) })}`}
        </Text>
      </View>

      <Button
        testID={`${id}-details`}
        variant="link"
        size="sm"
        className="-ml-2 self-start"
        title={open ? t('booking.movers.hideDetails') : t('booking.movers.details')}
        onPress={() => setOpen((o) => !o)}
      />
      {open ? <PriceLines quote={quote} locale={locale} testID={`${id}-lines`} /> : null}

      <Button
        testID={`${id}-choose`}
        variant={chosen ? 'secondary' : 'primary'}
        size="md"
        title={chosen ? t('booking.movers.chosen') : t('booking.movers.choose')}
        accessibilityLabel={`${t('booking.movers.choose')}: ${offer.companyName}`}
        onPress={onChoose}
      />
      {chosen ? <BookingSoon /> : null}
    </Card>
  );
}

/** The mover's price line by line, as their rate card produced it; the lines add up to the price. */
function PriceLines({ quote, locale, testID }: { quote: Quote; locale: Locale; testID: string }) {
  const { t } = useTranslation();
  const km = (q: number | undefined) => formatTenths(Math.round((q ?? 0) * 10), locale);
  const n = (q: number | undefined) => formatNumber(q ?? 0, locale);
  return (
    <View testID={testID} className="gap-1.5 rounded-input bg-stone-150 p-3">
      {quote.lines.map((line) => {
        const label =
          line.kind === 'base'
            ? t('booking.movers.lines.base')
            : line.kind === 'distance'
              ? t('booking.movers.lines.distance', { km: km(line.quantity) })
              : line.kind === 'labor'
                ? t('booking.movers.lines.labor', { min: n(line.quantity) })
                : line.kind === 'floors'
                  ? t('booking.movers.lines.floors', { n: n(line.quantity) })
                  : line.kind === 'heavyItems'
                    ? t('booking.movers.lines.heavyItems', { n: n(line.quantity) })
                    : line.kind === 'assembly'
                      ? t('booking.movers.lines.assembly', { n: n(line.quantity) })
                      : line.kind === 'longDistance'
                        ? t('booking.movers.lines.longDistance', { km: km(line.quantity) })
                        : t('booking.movers.lines.minimumPrice');
        return (
          <View key={line.kind} className="flex-row items-start justify-between gap-3">
            <Text className="flex-1 font-sans text-[13px] leading-[18px] text-ink-700">{label}</Text>
            <Text className="font-sans-medium text-[13px] text-ink-900">{formatMoney(line.amount, quote.currency, locale)}</Text>
          </View>
        );
      })}
    </View>
  );
}
