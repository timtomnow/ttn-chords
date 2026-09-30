// Song-level helpers that operate on the structured model (sections/lines/
// events). Pure; shared by the editor, read view, and reports.

import type { ArrangementEntry, Section, Song, SongDifficulty } from '@/types';
import { newId } from '@/lib/id';
import { defaultLabelForKind } from '@/lib/chordpro';
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

// ─────────────────────────────────────────────────────────────────────────
// Arrangement — performance order over the section pool
// ─────────────────────────────────────────────────────────────────────────

/**
 * One resolved occurrence of a section in the performance order. `sectionIndex`
 * is the index into the variant's `sections` POOL (what beat edits write to);
 * `slotIndex` is the position in the performance order (what the timeline lays
 * end-to-end). They're the same number only for a song with no arrangement.
 */
export type ArrangementSlot = {
  /** Unique per occurrence — safe as a React key where a section id is not. */
  key: string;
  /** The arrangement entry's id, or the section id for an implicit arrangement. */
  entryId: string;
  section: Section;
  /** Index into the variant's `sections` pool. */
  sectionIndex: number;
  /** Position in the performance order. */
  slotIndex: number;
  /** Back-to-back passes of this block (>= 1). */
  repeat: number;
  /** Semitones to transpose this occurrence. */
  transpose: number;
  notes?: string;
};

/**
 * Resolve a variant's performance order. With no `arrangement` this is the
 * section pool in order, once each — which is exactly how every song behaved
 * before arrangements existed, so nothing needs migrating. Entries pointing at a
 * section that no longer exists are dropped.
 */
export function arrangementOf(diff: SongDifficulty | undefined): ArrangementSlot[] {
  const sections = diff?.sections ?? [];
  const entries = diff?.arrangement;

  if (!entries?.length) {
    return sections.map((section, i) => ({
      key: `${section.id}#${i}`,
      entryId: section.id,
      section,
      sectionIndex: i,
      slotIndex: i,
      repeat: Math.max(1, section.repeat ?? 1),
      transpose: 0,
    }));
  }

  const indexById = new Map(sections.map((s, i) => [s.id, i]));
  const slots: ArrangementSlot[] = [];
  for (const entry of entries) {
    const sectionIndex = indexById.get(entry.sectionId);
    if (sectionIndex === undefined) continue; // the part was deleted
    const section = sections[sectionIndex];
    slots.push({
      key: `${entry.id}#${slots.length}`,
      entryId: entry.id,
      section,
      sectionIndex,
      slotIndex: slots.length,
      repeat: Math.max(1, entry.repeat ?? section.repeat ?? 1),
      transpose: entry.transpose ?? 0,
      notes: entry.notes,
    });
  }
  return slots;
}

/**
 * Label one entry of a performance order, numbering repeat occurrences of the
 * same part ("Chorus 2") so four choruses don't read as four identical headings.
 * Takes anything slot-shaped, so it serves both `ArrangementSlot[]` and the
 * timeline's `SectionSpan[]`.
 */
export function occurrenceLabel(slots: { section: Section }[], index: number): string {
  const slot = slots[index];
  if (!slot) return '';
  const base = slot.section.label || defaultLabelForKind(slot.section.kind);
  const total = slots.filter((s) => s.section.id === slot.section.id).length;
  if (total < 2) return base;
  const nth = slots.slice(0, index + 1).filter((s) => s.section.id === slot.section.id).length;
  return `${base} ${nth}`;
}

/** The performance order of the resolved difficulty variant (see arrangementOf). */
export function slotsOf(song: Song, difficultyId?: string): ArrangementSlot[] {
  return arrangementOf(getDifficulty(song, difficultyId));
}

/**
 * An explicit arrangement equivalent to the implicit one — the starting point
 * when the editor first opens the arrangement pane for a song.
 */
export function defaultArrangement(sections: Section[]): ArrangementEntry[] {
  return sections.map((s) => ({ id: newId(), sectionId: s.id }));
}

/** Add one occurrence of a section to the end of a variant's arrangement. */
export function appendToArrangement(
  entries: ArrangementEntry[],
  sectionId: string,
): ArrangementEntry[] {
  return [...entries, { id: newId(), sectionId }];
}

/**
 * Drop arrangement entries whose section no longer exists. Called after a part
 * is deleted so the stored arrangement never carries dangling references.
 */
export function pruneArrangement(
  entries: ArrangementEntry[] | undefined,
  sections: Section[],
): ArrangementEntry[] | undefined {
  if (!entries) return undefined;
  const ids = new Set(sections.map((s) => s.id));
  const kept = entries.filter((e) => ids.has(e.sectionId));
  return kept.length === entries.length ? entries : kept;
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
 * Pass the section POOL here: a chord is worth one chart however many times the
 * arrangement plays the block it sits in.
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

/**
 * Distinct chord symbols across a resolved performance order, honouring each
 * slot's own transpose on top of the global one — so a last chorus up a tone
 * contributes its own chords to the chart strip.
 */
export function uniqueChordsInSlots(
  slots: ArrangementSlot[],
  transpose = 0,
  preferFlats = false,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const slot of slots) {
    const shift = transpose + slot.transpose;
    for (const line of slot.section.lines) {
      for (const ev of line.events) {
        if (!ev.chord) continue;
        const sym = shift ? transposeChordSymbol(ev.chord, shift, preferFlats) : ev.chord;
        if (!seen.has(sym)) {
          seen.add(sym);
          out.push(sym);
        }
      }
    }
  }
  return out;
}
