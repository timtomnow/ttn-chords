// The single Supabase browser client. Components/repos import `supabase` from
// here. It uses the public ANON key only — Row-Level Security (not this key)
// decides what each signed-in user may read/write. The service-role key never
// touches the frontend.

import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/**
 * True only when both env vars are present. When false the app shows a
 * configuration screen instead of making (doomed) network calls — see
 * AuthProvider. We still construct a client below with harmless placeholders so
 * the rest of the code can import `supabase` without null checks.
 */
export const isSupabaseConfigured = Boolean(url && anonKey);

if (!isSupabaseConfigured) {
  console.error(
    '[supabase] Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY. ' +
      'Copy .env.example to .env.local and fill in your dev project values.',
  );
}

export const supabase = createClient<Database>(
  url || 'http://localhost:54321',
  anonKey || 'public-anon-key-placeholder',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      // Needed so OAuth (social login) redirects back into a session.
      detectSessionInUrl: true,
      storageKey: 'ttn-chords-auth',
    },
  },
);
