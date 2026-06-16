// Pure, reusable edits to a Song's beat-timing layer, shared by the play-along
// tagger's fine-tune editor (TagBeats `ReviewEditor`) and the Highway view's
// "Edit timing" mode (HorizontalView). Every function takes `Section[]` (plus a
// resolved `Timeline` where it needs the bar/section geometry) and returns a NEW
// `Section[]` — no mutation, no React, no DB.
//
// Beats are section-relative (see types.ts), so a bar op shifts every event at or
// after a beat *within its own section's single pass* by ±one bar; the section's
// length is derived from its last event (timeline.ts `passLength`), so the
// timeline and all repeats follow automatically.

import { newId } from '@/lib/id';
import { parseBeat } from '@/lib/chordpro';
import { beatsToNumber } from '@/lib/timeline';
import type { SectionSpan, Timeline, TimelineBar } from '@/lib/timeline';
import type { Beats, ChordEvent, Line, Section } from '@/types';

const EPS = 1e-9;

/** Snap a (non-negative) quarter-beat number to an exact rational. */
export function snapBeats(x: number): Beats {
  return parseBeat(String(Math.max(0, x))) ?? { n: Math.round(Math.max(0, x)), d: 1 };
}

/** The section span an absolute beat falls in (last span as a fallback). */
export function spanForBeat(timeline: Timeline, absBeat: number): SectionSpan | undefined {
  return (
    timeline.sections.find(
      (s) => absBeat >= s.startBeat - EPS && absBeat < s.startBeat + s.lengthBeats - EPS,
    ) ?? timeline.sections[timeline.sections.length - 1]
  );
}

/** Beat offset of `absBeat` within a single pass of its section. */
export function beatWithinPass(span: SectionSpan, absBeat: number): number {
  const rel = absBeat - span.startBeat;
  return rel - Math.floor((rel + EPS) / span.passBeats) * span.passBeats;
}

/** Shift events in one section whose beat ≥ `fromBeat` by `delta` quarter-beats. */
export function shiftSectionEvents(
  sections: Section[],
  sectionIndex: number,
  fromBeat: number,
  delta: number,
): Section[] {
  return sections.map((s, si) =>
    si !== sectionIndex
      ? s
      : {
          ...s,
          lines: s.lines.map((l) => ({
            ...l,
            events: l.events.map((e) => {
              if (!e.beat) return e;
              const v = beatsToNumber(e.beat);
              return v >= fromBeat - EPS ? { ...e, beat: snapBeats(v + delta) } : e;
            }),
          })),
        },
  );
}

/** Insert one empty bar immediately before the bar starting at `absBeat`. */
export function insertBarAt(sections: Section[], timeline: Timeline, absBeat: number): Section[] {
  const span = spanForBeat(timeline, absBeat);
  if (!span) return sections;
  return shiftSectionEvents(sections, span.sectionIndex, beatWithinPass(span, absBeat), span.barBeats);
}

/** Remove a (blank) bar, pulling everything after it back by one bar. */
export function deleteBarAt(sections: Section[], timeline: Timeline, absBeat: number): Section[] {
  const span = spanForBeat(timeline, absBeat);
  if (!span) return sections;
  const start = beatWithinPass(span, absBeat);
  return shiftSectionEvents(sections, span.sectionIndex, start + span.barBeats, -span.barBeats);
}

/** A bar with no chord onset anywhere inside it — safe to delete. */
export function isBlankBar(timeline: Timeline, bar: TimelineBar): boolean {
  return !timeline.items.some(
    (it) => it.absBeat >= bar.absBeat - EPS && it.absBeat < bar.absBeat + bar.beats - EPS,
  );
}

// ── Lyric "text packet" editing ──
// A timed event with a `charIndex` owns the slice of its line's lyric from that
// index up to the next anchor on the same line — that's the "text packet" the
// Highway shows beneath the chord. These edits rewrite `Line.lyric` + anchors so
// the change flows straight back to the Scroll view and ChordPro export. A
// chord-less event (chord: '') is a pure lyric anchor that can sit on its own
// beat, independent of any chord.

/** The [start, end) range in `line.lyric` an anchored event's packet occupies. */
function segmentRange(line: Line, charIndex: number): { start: number; end: number } {
  let end = line.lyric.length;
  for (const e of line.events) {
    if (e.charIndex !== undefined && e.charIndex > charIndex && e.charIndex < end) end = e.charIndex;
  }
  return { start: charIndex, end };
}

/** Shift the anchors of a line's events at/after `from` by `delta` chars. */
function shiftAnchors(events: ChordEvent[], from: number, delta: number, except?: string): ChordEvent[] {
  if (delta === 0) return events;
  return events.map((e) =>
    e.id !== except && e.charIndex !== undefined && e.charIndex >= from
      ? { ...e, charIndex: e.charIndex + delta }
      : e,
  );
}

/** Map over whichever line owns `eventId`, leaving the rest untouched. */
function mapOwningLine(
  sections: Section[],
  eventId: string,
  fn: (line: Line, event: ChordEvent) => Line,
): Section[] {
  return sections.map((s) => ({
    ...s,
    lines: s.lines.map((l) => {
      const event = l.events.find((e) => e.id === eventId);
      return event ? fn(l, event) : l;
    }),
  }));
}

