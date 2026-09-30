import { describe, expect, it } from 'vitest';
import {
  appendToArrangement,
  arrangementOf,
  defaultArrangement,
  getDifficulty,
  occurrenceLabel,
  pruneArrangement,
  sectionsOf,
  sortedDifficulties,
  uniqueChords,
  uniqueChordsInSlots,
} from './song';
import { parseChordPro } from './chordpro';
import type { ArrangementEntry, Section, Song, SongDifficulty } from '@/types';

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

// ───────── Arrangement (performance order over the section pool) ─────────

const pool: Section[] = [
  { id: 'intro', kind: 'intro', lines: [] },
  { id: 'verse', kind: 'verse', lines: [{ id: 'lv', lyric: 'v', events: [{ id: 'ev', chord: 'G' }] }] },
  { id: 'chorus', kind: 'chorus', lines: [{ id: 'lc', lyric: 'c', events: [{ id: 'ec', chord: 'C' }] }] },
];

function withArrangement(arrangement?: ArrangementEntry[]): SongDifficulty {
  return { id: 'd', level: 3, sections: pool, arrangement };
}

describe('arrangementOf', () => {
  it('falls back to the pool in order when there is no arrangement', () => {
    const slots = arrangementOf(withArrangement());
    expect(slots.map((s) => s.section.id)).toEqual(['intro', 'verse', 'chorus']);
    expect(slots.map((s) => s.sectionIndex)).toEqual([0, 1, 2]);
    expect(slots.map((s) => s.slotIndex)).toEqual([0, 1, 2]);
  });

  it('honours Section.repeat in the implicit arrangement', () => {
    const diff: SongDifficulty = {
      id: 'd',
      level: 3,
      sections: [{ id: 'a', kind: 'verse', lines: [], repeat: 3 }],
    };
    expect(arrangementOf(diff)[0].repeat).toBe(3);
  });

  it('plays one pooled section at several points, sharing its pool index', () => {
    const slots = arrangementOf(
      withArrangement([
        { id: 'a1', sectionId: 'verse' },
        { id: 'a2', sectionId: 'chorus' },
        { id: 'a3', sectionId: 'verse' },
        { id: 'a4', sectionId: 'chorus' },
      ]),
    );
    expect(slots.map((s) => s.section.id)).toEqual(['verse', 'chorus', 'verse', 'chorus']);
    // Both choruses point at the same authored part, so a beat edit hits both.
    expect(slots[1].sectionIndex).toBe(slots[3].sectionIndex);
    expect(slots.map((s) => s.slotIndex)).toEqual([0, 1, 2, 3]);
  });

  it('gives every slot a unique key even for repeats of one section', () => {
    const slots = arrangementOf(
      withArrangement([
        { id: 'a1', sectionId: 'chorus' },
        { id: 'a2', sectionId: 'chorus' },
      ]),
    );
    expect(new Set(slots.map((s) => s.key)).size).toBe(2);
  });

  it('carries per-occurrence repeat, transpose and notes', () => {
    const slots = arrangementOf(
      withArrangement([{ id: 'a1', sectionId: 'chorus', repeat: 2, transpose: 2, notes: 'big finish' }]),
    );
    expect(slots[0]).toMatchObject({ repeat: 2, transpose: 2, notes: 'big finish' });
  });

  it('drops entries whose section was deleted', () => {
    const slots = arrangementOf(
      withArrangement([
        { id: 'a1', sectionId: 'verse' },
        { id: 'a2', sectionId: 'gone' },
      ]),
    );
    expect(slots.map((s) => s.section.id)).toEqual(['verse']);
    expect(slots[0].slotIndex).toBe(0);
  });

  it('treats an empty arrangement as "no arrangement"', () => {
    expect(arrangementOf(withArrangement([])).length).toBe(3);
  });
});

describe('occurrenceLabel', () => {
  it('leaves a part played once unnumbered', () => {
    const slots = arrangementOf(withArrangement());
    expect(slots.map((_, i) => occurrenceLabel(slots, i))).toEqual(['Intro', 'Verse', 'Chorus']);
  });

  it('numbers repeat occurrences of the same part', () => {
    const slots = arrangementOf(
      withArrangement([
        { id: 'a1', sectionId: 'verse' },
        { id: 'a2', sectionId: 'chorus' },
        { id: 'a3', sectionId: 'verse' },
        { id: 'a4', sectionId: 'chorus' },
      ]),
    );
    expect(slots.map((_, i) => occurrenceLabel(slots, i))).toEqual([
      'Verse 1',
      'Chorus 1',
      'Verse 2',
      'Chorus 2',
    ]);
  });
});

describe('arrangement editing helpers', () => {
  it('defaultArrangement mirrors the pool order', () => {
    const entries = defaultArrangement(pool);
    expect(entries.map((e) => e.sectionId)).toEqual(['intro', 'verse', 'chorus']);
    expect(new Set(entries.map((e) => e.id)).size).toBe(3);
  });

  it('appendToArrangement adds one occurrence at the end', () => {
    const entries = appendToArrangement(defaultArrangement(pool), 'chorus');
    expect(entries.map((e) => e.sectionId)).toEqual(['intro', 'verse', 'chorus', 'chorus']);
  });

  it('pruneArrangement removes dangling references and keeps identity otherwise', () => {
    const entries = defaultArrangement(pool);
    expect(pruneArrangement(entries, pool)).toBe(entries);
    const pruned = pruneArrangement(entries, pool.slice(0, 2));
    expect(pruned?.map((e) => e.sectionId)).toEqual(['intro', 'verse']);
    expect(pruneArrangement(undefined, pool)).toBeUndefined();
  });
});

describe('uniqueChordsInSlots', () => {
  it('applies each occurrence’s own transpose on top of the global one', () => {
    const slots = arrangementOf(
      withArrangement([
        { id: 'a1', sectionId: 'chorus' },
        { id: 'a2', sectionId: 'chorus', transpose: 2 },
      ]),
    );
    expect(uniqueChordsInSlots(slots)).toEqual(['C', 'D']);
    expect(uniqueChordsInSlots(slots, 1)).toEqual(['C#', 'D#']);
  });

  it('lists a chord once however many times its part is played', () => {
    const slots = arrangementOf(
      withArrangement([
        { id: 'a1', sectionId: 'verse' },
        { id: 'a2', sectionId: 'verse' },
      ]),
    );
    expect(uniqueChordsInSlots(slots)).toEqual(['G']);
  });
});
