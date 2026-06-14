// Flattens a Song's per-section beat-timing layer into ONE continuous,
// absolute timeline measured in quarter-note beats from the start of the song.
// This is what the horizontal ("highway") performance view scrolls and what the
// beat-tagging fine-tune editor draws on.
//
// The stored model (see types.ts) keeps `ChordEvent.beat` *relative to its
// section*; this module resolves each section's effective tempo/time-signature
// (section override → song → app defaults), computes each section's length in
// bars, lays the sections end-to-end, and exposes absolute beat positions for
// every timed chord event plus the bar grid.
//
// Pure + unit-tested (timeline.test.ts). No React, no DB.

import type { Beats, ChordEvent, Line, Section, Song, TimeSignature } from '@/types';

export const DEFAULT_TS: TimeSignature = { beats: 4, unit: 4 };
export const DEFAULT_TEMPO = 100;

/** A rational beat value as a plain number of quarter-note beats. */
export function beatsToNumber(b: Beats): number {
  return b.n / b.d;
}

/**
 * Length of one bar in quarter-note beats. ChordEvent.beat is always in
 * quarter-note beats, so the grid must be too: 4/4 = 4, 3/4 = 3, 6/8 = 3,
 * 12/8 = 6.
 */
export function quarterBeatsPerBar(ts: TimeSignature): number {
  return (ts.beats * 4) / ts.unit;
}

/** Does any chord event anywhere in the song carry a beat? Drives the "needs
 * tagging" empty state in the horizontal view. */
export function hasAnyBeats(song: Song): boolean {
  return song.sections.some((s) => s.lines.some((l) => l.events.some((e) => e.beat)));
}

export type TimelineDefaults = {
  tempo: number;
  timeSignature: TimeSignature;
};

/** One timed chord event placed on the absolute timeline. */
export type TimelineItem = {
  /** Stable per-event id (the underlying ChordEvent id). */
  id: string;
  event: ChordEvent;
  line: Line;
  section: Section;
  sectionIndex: number;
  /** Which repeat pass this item belongs to (0-based). */
  repetition: number;
  /** Absolute onset, quarter-note beats from song start. */
  absBeat: number;
};

/** One bar on the absolute grid (bars can differ in length across sections). */
export type TimelineBar = {
  absBeat: number;
  /** Quarter-note beats in this bar (from the section's time signature). */
  beats: number;
  /** 1-based bar number within the whole song. */
  number: number;
};

export type SectionSpan = {
  section: Section;
  sectionIndex: number;
  startBeat: number;
  /** Total length including all repeats, in quarter-note beats. */
  lengthBeats: number;
  /** Length of a single pass (one repeat), in quarter-note beats. */
  passBeats: number;
  barBeats: number;
  tempo: number;
  timeSignature: TimeSignature;
};

export type Timeline = {
  items: TimelineItem[];
  bars: TimelineBar[];
  sections: SectionSpan[];
  totalBeats: number;
};

const EPS = 1e-9;

/** Resolve a section's effective time signature / tempo. */
function effectiveTs(section: Section, song: Song, defaults: TimelineDefaults): TimeSignature {
  return section.timeSignature ?? song.timeSignature ?? defaults.timeSignature;
}
function effectiveTempo(section: Section, song: Song, defaults: TimelineDefaults): number {
  return section.tempo ?? song.tempo ?? defaults.tempo;
}

/**
 * A single pass of a section is as long as the bar that contains its last timed
 * event, rounded up to a whole number of bars. If the section has no timed
 * events we can't know its length, so fall back to one bar per lyric line so
 * the timeline still advances (a partially-tagged-song edge case).
 */
function passLength(section: Section, barBeats: number): number {
  let max = -1;
  for (const line of section.lines) {
    for (const e of line.events) {
      if (e.beat) max = Math.max(max, beatsToNumber(e.beat));
    }
  }
  if (max < 0) {
    const lyricLines = section.lines.filter((l) => l.lyric.trim().length > 0).length;
    return Math.max(1, lyricLines) * barBeats;
  }
  const bars = Math.max(1, Math.ceil((max + EPS) / barBeats));
  return bars * barBeats;
}

/**
 * Build the absolute timeline. Sections lay end-to-end; `section.repeat`
 * (default 1) duplicates a section's items and length.
 */
export function buildTimeline(song: Song, defaults: TimelineDefaults): Timeline {
  const items: TimelineItem[] = [];
  const bars: TimelineBar[] = [];
  const sections: SectionSpan[] = [];

  let cursor = 0;
  let barNumber = 1;

  song.sections.forEach((section, sectionIndex) => {
    const ts = effectiveTs(section, song, defaults);
    const tempo = effectiveTempo(section, song, defaults);
    const barBeats = quarterBeatsPerBar(ts);
    const passBeats = passLength(section, barBeats);
    const repeats = Math.max(1, section.repeat ?? 1);
    const startBeat = cursor;

    for (let rep = 0; rep < repeats; rep++) {
      const passStart = startBeat + rep * passBeats;

      // Bar grid for this pass.
      for (let b = 0; b < passBeats - EPS; b += barBeats) {
        bars.push({ absBeat: passStart + b, beats: barBeats, number: barNumber++ });
      }

      // Timed chord events for this pass.
      for (const line of section.lines) {
        for (const event of line.events) {
          if (!event.beat) continue;
          items.push({
            id: event.id,
            event,
            line,
            section,
            sectionIndex,
            repetition: rep,
            absBeat: passStart + beatsToNumber(event.beat),
          });
        }
      }
    }

    const lengthBeats = passBeats * repeats;
    sections.push({
      section,
      sectionIndex,
      startBeat,
      lengthBeats,
      passBeats,
      barBeats,
      tempo,
      timeSignature: ts,
    });
    cursor += lengthBeats;
  });

  items.sort((a, b) => a.absBeat - b.absBeat);

  return { items, bars, sections, totalBeats: cursor };
}
