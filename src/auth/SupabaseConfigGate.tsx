// Renders a friendly setup message when the Supabase env vars are missing,
// instead of letting the app make doomed network calls. Wraps the whole app.

import type { ReactNode } from 'react';
import { isSupabaseConfigured } from '@/lib/supabase/client';

export function SupabaseConfigGate({ children }: { children: ReactNode }) {
  if (isSupabaseConfigured) return <>{children}</>;

  return (
    <div className="flex min-h-full items-center justify-center bg-ink-50 px-4 py-12 text-ink-900 dark:bg-ink-950 dark:text-ink-50">
      <div className="card max-w-md space-y-3 p-6">
        <h1 className="text-lg font-semibold tracking-tight">Supabase not configured</h1>
        <p className="text-sm text-ink-600 dark:text-ink-300">
          The app needs a Supabase project to run. Copy{' '}
          <code className="rounded bg-ink-100 px-1 py-0.5 dark:bg-ink-800">.env.example</code>{' '}
          to{' '}
          <code className="rounded bg-ink-100 px-1 py-0.5 dark:bg-ink-800">.env.local</code>{' '}
          and set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> from your project's API settings,
          then restart the dev server.
        </p>
      </div>
    </div>
  );
}
