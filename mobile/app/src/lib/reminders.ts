import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { REMINDER_COLUMNS, reminderRowSchema, type ReminderRow } from '@movershub/shared';
import { useAuth } from '@movershub/mobile';

const remindersKey = (userId: string | undefined) => ['mover-reminders', userId] as const;

/**
 * The signed-in mover's unread reminders (RLS: their own) — documents ending in 30, 14 or 3 days, or
 * ended (design/DECISIONS.md #30). Made daily on the server; read again when the app comes back.
 */
export function useReminders() {
  const { supabase, session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: remindersKey(userId),
    enabled: userId !== undefined,
    networkMode: 'always',
    retry: 1,
    staleTime: 5 * 60_000,
    queryFn: async ({ signal }): Promise<ReminderRow[]> => {
      const { data, error } = await supabase
        .from('mover_reminders')
        .select(REMINDER_COLUMNS)
        .is('read_at', null)
        .order('created_at', { ascending: false })
        .abortSignal(signal);
      if (error) throw error;
      return reminderRowSchema.array().parse(data);
    },
  });
}

/** "Got it": the document's reminders are read (they stay away until its next stage). */
export function useDismissReminders() {
  const { supabase, session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  return useMutation({
    networkMode: 'always',
    mutationFn: async (ids: readonly string[]) => {
      const { error } = await supabase.from('mover_reminders').update({ read_at: new Date().toISOString() }).in('id', [...ids]);
      if (error) throw error;
      return ids;
    },
    onSuccess: (ids) =>
      queryClient.setQueryData<ReminderRow[]>(remindersKey(userId), (rows) => rows?.filter((r) => !ids.includes(r.id))),
  });
}
