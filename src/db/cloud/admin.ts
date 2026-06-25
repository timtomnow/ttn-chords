// Admin + redemption operations.
//  * redeemCode — calls the redeem-code Edge Function (service-role server side),
//    then refreshes the user's entitlement-derived caches.
//  * Admin CRUD for bundles, bundle songs, access codes, and direct grants —
//    plain Supabase writes gated by RLS (is_admin()).

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import { newId } from '@/lib/id';
import type { AccessCode, Bundle } from '@/lib/supabase/types';
import type { Json } from '@/lib/supabase/types';
import type { Song } from '@/types';
import { CloudList, useCloudList } from './reactive';
import { entitledSongsList } from './songs';
import { entitlementsList, storefrontList } from './bundles';
import { createNotification, notificationsList } from './notifications';

// ── Redeem an access code (user-facing) ─────────────────────────────────────
export async function redeemCode(code: string): Promise<{ bundleId: string }> {
  const { data, error } = await supabase.functions.invoke('redeem-code', {
    body: { code },
  });
  if (error) {
    // Edge function returns a JSON { error } body with a non-2xx status.
    let message = 'Redemption failed';
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const body = await ctx.json();
        if (body?.error) message = body.error;
      }
    } catch {
      /* fall back to the generic message */
    }
    throw new Error(message);
  }
  // Newly entitled — refresh the gated caches so the unlock shows immediately,
  // plus the inbox so the redemption notification appears.
  await Promise.all([
    entitlementsList.refresh(),
    entitledSongsList.refresh(),
    storefrontList.refresh(),
    notificationsList.refresh(),
  ]);
  return { bundleId: (data as { bundle_id: string }).bundle_id };
}

// ── Start a Square checkout (user-facing) ───────────────────────────────────
/** Ask the create-checkout Edge Function for a per-user Square payment link
 *  (user + bundle baked into the order metadata) and send the browser there.
 *  Resolves only if the redirect didn't happen (otherwise navigation occurs). */
export async function startCheckout(bundleId: string, redirectTo?: string): Promise<void> {
  const { data, error } = await supabase.functions.invoke('create-checkout', {
    body: { bundleId, redirectTo },
  });
  if (error) {
    let message = 'Could not start checkout';
    try {
      const ctx = (error as { context?: Response }).context;
      if (ctx) {
        const body = await ctx.json();
        if (body?.error) message = body.error;
      }
    } catch {
      /* fall back to the generic message */
    }
    throw new Error(message);
  }
  const url = (data as { url?: string }).url;
  if (!url) throw new Error('Could not start checkout');
  window.location.href = url;
}

