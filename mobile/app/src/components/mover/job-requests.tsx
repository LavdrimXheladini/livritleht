import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { Button, DarkPanel, Display, Pill, announce, formatClockTime, formatMoveDay } from '@movershub/mobile';
import { GPS_ACTIVE_STATUSES, formatMoney, localDay, resolveLocale, stopArea, type JobStatus, type MoverJobRow } from '@movershub/shared';

import { useJobPhotoQueue } from '@/lib/job-photos';
import { useJobStep, useMoverJobs } from '@/lib/jobs';

import { Payout, Work, when } from './job-parts';

const UNDER_WAY: readonly JobStatus[] = GPS_ACTIVE_STATUSES;
const openJob = (jobId: string) => router.push({ pathname: '/mover/jobs/[id]', params: { id: jobId } });

/**
 * The mover's jobs on their home (design/DECISIONS.md #35, #36; COMPLIANCE §2, §9.1): a move under way
 * first, then requests to answer — the area of each stop, the day, the work and their own price and
 * payout, the exact places only once they accept — then accepted jobs (each opens its job screen), then
 * the jobs that ended in the last 7 days (areas only). Accepting or declining is free; declining changes
 * nothing for them. Hidden while there is none.
 */
export function MoverJobs() {
  const { t } = useTranslation();
  const { t: tj } = useTranslation('job');
  const jobs = useMoverJobs();
  // Photos not sent yet go out from here too (e.g. after the app was closed at a stop).
  useJobPhotoQueue();
  const rows = jobs.data ?? [];
  const accepted = rows.filter((r) => r.offer_status === 'accepted');
  const inProgress = accepted.filter((r) => UNDER_WAY.includes(r.status));
  const requests = rows.filter((r) => r.offer_status === 'offered');
  const upcoming = accepted.filter((r) => r.status === 'ACCEPTED');
  const recent = accepted.filter((r) => r.ended_at !== null).sort((a, b) => Date.parse(b.ended_at ?? '') - Date.parse(a.ended_at ?? ''));
  if (jobs.isError && !jobs.data) {
    return (
      <View testID="jobs-load-failed" className="gap-2">
        <Text role="alert" className="font-sans text-[14px] leading-5 text-danger-on-dark">
          {tj('mover.home.loadFailed')}
        </Text>
        <Button variant="outline-dark" size="md" className="self-start" title={t('common.retry')} loading={jobs.isFetching} onPress={() => void jobs.refetch()} />
      </View>
    );
  }
  if (rows.length === 0) return null;
  return (
    <View className="gap-5">
      {inProgress.length ? (
        <View testID="jobs-in-progress" className="gap-3">
          <Text accessibilityRole="header" className="font-sans-medium text-base text-night-50">
            {tj('mover.home.inProgressTitle')}
          </Text>
          {inProgress.map((row) => (
            <InProgress key={row.offer_id} row={row} />
          ))}
        </View>
      ) : null}
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
      {upcoming.length ? (
        <View testID="my-jobs" className="gap-3">
          <Text accessibilityRole="header" className="font-sans-medium text-base text-night-50">
            {t('mover.jobs.acceptedTitle')}
          </Text>
          {upcoming.map((row) => (
            <Accepted key={row.offer_id} row={row} />
          ))}
        </View>
      ) : null}
      {recent.length ? (
        <View testID="recent-jobs" className="gap-2">
          <Text accessibilityRole="header" className="font-sans-medium text-base text-night-50">
            {tj('mover.home.recentTitle')}
          </Text>
          <Text className="font-sans text-[12.5px] text-sage-400">{tj('mover.home.recentNote')}</Text>
          {recent.map((row) => (
            <Recent key={row.offer_id} row={row} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

/** A move under way: where it stands and since when, the areas, and the way into the job. */
function InProgress({ row }: { row: MoverJobRow }) {
  const { t: tj, i18n } = useTranslation('job');
  const locale = resolveLocale(i18n.language);
  return (
    <DarkPanel className="gap-3">
      <View testID={`mover-now-${row.job_id}`} className="gap-2">
        <Pill tone="accent" size="sm">
          {tj(`mover.state.${row.status as 'AT_PICKUP'}`)}
        </Pill>
        {row.last_event_at ? <Text className="font-sans text-[12.5px] text-sage-400">{tj('mover.since', { time: formatClockTime(row.last_event_at, locale) })}</Text> : null}
        <Text className="font-sans-semibold text-[15px] text-night-50">
          {`${stopArea(row.pickup_area, row.pickup_district)} → ${stopArea(row.dropoff_area, row.dropoff_district)}`}
        </Text>
      </View>
      <Button
        testID={`mover-now-${row.job_id}-open`}
        variant="accent"
        title={tj('mover.home.openJob')}
        accessibilityHint={tj('mover.home.openJobHint')}
        onPress={() => openJob(row.job_id)}
      />
    </DarkPanel>
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

/** An accepted job before the move day starts: the exact places now, and its job screen. */
function Accepted({ row }: { row: MoverJobRow }) {
  const { t, i18n } = useTranslation();
  const { t: tj } = useTranslation('job');
  const locale = resolveLocale(i18n.language);
  return (
    <Pressable
      testID={`my-job-${row.job_id}`}
      accessibilityRole="button"
      accessibilityHint={tj('mover.home.openJobHint')}
      onPress={() => openJob(row.job_id)}
      className="gap-2 rounded-panel bg-night-800 p-3.5 active:bg-night-700"
    >
      <Pill tone="dark" size="sm">
        {t('mover.jobs.accepted')}
      </Pill>
      <Text className="font-sans-semibold text-[16px] text-night-50">{when(row, locale)}</Text>
      <View testID={`my-job-${row.job_id}-pickup`} className="gap-0.5">
        <Text className="font-sans text-[12px] text-sage-400">{t('landing.quote.pickup')}</Text>
        <Text className="font-sans-medium text-[14px] text-night-50">{row.pickup_label ?? '—'}</Text>
      </View>
      <View className="gap-0.5">
        <Text className="font-sans text-[12px] text-sage-400">{t('landing.quote.dropoff')}</Text>
        <Text className="font-sans-medium text-[14px] text-night-50">{row.dropoff_label ?? '—'}</Text>
      </View>
      <Payout row={row} />
    </Pressable>
  );
}

/** A job that ended in the last 7 days: the areas only, how it ended, a cancellation charge if any. */
function Recent({ row }: { row: MoverJobRow }) {
  const { t: tj, i18n } = useTranslation('job');
  const locale = resolveLocale(i18n.language);
  const state = row.status === 'COMPLETED' ? tj('mover.state.COMPLETED') : row.cancelled_by === 'mover' ? tj('mover.state.cancelledByYou') : tj('mover.state.cancelledByCustomer');
  return (
    <Pressable
      testID={`recent-job-${row.job_id}`}
      accessibilityRole="button"
      onPress={() => openJob(row.job_id)}
      className="gap-1.5 rounded-panel border border-night-600 p-3 active:bg-night-800"
    >
      <View className="flex-row flex-wrap items-center gap-2">
        <Pill tone="dark-muted" size="sm">
          {state}
        </Pill>
        {row.cancellation_fee ? (
          <Text className="font-sans text-[12px] text-accent-300">{tj('mover.feeShort', { amount: formatMoney(row.cancellation_fee, row.currency, locale) })}</Text>
        ) : null}
      </View>
      <Text className="font-sans text-[13px] text-night-50">
        {`${when(row, locale)} · ${stopArea(row.pickup_area, row.pickup_district)} → ${stopArea(row.dropoff_area, row.dropoff_district)}`}
      </Text>
    </Pressable>
  );
}
