import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { Button, DarkPanel, Display, Pill, announce, formatClockTime, formatMoveDay } from '@movershub/mobile';
import { formatMoney, formatNumber, localDay, resolveLocale, stopArea, type Locale, type MoverJobRow } from '@movershub/shared';

import { useJobStep, useMoverJobs } from '@/lib/jobs';

import { hourText } from '../booking/when-screen';

/**
 * The mover's job requests and accepted moves, on the mover home (design/DECISIONS.md #35; COMPLIANCE
 * §2, §9.1): each request with the area of each stop, the day, the work and their own price and payout
 * — the exact places only once they accept. Accepting or declining is free; declining changes nothing
 * for them. Hidden while there is none.
 */
export function MoverJobs() {
  const { t } = useTranslation();
  const jobs = useMoverJobs();
  const rows = jobs.data ?? [];
  const requests = rows.filter((r) => r.offer_status === 'offered');
  const accepted = rows.filter((r) => r.offer_status === 'accepted');
  if (rows.length === 0) return null;
  return (
    <View className="gap-5">
      {requests.length ? (
        <View testID="job-requests" className="gap-3">
          <Text accessibilityRole="header" className="font-sans-medium text-base text-night-50">
            {t('mover.jobs.requestsTitle')}
          </Text>
          {requests.map((row) => (
            <Request key={row.offer_id} row={row} />
          ))}
        </View>
      ) : null}
      {accepted.length ? (
        <View testID="my-jobs" className="gap-3">
          <Text accessibilityRole="header" className="font-sans-medium text-base text-night-50">
            {t('mover.jobs.acceptedTitle')}
          </Text>
          {accepted.map((row) => (
            <Accepted key={row.offer_id} row={row} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** "Tuesday 20 October, 10:00". */
function when(row: MoverJobRow, locale: Locale) {
  const at = new Date(row.scheduled_at);
  return `${formatMoveDay(localDay(at), locale, { long: true })}, ${hourText(at.getHours())}`;
}

/** The work, in one place: van, crew, floors and lift at each end, the things to move. */
function Work({ row }: { row: MoverJobRow }) {
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

/** Their payout, large; their own price and the commission beside it (COMPLIANCE §1, §12: "Payout"). */
function Payout({ row }: { row: MoverJobRow }) {
  const { t, i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);
  return (
    <View className="flex-row items-end justify-between gap-3 border-t border-night-600 pt-3">
      <View>
        <Text className="font-sans text-[11.5px] text-sage-400">{t('landing.movers.phone.payout')}</Text>
        <Display size={28} tone="dark" accent accessibilityRole="text">
          {formatMoney(row.mover_payout, row.currency, locale)}
        </Display>
      </View>
      <Text className="text-right font-sans text-[11.5px] leading-[15px] text-sage-400">
        {t('landing.movers.phone.breakdown', { price: formatMoney(row.mover_price, row.currency, locale), pct: row.take_rate_pct })}
      </Text>
    </View>
  );
}

function Request({ row }: { row: MoverJobRow }) {
  const { t, i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);
  const step = useJobStep();
  const [problem, setProblem] = useState<string | null>(null);

  const answer = async (action: 'accept' | 'decline') => {
    setProblem(null);
    const result = await step.mutateAsync({ action, offerId: row.offer_id });
    if (result.ok) {
      announce(action === 'accept' ? t('mover.jobs.acceptedDone') : t('mover.jobs.declinedDone'));
      return;
    }
    const known = ['offer_expired', 'already_answered', 'not_open', 'not_eligible'];
    setProblem(known.includes(result.error) ? t(`mover.jobs.errors.${result.error as 'offer_expired'}`) : t('common.errorGeneric'));
  };

  return (
    <DarkPanel className="gap-3">
      <View testID={`job-request-${row.job_id}`} className="gap-3">
        <Pill tone="accent-soft" size="sm">
          {t('landing.movers.phone.newRequest')}
        </Pill>
        <Display size={22} tone="dark">
          {when(row, locale)}
        </Display>
        <Text className="font-sans-semibold text-[14px] text-night-50">
          {`${stopArea(row.pickup_area, row.pickup_district)} → ${stopArea(row.dropoff_area, row.dropoff_district)}`}
        </Text>
        <Text className="-mt-2 font-sans text-[11.5px] text-sage-400">{t('landing.movers.phone.district')}</Text>
        <Work row={row} />
        <Payout row={row} />
        <Text testID={`job-request-${row.job_id}-until`} className="font-sans text-[12.5px] text-sage-400">
          {t('mover.jobs.answerBy', {
            date: formatMoveDay(localDay(new Date(row.offer_expires_at)), locale),
            time: formatClockTime(row.offer_expires_at, locale),
          })}
        </Text>
      </View>
      <View className="flex-row gap-2.5">
        <Button
          testID={`job-request-${row.job_id}-decline`}
          variant="outline-dark"
          className="flex-1"
          title={t('landing.movers.phone.decline')}
          disabled={step.isPending}
          onPress={() => void answer('decline')}
        />
        <Button
          testID={`job-request-${row.job_id}-accept`}
          variant="accent"
          className="flex-[1.4]"
          title={t('landing.movers.phone.accept')}
          loading={step.isPending}
          onPress={() => void answer('accept')}
        />
      </View>
      <Text className="font-sans text-[12px] leading-[17px] text-sage-400">{t('mover.jobs.declineNote')}</Text>
      {problem ? (
        <Text role="alert" className="font-sans text-[13px] text-danger-on-dark">
          {problem}
        </Text>
      ) : null}
    </DarkPanel>
  );
}

/** An accepted move: now with the exact places and the customer's directions. Its steps follow (build step 6). */
function Accepted({ row }: { row: MoverJobRow }) {
  const { t, i18n } = useTranslation();
  const locale = resolveLocale(i18n.language);
  return (
    <DarkPanel className="gap-3">
      <View testID={`my-job-${row.job_id}`} className="gap-3">
        <Pill tone="dark" size="sm">
          {t('mover.jobs.accepted')}
        </Pill>
        <Display size={22} tone="dark">
          {when(row, locale)}
        </Display>
        <Place label={t('landing.quote.pickup')} place={row.pickup_label} details={row.pickup_details} testID={`my-job-${row.job_id}-pickup`} />
        <Place label={t('landing.quote.dropoff')} place={row.dropoff_label} details={row.dropoff_details} testID={`my-job-${row.job_id}-dropoff`} />
        <Work row={row} />
        <Payout row={row} />
      </View>
    </DarkPanel>
  );
}

function Place({ label, place, details, testID }: { label: string; place: string | null; details: string | null; testID: string }) {
  const { t } = useTranslation();
  return (
    <View testID={testID} className="gap-0.5">
      <Text className="font-sans text-[12px] text-sage-400">{label}</Text>
      <Text className="font-sans-semibold text-[15px] text-night-50">{place ?? '—'}</Text>
      {details ? <Text className="font-sans text-[13px] text-night-50">{t('mover.jobs.directions', { text: details })}</Text> : null}
    </View>
  );
}
