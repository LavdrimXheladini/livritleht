import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Button, Card, ChipGroup, Stepper, TextField, announce } from '@movershub/mobile';
import { STOP_DETAILS_MAX, stopProblems, type BookingDraft, type BookingStop } from '@movershub/shared';

import { AddressField } from '../customer/address-field';
import { BookingFrame, type UpdateBooking } from './booking-frame';

type Which = 'pickup' | 'dropoff';

/**
 * Step 1: the exact pickup and drop-off — the place on the map (or, where the map knows only the
 * town, how to find it), the floor, and above the ground floor whether there is a lift. Movers see
 * only the town or neighbourhood until one accepts (COMPLIANCE §9.1); the screen says so.
 */
export function StopsScreen() {
  const { t } = useTranslation();
  return (
    <BookingFrame step={0} title={t('booking.stops.title')} subtitle={t('booking.stops.subtitle')}>
      {(draft, update) => <Stops draft={draft} update={update} />}
    </BookingFrame>
  );
}

function Stops({ draft, update }: { draft: BookingDraft; update: UpdateBooking }) {
  const { t } = useTranslation();
  // Errors show after the first Continue, then follow the fields.
  const [tried, setTried] = useState(false);
  const same = draft.pickup.place.lat === draft.dropoff.place.lat && draft.pickup.place.lon === draft.dropoff.place.lon;
  const problems = { pickup: stopProblems(draft.pickup), dropoff: stopProblems(draft.dropoff) };
  const setStop = (which: Which) => (change: (stop: BookingStop) => BookingStop) => update((d) => ({ ...d, [which]: change(d[which]) }));

  const next = () => {
    if (!same && problems.pickup.length === 0 && problems.dropoff.length === 0) {
      router.push('/book/items');
      return;
    }
    setTried(true);
    // Every error at once, in screen order (two announcements would cut each other off).
    const messages = (['pickup', 'dropoff'] as const).flatMap((which) =>
      problems[which].map((p) => `${stopLabel(t, which)}: ${p === 'place' ? t('booking.stops.detailsRequired') : t('booking.stops.liftRequired')}`),
    );
    announce([...messages, ...(same ? [t('landing.quote.samePlace')] : [])].join(' '));
  };

  return (
    <>
      <StopCard which="pickup" stop={draft.pickup} other={draft.dropoff} problems={tried ? problems.pickup : []} onChange={setStop('pickup')} />
      <StopCard which="dropoff" stop={draft.dropoff} other={draft.pickup} problems={tried ? problems.dropoff : []} onChange={setStop('dropoff')} />
      {same ? (
        <Text testID="stops-same-place" className="font-sans text-[13px] text-danger">
          {t('landing.quote.samePlace')}
        </Text>
      ) : null}
      <Button testID="stops-next" title={t('common.continue')} onPress={next} />
    </>
  );
}

/** Only the two keys it reads: the whole typed `t` as a parameter is too deep for TypeScript. */
const stopLabel = (t: (key: 'landing.quote.pickup' | 'landing.quote.dropoff') => string, which: Which) =>
  which === 'pickup' ? t('landing.quote.pickup') : t('landing.quote.dropoff');

function StopCard({
  which,
  stop,
  other,
  problems,
  onChange,
}: {
  which: Which;
  stop: BookingStop;
  other: BookingStop;
  /** What to point out (after the first Continue). */
  problems: ('place' | 'lift')[];
  onChange: (change: (stop: BookingStop) => BookingStop) => void;
}) {
  const { t } = useTranslation();
  const label = stopLabel(t, which);
  const liftError = problems.includes('lift') ? t('booking.stops.liftRequired') : null;
  return (
    <Card variant="widget" className="gap-4">
      <AddressField
        testID={`stop-${which}`}
        label={label}
        placeholder={t('landing.quote.addressPlaceholder')}
        value={stop.place}
        near={other.place}
        onSelect={(place, parts) =>
          onChange((s) => ({ ...s, place, street: parts.street ?? null, houseNumber: parts.houseNumber ?? null }))
        }
      />
      {stop.street === null ? (
        <Text testID={`stop-${which}-only-area`} className="font-sans text-[13px] leading-[19px] text-ink-700">
          {t('booking.stops.onlyArea', { area: stop.place.district ?? stop.place.area })}
        </Text>
      ) : null}
      <TextField
        testID={`stop-${which}-details`}
        label={`${t('booking.stops.detailsLabel')} · ${label}`}
        placeholder={t('booking.stops.detailsPlaceholder')}
        value={stop.details}
        onChangeText={(details) => onChange((s) => ({ ...s, details }))}
        maxLength={STOP_DETAILS_MAX}
        error={problems.includes('place') ? t('booking.stops.detailsRequired') : undefined}
        announceError={false}
      />
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text className="font-sans text-[13px] text-ink-600">{t('booking.stops.floor')}</Text>
        <Stepper
          testID={`stop-${which}-floor`}
          value={stop.floor}
          min={0}
          max={60}
          label={`${label}: ${t('booking.stops.floor')}`}
          decreaseLabel={t('booking.stops.lower')}
          increaseLabel={t('booking.stops.higher')}
          valueText={stop.floor === 0 ? t('booking.stops.ground') : t('booking.stops.floorN', { n: stop.floor })}
          onChange={(floor) => onChange((s) => ({ ...s, floor }))}
        />
      </View>
      {stop.floor > 0 ? (
        <View className="gap-1.5">
          <ChipGroup
            testID={`stop-${which}-lift`}
            label={t('booking.stops.lift')}
            accessibilityLabel={[`${label}: ${t('booking.stops.lift')}`, liftError].filter(Boolean).join(', ')}
            value={stop.hasLift === null ? null : stop.hasLift ? 'yes' : 'no'}
            options={[
              { value: 'yes', label: t('booking.stops.liftYes') },
              { value: 'no', label: t('booking.stops.liftNo') },
            ]}
            onChange={(v) => onChange((s) => ({ ...s, hasLift: v === 'yes' }))}
          />
          {liftError ? (
            <Text aria-hidden className="font-sans text-[13px] text-danger">
              {liftError}
            </Text>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
}
