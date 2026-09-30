import { describe, expect, it } from 'vitest';
import { clearAllBeats, spaceSection, spaceSections, spacingPreview } from './spacing';
import type { SpacingOptions } from './spacing';
import { beatsToNumber } from './timeline';
import type { Line, Section } from '@/types';

let n = 0;
const id = () => `id-${n++}`;

/** A line built from "Chord@charIndex" pairs, e.g. line('hello world', ['G:0','C:6']). */
function line(lyric: string, chords: string[]): Line {
  return {
    id: id(),
    lyric,
    events: chords.map((spec) => {
      const [chord, at] = spec.split(':');
      return at === undefined
        ? { id: id(), chord }
        : { id: id(), chord, charIndex: Number(at) };
    }),
  };
}

function section(lines: Line[]): Section {
  return { id: id(), kind: 'verse', lines };
}

const base: SpacingOptions = { mode: 'line', beatsPerChord: 2, barBeats: 4, grid: 8 };

/** Every event's beat as a plain number, in stored order, per line. */
function beats(s: Section): number[][] {
  return s.lines.map((l) => l.events.map((e) => (e.beat ? beatsToNumber(e.beat) : NaN)));
}

describe('spaceSection — fixed', () => {
  it('spaces every chord in the section by beatsPerChord, ignoring line breaks', () => {
    const s = section([line('one two', ['G:0', 'C:4']), line('three four', ['Am:0', 'D:6'])]);
    expect(beats(spaceSection(s, { ...base, mode: 'fixed' }))).toEqual([
      [0, 2],
      [4, 6],
    ]);
  });

  it('honours a 4-beat default', () => {
    const s = section([line('one two', ['G:0', 'C:4'])]);
    expect(beats(spaceSection(s, { ...base, mode: 'fixed', beatsPerChord: 4 }))).toEqual([[0, 4]]);
  });

  it('places anchorless (rhythm-only) events too', () => {
    const s = section([line('one', ['G:0', '']), line('', ['C'])]);
    expect(beats(spaceSection(s, { ...base, mode: 'fixed' }))).toEqual([[0, 2], [4]]);
  });
});

describe('spaceSection — line (bar per line)', () => {
  it('restarts each lyric line on a downbeat', () => {
    // Line 1 has 2 chords at 2 beats = one bar; line 2 starts at beat 4.
    const s = section([line('one two', ['G:0', 'C:4']), line('three four', ['Am:0', 'D:6'])]);
    expect(beats(spaceSection(s, base))).toEqual([
      [0, 2],
      [4, 6],
    ]);
  });

  it('gives a line with three chords two whole bars, so the next line is still on a bar line', () => {
    const s = section([line('a b c', ['G:0', 'C:2', 'D:4']), line('next', ['Am:0'])]);
    // 3 chords x 2 beats = 6 -> ceil to 2 bars = 8 beats.
    expect(beats(spaceSection(s, base))).toEqual([[0, 2, 4], [8]]);
  });

  it('a lyric line with no chords still consumes a bar (the chord is held through it)', () => {
    const s = section([line('one', ['G:0']), line('held over', []), line('next', ['C:0'])]);
    expect(beats(spaceSection(s, base))).toEqual([[0], [], [8]]);
  });

  it('a blank line consumes nothing', () => {
    const s = section([line('one', ['G:0']), line('', []), line('next', ['C:0'])]);
    expect(beats(spaceSection(s, base))).toEqual([[0], [], [4]]);
  });

  it('sorts by lyric anchor rather than trusting stored order', () => {
    // Stored out of order (a drag in the Highway can do this).
    const s = section([line('one two three', ['D:8', 'G:0', 'C:4'])]);
    // D is last in reading order, so it gets the latest beat.
    expect(beats(spaceSection(s, base))).toEqual([[4, 0, 2]]);
  });
});

