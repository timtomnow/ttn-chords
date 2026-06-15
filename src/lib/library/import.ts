// Pure planning helpers for syncing a bundle into the library. The DB-touching
// apply step lives in repo.importBundle; everything here is side-effect-free and
// unit-tested (import.test.ts). Matching is by normalized title + artist, per the
// product decision: a match prompts overwrite-vs-duplicate; no match imports new.

import type { Song } from '@/types';
import type { SongBundle } from './types';

export type ConflictResolution = 'overwrite' | 'duplicate';

/** Minimal existing-song shape the planner needs (so callers can pass DB rows). */
export type ExistingSongRef = { id: string; title: string; artist?: string };

export type ImportPlanItem = {
  /** The bundle song (already in v3 shape). */
  song: Song;
  status: 'new' | 'conflict';
  /** Id of the matched existing song (present only when status === 'conflict'). */
  existingId?: string;
};

/** Case-insensitive, trimmed title|artist key used for match detection. */
export function matchKey(title: string, artist?: string): string {
  return `${title.trim().toLowerCase()}|${(artist ?? '').trim().toLowerCase()}`;
}

/** Classify each bundle song as new or a conflict against the existing library. */
export function planBundleImport(
  bundle: SongBundle,
  existing: ExistingSongRef[],
): ImportPlanItem[] {
  const byKey = new Map<string, string>();
  for (const s of existing) {
    const k = matchKey(s.title, s.artist);
    if (!byKey.has(k)) byKey.set(k, s.id); // first match wins
  }
  return bundle.songs.map((song) => {
    const existingId = byKey.get(matchKey(song.title, song.artist));
    return existingId
      ? { song, status: 'conflict' as const, existingId }
      : { song, status: 'new' as const };
  });
}

/**
 * Pick a non-colliding title for a duplicate import: `Base`, then `Base_1`,
 * `Base_2`, … skipping any that already exist (case-insensitively). When a
 * conflict triggered the duplicate, `base` itself is taken, so this returns
 * `Base_1` and increments on repeat imports.
 */
export function nextDuplicateTitle(base: string, existingTitles: Iterable<string>): string {
  const taken = new Set([...existingTitles].map((t) => t.trim().toLowerCase()));
  if (!taken.has(base.trim().toLowerCase())) return base;
  let i = 1;
  while (taken.has(`${base}_${i}`.toLowerCase())) i++;
  return `${base}_${i}`;
}
