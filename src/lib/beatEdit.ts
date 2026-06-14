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
import type { Beats, Section } from '@/types';

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
