import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';

import { USER_ROLES, type SelfSignupRole } from '@movershub/shared';

import { useAuth } from './auth-provider';
import { readSavedRole, saveRole } from './saved-role';

const profileSchema = z.object({ role: z.enum(USER_ROLES).nullable() });
/**
 * The signed-in person's role: null until they choose it after the first sign-in; customers and
 * movers can switch sides. `fromDevice`: the side saved on this device, used while the server
 * couldn't be asked.
 */
export type SignedInProfile = z.infer<typeof profileSchema> & { fromDevice?: true };

/** A stalled request (fetch on phones has no timeout) must not keep the app waiting forever. */
const TIMEOUT_MS = 10_000;
/** The side can change on another device: asked again when the app comes back after a minute. */
const FRESH_MS = 60_000;

/**
 * The signed-in person's profile (own row only — RLS). Its role decides which side of the app they
 * see. It only picks screens: what anyone may read or change is enforced in the database. The role
 * saved on this device shows at once while the server is asked, and stays when there's no network.
 * Every request here has its own timeout and error screen, so they run offline too (networkMode
 * 'always') instead of waiting, paused, for the browser to report a connection.
 */
export function useProfile() {
  const { supabase, session } = useAuth();
  const userId = session?.user.id;
  const saved = useQuery({
    queryKey: ['saved-role', userId],
    enabled: userId !== undefined,
    staleTime: Infinity,
    networkMode: 'always',
    queryFn: () => readSavedRole(userId ?? ''),
  });
  const savedRole = saved.data ?? null;
  const shownMeanwhile: SignedInProfile | undefined = savedRole ? { role: savedRole, fromDevice: true } : undefined;
  return useQuery({
    queryKey: ['profile', userId],
    // Asked once the saved role is read, so that one can show in the meantime.
    enabled: userId !== undefined && !saved.isPending,
    // The device's copy is asked for again at the next chance (focus, renewed session).
    staleTime: (query) => (query.state.data?.fromDevice ? 0 : FRESH_MS),
    retry: 1,
    networkMode: 'always',
    placeholderData: shownMeanwhile,
    queryFn: async ({ signal }): Promise<SignedInProfile> => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      signal.addEventListener('abort', () => controller.abort());
      try {
        const { data, error, status } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', userId ?? '')
          .abortSignal(controller.signal)
          .single();
        // No answer at all (offline, or too slow): stay on the side saved on this device — as saved
        // now, which may be newer than when the app started.
        if (error && status === 0) {
          const onDevice = await readSavedRole(userId ?? '');
          if (onDevice) return { role: onDevice, fromDevice: true };
        }
        if (error) throw error;
        const profile = profileSchema.parse(data);
        saveRole(userId ?? '', profile.role);
        return profile;
      } finally {
        clearTimeout(timer);
      }
    },
  });
}

/**
 * Saves the side the signed-in person chose (`public.choose_role`: customer or mover — after the
 * first sign-in, or to switch sides later) and puts it straight into the profile: no second request
 * that could fail.
 */
export function useChooseRole() {
  const { supabase, session } = useAuth();
  const queryClient = useQueryClient();
  const userId = session?.user.id;
  return useMutation({
    networkMode: 'always',
    mutationFn: async (role: SelfSignupRole) => {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const { data, error } = await supabase.rpc('choose_role', { p_role: role }).abortSignal(controller.signal);
        if (error) throw error;
        return profileSchema.shape.role.parse(data);
      } finally {
        clearTimeout(timer);
      }
    },
    onSuccess: async (role) => {
      // A profile request still running was asked before the switch: its answer must not undo it.
      await queryClient.cancelQueries({ queryKey: ['profile', userId] });
      queryClient.setQueryData<SignedInProfile>(['profile', userId], { role });
      queryClient.setQueryData(['saved-role', userId], role);
      saveRole(userId ?? '', role);
    },
  });
}
