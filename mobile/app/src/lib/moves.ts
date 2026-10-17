import { useQuery } from '@tanstack/react-query';

import { GPS_ACTIVE_STATUSES, JOB_COLUMNS, ON_MY_WAY_HOURS_BEFORE, jobRowSchema, type JobRow, type JobStatus } from '@movershub/shared';
import { useAuth } from '@movershub/mobile';

/** How many of their moves a customer sees (newest first). */
const MOVES_SHOWN = 20;

const UNDER_WAY: readonly JobStatus[] = GPS_ACTIVE_STATUSES;

/**
 * How often the customer's moves are asked again: every 30 seconds while a mover is on the move day
 * (from 6 hours before the arrival time), every minute while a mover may answer a request, every 5
 * minutes while an accepted move is further off; not at all otherwise.
 */
export function myMovesRefresh(jobs: readonly JobRow[] | undefined, now = Date.now()): number | false {
  if (!jobs) return false;
  const day = (j: JobRow) => Date.parse(j.scheduled_at) - ON_MY_WAY_HOURS_BEFORE * 3_600_000 <= now;
  if (jobs.some((j) => UNDER_WAY.includes(j.status) || (j.status === 'ACCEPTED' && day(j)))) return 30_000;
  if (jobs.some((j) => j.status === 'OFFERED')) return 60_000;
  if (jobs.some((j) => j.status === 'ACCEPTED')) return 300_000;
  return false;
}

/**
 * The signed-in customer's moves (RLS: their own only), newest first, each with its latest quote —
 * "My moves" (design/DECISIONS.md #28), with the requests to movers (#35) and the move day's log and a
 * cancellation after acceptance (#36). Refreshed after every booking request (`useBookRequest`) and every
 * step (`useJobStep`), and while something may change (`myMovesRefresh`).
 */
export function useMyMoves() {
  const { supabase, session } = useAuth();
  const userId = session?.user.id;
  return useQuery<JobRow[]>({
    queryKey: ['my-moves', userId],
    enabled: userId !== undefined,
    networkMode: 'always',
    retry: 1,
    staleTime: 30_000,
    refetchInterval: (query) => myMovesRefresh(query.state.data),
    queryFn: async ({ signal }): Promise<JobRow[]> => {
      const { data, error } = await supabase
        .from('jobs')
        .select(JOB_COLUMNS)
        .order('created_at', { ascending: false })
        .order('created_at', { referencedTable: 'quotes', ascending: false })
        .limit(1, { referencedTable: 'quotes' })
        .order('created_at', { referencedTable: 'job_offers', ascending: false })
        .order('id', { referencedTable: 'job_events', ascending: true })
        .limit(MOVES_SHOWN)
        .abortSignal(signal);
      if (error) throw error;
      return jobRowSchema.array().parse(data);
    },
  });
}
