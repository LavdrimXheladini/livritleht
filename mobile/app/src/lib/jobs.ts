import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { GPS_ACTIVE_STATUSES, moverJobRowSchema, type JobStatus, type JobTransition, type MoverJobRow } from '@movershub/shared';
import { useAuth } from '@movershub/mobile';

import { callFunction, type Called } from './functions';

export const moverJobsKey = (userId: string | undefined) => ['mover-jobs', userId] as const;

const UNDER_WAY: readonly JobStatus[] = GPS_ACTIVE_STATUSES;

/**
 * How often the mover's list is asked again: every 30 seconds while a move is under way or "On my way"
 * can be marked (the customer may cancel, a step may be needed), else every minute (new requests).
 */
export function moverJobsRefresh(rows: readonly MoverJobRow[] | undefined, now = Date.now()): number {
  const busy = rows?.some(
    (r) =>
      r.offer_status === 'accepted' &&
      (UNDER_WAY.includes(r.status) || (r.status === 'ACCEPTED' && r.on_my_way_from !== null && Date.parse(r.on_my_way_from) <= now)),
  );
  return busy ? 30_000 : 60_000;
}

/**
 * The signed-in mover's open job requests, accepted moves and the moves that ended in the last 7 days
 * (public.my_mover_jobs, design/DECISIONS.md #35, #36): the area only until accepted, the exact places
 * only while the move needs them (COMPLIANCE §9.1). Asked again while open (see `moverJobsRefresh`) and
 * when the app comes back.
 */
export function useMoverJobs() {
  const { supabase, session } = useAuth();
  const userId = session?.user.id;
  return useQuery<MoverJobRow[]>({
    queryKey: moverJobsKey(userId),
    enabled: userId !== undefined,
    networkMode: 'always',
    retry: 1,
    staleTime: 20_000,
    refetchInterval: (query) => moverJobsRefresh(query.state.data),
    queryFn: async ({ signal }): Promise<MoverJobRow[]> => {
      const { data, error } = await supabase.rpc('my_mover_jobs', { p_include_ended: true }).abortSignal(signal);
      if (error) throw error;
      return moverJobRowSchema.array().parse(data);
    },
  });
}

/** One of the mover's accepted moves (the job screen), from the same list. */
export function useMoverJob(jobId: string | undefined) {
  const jobs = useMoverJobs();
  const row = jobs.data?.find((r) => r.job_id === jobId && r.offer_status === 'accepted');
  return { ...jobs, row };
}

export type StepAnswer = { status: string; offerId?: string; fee?: number; confirmedAt?: string };

/**
 * One step of a job through the `job-transition` function (book with a test mover, accept, decline,
 * cancel, the mover's steps, the mover's cancel, confirm). The answer is `Called`: the function's reason
 * when it refused (e.g. `offer_expired`), with the rest of its answer (`fee_changed`: the new fee;
 * `too_early`: from when). Both sides' lists, and the move's photos, are asked again after every step.
 */
export function useJobStep() {
  const { supabase, session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  return useMutation({
    networkMode: 'always',
    mutationFn: (step: JobTransition): Promise<Called<StepAnswer>> => callFunction(supabase, 'job-transition', step),
    onSettled: (_answer, _error, step) => {
      void queryClient.invalidateQueries({ queryKey: moverJobsKey(userId) });
      void queryClient.invalidateQueries({ queryKey: ['my-moves'] });
      if ('jobId' in step) void queryClient.invalidateQueries({ queryKey: ['job-photos', step.jobId] });
    },
  });
}
