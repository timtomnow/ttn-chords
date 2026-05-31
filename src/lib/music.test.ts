import { describe, expect, it } from 'vitest';
import {
  capoTransposeDelta,
  chordTones,
  mod12,
  noteName,
  parseChordSymbol,
  parseNote,
  preferFlatsForKey,
  transposeChordSymbol,
} from './music';

describe('mod12', () => {
  it('wraps negatives and overflow into 0–11', () => {
    expect(mod12(-1)).toBe(11);
    expect(mod12(12)).toBe(0);
    expect(mod12(25)).toBe(1);
  });
});

describe('parseNote / noteName', () => {
  it('parses naturals, sharps, flats, and unicode accidentals', () => {
    expect(parseNote('C')).toBe(0);
    expect(parseNote('C#')).toBe(1);
    expect(parseNote('Db')).toBe(1);
    expect(parseNote('Bb')).toBe(10);
    expect(parseNote('B♭')).toBe(10);
    expect(parseNote('x')).toBeNull();
  });

  it('names a pitch class with the requested accidental preference', () => {
    expect(noteName(1)).toBe('C#');
    expect(noteName(1, true)).toBe('Db');
    expect(noteName(10, true)).toBe('Bb');
  });
});

describe('parseChordSymbol', () => {
  it('splits root, quality, and slash bass', () => {
    expect(parseChordSymbol('G')).toMatchObject({ rootPc: 7, quality: '' });
    expect(parseChordSymbol('Am7')).toMatchObject({ rootPc: 9, quality: 'm7' });
    expect(parseChordSymbol('F#m7b5')).toMatchObject({ rootPc: 6, quality: 'm7b5' });
    expect(parseChordSymbol('C/E')).toMatchObject({ rootPc: 0, bassPc: 4, bassText: 'E' });
  });

  it('returns null for non-chords', () => {
    expect(parseChordSymbol('N.C.')).toBeNull();
    expect(parseChordSymbol('')).toBeNull();
  });
});

describe('transposeChordSymbol', () => {
  it('transposes root and bass, preserving quality', () => {
    expect(transposeChordSymbol('C', 2)).toBe('D');
    expect(transposeChordSymbol('Am7', 3)).toBe('Cm7');
    expect(transposeChordSymbol('C/E', 5)).toBe('F/A');
  });

  it('respects the flat preference for natural enharmonic spelling', () => {
    expect(transposeChordSymbol('A', 1)).toBe('A#');
    expect(transposeChordSymbol('A', 1, true)).toBe('Bb');
  });

  it('leaves unparseable annotations untouched', () => {
    expect(transposeChordSymbol('N.C.', 2)).toBe('N.C.');
  });

  it('wraps around the octave', () => {
    expect(transposeChordSymbol('B', 1)).toBe('C');
  });
});

describe('preferFlatsForKey', () => {
  it('chooses flats for flat keys', () => {
    expect(preferFlatsForKey('F')).toBe(true);
    expect(preferFlatsForKey('Eb')).toBe(true);
    expect(preferFlatsForKey('Dm')).toBe(true);
    expect(preferFlatsForKey('G')).toBe(false);
    expect(preferFlatsForKey(undefined)).toBe(false);
  });
});

describe('chordTones', () => {
  it('spells common qualities', () => {
    expect(chordTones('C')).toEqual([0, 4, 7]);
    expect(chordTones('Am')).toEqual([9, 0, 4]);
    expect(chordTones('G7')).toEqual([7, 11, 2, 5]);
    expect(chordTones('Cmaj7')).toEqual([0, 4, 7, 11]);
  });

  it('adds the slash bass when not already present', () => {
    expect(chordTones('C/E')).toEqual([0, 4, 7]); // E already in C
    expect(chordTones('C/G')).toEqual([0, 4, 7]); // G already in C
    expect(chordTones('C/B')).toEqual([11, 0, 4, 7]); // B added in front
  });

  it('falls back to a major triad for unknown qualities', () => {
    expect(chordTones('Cweird')).toEqual([0, 4, 7]);
  });

  it('returns [] for unparseable input', () => {
    expect(chordTones('N.C.')).toEqual([]);
  });
});

describe('capoTransposeDelta', () => {
  it('is the negative capo fret', () => {
    expect(capoTransposeDelta(3)).toBe(-3);
    expect(capoTransposeDelta(0)).toBe(0);
  });
});
