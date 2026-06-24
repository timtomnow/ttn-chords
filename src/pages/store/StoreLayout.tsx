// Public shell for the storefront. Works logged-out (so visitors can browse
// active bundles) and logged-in (a "Back to app" link instead of "Sign in").
// One adaptive layout — not a parallel UI.

import { Link, Outlet } from 'react-router-dom';
import { Logo } from '@/components/layout/Logo';
import { useAuth } from '@/auth/AuthProvider';

export function StoreLayout() {
  const { session } = useAuth();
  return (
    <div className="min-h-full bg-ink-50 text-ink-900 dark:bg-ink-950 dark:text-ink-50">
      <header className="border-b border-ink-200 dark:border-ink-800">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3 md:px-8">
          <Link to="/store" aria-label="Store home">
            <Logo />
          </Link>
          {session ? (
            <Link className="btn-secondary" to="/songs">
              Back to app
            </Link>
          ) : (
            <Link className="btn-primary" to="/auth">
              Sign in
            </Link>
          )}
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">
        <Outlet />
      </main>
    </div>
  );
}
