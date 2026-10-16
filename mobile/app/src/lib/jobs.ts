import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { moverJobRowSchema, type JobTransition, type MoverJobRow } from '@movershub/shared';
import { useAuth } from '@movershub/mobile';

import { callFunction, type Called } from './functions';

const moverJobsKey = (userId: string | undefined) => ['mover-jobs', userId] as const;

/**
 * The signed-in mover's open job requests and accepted moves (public.my_mover_jobs, design/DECISIONS.md
 * #35): the area only until accepted (COMPLIANCE §9.1). Asked again every minute while open, and when
 * the app comes back.
 */
export function useMoverJobs() {
  const { supabase, session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: moverJobsKey(userId),
    enabled: userId !== undefined,
    networkMode: 'always',
    retry: 1,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async ({ signal }): Promise<MoverJobRow[]> => {
      const { data, error } = await supabase.rpc('my_mover_jobs').abortSignal(signal);
      if (error) throw error;
      return moverJobRowSchema.array().parse(data);
    },
  });
}

/**
 * One step of a job through the `job-transition` function (book with a test mover, accept, decline,
 * cancel). The answer is `Called`: the function's reason when it refused (e.g. `offer_expired`). Both
 * sides' lists are asked again after every step.
 */
export function useJobStep() {
  const { supabase, session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  return useMutation({
    networkMode: 'always',
    mutationFn: (step: JobTransition): Promise<Called<{ status: string; offerId?: string }>> => callFunction(supabase, 'job-transition', step),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: moverJobsKey(userId) });
      void queryClient.invalidateQueries({ queryKey: ['my-moves'] });
    },
  });
}
