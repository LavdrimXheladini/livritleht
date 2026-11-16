import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Pressable, Text, View } from 'react-native';

import { Display, Pill, formatClockTime, formatMoveDay } from '@movershub/mobile';
import { directionsUrl, formatMoney, formatNumber, localDay, resolveLocale, type Locale, type MoverJobRow } from '@movershub/shared';

import { hourText } from '../booking/when-screen';
import { ExternalLink } from '../external-link';

// Parts of a job as the mover sees it, on the home (requests, jobs) and on the job screen.

/** "Tuesday 20 October, 10:00". */
export function when(row: MoverJobRow, locale: Locale) {
  const at = new Date(row.scheduled_at);
  return `${formatMoveDay(localDay(at), locale, { long: true })}, ${hourText(at.getHours())}`;
}

/** A moment as the texts' {{date}} and {{time}} ("Tue 20 Oct", "08:47"). */
export function dateTime(iso: string, locale: Locale) {
  return { date: formatMoveDay(localDay(new Date(iso)), locale), time: formatClockTime(iso, locale) };
}

/** The work, in one place: van, crew, floors and lift at each end, the things to move. */
export function Work({ row }: { row: MoverJobRow }) {
  const { t, i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);
  const level = (floor: number, lift: boolean) =>
    floor === 0 ? t('booking.stops.ground') : `${t('booking.stops.floorN', { n: floor })} · ${lift ? t('booking.stops.liftYes') : t('booking.stops.liftNo')}`;
  return (
    <View className="gap-2">
      <View className="flex-row flex-wrap gap-1.5">
        <Pill tone="dark" shape="tag">
          {t(`vehicles.${row.vehicle_class}.name`)}
        </Pill>
        <Pill tone="dark" shape="tag">
          {t(`landing.movers.phone.crew${row.helpers as 1 | 2 | 3}`)}
        </Pill>
        <Pill tone="dark" shape="tag">
          {`${formatNumber(row.distance_km, locale)} km`}
        </Pill>
      </View>
      <Text className="font-sans text-[13px] leading-[18px] text-sage-400">
        {t('mover.jobs.levels', { pickup: level(row.pickup_floor, row.pickup_has_lift), dropoff: level(row.dropoff_floor, row.dropoff_has_lift) })}
      </Text>
      <Text className="font-sans text-[13px] leading-[18px] text-night-50">
        {row.items.map((it) => `${t(`items.${it.key}`)} × ${formatNumber(it.qty, locale)}`).join(' · ')}
      </Text>
    </View>
  );
}

/**
 * The payout, large — what the mover receives, like the trip requests of ride apps. Their own price
 * and the commission it comes from are one tap away ("Details"), so both are known before accepting
 * (COMPLIANCE §1.1; §12: "Payout").
 */
export function PayoutLine({
  payout,
  breakdown,
  size = 28,
  toggle = true,
}: {
  payout: string;
  breakdown: string;
  size?: number;
  /** False inside a card that is itself a button: the details then show without a tap. */
  toggle?: boolean;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <View className="gap-1 border-t border-night-600 pt-3">
      <View className="flex-row items-end justify-between gap-3">
        <View>
          <Text className="font-sans text-[11.5px] text-sage-400">{t('landing.movers.phone.payout')}</Text>
          <Display size={size} tone="dark" accent accessibilityRole="text">
            {payout}
          </Display>
        </View>
        {toggle ? (
          <Pressable
            testID="payout-details"
            accessibilityRole="button"
            accessibilityState={{ expanded: open }}
            onPress={() => setOpen(!open)}
            className="min-h-11 justify-center px-1 active:opacity-60"
          >
            <Text className="font-sans-medium text-[13px] text-accent-300 underline">{open ? t('mover.payoutHide') : t('mover.payoutDetails')}</Text>
          </Pressable>
        ) : null}
      </View>
      {open || !toggle ? (
        <Text testID="payout-breakdown" className="font-sans text-[12.5px] leading-[18px] text-sage-400">
          {breakdown.replace('\n', ' · ')}
        </Text>
      ) : null}
    </View>
  );
}

