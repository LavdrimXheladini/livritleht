import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { Button, Card, SwapIcon, startBooking, useAnnouncement, useAuth } from '@movershub/mobile';
import { demoPlace, newStop, type Place, type VehicleClass } from '@movershub/shared';
import { colors } from '@movershub/ui';

import { AddressField } from './address-field';
import { PopularRoutes } from './popular-routes';
import { VehiclePicker } from './vehicle-picker';

/**
 * The home's "where from, where to": pickup, drop-off, the van size by name and one button. No prices
 * here — a price for a typical load on a guessed route says nothing about the customer's own move;
 * movers' prices come in the booking, for their things, floors and day ("Choose the van size").
 * "Book with a mover" starts the booking with these addresses and this size.
 */
type Parts = { street?: string | undefined; houseNumber?: string | undefined };

export function QuoteCard() {
  const { t } = useTranslation();
  // Starts on Prishtina → Prizren, like the website.
  const [[pickup, dropoff], setPair] = useState<[Place, Place]>(() => [
    demoPlace('prishtina', t('places.prishtina')),
    demoPlace('prizren', t('places.prizren')),
  ]);
  // The street and house number of each address found by search (the booking needs the exact place).
  const [[pickupParts, dropoffParts], setParts] = useState<[Parts, Parts]>([{}, {}]);
  const [cls, setCls] = useState<VehicleClass>('VAN');
  const { session } = useAuth();

  // One place twice: no move (the server refuses it too).
  const samePlace = pickup.lat === dropoff.lat && pickup.lon === dropoff.lon;
  useAnnouncement(samePlace ? t('landing.quote.samePlace') : null);

  const setPlaces = (nextPickup: Place, nextDropoff: Place, parts: [Parts, Parts] = [{}, {}]) => {
    setPair([nextPickup, nextDropoff]);
    setParts(parts);
  };
  const book = () => {
    if (!session || samePlace) return;
    startBooking(session.user.id, {
      pickup: newStop(pickup, pickupParts),
      dropoff: newStop(dropoff, dropoffParts),
      items: {},
      otherItems: '',
      day: null,
      hour: null,
      minute: 0,
      crew: 2,
      crewAsked: null,
      vehicleClass: cls,
      choice: null,
      jobId: null,
      contactPhone: null,
      contactName: null,
    });
    router.push('/book/stops');
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
          onSelect={(p, parts) => setPlaces(p, dropoff, [parts, dropoffParts])}
        />
        <SwapButton label={t('landing.quote.swap')} onPress={() => setPlaces(dropoff, pickup, [dropoffParts, pickupParts])} />
        <AddressField
          testID="quote-dropoff"
          label={t('landing.quote.dropoff')}
          placeholder={t('landing.quote.addressPlaceholder')}
          value={dropoff}
          near={pickup}
          onSelect={(d, parts) => setPlaces(pickup, d, [pickupParts, parts])}
        />
      </View>
      {samePlace ? <Text className="font-sans text-[13px] text-danger">{t('landing.quote.samePlace')}</Text> : null}
      <PopularRoutes pickup={pickup} dropoff={dropoff} onPick={setPlaces} />
      <VehiclePicker selected={cls} onSelect={setCls} />
      <Button testID="see-movers" title={t('booking.start')} disabled={samePlace} onPress={book} />
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

/** After "See movers", until choosing a mover exists in the app. */
export function BookingSoon() {
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

export function PricesLoading() {
  const { t } = useTranslation();
  return (
    <View accessibilityLiveRegion="polite" className="min-h-[120px] flex-row items-center justify-center gap-3">
      <ActivityIndicator color={colors.brand[500]} />
      <Text className="font-sans text-sm text-ink-600">{t('customer.priceLoading')}</Text>
    </View>
  );
}

/** The route couldn't be quoted (routing or the server unavailable). */
export function PricesError({ retrying, onRetry }: { retrying: boolean; onRetry: () => void }) {
  const { t } = useTranslation();
  useAnnouncement(t('landing.quote.routeError'));
  return (
    <View className="items-start gap-3">
      <Text className="font-sans text-[13px] text-danger">{t('landing.quote.routeError')}</Text>
      <Button variant="outline" size="md" title={t('customer.retry')} loading={retrying} onPress={onRetry} />
    </View>
  );
}
