// Auth state for the whole app. Mirrors the ThemeProvider pattern: a context +
// a useAuth() hook. Holds the Supabase session, the signed-in user's profile
// row (which carries the 'user' | 'admin' role), and the auth actions.
//
// The profile row is created server-side by the handle_new_user() trigger on
// signup (see ttn-chords-supabase-schema.md), so the client never inserts it.

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase/client';
import type { Profile } from '@/lib/supabase/types';

export const SOCIAL_AUTH_ENABLED =
  import.meta.env.VITE_ENABLE_SOCIAL_AUTH === 'true';

export type SocialProvider = 'google' | 'apple';

type AuthResult = { error: string | null };

type AuthContextValue = {
  /** undefined while the initial session is loading. */
  loading: boolean;
  /** True once the profile row (and thus role) has been resolved for the user. */
  profileLoaded: boolean;
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isAdmin: boolean;
  signUp: (email: string, password: string, displayName?: string) => Promise<AuthResult>;
  signIn: (email: string, password: string) => Promise<AuthResult>;
  signInWithProvider: (provider: SocialProvider) => Promise<AuthResult>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (error) {
    console.error('[auth] failed to load profile', error.message);
    return null;
  }
  return data;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  useEffect(() => {
    let active = true;

    // Seed from any persisted session, then subscribe to changes (login,
    // logout, token refresh). onAuthStateChange also fires once on mount.
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      setSession(next);
      setLoading(false);
    });

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Keep the profile row in sync with the current user.
  const userId = session?.user.id;
  useEffect(() => {
    let active = true;
    if (!userId) {
      setProfile(null);
      setProfileLoaded(true);
      return;
    }
    setProfileLoaded(false);
    fetchProfile(userId).then((p) => {
      if (active) {
        setProfile(p);
        setProfileLoaded(true);
      }
    });
    return () => {
      active = false;
    };
  }, [userId]);

  const signUp = useCallback<AuthContextValue['signUp']>(
    async (email, password, displayName) => {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: displayName
          ? { data: { display_name: displayName } }
          : undefined,
      });
      return { error: error?.message ?? null };
    },
    [],
  );

  const signIn = useCallback<AuthContextValue['signIn']>(async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  }, []);

  const signInWithProvider = useCallback<AuthContextValue['signInWithProvider']>(
    async (provider) => {
      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo: window.location.origin + import.meta.env.BASE_URL },
      });
      return { error: error?.message ?? null };
    },
    [],
  );

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      loading,
      profileLoaded,
      session,
      user: session?.user ?? null,
      profile,
      isAdmin: profile?.role === 'admin',
      signUp,
      signIn,
      signInWithProvider,
      signOut,
    }),
    [loading, profileLoaded, session, profile, signUp, signIn, signInWithProvider, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
