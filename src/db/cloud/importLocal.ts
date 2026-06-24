// Bulk imports into the cloud:
//  * importBundle  — starter-library sync (same conflict semantics as before,
//    now writing personal songs to Supabase instead of Dexie).
//  * importLocalData — the one-time "import my local data" action: pushes the
//    user's existing IndexedDB songs/setlists into Supabase. Idempotent — it
//    keeps local ids as cloud ids and skips anything already present, so a
//    second run doesn't duplicate (and won't clobber later cloud edits).
//
// Neither is atomic (Supabase has no client-side multi-row transaction); these
// are explicit, user-initiated bulk operations where that's acceptable.

import { db } from '@/db/schema';
import { newId } from '@/lib/id';
import { matchKey, nextDuplicateTitle, type ConflictResolution } from '@/lib/library/import';
import type { SongBundle } from '@/lib/library/types';
import type { Song } from '@/types';
import { songsList, upsertSong } from './songs';
import { setlistsList, upsertSetlist } from './setlists';

const now = () => Date.now();

export type BundleImportSummary = {
  added: number;
  overwritten: number;
  duplicated: number;
  setlists: number;
};

export type LocalImportSummary = {
  songs: number;
  setlists: number;
  skipped: number;
};

async function ensureSongs(): Promise<Song[]> {
  const snap = songsList.getSnapshot();
  if (snap) return snap;
  await songsList.refresh();
  return songsList.getSnapshot() ?? [];
}

async function ensureSetlistOrder(): Promise<number> {
  let snap = setlistsList.getSnapshot();
  if (!snap) {
    await setlistsList.refresh();
    snap = setlistsList.getSnapshot();
  }
  return (snap ?? []).reduce((m, s) => Math.max(m, s.order), 0);
}

export async function importBundle(
  bundle: SongBundle,
  resolutions: Record<string, ConflictResolution>,
): Promise<BundleImportSummary> {
  const summary: BundleImportSummary = { added: 0, overwritten: 0, duplicated: 0, setlists: 0 };

  const existing = await ensureSongs();
  const byKey = new Map<string, Song>();
  for (const s of existing) {
    const k = matchKey(s.title, s.artist);
    if (!byKey.has(k)) byKey.set(k, s);
  }
  const titles = new Set(existing.map((s) => s.title));
  let maxOrder = existing.reduce((m, s) => Math.max(m, s.order), 0);
  const idMap = new Map<string, string>();

  for (const bs of bundle.songs) {
    const match = byKey.get(matchKey(bs.title, bs.artist));
    if (match && resolutions[bs.id] === 'overwrite') {
      await upsertSong({ ...bs, id: match.id, order: match.order, createdAt: match.createdAt, updatedAt: now() });
      idMap.set(bs.id, match.id);
      summary.overwritten += 1;
    } else {
      const id = newId();
      const isDuplicate = Boolean(match);
      const title = isDuplicate ? nextDuplicateTitle(bs.title, titles) : bs.title;
      titles.add(title);
      await upsertSong({ ...bs, id, title, order: ++maxOrder, createdAt: now(), updatedAt: now() });
      idMap.set(bs.id, id);
      if (isDuplicate) summary.duplicated += 1;
      else summary.added += 1;
    }
  }

  if (bundle.setlists?.length) {
    let maxSlOrder = await ensureSetlistOrder();
    for (const sl of bundle.setlists) {
      const entries = sl.entries
        .map((e) => ({ ...e, songId: idMap.get(e.songId) ?? '' }))
        .filter((e) => e.songId);
      await upsertSetlist({ ...sl, id: newId(), entries, order: ++maxSlOrder, createdAt: now(), updatedAt: now() });
      summary.setlists += 1;
    }
  }

  await songsList.refresh();
  await setlistsList.refresh();
  return summary;
}

export async function importLocalData(): Promise<LocalImportSummary> {
  const [localSongs, localSetlists] = await Promise.all([
    db.songs.toArray(),
    db.setlists.toArray(),
  ]);

  const existingSongs = await ensureSongs();
  const existingSongIds = new Set(existingSongs.map((s) => s.id));
  const existingSetlists = setlistsList.getSnapshot() ?? [];
  const existingSetlistIds = new Set(existingSetlists.map((s) => s.id));

  let songs = 0;
  let setlists = 0;
  let skipped = 0;
  let maxOrder = existingSongs.reduce((m, s) => Math.max(m, s.order), 0);
  let maxSlOrder = existingSetlists.reduce((m, s) => Math.max(m, s.order), 0);

  // Keep local ids so setlist entries (which reference song ids) still resolve.
  for (const s of localSongs) {
    if (existingSongIds.has(s.id)) {
      skipped += 1;
      continue;
    }
    await upsertSong({ ...s, order: ++maxOrder, updatedAt: now() });
    songs += 1;
  }

  for (const sl of localSetlists) {
    if (existingSetlistIds.has(sl.id)) {
      skipped += 1;
      continue;
    }
    await upsertSetlist({ ...sl, order: ++maxSlOrder, updatedAt: now() });
    setlists += 1;
  }

  await songsList.refresh();
  await setlistsList.refresh();
  return { songs, setlists, skipped };
}
