// Route guard for the admin area: requires a session AND an admin role. Waits
// for the profile (role) to resolve before deciding, so we don't bounce an admin
// out during the brief profile fetch. Non-admins are sent to the app.

import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthProvider';

export function RequireAdmin() {
  const { loading, profileLoaded, session, isAdmin } = useAuth();

  if (loading || (session && !profileLoaded)) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-ink-500 dark:text-ink-400">
        Loading…
      </div>
    );
  }

  if (!session) return <Navigate to="/auth" replace />;
  if (!isAdmin) return <Navigate to="/songs" replace />;

  return <Outlet />;
}
