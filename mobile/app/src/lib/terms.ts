import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  TERMS_VERSION_COLUMNS,
  publishedTermsSchema,
  termsStatus,
  termsVersionRowSchema,
  type PublishedTerms,
  type TermsAudience,
  type TermsStatus,
  type TermsVersionRow,
} from '@movershub/shared';
import { useAuth } from '@movershub/mobile';

const versionsKey = ['terms-versions'] as const;
const acceptedKey = (userId: string | undefined) => ['terms-accepted', userId] as const;

/** A stalled request (fetch on phones has no timeout) must not keep the home waiting. */
const TIMEOUT_MS = 10_000;

function timeoutSignal(outer: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  outer.addEventListener('abort', () => controller.abort());
  controller.signal.addEventListener('abort', () => clearTimeout(timer));
  return controller.signal;
}

/**
 * Where the signed-in person stands with the terms for their side (design/DECISIONS.md #34): the
 * version in effect to accept first, a version coming later to show as a notice. Asked as soon as
 * someone is signed in, alongside their profile. `audience` null (an admin, or no side yet): nothing
 * to accept. With nothing published, nothing either.
 */
export function useTermsStatus(audience: TermsAudience | null) {
  const { supabase, session } = useAuth();
  const userId = session?.user.id;
  const versions = useQuery({
    queryKey: versionsKey,
    enabled: userId !== undefined,
    networkMode: 'always',
    retry: 1,
    staleTime: 10 * 60_000,
    queryFn: async ({ signal }): Promise<TermsVersionRow[]> => {
      const { data, error } = await supabase.from('terms_versions').select(TERMS_VERSION_COLUMNS).order('effective_at').abortSignal(timeoutSignal(signal));
      if (error) throw error;
      return termsVersionRowSchema.array().parse(data);
    },
  });
  const accepted = useQuery({
    queryKey: acceptedKey(userId),
    enabled: userId !== undefined,
    networkMode: 'always',
    retry: 1,
    staleTime: 10 * 60_000,
    queryFn: async ({ signal }): Promise<string[]> => {
      const { data, error } = await supabase
        .from('terms_acceptances')
        .select('terms_version_id')
        .eq('user_id', userId ?? '')
        .abortSignal(timeoutSignal(signal));
      if (error) throw error;
      return (data as { terms_version_id: string }[]).map((row) => row.terms_version_id);
    },
  });
  const status: TermsStatus | undefined =
    audience && versions.data && accepted.data ? termsStatus(versions.data.filter((v) => v.audience === audience), accepted.data) : undefined;
  return {
    status,
    /** Still asking (a failed answer doesn't hold anyone up: the server checks again when it matters). */
    isPending: audience !== null && (versions.isPending || accepted.isPending) && !versions.isError && !accepted.isError,
  };
}

/** Accepts a version of the terms for the caller's side (once; Postgres checks the side). */
export function useAcceptTerms() {
  const { supabase, session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  return useMutation({
    networkMode: 'always',
    mutationFn: async (versionId: string) => {
      const { error } = await supabase.rpc('accept_terms', { p_version_id: versionId });
      if (error) throw error;
      return versionId;
    },
    onSuccess: (versionId) =>
      queryClient.setQueryData<string[]>(acceptedKey(userId), (ids) => (ids?.includes(versionId) ? ids : [...(ids ?? []), versionId])),
  });
}

/** A published version as it was published — the text people accepted — with its number and start. */
export function usePublishedTerms(versionId: string | undefined) {
  const { supabase } = useAuth();
  return useQuery({
    queryKey: ['terms-version', versionId],
    enabled: versionId !== undefined,
    networkMode: 'always',
    retry: 1,
    staleTime: Infinity,
    queryFn: async ({ signal }): Promise<{ version: number; effective_at: string; content: PublishedTerms }> => {
      const { data, error } = await supabase
        .from('terms_versions')
        .select('version,effective_at,content')
        .eq('id', versionId ?? '')
        .abortSignal(signal)
        .single();
      if (error) throw error;
      const row = data as { version: number; effective_at: string; content: unknown };
      return { version: row.version, effective_at: row.effective_at, content: publishedTermsSchema.parse(row.content) };
    },
  });
}
