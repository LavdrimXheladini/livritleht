import { router, useFocusEffect, useIsFocused } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Text, View } from 'react-native';

import { Button, Display, Pill, ProgressBar, Screen, announce } from '@movershub/mobile';
import { CANCELLABLE_AFTER_ACCEPTANCE, JOB_DAY_STEPS, cancellationTerms, resolveLocale, type JobStatus, type MoverJobRow } from '@movershub/shared';
import { colors } from '@movershub/ui';

import { useJobPhotoQueue, useJobPhotos } from '@/lib/job-photos';
import { useMoverJob } from '@/lib/jobs';

import { useCancellationText } from '../booking/cancellation';
import { CancelJob } from './cancel-job';
import { Payout, StopCard, Work, when } from './job-parts';
import { NextStep } from './next-step';

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** The status in the mover's words: the step, or who cancelled. */
export function useJobStateLabel() {
  const { t: tj } = useTranslation('job');
  return (row: MoverJobRow) =>
    row.status === 'CANCELLED'
      ? tj(row.cancelled_by === 'mover' ? 'mover.state.cancelledByYou' : 'mover.state.cancelledByCustomer')
      : tj(`mover.state.${row.status as 'ACCEPTED'}`);
}

const CANCELLABLE: readonly JobStatus[] = CANCELLABLE_AFTER_ACCEPTANCE;

/**
 * One accepted job (design/DECISIONS.md #36): where it stands, the one next step, the stops with "Open in
 * maps" (the exact places only while the move needs them — COMPLIANCE §9.1), the work and payout, and
 * cancelling until the things are loaded. Asked again when the screen comes back; a change the customer
 * made (a cancellation) is read out while the screen is in front.
 */
export function JobScreen({ id }: { id: string | undefined }) {
  const { t, i18n } = useTranslation();
  const { t: tj } = useTranslation('job');
  const locale = resolveLocale(i18n.language);
  const job = useMoverJob(id);
  const row = job.row;
  const photos = useJobPhotos(row ? row.job_id : undefined, { poll: row?.status === 'AT_PICKUP' || row?.status === 'AT_DROPOFF' });
  const stateLabel = useJobStateLabel();
  const describeCancellation = useCancellationText();
  useJobPhotoQueue();

  const { refetch } = job;
  useFocusEffect(
    useCallback(() => {
      void refetch();
    }, [refetch]),
  );

  // Read out a cancellation by the customer (this screen stays mounted behind others in the browser).
  const focused = useIsFocused();
  const seen = useRef<JobStatus | null>(null);
  useEffect(() => {
    if (!row) return;
    if (focused && seen.current && seen.current !== 'CANCELLED' && row.status === 'CANCELLED' && row.cancelled_by === 'customer') announce(stateLabel(row));
    seen.current = row.status;
  }, [row, focused, stateLabel]);

  const back = <Button testID="mover-job-back" variant="link-dark" className="self-start" title={`‹ ${t('common.back')}`} accessibilityLabel={t('common.back')} onPress={goBack} />;

  if (!row) {
    return (
      <Screen tone="dark">
        <StatusBar style="light" />
        {back}
        {job.isPending ? (
          <ActivityIndicator color={colors.accent[300]} />
        ) : job.isError ? (
          <View className="gap-3">
            <Text role="alert" className="font-sans text-[15px] text-danger-on-dark">
              {tj('mover.loadFailed')}
            </Text>
            <Button testID="mover-job-retry" variant="outline-dark" className="self-start" title={t('common.retry')} onPress={() => void refetch()} />
          </View>
        ) : (
          <Text testID="mover-job-not-found" className="font-sans text-[15px] leading-[22px] text-night-50">
            {tj('mover.notFound')}
          </Text>
        )}
      </Screen>
    );
  }

  const reached = JOB_DAY_STEPS.indexOf(row.status as (typeof JOB_DAY_STEPS)[number]);
  const terms = cancellationTerms(row);
  return (
    <Screen tone="dark">
      <StatusBar style="light" />
      {back}
      <View testID="mover-job" className="gap-4">
        <View className="gap-2">
          <View testID="mover-job-status">
            <Pill tone={row.status === 'CANCELLED' ? 'dark-muted' : 'accent'} size="sm">
              {stateLabel(row)}
            </Pill>
          </View>
          <Display size={26} tone="dark">
            {when(row, locale)}
          </Display>
          {reached >= 0 ? <ProgressBar value={reached / (JOB_DAY_STEPS.length - 1)} label={tj('mover.progress', { step: stateLabel(row) })} /> : null}
        </View>

        <NextStep row={row} photos={photos.data ?? []} />

        {row.pickup_label !== null ? (
          <>
            <StopCard row={row} stop="pickup" testID="mover-job-pickup" />
            <StopCard row={row} stop="dropoff" testID="mover-job-dropoff" />
          </>
        ) : null}

        <Work row={row} />
        {row.status === 'CANCELLED' || row.status === 'COMPLETED' ? null : <Payout row={row} />}
        {terms ? <Text className="font-sans text-[12.5px] leading-[17px] text-sage-400">{tj('mover.yourTerms', { terms: describeCancellation(terms) })}</Text> : null}
        {CANCELLABLE.includes(row.status) ? <CancelJob row={row} /> : null}
      </View>
    </Screen>
  );
}