// ── Admin: bundles ──────────────────────────────────────────────────────────
async function fetchAdminBundles(): Promise<Bundle[]> {
  // Admins read all bundles (incl. inactive) via RLS.
  const { data, error } = await supabase
    .from('bundles')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export const adminBundlesList = new CloudList<Bundle>(fetchAdminBundles);

export function useAdminBundles(): Bundle[] | undefined {
  return useCloudList(adminBundlesList);
}

export type BundleInput = {
  title: string;
  description?: string | null;
  price_cents?: number;
  square_link_url?: string | null;
  is_active?: boolean;
};

export async function createBundle(input: BundleInput): Promise<string> {
  const { data, error } = await supabase
    .from('bundles')
    .insert({ ...input, title: input.title })
    .select('id')
    .single();
  if (error) throw error;
  await Promise.all([adminBundlesList.refresh(), storefrontList.refresh()]);
  return data.id;
}

export async function updateBundle(id: string, patch: BundleInput): Promise<void> {
  const { error } = await supabase.from('bundles').update(patch).eq('id', id);
  if (error) throw error;
  await Promise.all([adminBundlesList.refresh(), storefrontList.refresh()]);
}

export async function deleteBundle(id: string): Promise<void> {
  const { error } = await supabase.from('bundles').delete().eq('id', id);
  if (error) throw error;
  await Promise.all([adminBundlesList.refresh(), storefrontList.refresh()]);
}

// ── Admin: bundle songs ─────────────────────────────────────────────────────
function rowToSong(row: { id: string; title: string; content: Json }): Song {
  return { ...(row.content as unknown as Song), id: row.id, title: row.title };
}

/** Songs in a bundle (admin view; reloadable). */
export function useAdminBundleSongs(bundleId: string | undefined): {
  songs: Song[] | undefined;
  reload: () => Promise<void>;
} {
  const [songs, setSongs] = useState<Song[] | undefined>(undefined);
  const reload = useCallback(async () => {
    if (!bundleId) {
      setSongs([]);
      return;
    }
    const { data, error } = await supabase
      .from('songs')
      .select('id, title, content')
      .eq('bundle_id', bundleId);
    if (error) {
      console.error('[admin] bundle songs load failed', error.message);
      setSongs([]);
      return;
    }
    setSongs((data ?? []).map(rowToSong));
  }, [bundleId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { songs, reload };
}

/** Copy a personal song into a bundle as paid content (new id, owner_id null). */
export async function addSongToBundle(bundleId: string, song: Song): Promise<void> {
  const id = newId();
  const clone: Song = {
    ...song,
    id,
    order: 0,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const { error } = await supabase.from('songs').insert({
    id,
    bundle_id: bundleId,
    owner_id: null,
    title: clone.title,
    content: clone as unknown as Json,
  });
  if (error) throw error;
  await Promise.all([entitledSongsList.refresh(), storefrontList.refresh()]);
}

export async function removeBundleSong(songId: string): Promise<void> {
  const { error } = await supabase.from('songs').delete().eq('id', songId);
  if (error) throw error;
  await Promise.all([entitledSongsList.refresh(), storefrontList.refresh()]);
}

// ── Admin: access codes ─────────────────────────────────────────────────────
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I

function generateCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  let s = '';
  for (const b of bytes) s += CODE_ALPHABET[b % CODE_ALPHABET.length];
  return s;
}

/** Generate and store N access codes for a bundle; returns the new codes. */
export async function createAccessCodes(bundleId: string, count: number): Promise<string[]> {
  const codes = Array.from({ length: count }, generateCode);
  const { error } = await supabase
    .from('access_codes')
    .insert(codes.map((code) => ({ code, bundle_id: bundleId })));
  if (error) throw error;
  return codes;
}

export function useAccessCodes(bundleId: string | undefined): {
  codes: AccessCode[] | undefined;
  reload: () => Promise<void>;
} {
  const [codes, setCodes] = useState<AccessCode[] | undefined>(undefined);
  const reload = useCallback(async () => {
    if (!bundleId) {
      setCodes([]);
      return;
    }
    const { data, error } = await supabase
      .from('access_codes')
      .select('*')
      .eq('bundle_id', bundleId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('[admin] codes load failed', error.message);
      setCodes([]);
      return;
    }
    setCodes(data ?? []);
  }, [bundleId]);
  useEffect(() => {
    void reload();
  }, [reload]);
  return { codes, reload };
}

// ── Admin: direct grant ─────────────────────────────────────────────────────
/** Grant a bundle to a user by email (source = 'admin_grant'). On a fresh grant
 *  (not a re-grant of something they already own) also drop a notification in
 *  the user's inbox. */
export async function grantBundleByEmail(email: string, bundleId: string): Promise<void> {
  const { data: profile, error: lookupErr } = await supabase
    .from('profiles')
    .select('id')
    .eq('email', email.trim())
    .maybeSingle();
  if (lookupErr) throw lookupErr;
  if (!profile) throw new Error('No user found with that email');
  // ignoreDuplicates + select: a row comes back only when a NEW grant was made,
  // so we don't re-notify on a repeat grant.
  const { data: granted, error } = await supabase
    .from('entitlements')
    .upsert(
      { user_id: profile.id, bundle_id: bundleId, source: 'admin_grant' },
      { onConflict: 'user_id,bundle_id', ignoreDuplicates: true },
    )
    .select('id');
  if (error) throw error;
  if (granted && granted.length > 0) {
    const title = adminBundlesList.getSnapshot()?.find((b) => b.id === bundleId)?.title;
    await createNotification({
      userId: profile.id,
      type: 'admin_grant',
      title: 'A bundle was added to your account',
      body: title ? `“${title}” is now in your library.` : 'A new bundle is now in your library.',
      bundleId,
    });
  }
}
