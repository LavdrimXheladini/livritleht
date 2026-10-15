import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, Text, View } from 'react-native';

import { Button, Card, WarningIcon, currentLocale, cx, formatMoveDay, useMoveQuote } from '@movershub/mobile';
import {
  VEHICLE_CLASSES,
  fittingClass,
  formatNumber,
  formatTenths,
  jobItems,
  loadTenthsM3,
  moveQuoteRequest,
  routeLabel,
  smallerClass,
  type BookingDraft,
  type VehicleClass,
} from '@movershub/shared';
import { colors } from '@movershub/ui';

import { offersFor, type ClassOffers } from '../customer/offers';
import { BookingSoon, PricesError, PricesLoading } from '../customer/quote-card';
import { VehicleClasses } from '../customer/vehicle-classes';
import { BookingFrame, type UpdateBooking } from './booking-frame';
import { hourText } from './when-screen';

/**
 * Step 4: the van size, each with its lowest mover's price ("from") for THIS move — the customer's
 * stops, floors, items, crew and day, priced on the server from each mover's own rate card
 * (COMPLIANCE §1.1). The size that fits the items is chosen to start with; a smaller one may be picked,
 * with a warning. Next (build step 4, part 2): the movers in that size and their fixed totals.
 */
export function SizeScreen() {
  const { t } = useTranslation();
  return (
    <BookingFrame step={3} title={t('booking.size.title')} subtitle={t('booking.size.subtitle')}>
      {(draft, update) => <Size draft={draft} update={update} />}
    </BookingFrame>
  );
}

/** The chosen size — or, when no mover offers it for this move, the first size that fits and has offers. */
function shownClass(offers: ClassOffers | null, chosen: VehicleClass, fit: VehicleClass): VehicleClass {
  if (!offers || offers[chosen]) return chosen;
  return VEHICLE_CLASSES.find((k) => offers[k] && !smallerClass(k, fit)) ?? VEHICLE_CLASSES.find((k) => offers[k]) ?? chosen;
}

function Size({ draft, update }: { draft: BookingDraft; update: UpdateBooking }) {
  const { t } = useTranslation();
  const locale = currentLocale();
  const quote = useMoveQuote(moveQuoteRequest(draft));
  const [submitted, setSubmitted] = useState(false);
  const fit = fittingClass(loadTenthsM3(jobItems(draft.items)));
  const data = quote.data;
  const updating = quote.isPlaceholderData;
  const offers = data ? offersFor(data, draft.crew, draft.pickup.place) : null;
  const shown = shownClass(offers, draft.vehicleClass, fit);
  const anyOffer = offers !== null && VEHICLE_CLASSES.some((k) => offers[k]);

  const seeMovers = () => {
    setSubmitted(true);
    AccessibilityInfo.announceForAccessibility(`${t('landing.quote.soonTitle')} ${t('customer.bookingSoon')}`);
  };

  return (
    <>
      <MoveSummary draft={draft} />
      {data && offers ? (
        <View className={cx('gap-4', updating && 'opacity-60')}>
          <VehicleClasses
            offers={offers}
            selected={shown}
            onSelect={(vehicleClass) => {
              setSubmitted(false);
              update((d) => ({ ...d, vehicleClass }));
            }}
            locale={locale}
            updating={updating}
            testIDPrefix="size-class"
          />
          {smallerClass(shown, fit) ? (
            <View testID="size-too-small" className="flex-row items-start gap-2">
              <WarningIcon size={18} color={colors.warning} />
              <Text className="flex-1 font-sans text-[13.5px] leading-5 text-ink-900">
                {t('booking.size.tooSmall', { vehicle: t(`vehicles.${shown}.name`) })}
              </Text>
            </View>
          ) : null}
          {anyOffer ? (
            <Button testID="size-see-movers" title={t('booking.size.seeMovers')} onPress={seeMovers} />
          ) : (
            <Text className="font-sans text-[13.5px] leading-5 text-ink-700">{t('customer.noMoversHere')}</Text>
          )}
          {submitted ? <BookingSoon /> : null}
          <Text className="font-sans text-xs leading-[18px] text-ink-500">
            {t('booking.size.note')}
            {data.testMovers ? ` ${t('landing.quote.testNote')}` : null}
          </Text>
        </View>
      ) : quote.isError ? (
        <PricesError retrying={quote.isFetching} onRetry={() => void quote.refetch()} />
      ) : (
        <PricesLoading />
      )}
    </>
  );
}

/** The move in short: route, day and time, people, things and their volume. */
function MoveSummary({ draft }: { draft: BookingDraft }) {
  const { t } = useTranslation();
  const locale = currentLocale();
  const items = jobItems(draft.items);
  const things = items.reduce((n, it) => n + it.qty, 0);
  const lines = [
    routeLabel(draft.pickup.place, draft.dropoff.place, (city) => t('landing.quote.withinCity', { city })),
    draft.day !== null && draft.hour !== null ? `${formatMoveDay(draft.day, locale, { long: true })}, ${hourText(draft.hour)}` : null,
    t(`landing.quote.crew${draft.crew}`),
    t('booking.size.things', { n: formatNumber(things, locale), m3: formatTenths(loadTenthsM3(items), locale) }),
  ].filter((line): line is string => line !== null);
  return (
    <Card variant="inset" className="gap-1">
      {lines.map((line, i) => (
        <Text
          key={line}
          testID={`size-summary-${i}`}
          className={i === 0 ? 'font-sans-semibold text-[15px] text-ink-900' : 'font-sans text-sm text-ink-700'}
        >
          {line}
        </Text>
      ))}
    </Card>
  );
}