/**
 * Set the text of an event's packet. Rewrites the owning line's lyric slice and
 * shifts every later anchor by the length delta. An empty/blank `text` deletes
 * the packet's text and unanchors the event (a chord becomes trailing; a
 * chord-less anchor becomes a bare beat marker). An event with no `charIndex`
 * yet gets one by appending the text to the end of its line.
 */
export function setEventLyric(sections: Section[], eventId: string, text: string): Section[] {
  return mapOwningLine(sections, eventId, (line, event) => {
    // No anchor yet → append the text to the line and anchor here.
    if (event.charIndex === undefined) {
      const t = text.trim();
      if (!t) return line;
      const base = line.lyric.length ? `${line.lyric} ` : '';
      return {
        ...line,
        lyric: base + t,
        events: line.events.map((e) => (e.id === eventId ? { ...e, charIndex: base.length } : e)),
      };
    }

    const { start, end } = segmentRange(line, event.charIndex);
    // Blank text → drop the slice and the anchor entirely.
    if (!text.trim()) {
      const lyric = line.lyric.slice(0, start) + line.lyric.slice(end);
      const events = shiftAnchors(line.events, end, start - end, eventId).map((e) => {
        if (e.id !== eventId) return e;
        const { charIndex: _drop, ...rest } = e;
        void _drop;
        return rest;
      });
      return { ...line, lyric, events };
    }

    // Keep a single separating space before the following packet, if any.
    let stored = text;
    if (end < line.lyric.length && !/\s$/.test(stored)) stored += ' ';
    const lyric = line.lyric.slice(0, start) + stored + line.lyric.slice(end);
    const delta = stored.length - (end - start);
    return { ...line, lyric, events: shiftAnchors(line.events, end, delta, eventId) };
  });
}

/**
 * Split an event's packet at `caret` (a char offset into `text`, the possibly
 * edited full packet text). The original event keeps the first half; a new
 * chord-less anchor at `newBeat` takes the second half, so a word can be pulled
 * onto its own beat. No-op when the split would leave either half empty.
 */
export function splitLyricEvent(
  sections: Section[],
  eventId: string,
  caret: number,
  text: string,
  newBeat: Beats,
): Section[] {
  const first = text.slice(0, caret).trim();
  const second = text.slice(caret).trim();
  if (!first || !second) return setEventLyric(sections, eventId, text);
  return mapOwningLine(sections, eventId, (line, event) => {
    if (event.charIndex === undefined) return line;
    const { start, end } = segmentRange(line, event.charIndex);
    let combined = `${first} ${second}`;
    if (end < line.lyric.length) combined += ' '; // keep the gap to the next packet
    const lyric = line.lyric.slice(0, start) + combined + line.lyric.slice(end);
    const delta = combined.length - (end - start);
    const secondAnchor = start + first.length + 1;
    const newEvent: ChordEvent = { id: newId(), chord: '', beat: newBeat, charIndex: secondAnchor };
    const events = [...shiftAnchors(line.events, end, delta, eventId), newEvent];
    return { ...line, lyric, events };
  });
}

/**
 * Add a chord-less lyric anchor at `beat`, appending `text` to the target line
 * (the section's first line by default, created if the section has none).
 */
export function addLyricAnchor(
  sections: Section[],
  opts: { sectionIndex: number; beat: Beats; text: string; lineId?: string },
): Section[] {
  const { sectionIndex, beat, text, lineId } = opts;
  const t = text.trim();
  if (!t) return sections;
  return sections.map((s, si) => {
    if (si !== sectionIndex) return s;
    if (!s.lines.length) {
      return { ...s, lines: [{ id: newId(), lyric: t, events: [{ id: newId(), chord: '', beat, charIndex: 0 }] }] };
    }
    const targetId = lineId ?? s.lines[0].id;
    let placed = false;
    const lines = s.lines.map((l) => {
      if (placed || l.id !== targetId) return l;
      placed = true;
      const base = l.lyric.length ? `${l.lyric} ` : '';
      return {
        ...l,
        lyric: base + t,
        events: [...l.events, { id: newId(), chord: '', beat, charIndex: base.length }],
      };
    });
    return { ...s, lines };
  });
}

/** Append a new chord event to a section. With no `lineId` it lands on the
 * section's first line (created if the section has none) — used for beat-only
 * chords that aren't anchored to any lyric. */
export function addChordEvent(
  sections: Section[],
  opts: { sectionIndex: number; chord: string; beat: Beats; lineId?: string; charIndex?: number },
): Section[] {
  const { sectionIndex, chord, beat, lineId, charIndex } = opts;
  const event = {
    id: newId(),
    chord,
    beat,
    ...(charIndex !== undefined ? { charIndex } : {}),
  };
  return sections.map((s, si) => {
    if (si !== sectionIndex) return s;
    if (!s.lines.length) return { ...s, lines: [{ id: newId(), lyric: '', events: [event] }] };
    const targetId = lineId ?? s.lines[0].id;
    let placed = false;
    const lines = s.lines.map((l) => {
      if (placed || l.id !== targetId) return l;
      placed = true;
      return { ...l, events: [...l.events, event] };
    });
    return { ...s, lines };
  });
}
