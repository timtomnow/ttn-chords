import { describe, expect, it } from 'vitest';
import { uniqueChords } from './song';
import { parseChordPro } from './chordpro';

const sections = parseChordPro(
  [
    '{start_of_verse}',
    '[G]Amazing [C]grace how [G]sweet the [D]sound',
    '{end_of_verse}',
    '{start_of_chorus}',
    '[C]grace [Am@2]oh [@4]',
    '{end_of_chorus}',
  ].join('\n'),
).sections;

describe('uniqueChords', () => {
  it('lists distinct chords in first-appearance order, skipping rhythm-only', () => {
    expect(uniqueChords(sections)).toEqual(['G', 'C', 'D', 'Am']);
  });

  it('transposes when asked', () => {
    expect(uniqueChords(sections, 2)).toEqual(['A', 'D', 'E', 'Bm']);
  });

  it('respects flat preference', () => {
    expect(uniqueChords(sections, 1, true)).toEqual(['Ab', 'Db', 'Eb', 'Bbm']);
  });
});
