// Personal setlists, backed by Supabase. JSON-aggregate model: the full app
// Setlist (including its rich entries[] with per-performance overrides) lives in
// the `content` jsonb column; name/description are mirrored to columns. Same
// signatures as the former Dexie repo.

import { useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { newId } from '@/lib/id';
import type { Setlist } from '@/types';
import type { Database, Json } from '@/lib/supabase/types';
import { CloudList, useCloudList } from './reactive';
import { requireUserId } from './auth';

const now = () => Date.now();
type SetlistRow = Pick<Database['public']['Tables']['setlists']['Row'], 'id' | 'content'>;

function rowToSetlist(row: SetlistRow): Setlist {
  return { ...(row.content as unknown as Setlist), id: row.id };
}

async function fetchSetlists(): Promise<Setlist[]> {
  const uid = await requireUserId();
  const { data, error } = await supabase
    .from('setlists')
    .select('id, content')
    .eq('user_id', uid);
  if (error) throw error;
  const setlists = (data ?? []).map(rowToSetlist);
  setlists.sort((a, b) => a.order - b.order);
  return setlists;
}

export const setlistsList = new CloudList<Setlist>(fetchSetlists);

export function useSetlists(): Setlist[] | undefined {
  return useCloudList(setlistsList);
}

export function useSetlist(id: string | undefined): Setlist | undefined {
  const setlists = useSetlists();
  return useMemo(() => {
    if (!id || setlists === undefined) return undefined;
    return setlists.find((s) => s.id === id);
  }, [setlists, id]);
}

/** Insert (or replace by id) a fully-formed Setlist aggregate. */
export async function upsertSetlist(setlist: Setlist): Promise<void> {
  const user_id = await requireUserId();
  const { error } = await supabase.from('setlists').upsert({
    id: setlist.id,
    user_id,
    title: setlist.name,
    description: setlist.description ?? null,
    content: setlist as unknown as Json,
  });
  if (error) throw error;
}

export async function createSetlist(
  data: Partial<Setlist> & Pick<Setlist, 'name'>,
): Promise<string> {
  const id = data.id ?? newId();
  const current = setlistsList.getSnapshot() ?? (await fetchSetlists());
  const max = current.reduce((m, s) => Math.max(m, s.order), 0);
  const setlist: Setlist = {
    id,
    name: data.name,
    description: data.description,
    entries: data.entries ?? [],
    order: max + 1,
    createdAt: now(),
    updatedAt: now(),
  };
  await upsertSetlist(setlist);
  await setlistsList.refresh();
  return id;
}

export async function updateSetlist(id: string, patch: Partial<Setlist>): Promise<void> {
  const current = setlistsList.getSnapshot()?.find((s) => s.id === id);
  const base = current ?? (await fetchSetlists()).find((s) => s.id === id);
  if (!base) return;
  await upsertSetlist({ ...base, ...patch, id, updatedAt: now() });
  await setlistsList.refresh();
}

export async function deleteSetlist(id: string): Promise<void> {
  const { error } = await supabase.from('setlists').delete().eq('id', id);
  if (error) throw error;
  await setlistsList.refresh();
}
