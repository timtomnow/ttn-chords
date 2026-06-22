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
import { sectionsOf } from '@/lib/song';

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

/** Does any chord event in the given difficulty carry a beat? Drives the "needs
 * tagging" empty state in the horizontal view. */
export function hasAnyBeats(song: Song, difficultyId?: string): boolean {
  return sectionsOf(song, difficultyId).some((s) =>
    s.lines.some((l) => l.events.some((e) => e.beat)),
  );
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
export function buildTimeline(
  song: Song,
  defaults: TimelineDefaults,
  difficultyId?: string,
): Timeline {
  const items: TimelineItem[] = [];
  const bars: TimelineBar[] = [];
  const sections: SectionSpan[] = [];

  let cursor = 0;
  let barNumber = 1;

  sectionsOf(song, difficultyId).forEach((section, sectionIndex) => {
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

/**
 * The lyric "text packet" each anchored event owns: the slice of its line's
 * lyric from its `charIndex` up to the next anchor on the same line (trimmed for
 * display). Keyed by event id. This is the *editable* unit — `lib/beatEdit`'s
 * `setEventLyric`/`splitLyricEvent` rewrite exactly this line slice — so it must
 * stay within a single line. For the Highway's *display* packets (which run on
 * across line breaks) see `lyricPackets`.
 */
export function lyricSegments(items: TimelineItem[]): Map<string, string> {
  const map = new Map<string, string>();
  const byLine = new Map<string, number[]>();
  for (const item of items) {
    const idx = item.event.charIndex;
    if (idx === undefined) continue;
    const key = `${item.section.id}:${item.line.id}`;
    const arr = byLine.get(key) ?? [];
    arr.push(idx);
    byLine.set(key, arr);
  }
  for (const item of items) {
    const idx = item.event.charIndex;
    if (idx === undefined) continue;
    const lyric = item.line.lyric;
    const anchors = (byLine.get(`${item.section.id}:${item.line.id}`) ?? []).filter((a) => a > idx);
    const end = anchors.length ? Math.min(...anchors) : lyric.length;
    map.set(item.event.id, lyric.slice(idx, end).trim());
  }
  return map;
}

/**
 * The lyric "text packet" each anchored chord *displays* in the Highway view:
 * every word from that chord's `charIndex` up to the *next chord* — continuing
 * past line breaks and even past the end of a section (newlines become spaces),
 * so a held phrase reads as one packet instead of being chopped at each line.
 * Keyed by event id. A chord's boundary is the next anchored chord that also
 * appears on the timeline (i.e. has a beat); chords with no beat don't split a
 * packet. This is display-only — edit with `lyricSegments` + `beatEdit`.
 */
export function lyricPackets(timeline: Timeline): Map<string, string> {
  const map = new Map<string, string>();

  // Only chords anchored to a lyric AND placed on the timeline (have a beat)
  // bound a packet. Repeats collapse to the same event id.
  const boundary = new Set<string>();
  for (const item of timeline.items) {
    if (item.event.charIndex !== undefined) boundary.add(item.event.id);
  }

  const tidy = (parts: string[]) => parts.join(' ').replace(/\s+/g, ' ').trim();

  // Walk the song in reading order, accumulating text into the currently-open
  // packet. A line with no boundary chord contributes all of its text to the
  // packet still open from an earlier line/section.
  let current: { id: string; parts: string[] } | null = null;
  const flush = () => {
    if (current) map.set(current.id, tidy(current.parts));
  };

  for (const span of timeline.sections) {
    for (const line of span.section.lines) {
      const lyric = line.lyric;
      const anchors = line.events
        .filter((e) => e.charIndex !== undefined && boundary.has(e.id))
        .map((e) => ({ id: e.id, idx: e.charIndex as number }))
        .sort((a, b) => a.idx - b.idx);

      if (!anchors.length) {
        if (current) current.parts.push(lyric);
        continue;
      }

      // Text before the first chord on this line belongs to the open packet.
      if (current) current.parts.push(lyric.slice(0, anchors[0].idx));
      // Each chord opens a packet that runs to the next chord on this line;
      // the last one stays open to absorb following lines/sections.
      for (let i = 0; i < anchors.length; i++) {
        flush();
        const end = i + 1 < anchors.length ? anchors[i + 1].idx : lyric.length;
        current = { id: anchors[i].id, parts: [lyric.slice(anchors[i].idx, end)] };
      }
    }
  }
  flush();

  return map;
}
