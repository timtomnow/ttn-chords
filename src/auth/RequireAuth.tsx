// Route guard: gates the app shell behind a session. While the initial session
// resolves we show a minimal loading state; with no session we redirect to /auth
// and remember where the user was headed so we can return them after sign-in.

import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function RequireAuth() {
  const { loading, session } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center bg-ink-50 text-sm text-ink-500 dark:bg-ink-950 dark:text-ink-400">
        Loading…
      </div>
    );
  }

  if (!session) {
    return (
      <Navigate
        to="/auth"
        replace
        state={{ from: location.pathname + location.search }}
      />
    );
  }

  return <Outlet />;
}