/** A job's payout with its details (see PayoutLine). */
export function Payout({ row, toggle = true }: { row: MoverJobRow; toggle?: boolean }) {
  const { t, i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);
  return (
    <PayoutLine
      toggle={toggle}
      payout={formatMoney(row.mover_payout, row.currency, locale)}
      breakdown={t('landing.movers.phone.breakdown', { price: formatMoney(row.mover_price, row.currency, locale), pct: row.take_rate_pct })}
    />
  );
}

/** A stop's exact place and the customer's directions (only once accepted). */
export function Place({ label, place, details, testID }: { label: string; place: string | null; details: string | null; testID: string }) {
  const { t } = useTranslation();
  return (
    <View testID={testID} className="gap-0.5">
      <Text className="font-sans text-[12px] text-sage-400">{label}</Text>
      <Text selectable className="font-sans-semibold text-[15px] text-night-50">
        {place ?? '—'}
      </Text>
      {details ? <Text className="font-sans text-[13px] text-night-50">{t('mover.jobs.directions', { text: details })}</Text> : null}
    </View>
  );
}

/**
 * The customer's phone for the move day and who to ask for (design/DECISIONS.md #37; COMPLIANCE §9):
 * on an accepted move only, until it is done or cancelled — the server leaves it out otherwise.
 */
export function CustomerContact({ row }: { row: MoverJobRow }) {
  const { t: tj } = useTranslation('job');
  const phone = row.contact_phone;
  if (!phone) return null;
  return (
    <View testID="mover-job-contact" className="gap-1.5 rounded-panel border border-night-600 bg-night-800 p-3.5">
      <Text className="font-sans text-[12px] text-sage-400">{tj('mover.customer.title')}</Text>
      {row.contact_name ? (
        <Text selectable className="font-sans-semibold text-[15px] text-night-50">
          {tj('mover.customer.askFor', { name: row.contact_name })}
        </Text>
      ) : null}
      <ExternalLink testID="mover-job-contact-call" href={`tel:${phone.replace(/[^\d+]/g, '')}`} title={tj('mover.customer.call', { phone })} />
      <Text className="font-sans text-[12px] leading-[17px] text-sage-400">{tj('mover.customer.note')}</Text>
    </View>
  );
}

const OS = Platform.OS === 'android' ? 'android' : Platform.OS === 'ios' ? 'ios' : 'web';

/**
 * A stop on the job screen: the exact place, floor and lift, the customer's directions, and "Open in
 * maps" — a destination for the phone's maps app, never a route (COMPLIANCE §2). Exact data only while
 * the move needs it (COMPLIANCE §9.1); a stop the map knows only by town says so.
 */
export function StopCard({ row, stop, testID }: { row: MoverJobRow; stop: 'pickup' | 'dropoff'; testID: string }) {
  const { t } = useTranslation();
  const { t: tj } = useTranslation('job');
  const label = row[`${stop}_label`];
  const lat = row[`${stop}_lat`];
  const lon = row[`${stop}_lon`];
  const floor = row[`${stop}_floor`];
  const level =
    floor === 0 ? t('booking.stops.ground') : `${t('booking.stops.floorN', { n: floor })} · ${row[`${stop}_has_lift`] ? t('booking.stops.liftYes') : t('booking.stops.liftNo')}`;
  return (
    <View testID={testID} className="gap-1.5 rounded-panel border border-night-600 bg-night-800 p-3.5">
      <Place label={t(stop === 'pickup' ? 'landing.quote.pickup' : 'landing.quote.dropoff')} place={label} details={row[`${stop}_details`]} testID={`${testID}-place`} />
      <Text className="font-sans text-[13px] text-sage-400">{level}</Text>
      {label && row[`${stop}_street`] === null ? <Text className="font-sans text-[12.5px] leading-[17px] text-sage-400">{tj('mover.townOnly')}</Text> : null}
      {lat !== null && lon !== null ? (
        <ExternalLink
          testID={`${testID}-maps`}
          href={directionsUrl({ lat, lon }, OS)}
          fallback={OS === 'android' ? directionsUrl({ lat, lon }, 'web') : undefined}
          title={tj('mover.openInMaps')}
          hint={tj('mover.openInMapsHint')}
        />
      ) : null}
    </View>
  );
}
