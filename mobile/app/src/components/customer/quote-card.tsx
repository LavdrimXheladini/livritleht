import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AccessibilityInfo, ActivityIndicator, Pressable, Text, View } from 'react-native';

import {
  Button,
  Card,
  CrewPills,
  Display,
  SwapIcon,
  currentLocale,
  cx,
  useAnnouncement,
  useQuote,
  type ClassFrom,
} from '@movershub/mobile';
import { VEHICLE_CLASSES, demoPlace, formatNumber, type CrewSize, type Locale, type Place, type VehicleClass } from '@movershub/shared';
import { colors } from '@movershub/ui';

import { AddressField } from './address-field';
import { offersFor, priceText, type LiveQuote } from './offers';
import { PopularRoutes } from './popular-routes';
import { VehicleClasses } from './vehicle-classes';

/**
 * Phone version of the website's quote widget: pickup + drop-off → per vehicle class the lowest
 * mover's price ("from") and the number of offers, live from movers' own rate cards for a typical
 * load (the `quote` function, design/DECISIONS.md #11). Nothing is priced in the app (COMPLIANCE
 * §1.1). Booking — a specific mover and their fixed total before payment — comes later.
 */
export function QuoteCard() {
  const { t } = useTranslation();
  const locale = currentLocale();
  // Starts on Prishtina → Prizren, like the website.
  const [[pickup, dropoff], setPair] = useState<[Place, Place]>(() => [
    demoPlace('prishtina', t('places.prishtina')),
    demoPlace('prizren', t('places.prizren')),
  ]);
  const [cls, setCls] = useState<VehicleClass>('LARGE_VAN');
  const [crew, setCrew] = useState<CrewSize>(2);
  const [submitted, setSubmitted] = useState(false);

  // One place twice: nothing to quote (the server refuses it too).
  const samePlace = pickup.lat === dropoff.lat && pickup.lon === dropoff.lon;
  const quote = useQuote(samePlace ? null : pickup, samePlace ? null : dropoff);
  useAnnouncement(samePlace ? t('landing.quote.samePlace') : null);
  const data = quote.data;
  // The last route's prices stay, dimmed and marked busy, while the new route is priced (like the website).
  const updating = quote.isPlaceholderData;
  const offers = data ? offersFor(data, crew, pickup) : null;
  // The chosen class — or, when no mover offers it on this route for this crew, the first class one does.
  const shownCls = offers && !offers[cls] ? (VEHICLE_CLASSES.find((k) => offers[k]) ?? cls) : cls;

  const setPlaces = (nextPickup: Place, nextDropoff: Place) => {
    setPair([nextPickup, nextDropoff]);
    setSubmitted(false);
  };
  const seeMovers = () => {
    setSubmitted(true);
    AccessibilityInfo.announceForAccessibility(`${t('landing.quote.soonTitle')} ${t('customer.bookingSoon')}`);
  };

  return (
    <Card variant="widget" className="gap-4">
      <View className="gap-1">
        <AddressField
          testID="quote-pickup"
          label={t('landing.quote.pickup')}
          placeholder={t('landing.quote.addressPlaceholder')}
          value={pickup}
          near={dropoff}
          onSelect={(p) => setPlaces(p, dropoff)}
        />
        <SwapButton label={t('landing.quote.swap')} onPress={() => setPlaces(dropoff, pickup)} />
        <AddressField
          testID="quote-dropoff"
          label={t('landing.quote.dropoff')}
          placeholder={t('landing.quote.addressPlaceholder')}
          value={dropoff}
          near={pickup}
          onSelect={(d) => setPlaces(pickup, d)}
        />
      </View>
      {samePlace ? <Text className="font-sans text-[13px] text-danger">{t('landing.quote.samePlace')}</Text> : null}
      <PopularRoutes pickup={pickup} dropoff={dropoff} onPick={setPlaces} />

      {samePlace ? null : (
        <View className={cx('gap-4 border-t border-stone-300 pt-4', updating && 'opacity-60')}>
          {data && offers ? (
            <>
              <VehicleClasses offers={offers} selected={shownCls} onSelect={setCls} locale={locale} updating={updating} />
              <CrewPills
                value={crew}
                onChange={setCrew}
                groupLabel={t('landing.quote.crew')}
                labels={{ 1: t('landing.quote.crew1'), 2: t('landing.quote.crew2'), 3: t('landing.quote.crew3') }}
              />
              <PriceSummary quote={data} offer={offers[shownCls]} locale={locale} updating={updating} />
              <Button testID="see-movers" title={t('landing.quote.seeMovers')} onPress={seeMovers} />
              {submitted ? <BookingSoon /> : null}
              <Text className="font-sans text-xs leading-[18px] text-ink-500">
                {t('landing.quote.liveNote')}
                {data.testMovers ? ` ${t('landing.quote.testNote')}` : null}
              </Text>
            </>
          ) : quote.isError ? (
            <PricesError retrying={quote.isFetching} onRetry={() => void quote.refetch()} />
          ) : (
            <PricesLoading />
          )}
        </View>
      )}
    </Card>
  );
}

