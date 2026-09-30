import { describe, expect, it } from 'vitest';
import {
  applyGridToSection,
  barBeatsOf,
  eventsToGrid,
  gridBarCount,
  gridToEvents,
  parseChordGrid,
} from './chordGrid';
import { beatsToNumber } from './timeline';
import type { Section, TimeSignature } from '@/types';

const FOUR_FOUR: TimeSignature = { beats: 4, unit: 4 };
const THREE_FOUR: TimeSignature = { beats: 3, unit: 4 };
const SIX_EIGHT: TimeSignature = { beats: 6, unit: 8 };

/** [chord, beat] pairs for easy assertions. */
function pairs(text: string, ts: TimeSignature = FOUR_FOUR): [string, number][] {
  return gridToEvents(text, ts).map((e) => [e.chord, e.beat ? beatsToNumber(e.beat) : NaN]);
}

describe('barBeatsOf', () => {
  it('measures a bar in quarter-note beats', () => {
    expect(barBeatsOf(FOUR_FOUR)).toEqual({ n: 4, d: 1 });
    expect(barBeatsOf(THREE_FOUR)).toEqual({ n: 3, d: 1 });
    expect(barBeatsOf(SIX_EIGHT)).toEqual({ n: 3, d: 1 });
    expect(barBeatsOf({ beats: 7, unit: 8 })).toEqual({ n: 7, d: 2 });
  });
});

describe('parseChordGrid — bars', () => {
  it('splits on bar lines and ignores the outer ones', () => {
    expect(parseChordGrid('| G | C |').bars.map((b) => b.tokens)).toEqual([['G'], ['C']]);
  });

  it('works without a leading or trailing bar line', () => {
    expect(parseChordGrid('G | C').bars.map((b) => b.tokens)).toEqual([['G'], ['C']]);
  });

  it('writes a bar of rest with an explicit hold token', () => {
    expect(parseChordGrid('| G | - | C |').bars.map((b) => b.tokens)).toEqual([
      ['G'],
      ['-'],
      ['C'],
    ]);
  });

  it('drops blank chunks, so a wrapped row is layout rather than a rest bar', () => {
    expect(parseChordGrid('| G | | C |').bars.map((b) => b.tokens)).toEqual([['G'], ['C']]);
  });

  it('treats newlines as whitespace so rows are just layout', () => {
    expect(parseChordGrid('| G | C |\n| Am | D |').bars.length).toBe(4);
  });

  it('flags tokens that are not chords', () => {
    const p = parseChordGrid('| G | Zq9 |');
    expect(p.unknownChords).toEqual(['Zq9']);
  });

  it('does not flag hold or repeat tokens', () => {
    expect(parseChordGrid('| G . . / | % |').unknownChords).toEqual([]);
  });
});

describe('parseChordGrid — repeats', () => {
  it('a bare :| plays the group twice', () => {
    expect(parseChordGrid('|: G | C :|').bars.map((b) => b.tokens)).toEqual([
      ['G'],
      ['C'],
      ['G'],
      ['C'],
    ]);
  });

  it('xN sets the number of passes', () => {
    expect(gridBarCount('|: G | C :| x4')).toBe(8);
    expect(gridBarCount('|: G :| x3')).toBe(3);
  });

  it('keeps bars outside the repeat', () => {
    expect(parseChordGrid('| Am |: G | C :| x3 | D |').bars.map((b) => b.tokens)).toEqual([
      ['Am'],
      ['G'],
      ['C'],
      ['G'],
      ['C'],
      ['G'],
      ['C'],
      ['D'],
    ]);
  });

  it('warns about unbalanced repeat marks instead of throwing', () => {
    expect(parseChordGrid('|: G | C').warnings.length).toBe(1);
    expect(parseChordGrid('G | C :|').warnings.length).toBe(1);
  });

  it('is not stateful across calls', () => {
    parseChordGrid('|: G :| x5');
    expect(gridBarCount('| G | C |')).toBe(2);
  });
});

describe('gridToEvents — slot math', () => {
  it('one chord per bar fills the bar', () => {
    expect(pairs('| G | C | Am | D |')).toEqual([
      ['G', 0],
      ['C', 4],
      ['Am', 8],
      ['D', 12],
    ]);
  });

  it('two chords split the bar in half', () => {
    expect(pairs('| G C | Am D |')).toEqual([
      ['G', 0],
      ['C', 2],
      ['Am', 4],
      ['D', 6],
    ]);
  });

  it('hold tokens push the next chord later', () => {
    expect(pairs('| G . . C |')).toEqual([
      ['G', 0],
      ['C', 3],
    ]);
    expect(pairs('| G / / / | C |')).toEqual([
      ['G', 0],
      ['C', 4],
    ]);
  });

  it('three chords in a bar land on exact thirds', () => {
    const evs = gridToEvents('| G C D |', FOUR_FOUR);
    expect(evs.map((e) => e.beat)).toEqual([
      { n: 0, d: 1 },
      { n: 4, d: 3 },
      { n: 8, d: 3 },
    ]);
  });

  it('% repeats the previous bar', () => {
    expect(pairs('| G C | % |')).toEqual([
      ['G', 0],
      ['C', 2],
      ['G', 4],
      ['C', 6],
    ]);
  });

  it('a rest bar takes time but starts no chord', () => {
    expect(pairs('| G | - | C |')).toEqual([
      ['G', 0],
      ['C', 8],
    ]);
  });

  it('follows the time signature', () => {
    expect(pairs('| G | C |', THREE_FOUR)).toEqual([
      ['G', 0],
      ['C', 3],
    ]);
    expect(pairs('| G C |', SIX_EIGHT)).toEqual([
      ['G', 0],
      ['C', 1.5],
    ]);
  });

  it('stores exact rationals, never floats', () => {
    for (const e of gridToEvents('| G C D |', { beats: 7, unit: 8 })) {
      expect(Number.isInteger(e.beat?.n)).toBe(true);
      expect(Number.isInteger(e.beat?.d)).toBe(true);
    }
  });

  it('expands a repeat onto real, increasing beats', () => {
    expect(pairs('|: G | C :| x2')).toEqual([
      ['G', 0],
      ['C', 4],
      ['G', 8],
      ['C', 12],
    ]);
  });

  it('gives beat-only events (no lyric anchors)', () => {
    expect(gridToEvents('| G | C |', FOUR_FOUR).every((e) => e.charIndex === undefined)).toBe(true);
  });
});

