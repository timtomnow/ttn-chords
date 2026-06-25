// Wire the cloud caches to auth changes: when the signed-in user changes
// (login, logout, account switch) drop cached collections and refetch for the
// new user. Call initCloudSync() once on app start.

import { supabase } from '@/lib/supabase/client';
import { songsList, entitledSongsList } from './songs';
import { setlistsList } from './setlists';
import { storefrontList, entitlementsList } from './bundles';
import { notificationsList } from './notifications';

// Per-user caches: dropped and refetched when the signed-in user changes.
const userScoped = [
  songsList,
  setlistsList,
  entitledSongsList,
  entitlementsList,
  notificationsList,
];

let lastUserId: string | null = null;
let initialized = false;

export function initCloudSync(): void {
  if (initialized) return;
  initialized = true;
  supabase.auth.onAuthStateChange((_event, session) => {
    const id = session?.user.id ?? null;
    if (id === lastUserId) return;
    lastUserId = id;
    for (const list of userScoped) {
      list.reset();
      if (id) void list.refresh();
    }
    // The storefront is the same for everyone (active bundles); just re-pull so
    // a fresh login reflects any newly-activated bundles.
    void storefrontList.refresh();
  });
}
