import AsyncStorage from '@react-native-async-storage/async-storage';
import { isAuthRetryableFetchError, type Session, type SupabaseClient } from '@supabase/supabase-js';
import { useQueryClient } from '@tanstack/react-query';
import { createContext, use, useCallback, useEffect, useState, type ReactNode } from 'react';

import { owePassword, restorePasswordOwed, settlePassword } from './password';
import { clearDraftEmail, setPendingSignIn } from './pending-sign-in';
import { forgetSavedRole } from './saved-role';
import { SESSION_STORAGE_KEY } from './supabase';

type AuthState = {
  supabase: SupabaseClient;
  session: Session | null;
  /** True until the stored session has been read on startup. */
  loading: boolean;
  /** Signs out — on this device even without network. */
  signOut: () => Promise<void>;
  signingOut: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

/** How long a sign-out may wait for the server before this device forgets the session anyway. */
const SIGN_OUT_WAIT_MS = 3000;

/**
 * The session kept on this device, even with an expired access token. supabase-js reports no
 * session while it can't renew an expired one (offline, it keeps trying for ~30 s), but it keeps it
 * stored, renews it once the network is back and signs out if the server refuses it.
 */
async function storedSession(): Promise<Session | null> {
  if (typeof window === 'undefined') return null; // Expo web pre-rendering in Node
  try {
    const raw = await AsyncStorage.getItem(SESSION_STORAGE_KEY);
    const session = raw ? (JSON.parse(raw) as Partial<Session> | null) : null;
    return session?.access_token && session.refresh_token && session.user?.id ? (session as Session) : null;
  } catch {
    return null;
  }
}

/** Must sit inside the QueryClientProvider: signing out also drops the cached profile. */
export function AuthProvider({ supabase, children }: { supabase: SupabaseClient; children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingOut, setSigningOut] = useState(false);

  /** What this device remembers about the person: their side and its cached copy. */
  const forgetPerson = useCallback(() => {
    forgetSavedRole();
    setPendingSignIn(null);
    clearDraftEmail();
    void settlePassword();
    queryClient.removeQueries({ queryKey: ['profile'] });
    queryClient.removeQueries({ queryKey: ['saved-role'] });
    // The mover's company details (personal data) leave the device's memory too.
    queryClient.removeQueries({ queryKey: ['mover-company'] });
    queryClient.removeQueries({ queryKey: ['confirmed-phones'] });
    queryClient.removeQueries({ queryKey: ['mover-documents'] });
  }, [queryClient]);

  useEffect(() => {
    let checked = false;
    // Open at once as the person signed in on this device — also offline. Their requests wait until
    // supabase-js has renewed the session (it does that before any request).
    void storedSession().then((stored) => {
      if (checked) return;
      setSession(stored);
      setLoading(false);
    });
    void supabase.auth.getSession().then(async ({ data, error }) => {
      checked = true;
      // No network: keep the stored session (supabase-js renews it later). Refused: signed out.
      const offline = !data.session && isAuthRetryableFetchError(error);
      setSession(offline ? await storedSession() : data.session);
      setLoading(false);
    });
    let latest = 0;
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      const seq = ++latest;
      if (event === 'SIGNED_OUT') forgetPerson();
      // A "Forgot password?" code (also when another tab of the browser version used it): a new
      // password is owed before anything else.
      if (event === 'PASSWORD_RECOVERY' && next?.user.email) void owePassword(next.user.email, 'recovery');
      // A sign-in, maybe by a code used in another tab, which stored the password it owes first:
      // read that before the screens see the session.
      if (event === 'SIGNED_IN') {
        clearDraftEmail();
        void restorePasswordOwed().then(() => {
          if (seq === latest) setSession(next);
        });
        return;
      }
      // A renewed session means the network is back: a side taken from the device while offline is
      // asked from the server again. Only that one, and never restarting a request already running —
      // that request itself may have renewed the session (e.g. on a phone whose clock is off).
      if (event === 'TOKEN_REFRESHED') {
        void queryClient.invalidateQueries(
          { queryKey: ['profile'], predicate: (query) => (query.state.data as { fromDevice?: boolean } | undefined)?.fromDevice === true },
          { cancelRefetch: false },
        );
      }
      // The start is handled above (with the offline case); this reports what changes afterwards.
      if (event !== 'INITIAL_SESSION') setSession(next);
    });
    return () => data.subscription.unsubscribe();
  }, [supabase, queryClient, forgetPerson]);

  const signOut = useCallback(async () => {
    setSigningOut(true);
    try {
      const signedOut = await Promise.race([
        supabase.auth.signOut().then(({ error }) => !error),
        new Promise<false>((resolve) => setTimeout(() => resolve(false), SIGN_OUT_WAIT_MS)),
      ]);
      // Offline with an expired access token supabase-js can't sign out: it renews the session first
      // and keeps it while there's no network. This device forgets it anyway; a server sign-out that
      // is still running finishes in the background.
      if (!signedOut) {
        await AsyncStorage.removeItem(SESSION_STORAGE_KEY).catch(() => undefined);
        forgetPerson();
        setSession(null);
      }
    } finally {
      setSigningOut(false);
    }
  }, [supabase, forgetPerson]);

  return <AuthContext value={{ supabase, session, loading, signOut, signingOut }}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