describe('applyGridToSection', () => {
  const section: Section = {
    id: 's1',
    kind: 'verse',
    lines: [
      { id: 'l1', lyric: 'amazing grace', events: [{ id: 'e1', chord: 'G', charIndex: 0 }] },
      { id: 'l2', lyric: 'how sweet', events: [{ id: 'e2', chord: 'C', charIndex: 0 }] },
    ],
  };

  it('puts the compiled chords on a leading chord-only line', () => {
    const out = applyGridToSection(section, '| D | A |', FOUR_FOUR);
    expect(out.lines[0].lyric).toBe('');
    expect(out.lines[0].events.map((e) => e.chord)).toEqual(['D', 'A']);
  });

  it('keeps the lyrics but drops their old chord anchors', () => {
    const out = applyGridToSection(section, '| D |', FOUR_FOUR);
    expect(out.lines.slice(1).map((l) => l.lyric)).toEqual(['amazing grace', 'how sweet']);
    expect(out.lines.slice(1).every((l) => l.events.length === 0)).toBe(true);
  });

  it('stores the authored grid text on the section', () => {
    expect(applyGridToSection(section, '| D |', FOUR_FOUR).grid).toBe('| D |');
  });
});

describe('eventsToGrid', () => {
  it('round-trips a simple one-chord-per-bar progression', () => {
    const events = gridToEvents('| G | C | Am | D |', FOUR_FOUR);
    const section: Section = { id: 's', kind: 'verse', lines: [{ id: 'l', lyric: '', events }] };
    expect(pairs(eventsToGrid(section, FOUR_FOUR))).toEqual(pairs('| G | C | Am | D |'));
  });

  it('round-trips half-bar chords', () => {
    const events = gridToEvents('| G C | Am D |', FOUR_FOUR);
    const section: Section = { id: 's', kind: 'verse', lines: [{ id: 'l', lyric: '', events }] };
    expect(pairs(eventsToGrid(section, FOUR_FOUR))).toEqual(pairs('| G C | Am D |'));
  });

  it('round-trips an off-beat onset', () => {
    const events = gridToEvents('| G . . C |', FOUR_FOUR);
    const section: Section = { id: 's', kind: 'verse', lines: [{ id: 'l', lyric: '', events }] };
    expect(pairs(eventsToGrid(section, FOUR_FOUR))).toEqual(pairs('| G . . C |'));
  });

  it('round-trips a rest bar', () => {
    const events = gridToEvents('| G | - | C |', FOUR_FOUR);
    const section: Section = { id: 's', kind: 'verse', lines: [{ id: 'l', lyric: '', events }] };
    expect(pairs(eventsToGrid(section, FOUR_FOUR))).toEqual(pairs('| G | - | C |'));
  });

  it('returns empty text for a section with no chords', () => {
    const section: Section = { id: 's', kind: 'verse', lines: [{ id: 'l', lyric: 'la', events: [] }] };
    expect(eventsToGrid(section, FOUR_FOUR)).toBe('');
  });
});

describe('deterministic ids', () => {
  const FF = FOUR_FOUR;
  it('derives stable event ids from an id prefix', () => {
    const a = gridToEvents('| G C | Am |', FF, 'sec:g').map((e) => e.id);
    const b = gridToEvents('| G C | Am |', FF, 'sec:g').map((e) => e.id);
    expect(a).toEqual(b);
    expect(new Set(a).size).toBe(3);
  });

  it('generates fresh ids when no prefix is given', () => {
    const a = gridToEvents('| G |', FF)[0].id;
    const b = gridToEvents('| G |', FF)[0].id;
    expect(a).not.toBe(b);
  });

  it('applyGridToSection keeps line ids unique', () => {
    const section: Section = {
      id: 's1',
      kind: 'verse',
      lines: [{ id: 'l1', lyric: 'words here', events: [] }],
    };
    const out = applyGridToSection(section, '| G |', FF);
    expect(new Set(out.lines.map((l) => l.id)).size).toBe(out.lines.length);
  });

  it('recompiling the same grid is stable', () => {
    const section: Section = { id: 's1', kind: 'verse', lines: [] };
    const once = applyGridToSection(section, '| G | C |', FF);
    const twice = applyGridToSection(once, '| G | C |', FF);
    expect(twice.lines[0].events.map((e) => e.id)).toEqual(once.lines[0].events.map((e) => e.id));
    expect(twice.lines[0].id).toBe(once.lines[0].id);
  });
});
