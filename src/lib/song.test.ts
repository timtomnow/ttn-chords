import { describe, expect, it } from 'vitest';
import { getDifficulty, sectionsOf, sortedDifficulties, uniqueChords } from './song';
import { parseChordPro } from './chordpro';
import type { Song } from '@/types';

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

const multi: Song = {
  id: 's',
  title: 'T',
  tags: [],
  difficulties: [
    { id: 'easy', level: 1, sections: parseChordPro('{start_of_verse}\n[G]One\n{end_of_verse}').sections },
    { id: 'hard', level: 4, sections: parseChordPro('{start_of_verse}\n[Gmaj7]Two\n{end_of_verse}').sections },
  ],
  defaultDifficultyId: 'hard',
  order: 0,
  createdAt: 0,
  updatedAt: 0,
};

describe('difficulty helpers', () => {
  it('sorts variants easiest → hardest', () => {
    expect(sortedDifficulties(multi).map((d) => d.id)).toEqual(['easy', 'hard']);
  });

  it('resolves requested id, then default, then first', () => {
    expect(getDifficulty(multi, 'easy')?.id).toBe('easy');
    expect(getDifficulty(multi)?.id).toBe('hard'); // default
    expect(getDifficulty(multi, 'missing')?.id).toBe('hard'); // bad id → default
    expect(getDifficulty({ ...multi, defaultDifficultyId: undefined })?.id).toBe('easy'); // first
  });

  it('sectionsOf returns the resolved variant body', () => {
    expect(uniqueChords(sectionsOf(multi, 'easy'))).toEqual(['G']);
    expect(uniqueChords(sectionsOf(multi))).toEqual(['Gmaj7']);
  });
});
