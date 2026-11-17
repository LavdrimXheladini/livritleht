import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button, currentLocale, useAuth } from '@movershub/mobile';
import type { GeoSuggestion, Place } from '@movershub/shared';

import { deviceLocation } from '@/lib/device-location';
import { callFunction } from '@/lib/functions';
import type { MapPoint } from '@/lib/pin-map-html';

import { PinMap } from '../pin-map';

/**
 * How far the pin may be from the address found by the search where the map knows no address at the
 * pin: the town and the neighbourhood then stay the search's, so a place further away is searched for.
 */
export const PIN_MAX_METRES = 1000;

/** Metres between two points (great circle). */
export function metresBetween(a: MapPoint, b: MapPoint): number {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 2 * 6_371_000 * Math.asin(Math.sqrt(h));
}

/** What the pin gives: the point, and the address the map knows there (null = none, the address stays). */
export type Pinned = { point: MapPoint; found: GeoSuggestion | null };

/**
 * "Pin the exact place": the map opens on the address, the customer moves it until the pin in the
 * middle is on their entrance, and that point becomes the stop's — with the address the map knows
 * there (street, number, town), asked from the `places` function. Where the map knows none, the
 * address stays the search's and the pin must be near it (`from`: where the search put it).
 * `here`: the stop is not exact yet (a town only), so the map goes to where the phone is — most
 * people pin the place they are at. "My location" does the same on request.
 */
export function PinPlace({
  place,
  from,
  here,
  onUse,
  onClose,
}: {
  place: Place;
  from: MapPoint;
  here: boolean;
  onUse: (pinned: Pinned) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { supabase } = useAuth();
  const locale = currentLocale();
  // Where the map opens: the stop's point now. Kept for as long as the map is open.
  const [start] = useState<MapPoint>({ lat: place.lat, lon: place.lon });
  const [centre, setCentre] = useState<MapPoint>(start);
  const [looking, setLooking] = useState(false);
  const [problem, setProblem] = useState(false);
  // The device's location: where the map is sent, and whether it is being asked for or wasn't given.
  const [target, setTarget] = useState<MapPoint | null>(null);
  const [locating, setLocating] = useState(here);
  const [noLocation, setNoLocation] = useState(false);
  const located = (found: MapPoint | null) => {
    setLocating(false);
    setNoLocation(found === null);
    if (!found) return;
    // The pin is there at once (the map follows and reports the same centre).
    setTarget({ ...found });
    setCentre(found);
    setProblem(false);
  };
  const locate = () => {
    setLocating(true);
    setNoLocation(false);
    void deviceLocation().then(located);
  };
  useEffect(() => {
    if (!here) return;
    let open = true;
    void deviceLocation().then((found) => {
      if (open) located(found);
    });
    return () => {
      open = false;
    };
    // Once, when the map opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const move = (point: MapPoint) => {
    setCentre(point);
    setProblem(false);
  };
  const use = async () => {
    if (looking) return;
    setLooking(true);
    const answer = await callFunction<{ suggestions: GeoSuggestion[] }>(supabase, 'places', { at: centre, locale }, 8_000);
    setLooking(false);
    const found = answer.ok ? (answer.data.suggestions[0] ?? null) : null;
    if (!found && metresBetween(from, centre) > PIN_MAX_METRES) {
      setProblem(true);
      return;
    }
    onUse({ point: centre, found });
  };
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View testID="pin-place" className="flex-1 bg-stone-200">
        <View className="flex-1">
          <PinMap start={start} target={target} onMove={move} />
          {/* The pin: fixed over the middle of the map, its tip on the centre. */}
          <View aria-hidden pointerEvents="none" className="absolute inset-0 items-center justify-center">
            <View style={{ transform: [{ translateY: -21 }, { rotate: '-45deg' }] }} className="size-[34px] items-center justify-center rounded-full rounded-bl-none border-[3px] border-stone-50 bg-brand-500 shadow-lift">
              <View className="size-2.5 rounded-full bg-accent-300" />
            </View>
          </View>
        </View>
        <View className="-mt-5 gap-3 rounded-t-[28px] bg-stone-50 px-5 pt-5" style={{ paddingBottom: insets.bottom + 20 }}>
          <Text accessibilityRole="header" className="font-sans-semibold text-base text-ink-900">
            {place.label}
          </Text>
          <Text testID="pin-note" accessibilityLiveRegion="polite" className={problem ? 'font-sans text-[13.5px] leading-5 text-danger' : 'font-sans text-[13.5px] leading-5 text-ink-700'}>
            {problem ? t('booking.stops.pinTooFar') : t('booking.stops.pinHint')}
          </Text>
          {noLocation ? (
            <Text testID="pin-no-location" accessibilityLiveRegion="polite" className="font-sans text-[13px] leading-[19px] text-ink-700">
              {t('booking.stops.pinNoLocation')}
            </Text>
          ) : null}
          <View className="flex-row flex-wrap gap-2">
            <Button testID="pin-use" size="md" title={t('booking.stops.pinUse')} loading={looking} onPress={() => void use()} />
            <Button testID="pin-here" variant="outline" size="md" title={t('booking.stops.pinHere')} loading={locating} disabled={looking} onPress={locate} />
            <Button testID="pin-close" variant="outline" size="md" title={t('common.close')} disabled={looking} onPress={onClose} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
