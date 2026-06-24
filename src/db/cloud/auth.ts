// Resolve the current user id for writes (owner_id / user_id). Reads the locally
// persisted session — no network call. Throws if not signed in; callers only run
// after the auth route guard, so that should never surface in normal use.

import { supabase } from '@/lib/supabase/client';

export async function requireUserId(): Promise<string> {
  const id = await getUserId();
  if (!id) throw new Error('Not signed in');
  return id;
}

/** Non-throwing variant for reads that should simply return nothing when signed
 *  out (e.g. entitlements, entitled bundle songs). */
export async function getUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user.id ?? null;
}
