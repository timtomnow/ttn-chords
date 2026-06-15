import { describe, expect, it } from 'vitest';
import {
  addChordEvent,
  deleteBarAt,
  insertBarAt,
  isBlankBar,
  shiftSectionEvents,
} from './beatEdit';
import { DEFAULT_TS, DEFAULT_TEMPO, beatsToNumber, buildTimeline } from './timeline';
import type { Beats, ChordEvent, Section, Song } from '@/types';

const defaults = { tempo: DEFAULT_TEMPO, timeSignature: DEFAULT_TS };

let n = 0;
const id = () => `id-${n++}`;
const b = (nn: number, d = 1): Beats => ({ n: nn, d });

function ev(chord: string, beat?: Beats): ChordEvent {
  return beat ? { id: id(), chord, beat } : { id: id(), chord };
}
function section(events: ChordEvent[], extra: Partial<Section> = {}): Section {
  return { id: id(), kind: 'verse', lines: [{ id: id(), lyric: 'la la la', events }], ...extra };
}
function song(sections: Section[]): Song {
  return {
    id: id(),
    title: 'T',
    tags: [],
    difficulties: [{ id: 'd', level: 3, sections }],
    order: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Flat list of every event's beat-number in a section, in document order. */
function beatsOf(sections: Section[], si = 0): (number | undefined)[] {
  return sections[si].lines.flatMap((l) => l.events.map((e) => (e.beat ? beatsToNumber(e.beat) : undefined)));
}

describe('shiftSectionEvents', () => {
  it('shifts only events at/after fromBeat, leaving others put', () => {
    const s = [section([ev('G', b(0)), ev('C', b(2)), ev('D', b(4))])];
    const out = shiftSectionEvents(s, 0, 2, 4);
    expect(beatsOf(out)).toEqual([0, 6, 8]);
  });
  it('ignores events with no beat', () => {
    const s = [section([ev('G'), ev('C', b(2))])];
    const out = shiftSectionEvents(s, 0, 0, 4);
    expect(beatsOf(out)).toEqual([undefined, 6]);
  });
});

describe('insertBarAt / deleteBarAt', () => {
  it('inserts a bar at the song start, pushing all first-section events right', () => {
    const s = [section([ev('G', b(0)), ev('C', b(2))])];
    const tl = buildTimeline(song(s), defaults);
    const out = insertBarAt(s, tl, 0); // bar 1 starts at beat 0
    expect(beatsOf(out)).toEqual([4, 6]);
  });

  it('insert then delete the same bar is a round-trip', () => {
    const s = [section([ev('G', b(0)), ev('C', b(2))])];
    const inserted = insertBarAt(s, buildTimeline(song(s), defaults), 0);
    const tl2 = buildTimeline(song(inserted), defaults);
    const back = deleteBarAt(inserted, tl2, 0);
    expect(beatsOf(back)).toEqual([0, 2]);
  });

  it('only affects the section the bar lives in', () => {
    const s = [section([ev('G', b(0))]), section([ev('D', b(0)), ev('E', b(2))])];
    const tl = buildTimeline(song(s), defaults);
    // second section starts at beat 4; insert before its first bar.
    const out = insertBarAt(s, tl, 4);
    expect(beatsOf(out, 0)).toEqual([0]); // first section untouched
    expect(beatsOf(out, 1)).toEqual([4, 6]); // second section shifted +1 bar
  });
});

describe('isBlankBar', () => {
  it('is true for a bar with no chord onset inside it', () => {
    // events at 0 and 4 → bar 2 (beats 4..8 has the onset), insert a gap at bar 2.
    const s = [section([ev('G', b(0)), ev('C', b(8))])];
    const tl = buildTimeline(song(s), defaults);
    const bar2 = tl.bars.find((bar) => bar.number === 2)!; // beats 4..8, empty
    expect(isBlankBar(tl, bar2)).toBe(true);
    const bar1 = tl.bars.find((bar) => bar.number === 1)!;
    expect(isBlankBar(tl, bar1)).toBe(false);
  });
});

describe('addChordEvent', () => {
  it('adds a beat-only chord to the section first line by default', () => {
    const s = [section([ev('G', b(0))])];
    const out = addChordEvent(s, { sectionIndex: 0, chord: 'F', beat: b(2) });
    const added = out[0].lines[0].events.find((e) => e.chord === 'F')!;
    expect(beatsToNumber(added.beat!)).toBe(2);
    expect(added.charIndex).toBeUndefined();
  });

  it('anchors to a given line with a charIndex', () => {
    const lineId = 'L1';
    const s = [
      section([ev('G', b(0))], { lines: [{ id: lineId, lyric: 'amazing', events: [ev('G', b(0))] }] }),
    ];
    const out = addChordEvent(s, { sectionIndex: 0, chord: 'C', beat: b(1), lineId, charIndex: 2 });
    const added = out[0].lines[0].events.find((e) => e.chord === 'C')!;
    expect(added.charIndex).toBe(2);
  });

  it('creates a line when the section has none', () => {
    const s = [section([], { lines: [] })];
    const out = addChordEvent(s, { sectionIndex: 0, chord: 'A', beat: b(0) });
    expect(out[0].lines).toHaveLength(1);
    expect(out[0].lines[0].events[0].chord).toBe('A');
  });
});
