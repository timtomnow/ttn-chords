// Sign-in / sign-up screen. Public route (no shell). Redirects to the app once a
// session exists. Email/password is the primary path; social buttons appear only
// when VITE_ENABLE_SOCIAL_AUTH is set and the providers are configured.

import { useState, type FormEvent } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Logo } from '@/components/layout/Logo';
import {
  SOCIAL_AUTH_ENABLED,
  useAuth,
  type SocialProvider,
} from '@/auth/AuthProvider';

type Mode = 'signin' | 'signup';

const SOCIAL_PROVIDERS: { id: SocialProvider; label: string }[] = [
  { id: 'google', label: 'Continue with Google' },
  { id: 'apple', label: 'Continue with Apple' },
];

export function Auth() {
  const { session, loading, signIn, signUp, signInWithProvider } = useAuth();
  const location = useLocation();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Already signed in → bounce to where they were headed (or the app root).
  if (!loading && session) {
    const to =
      (location.state as { from?: string } | null)?.from ?? '/songs';
    return <Navigate to={to} replace />;
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      const result =
        mode === 'signin'
          ? await signIn(email, password)
          : await signUp(email, password, displayName.trim() || undefined);
      if (result.error) {
        setError(result.error);
      } else if (mode === 'signup') {
        // Depending on the project's email-confirmation setting, the user may
        // need to confirm before a session exists.
        setNotice(
          'Account created. If email confirmation is on, check your inbox to finish signing in.',
        );
      }
    } finally {
      setBusy(false);
    }
  }

  async function onSocial(provider: SocialProvider) {
    setError(null);
    setBusy(true);
    const result = await signInWithProvider(provider);
    if (result.error) {
      setError(result.error);
      setBusy(false);
    }
    // On success the browser redirects to the provider, so no further UI here.
  }

  return (
    <div className="flex min-h-full items-center justify-center bg-ink-50 px-4 py-12 text-ink-900 dark:bg-ink-950 dark:text-ink-50">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex justify-center">
          <Logo />
        </div>

        <div className="card space-y-4 p-6">
          <div>
            <h1 className="text-lg font-semibold tracking-tight">
              {mode === 'signin' ? 'Sign in' : 'Create your account'}
            </h1>
            <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
              {mode === 'signin'
                ? 'Sign in to access your songs and setlists.'
                : 'Sign up to save your songs, setlists, and notes to the cloud.'}
            </p>
          </div>

          <form className="space-y-3" onSubmit={onSubmit}>
            {mode === 'signup' && (
              <div className="space-y-1">
                <label className="label" htmlFor="auth-name">
                  Display name (optional)
                </label>
                <input
                  id="auth-name"
                  className="input"
                  type="text"
                  autoComplete="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            )}

            <div className="space-y-1">
              <label className="label" htmlFor="auth-email">
                Email
              </label>
              <input
                id="auth-email"
                className="input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1">
              <label className="label" htmlFor="auth-password">
                Password
              </label>
              <input
                id="auth-password"
                className="input"
                type="password"
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && (
              <p className="text-sm text-rose-600 dark:text-rose-400" role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="text-sm text-emerald-600 dark:text-emerald-400">{notice}</p>
            )}

            <button className="btn-primary w-full" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
          </form>

          {SOCIAL_AUTH_ENABLED && (
            <div className="space-y-2">
              <div className="flex items-center gap-3 text-xs text-ink-400">
                <span className="h-px flex-1 bg-ink-200 dark:bg-ink-800" />
                or
                <span className="h-px flex-1 bg-ink-200 dark:bg-ink-800" />
              </div>
              {SOCIAL_PROVIDERS.map((p) => (
                <button
                  key={p.id}
                  className="btn-secondary w-full"
                  type="button"
                  disabled={busy}
                  onClick={() => onSocial(p.id)}
                >
                  {p.label}
                </button>
              ))}
            </div>
          )}
        </div>

        <p className="text-center text-sm text-ink-500 dark:text-ink-400">
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <button
            className="font-medium text-accent hover:underline"
            type="button"
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError(null);
              setNotice(null);
            }}
          >
            {mode === 'signin' ? 'Sign up' : 'Sign in'}
          </button>
        </p>
      </div>
    </div>
  );
}
