import { useQuery } from '@tanstack/react-query';

import { JOB_COLUMNS, jobRowSchema, type JobRow } from '@movershub/shared';
import { useAuth } from '@movershub/mobile';

/** How many of their moves a customer sees (newest first). */
const MOVES_SHOWN = 20;

/**
 * The signed-in customer's moves (RLS: their own only), newest first, each with its latest quote —
 * "My moves" (design/DECISIONS.md #28). Refreshed after every booking request (`useBookRequest`).
 */
export function useMyMoves() {
  const { supabase, session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['my-moves', userId],
    enabled: userId !== undefined,
    networkMode: 'always',
    retry: 1,
    staleTime: 30_000,
    queryFn: async ({ signal }): Promise<JobRow[]> => {
      const { data, error } = await supabase
        .from('jobs')
        .select(JOB_COLUMNS)
        .order('created_at', { ascending: false })
        .order('created_at', { referencedTable: 'quotes', ascending: false })
        .limit(1, { referencedTable: 'quotes' })
        .limit(MOVES_SHOWN)
        .abortSignal(signal);
      if (error) throw error;
      return jobRowSchema.array().parse(data);
    },
  });
}
