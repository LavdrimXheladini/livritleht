import { useQuery } from '@tanstack/react-query';

import { bookRequestFromDraft, type BookResponse, type BookingDraft } from '@movershub/shared';
import { updateBooking, useAuth } from '@movershub/mobile';

import { callFunction } from './functions';

/** The `book` function refused the request: its error code (e.g. `mover_unavailable`) and HTTP status. */
export class BookError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
  ) {
    super(code);
  }
}

/**
 * The booking request for this move and the chosen mover (design/DECISIONS.md #26): the `book` function
 * prices the van again on the server and saves the request with a quote valid 15 minutes. Asked once
 * per version of the move (the saved request's id is not part of the key: it is remembered with the
 * move and reused, so the same request is updated, not saved twice). `refetch` = price it again.
 */
export function useBookRequest(draft: BookingDraft) {
  const { supabase, session } = useAuth();
  const userId = session?.user.id;
  const request = bookRequestFromDraft(draft);
  const { jobId: _jobId, ...move } = request ?? {};
  return useQuery({
    queryKey: ['book', userId, move],
    enabled: request !== null && userId !== undefined,
    networkMode: 'always',
    staleTime: Infinity,
    retry: (failures, error) => !(error instanceof BookError) && failures < 1,
    queryFn: async (): Promise<BookResponse> => {
      const answer = await callFunction<BookResponse>(supabase, 'book', request ?? {});
      if (!answer.ok) throw new BookError(answer.error, answer.status);
      const { jobId } = answer.data;
      if (userId) updateBooking(userId, (d) => (d.jobId === jobId ? d : { ...d, jobId }));
      return answer.data;
    },
  });
}