describe('spaceSection — proportional', () => {
  it('places chords by where their anchors sit in the line', () => {
    // 20-char line, one bar (2 chords x 2 beats = 4). usable = 4 - 0.5 = 3.5.
    // G at 0 -> 0; C at 10 -> 10/20 * 3.5 = 1.75 -> snaps to 2 on the 1/8 grid.
    const s = section([line('12345678901234567890', ['G:0', 'C:10'])]);
    expect(beats(spaceSection(s, { ...base, mode: 'proportional' }))).toEqual([[0, 2]]);
  });

  it('forces strictly increasing onsets when anchors are bunched up', () => {
    const s = section([line('abcdefghij', ['G:0', 'C:1', 'D:2'])]);
    const out = beats(spaceSection(s, { ...base, mode: 'proportional' }))[0];
    expect(out[0]).toBeLessThan(out[1]);
    expect(out[1]).toBeLessThan(out[2]);
    // One grid step (1/8 = 0.5 quarter-beats) apart at minimum.
    expect(out[1] - out[0]).toBeGreaterThanOrEqual(0.5);
  });

  it('keeps every onset inside the line span', () => {
    const s = section([line('abcdefghij', ['G:0', 'C:9'])]);
    const out = beats(spaceSection(s, { ...base, mode: 'proportional' }))[0];
    expect(Math.max(...out)).toBeLessThan(4);
  });

  it('snaps onto the chosen grid', () => {
    const s = section([line('12345678901234567890', ['G:0', 'C:7'])]);
    const out = beats(spaceSection(s, { ...base, mode: 'proportional', grid: 4 }))[0];
    // A 1/4 grid means whole quarter-beats only.
    for (const b of out) expect(b % 1).toBe(0);
  });
});

describe('exact rationals', () => {
  it('stores reduced fractions, never floats', () => {
    const s = section([line('12345678901234567890', ['G:0', 'C:5', 'D:15'])]);
    const out = spaceSection(s, { ...base, mode: 'proportional', grid: 16 });
    for (const e of out.lines[0].events) {
      expect(Number.isInteger(e.beat?.n)).toBe(true);
      expect(Number.isInteger(e.beat?.d)).toBe(true);
    }
  });
});

describe('skipTimedSections', () => {
  it('leaves an already-timed section untouched', () => {
    const timed = section([line('one two', ['G:0', 'C:4'])]);
    timed.lines[0].events[0].beat = { n: 3, d: 1 };
    const out = spaceSections([timed], { ...base, skipTimedSections: true });
    expect(out[0]).toBe(timed);
  });

  it('still spaces sections that have no beats at all', () => {
    const timed = section([line('one', ['G:0'])]);
    timed.lines[0].events[0].beat = { n: 3, d: 1 };
    const untimed = section([line('two', ['C:0'])]);
    const out = spaceSections([timed, untimed], { ...base, skipTimedSections: true });
    expect(out[0]).toBe(timed);
    expect(beats(out[1])).toEqual([[0]]);
  });
});

describe('spacingPreview', () => {
  it('counts the chords and sections a run would touch', () => {
    const a = section([line('one two', ['G:0', 'C:4'])]);
    const b = section([line('three', ['Am:0'])]);
    b.lines[0].events[0].beat = { n: 1, d: 1 };
    expect(spacingPreview([a, b], { ...base, skipTimedSections: true })).toEqual({
      chords: 2,
      sections: 1,
      skipped: 1,
    });
    expect(spacingPreview([a, b], base)).toEqual({ chords: 3, sections: 2, skipped: 0 });
  });
});

describe('clearAllBeats', () => {
  it('drops every beat but keeps the chords and anchors', () => {
    const s = spaceSection(section([line('one two', ['G:0', 'C:4'])]), base);
    const cleared = clearAllBeats([s])[0];
    expect(cleared.lines[0].events.every((e) => e.beat === undefined)).toBe(true);
    expect(cleared.lines[0].events.map((e) => e.chord)).toEqual(['G', 'C']);
    expect(cleared.lines[0].events.map((e) => e.charIndex)).toEqual([0, 4]);
  });
});
