import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  MOVER_COMPANY_COLUMNS,
  moverCompanyColumns,
  moverCompanyRowSchema,
  type MoverCompanyForm,
  type MoverCompanyRow,
} from '@movershub/shared';
import { useAuth } from '@movershub/mobile';

/** A stalled request (fetch on phones has no timeout) must not keep a screen waiting forever. */
const TIMEOUT_MS = 10_000;

function timeoutSignal(outer?: AbortSignal): AbortSignal {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  outer?.addEventListener('abort', () => controller.abort());
  controller.signal.addEventListener('abort', () => clearTimeout(timer));
  return controller.signal;
}

const companyKey = (userId: string | undefined) => ['mover-company', userId] as const;

/**
 * The signed-in mover's own company (RLS: only its owner reads it) — null until the "Your company"
 * form is first saved. Runs offline too (networkMode 'always'): the screens show their own error.
 */
export function useMoverCompany() {
  const { supabase, session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: companyKey(userId),
    enabled: userId !== undefined,
    retry: 1,
    networkMode: 'always',
    staleTime: 60_000,
    queryFn: async ({ signal }): Promise<MoverCompanyRow | null> => {
      const { data, error } = await supabase
        .from('mover_companies')
        .select(MOVER_COMPANY_COLUMNS)
        .eq('owner_id', userId ?? '')
        .abortSignal(timeoutSignal(signal))
        .maybeSingle();
      if (error) throw error;
      return data === null ? null : moverCompanyRowSchema.parse(data);
    },
  });
}

/**
 * Saves the form: creates the company the first time, then updates it. Only the columns movers may
 * write are sent; Postgres dates the self-certification and sends a verified company back to
 * verification when its legal identity changes.
 */
export function useSaveMoverCompany() {
  const { supabase, session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  return useMutation({
    networkMode: 'always',
    mutationFn: async ({ form, companyId }: { form: MoverCompanyForm; companyId: string | null }) => {
      // Any time will do: the server records when the mover first confirmed (and keeps it).
      const columns = { ...moverCompanyColumns(form), self_certification_at: new Date().toISOString() };
      const write = companyId
        ? supabase.from('mover_companies').update(columns).eq('id', companyId)
        : supabase.from('mover_companies').insert({ ...columns, owner_id: userId });
      const { data, error } = await write.select(MOVER_COMPANY_COLUMNS).abortSignal(timeoutSignal()).single();
      if (error) throw error;
      return moverCompanyRowSchema.parse(data);
    },
    onSuccess: (row) => queryClient.setQueryData(companyKey(userId), row),
  });
}
