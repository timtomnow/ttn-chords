// Auto-distribute the beat-timing layer: give every chord in a section a beat
// without tapping or dragging a single one.
//
// Why this exists: `ChordEvent.beat` is optional and, before this, was only ever
// written one event at a time (the play-along tagger, or a drag in the Highway /
// tag-beats lane). But most teaching material is regular — a chord every two
// beats, or one bar per lyric line — so the timing can be *derived* from the
// text and only touched up where the song is irregular. That turns beat tagging
// from a required pass into an optional polish step.
//
// Three modes, cheapest to smartest:
//   'fixed'        — N beats per chord, straight through the section.
//   'line'         — same spacing, but every lyric line restarts on a downbeat
//                    (each line gets a whole number of bars). The right default
//                    for hymns, folk and most group-singing material.
//   'proportional' — within each line's bar span, chords land in proportion to
//                    where their lyric anchor sits in the text, so a chord over
//                    the last word of a line lands late in the bar. Snapped to
//                    the grid and forced strictly increasing.
//
// Pure: takes Section[], returns a new Section[]. No React, no DB. Unit-tested
// in spacing.test.ts.

import { reduceBeats } from '@/lib/chordpro';
import { beatsToNumber } from '@/lib/timeline';
import type { Beats, ChordEvent, Line, Section } from '@/types';

const EPS = 1e-9;

export type SpacingMode = 'fixed' | 'line' | 'proportional';

export type SpacingOptions = {
  mode: SpacingMode;
  /** Quarter-note beats each chord gets by default (2 and 4 are the common ones). */
  beatsPerChord: number;
  /** Bar length in quarter-note beats (from the effective time signature). */
  barBeats: number;
  /** Grid denominator onsets snap to: 4 = quarter, 8 = eighth, 16 = sixteenth. */
  grid: number;
  /**
   * Leave any section that already has at least one timed chord completely
   * alone. Lets "space everything evenly" fill in the untouched sections without
   * flattening the ones already tagged by hand.
   */
  skipTimedSections?: boolean;
};

export const SPACING_MODES: { value: SpacingMode; label: string; hint: string }[] = [
  { value: 'line', label: 'Bar per line', hint: 'Every lyric line starts on a downbeat' },
  { value: 'fixed', label: 'Straight through', hint: 'Same spacing, ignoring line breaks' },
  {
    value: 'proportional',
    label: 'Follow the words',
    hint: 'Space chords by where they sit in each line',
  },
];

/** Snap a quarter-beat number onto the grid and reduce it to an exact rational. */
function snapToGrid(x: number, grid: number): Beats {
  const step = 4 / grid;
  const steps = Math.round(Math.max(0, x) / step);
  // step = 4/grid, so steps * 4/grid = (steps*4)/grid — exact, no float snapping.
  return reduceBeats(steps * 4, grid);
}

/** Does any event anywhere in this section carry a beat? */
export function sectionIsTimed(section: Section): boolean {
  return section.lines.some((l) => l.events.some((e) => e.beat));
}

/**
 * A line's events in reading order: by lyric anchor, with anchorless events
 * (rhythm-only or trailing chords) kept at the end in their stored order.
 * Stored order can drift from anchor order once chords have been dragged about,
 * so we sort rather than trusting the array.
 */
function readingOrder(line: Line): ChordEvent[] {
  return line.events
    .map((e, i) => ({ e, i }))
    .sort((a, b) => {
      const ai = a.e.charIndex ?? Number.POSITIVE_INFINITY;
      const bi = b.e.charIndex ?? Number.POSITIVE_INFINITY;
      return ai === bi ? a.i - b.i : ai - bi;
    })
    .map((x) => x.e);
}

/**
 * How many whole bars a line occupies. A line with chords takes however many
 * bars its chords need at the chosen spacing; a lyric line with no chords still
 * takes one bar (the previous chord is being held through it, and the timing
 * should keep pace with the reading); a blank line takes none.
 */
function barsForLine(line: Line, nChords: number, opts: SpacingOptions): number {
  if (nChords === 0) return line.lyric.trim() ? 1 : 0;
  return Math.max(1, Math.ceil((nChords * opts.beatsPerChord - EPS) / opts.barBeats));
}

