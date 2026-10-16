import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { APPEAL_COLUMNS, DECISION_COLUMNS, appealRowSchema, decisionRowSchema, type AppealRow, type DecisionRow } from '@movershub/shared';
import { useAuth } from '@movershub/mobile';

const decisionsKey = (userId: string | undefined) => ['mover-decisions', userId] as const;
const complaintsKey = (userId: string | undefined) => ['mover-complaints', userId] as const;

/**
 * Decisions about the signed-in mover's company — a suspension, or the account ending — with their
 * appeals (RLS: their own, once they were told; COMPLIANCE §3, design/DECISIONS.md #32). Newest first.
 */
export function useDecisions() {
  const { supabase, session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: decisionsKey(userId),
    enabled: userId !== undefined,
    networkMode: 'always',
    retry: 1,
    staleTime: 60_000,
    queryFn: async ({ signal }): Promise<DecisionRow[]> => {
      const { data, error } = await supabase
        .from('suspensions')
        .select(DECISION_COLUMNS)
        .order('notice_sent_at', { ascending: false })
        .abortSignal(signal);
      if (error) throw error;
      return decisionRowSchema.array().parse(data);
    },
  });
}

/** The mover's complaints about anything else (no decision), newest first, with MoversHub's answers. */
export function useComplaints() {
  const { supabase, session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: complaintsKey(userId),
    enabled: userId !== undefined,
    networkMode: 'always',
    retry: 1,
    staleTime: 60_000,
    queryFn: async ({ signal }): Promise<AppealRow[]> => {
      const { data, error } = await supabase
        .from('mover_appeals')
        .select(APPEAL_COLUMNS)
        .is('suspension_id', null)
        .order('created_at', { ascending: false })
        .abortSignal(signal);
      if (error) throw error;
      return appealRowSchema.array().parse(data);
    },
  });
}

/** Why sending was refused: the decision no longer applies, or three already wait for an answer. */
export type AppealProblem = 'not_appealable' | 'too_many_open' | 'failed';

/**
 * Sends an appeal of a decision (`suspensionId`), or a complaint about anything else (null). Postgres
 * sets an appeal's subject from the decision and refuses one that no longer applies.
 */
export function useSendAppeal() {
  const { supabase, session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  return useMutation({
    networkMode: 'always',
    mutationFn: async ({ companyId, suspensionId, text }: { companyId: string; suspensionId: string | null; text: string }): Promise<null | AppealProblem> => {
      const { error } = await supabase
        .from('mover_appeals')
        .insert({ company_id: companyId, suspension_id: suspensionId, subject: suspensionId ? 'suspension' : 'other', text });
      if (!error) return null;
      return error.message === 'not_appealable' || error.message === 'too_many_open' ? error.message : 'failed';
    },
    onSuccess: (problem, { suspensionId }) => {
      if (problem !== null) return;
      void queryClient.invalidateQueries({ queryKey: suspensionId ? decisionsKey(userId) : complaintsKey(userId) });
    },
  });
}
