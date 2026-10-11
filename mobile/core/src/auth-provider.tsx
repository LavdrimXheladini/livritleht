import type { Session, SupabaseClient } from '@supabase/supabase-js';
import { createContext, use, useEffect, useState, type ReactNode } from 'react';

type AuthState = {
  supabase: SupabaseClient;
  session: Session | null;
  /** True until the stored session has been read on startup. */
  loading: boolean;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ supabase, children }: { supabase: SupabaseClient; children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  return <AuthContext value={{ supabase, session, loading }}>{children}</AuthContext>;
}

export function useAuth(): AuthState {
  const ctx = use(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