/** Evenly spaced offsets within a span, preferring the exact requested spacing. */
function evenOffsets(n: number, spanBeats: number, opts: SpacingOptions): number[] {
  const fits = n * opts.beatsPerChord <= spanBeats + EPS;
  const step = fits ? opts.beatsPerChord : spanBeats / n;
  return Array.from({ length: n }, (_, k) => k * step);
}

/**
 * Offsets proportional to where each chord's lyric anchor sits in the line.
 * Anchorless events fall one grid step after their predecessor. The result is
 * forced strictly increasing (by one grid step) so two chords never collide, and
 * is clamped inside the line's span.
 */
function proportionalOffsets(
  line: Line,
  events: ChordEvent[],
  spanBeats: number,
  opts: SpacingOptions,
): number[] {
  const step = 4 / opts.grid;
  const anchors = events.map((e) => e.charIndex);
  const lastAnchor = anchors.reduce<number>((m, a) => (a === undefined ? m : Math.max(m, a)), 0);
  const denom = Math.max(1, line.lyric.length, lastAnchor + 1);
  // Keep the final chord inside the span with room for its own grid step.
  const usable = Math.max(step, spanBeats - step);

  const out: number[] = [];
  for (let k = 0; k < events.length; k++) {
    const anchor = anchors[k];
    let v = anchor === undefined ? (out[k - 1] ?? -step) + step : (anchor / denom) * usable;
    v = Math.min(Math.max(0, v), usable);
    if (k > 0) v = Math.max(v, out[k - 1] + step);
    out.push(v);
  }
  return out;
}

/** Retime one section. Returns the same object when there's nothing to place. */
export function spaceSection(section: Section, opts: SpacingOptions): Section {
  if (opts.skipTimedSections && sectionIsTimed(section)) return section;

  // 'fixed' runs one counter through the whole section; the other two restart
  // each line on the next bar line.
  let cursor = 0; // quarter-beats from the section start
  let seen = 0; // chords placed so far (fixed mode)
  const placed = new Map<string, Beats>();

  for (const line of section.lines) {
    const events = readingOrder(line);

    if (opts.mode === 'fixed') {
      for (const e of events) placed.set(e.id, snapToGrid(seen++ * opts.beatsPerChord, opts.grid));
      continue;
    }

    const bars = barsForLine(line, events.length, opts);
    const spanBeats = bars * opts.barBeats;
    if (events.length) {
      const offsets =
        opts.mode === 'proportional'
          ? proportionalOffsets(line, events, spanBeats, opts)
          : evenOffsets(events.length, spanBeats, opts);
      offsets.forEach((o, k) => placed.set(events[k].id, snapToGrid(cursor + o, opts.grid)));
    }
    cursor += spanBeats;
  }

  if (!placed.size) return section;
  return {
    ...section,
    lines: section.lines.map((l) => ({
      ...l,
      events: l.events.map((e) => {
        const beat = placed.get(e.id);
        return beat ? { ...e, beat } : e;
      }),
    })),
  };
}

/** Retime every section (see spaceSection). */
export function spaceSections(sections: Section[], opts: SpacingOptions): Section[] {
  return sections.map((s) => spaceSection(s, opts));
}

/**
 * Describe what spacing would do, for a confirmation line in the UI: how many
 * chords get a beat and how many sections are left alone.
 */
export function spacingPreview(
  sections: Section[],
  opts: SpacingOptions,
): { chords: number; sections: number; skipped: number } {
  let chords = 0;
  let touched = 0;
  let skipped = 0;
  for (const s of sections) {
    if (opts.skipTimedSections && sectionIsTimed(s)) {
      skipped++;
      continue;
    }
    const n = s.lines.reduce((m, l) => m + l.events.length, 0);
    if (n) {
      chords += n;
      touched++;
    }
  }
  return { chords, sections: touched, skipped };
}

/** Clear every beat in these sections (the undo for an unwanted spacing run). */
export function clearAllBeats(sections: Section[]): Section[] {
  return sections.map((s) => ({
    ...s,
    lines: s.lines.map((l) => ({
      ...l,
      events: l.events.map((e) => {
        if (!e.beat) return e;
        const { beat: _drop, ...rest } = e;
        void _drop;
        return rest;
      }),
    })),
  }));
}

/** The last timed onset in a section, in quarter-beats (-1 when untimed). */
export function lastOnset(section: Section): number {
  let max = -1;
  for (const l of section.lines) {
    for (const e of l.events) if (e.beat) max = Math.max(max, beatsToNumber(e.beat));
  }
  return max;
}
