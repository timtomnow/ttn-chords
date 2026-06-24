// Personal songs, backed by Supabase. The full app Song aggregate is stored in
// the `content` jsonb column (id + title mirrored to columns). These functions
// preserve the exact signatures of the former Dexie repo so consuming
// components didn't have to change.

import { useMemo } from 'react';
import { supabase } from '@/lib/supabase/client';
import { newId } from '@/lib/id';
import { makeDifficulty } from '@/lib/song';
import type { Section, Song } from '@/types';
import type { Database, Json } from '@/lib/supabase/types';
import { CloudList, useCloudList } from './reactive';
import { requireUserId, getUserId } from './auth';

const now = () => Date.now();
type SongRow = Pick<Database['public']['Tables']['songs']['Row'], 'id' | 'title' | 'content'>;

function rowToSong(row: SongRow): Song {
  // content holds the whole aggregate; trust the columns for id/title.
  return { ...(row.content as unknown as Song), id: row.id, title: row.title };
}

async function fetchSongs(): Promise<Song[]> {
  // Filter to the signed-in user's own songs explicitly: admins can read all
  // songs via RLS, but the personal library should only show theirs.
  const uid = await getUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from('songs')
    .select('id, title, content')
    .eq('owner_id', uid);
  if (error) throw error;
  const songs = (data ?? []).map(rowToSong);
  songs.sort((a, b) => a.order - b.order);
  return songs;
}

// Bundle songs the user can read — RLS returns only entitled bundles (admins
// see all bundle content). Resolved alongside personal songs so a bundle song
// referenced by a setlist/report/performance still loads, but kept OUT of the
// personal library list (useSongs), which is for the user's own editable songs.
async function fetchEntitledBundleSongs(): Promise<Song[]> {
  const uid = await getUserId();
  if (!uid) return [];
  const { data, error } = await supabase
    .from('songs')
    .select('id, title, content')
    .not('bundle_id', 'is', null);
  if (error) throw error;
  return (data ?? []).map(rowToSong);
}

export const songsList = new CloudList<Song>(fetchSongs);
export const entitledSongsList = new CloudList<Song>(fetchEntitledBundleSongs);

export function useSongs(): Song[] | undefined {
  return useCloudList(songsList);
}

/** Personal + entitled bundle songs, for id resolution (not the library list). */
function useResolvableSongs(): Song[] | undefined {
  const personal = useCloudList(songsList);
  const bundle = useCloudList(entitledSongsList);
  return useMemo(() => {
    if (personal === undefined && bundle === undefined) return undefined;
    return [...(personal ?? []), ...(bundle ?? [])];
  }, [personal, bundle]);
}

export function useSong(id: string | undefined): Song | null | undefined {
  const songs = useResolvableSongs();
  return useMemo(() => {
    if (!id) return null;
    if (songs === undefined) return undefined;
    return songs.find((s) => s.id === id) ?? null;
  }, [songs, id]);
}

export function useSongsByIds(ids: string[]): Map<string, Song> | undefined {
  const songs = useResolvableSongs();
  const key = ids.join(',');
  return useMemo(() => {
    if (songs === undefined) return undefined;
    const want = new Set(ids);
    const map = new Map<string, Song>();
    for (const s of songs) if (want.has(s.id)) map.set(s.id, s);
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs, key]);
}

/** True when the song is the user's own (editable), false for bundle content. */
export function useIsOwnedSong(id: string | undefined): boolean {
  const personal = useCloudList(songsList);
  return useMemo(
    () => Boolean(id && personal?.some((s) => s.id === id)),
    [personal, id],
  );
}


async function getSongById(id: string): Promise<Song | null> {
  const { data, error } = await supabase
    .from('songs')
    .select('id, title, content')
    .eq('id', id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToSong(data) : null;
}

/** Insert (or replace by id) a fully-formed Song aggregate owned by the user. */
export async function upsertSong(song: Song): Promise<void> {
  const owner_id = await requireUserId();
  const { error } = await supabase.from('songs').upsert({
    id: song.id,
    owner_id,
    title: song.title,
    content: song as unknown as Json,
  });
  if (error) throw error;
}

export async function createSong(
  data: Partial<Song> & Pick<Song, 'title'> & { sections?: Section[] },
): Promise<string> {
  const id = data.id ?? newId();
  const current = songsList.getSnapshot() ?? (await fetchSongs());
  const max = current.reduce((m, s) => Math.max(m, s.order), 0);
  const difficulties = data.difficulties?.length
    ? data.difficulties
    : [makeDifficulty(3, data.sections ?? [])];
  const song: Song = {
    id,
    title: data.title,
    artist: data.artist,
    key: data.key,
    capo: data.capo,
    tempo: data.tempo,
    timeSignature: data.timeSignature,
    tags: data.tags ?? [],
    difficulties,
    defaultDifficultyId: data.defaultDifficultyId ?? difficulties[0].id,
    source: data.source,
    sourceUrl: data.sourceUrl,
    notes: data.notes,
    order: max + 1,
    createdAt: now(),
    updatedAt: now(),
  };
  await upsertSong(song);
  await songsList.refresh();
  return id;
}

async function patchSong(id: string, mutate: (s: Song) => Song): Promise<void> {
  const current = await getSongById(id);
  if (!current) return;
  const next = mutate(current);
  const { error } = await supabase
    .from('songs')
    .update({ title: next.title, content: next as unknown as Json })
    .eq('id', id);
  if (error) throw error;
  await songsList.refresh();
}

export async function updateSong(id: string, patch: Partial<Song>): Promise<void> {
  await patchSong(id, (s) => ({ ...s, ...patch, updatedAt: now() }));
}

/**
 * Replace the sections of one difficulty variant (used by beat editing in the
 * Highway view + Tag beats). Falls back to the default/first variant when
 * `difficultyId` is omitted or no longer matches.
 */
export async function updateDifficultySections(
  songId: string,
  difficultyId: string | undefined,
  sections: Section[],
): Promise<void> {
  await patchSong(songId, (song) => {
    if (!song.difficulties.length) return song;
    const targetId =
      (difficultyId && song.difficulties.some((d) => d.id === difficultyId) && difficultyId) ||
      (song.defaultDifficultyId &&
        song.difficulties.some((d) => d.id === song.defaultDifficultyId) &&
        song.defaultDifficultyId) ||
      song.difficulties[0].id;
    const difficulties = song.difficulties.map((d) =>
      d.id === targetId ? { ...d, sections } : d,
    );
    return { ...song, difficulties, updatedAt: now() };
  });
}

export async function deleteSong(id: string): Promise<void> {
  const { error } = await supabase.from('songs').delete().eq('id', id);
  if (error) throw error;
  await songsList.refresh();
}