/** Round outline button between the stacked fields; the arrows turned to point up and down. */
function SwapButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="size-11 items-center justify-center self-center rounded-full border border-stone-400 bg-stone-50 active:border-ink-300"
    >
      <View className="rotate-90">
        <SwapIcon size={18} />
      </View>
    </Pressable>
  );
}

/** "Local · ≈12 km" and the big "from" price of the selected class and crew. */
function PriceSummary({
  quote,
  offer,
  locale,
  updating,
}: {
  quote: LiveQuote;
  offer: ClassFrom | null;
  locale: Locale;
  /** The price is still the last route's (a screen reader says "busy"). */
  updating: boolean;
}) {
  const { t } = useTranslation();
  const price = offer ? priceText(offer, locale) : null;
  return (
    <View accessibilityLiveRegion="polite" className="gap-0.5">
      <Text className="font-sans text-[12.5px] text-ink-600">
        {t('customer.quoteSummary', {
          kind: t(`landing.quote.${quote.scope}`),
          // At least 1 km, like the website (a move inside one street is not "≈0 km").
          km: formatNumber(Math.max(1, Math.round(quote.distanceKm)), locale),
        })}
      </Text>
      {price ? (
        <View
          accessible
          accessibilityLabel={`${t('landing.quote.from')} ${price}`}
          accessibilityState={{ busy: updating }}
          className="flex-row items-baseline gap-1.5"
        >
          <Text className="font-sans text-[13px] text-ink-600">{t('landing.quote.from')}</Text>
          <Display accessibilityRole="text">{price}</Display>
        </View>
      ) : (
        <Text className="font-sans text-[13.5px] leading-5 text-ink-700">{t('customer.noMoversHere')}</Text>
      )}
    </View>
  );
}

/** After "See movers", until booking exists in the app. */
function BookingSoon() {
  const { t } = useTranslation();
  return (
    <View className="flex-row gap-3 rounded-input bg-brand-500 px-[18px] py-3.5">
      <View className="mt-1.5 size-2.5 rounded-full bg-accent-500" />
      <Text className="flex-1 font-sans text-[14.5px] leading-5 text-stone-50">
        <Text className="font-sans-semibold">{t('landing.quote.soonTitle')}</Text> {t('customer.bookingSoon')}
      </Text>
    </View>
  );
}

function PricesLoading() {
  const { t } = useTranslation();
  return (
    <View accessibilityLiveRegion="polite" className="min-h-[120px] flex-row items-center justify-center gap-3">
      <ActivityIndicator color={colors.brand[500]} />
      <Text className="font-sans text-sm text-ink-600">{t('customer.priceLoading')}</Text>
    </View>
  );
}

/** The route couldn't be quoted (routing or the server unavailable). */
function PricesError({ retrying, onRetry }: { retrying: boolean; onRetry: () => void }) {
  const { t } = useTranslation();
  useAnnouncement(t('landing.quote.routeError'));
  return (
    <View className="items-start gap-3">
      <Text className="font-sans text-[13px] text-danger">{t('landing.quote.routeError')}</Text>
      <Button variant="outline" size="md" title={t('customer.retry')} loading={retrying} onPress={onRetry} />
    </View>
  );
}
