import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';

import type { Locale, MoverCountry } from '@movershub/shared';
import { useAuth } from '@movershub/mobile';

/**
 * A server function's answer: its JSON, or the error code it sent (`{ error }`) with the HTTP status;
 * `network` when there was no answer at all.
 */
type Called<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

async function call<T>(supabase: SupabaseClient, name: string, body: object): Promise<Called<T>> {
  const { data, error } = await supabase.functions.invoke<T>(name, { body });
  if (!error && data) return { ok: true, data };
  // supabase-js puts the function's own answer in `context` (a Response) when it isn't 2xx.
  const context = (error as { context?: unknown } | null)?.context;
  if (context instanceof Response) {
    const answer = (await context.json().catch(() => ({}))) as { error?: unknown };
    return { ok: false, error: typeof answer.error === 'string' ? answer.error : 'unavailable', status: context.status };
  }
  return { ok: false, error: 'network', status: 0 };
}

/** The phone numbers this account confirmed with a code (RLS: its own only). */
export function useConfirmedPhones() {
  const { supabase, session } = useAuth();
  const userId = session?.user.id;
  return useQuery({
    queryKey: ['confirmed-phones', userId],
    enabled: userId !== undefined,
    networkMode: 'always',
    retry: 1,
    queryFn: async (): Promise<string[]> => {
      const { data, error } = await supabase.from('phone_verifications').select('phone').eq('user_id', userId ?? '');
      if (error) throw error;
      return (data as { phone: string }[]).map((row) => row.phone);
    },
  });
}

export type PhoneChannel = 'sms' | 'whatsapp';

/** Sending and checking phone codes (`phone-verification` function); a confirmed number joins the list. */
export function usePhoneCodes() {
  const { supabase, session } = useAuth();
  const queryClient = useQueryClient();
  return {
    send: (phone: string, channel: PhoneChannel, locale: Locale) =>
      call<{ status: 'sent' }>(supabase, 'phone-verification', { action: 'send', phone, channel, locale }),
    check: async (phone: string, code: string) => {
      const answer = await call<{ status: 'approved' | 'wrong_code' }>(supabase, 'phone-verification', { action: 'check', phone, code });
      if (answer.ok && answer.data.status === 'approved') {
        await queryClient.invalidateQueries({ queryKey: ['confirmed-phones', session?.user.id] });
      }
      return answer;
    },
  };
}

export type RegistryAnswer =
  | { result: 'match' | 'mismatch' | 'valid' | 'not_found' | 'unavailable'; register: 'vies' | 'pl-white-list' | 'ch-uid'; registeredName?: string; authoritative: boolean }
  | { result: 'manual' };

/** What the official register says about a tax number (`company-registry` function). */
export function useCompanyRegistry() {
  const { supabase } = useAuth();
  return (input: { country: MoverCountry; isBusiness: boolean; taxId: string; legalName: string }) =>
    call<RegistryAnswer>(supabase, 'company-registry', input);
}
