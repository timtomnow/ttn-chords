// Commerce read side: the storefront (active bundles + song counts), the user's
// entitlements (which bundles they own), and a single bundle's detail. No writes
// here — entitlement grants come from Edge Functions / admin (Phases 4–5).

import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { Bundle, BundleSongTitle, Entitlement, StorefrontBundle } from '@/lib/supabase/types';
import { CloudList, useCloudList } from './reactive';
import { getUserId } from './auth';

// ── Storefront: active bundles + counts (works logged-out via SECURITY DEFINER RPC) ──
async function fetchStorefront(): Promise<StorefrontBundle[]> {
  const { data, error } = await supabase.rpc('storefront_bundles');
  if (error) throw error;
  return data ?? [];
}

export const storefrontList = new CloudList<StorefrontBundle>(fetchStorefront);

export function useStorefront(): StorefrontBundle[] | undefined {
  return useCloudList(storefrontList);
}

// ── The signed-in user's entitlements ───────────────────────────────────────
async function fetchEntitlements(): Promise<Entitlement[]> {
  const uid = await getUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from('entitlements')
    .select('*')
    .eq('user_id', uid);
  if (error) throw error;
  return data ?? [];
}

export const entitlementsList = new CloudList<Entitlement>(fetchEntitlements);

/** Set of bundle ids the user is entitled to. */
export function useEntitledBundleIds(): Set<string> | undefined {
  const rows = useCloudList(entitlementsList);
  return useMemo(
    () => (rows === undefined ? undefined : new Set(rows.map((e) => e.bundle_id))),
    [rows],
  );
}

// ── A single bundle's row (RLS: active or admin) ─────────────────────────────
export function useBundle(id: string | undefined): Bundle | null | undefined {
  const [bundle, setBundle] = useState<Bundle | null | undefined>(undefined);
  useEffect(() => {
    let active = true;
    if (!id) {
      setBundle(null);
      return;
    }
    void supabase
      .from('bundles')
      .select('*')
      .eq('id', id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error('[bundles] load failed', error.message);
          setBundle(null);
          return;
        }
        setBundle(data);
      });
    return () => {
      active = false;
    };
  }, [id]);
  return bundle;
}

/** Song titles in a bundle (storefront teaser — titles only, visible to anyone
 *  for an active bundle; the song bodies stay gated by entitlement). */
export function useBundleSongTitles(bundleId: string | undefined): BundleSongTitle[] | undefined {
  const [titles, setTitles] = useState<BundleSongTitle[] | undefined>(undefined);
  useEffect(() => {
    let active = true;
    if (!bundleId) {
      setTitles([]);
      return;
    }
    void supabase
      .rpc('bundle_song_titles', { p_bundle_id: bundleId })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          console.error('[bundles] titles load failed', error.message);
          setTitles([]);
          return;
        }
        setTitles(data ?? []);
      });
    return () => {
      active = false;
    };
  }, [bundleId]);
  return titles;
}
