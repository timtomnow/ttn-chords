// Song-level helpers that operate on the structured model (sections/lines/
// events). Pure; shared by the editor, read view, and reports.

import type { Section, Song, SongDifficulty } from '@/types';
import { newId } from '@/lib/id';
import { transposeChordSymbol } from '@/lib/music';

// ─────────────────────────────────────────────────────────────────────────
// Difficulty variants
// ─────────────────────────────────────────────────────────────────────────

/** Difficulty variants ordered easiest → hardest (by level). */
export function sortedDifficulties(song: Song): SongDifficulty[] {
  return [...(song.difficulties ?? [])].sort((a, b) => a.level - b.level);
}

/**
 * Resolve which difficulty variant to use: the requested id if present, else the
 * song's default, else the first variant. Returns undefined only for a song with
 * no variants (shouldn't happen after the v3 migration).
 */
export function getDifficulty(song: Song, id?: string): SongDifficulty | undefined {
  const list = song.difficulties ?? [];
  if (list.length === 0) return undefined;
  if (id) {
    const found = list.find((d) => d.id === id);
    if (found) return found;
  }
  if (song.defaultDifficultyId) {
    const def = list.find((d) => d.id === song.defaultDifficultyId);
    if (def) return def;
  }
  return list[0];
}

/** The sections of the resolved difficulty variant (see getDifficulty). */
export function sectionsOf(song: Song, id?: string): Section[] {
  return getDifficulty(song, id)?.sections ?? [];
}

/** Build a fresh difficulty variant (id generated like other sub-entities). */
export function makeDifficulty(
  level: number,
  sections: Section[] = [],
  label?: string,
): SongDifficulty {
  return { id: newId(), level, label, sections };
}

/**
 * Distinct chord symbols used across a song's sections, in first-appearance
 * order, optionally transposed. Rhythm-only events (empty chord) are skipped.
 */
export function uniqueChords(
  sections: Section[],
  transpose = 0,
  preferFlats = false,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const section of sections) {
    for (const line of section.lines) {
      for (const ev of line.events) {
        if (!ev.chord) continue;
        const sym = transpose
          ? transposeChordSymbol(ev.chord, transpose, preferFlats)
          : ev.chord;
        if (!seen.has(sym)) {
          seen.add(sym);
          out.push(sym);
        }
      }
    }
  }
  return out;
}
