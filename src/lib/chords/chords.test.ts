import { describe, expect, it } from 'vitest';
import type { ChordDefinition } from '@/types';
import { computeBassRootShape, computePianoShape } from './compute';
import {
  BUILTIN_BASS,
  BUILTIN_GUITAR,
  BUILTIN_PIANO,
  BUILTIN_UKULELE,
  resolveChord,
} from './index';

describe('resolveChord — bundled libraries', () => {
  it('returns the bundled guitar shape', () => {
    const c = resolveChord(BUILTIN_GUITAR, 'C');
    expect(c).toMatchObject({ kind: 'fretted', source: 'bundled' });
    expect(c?.kind === 'fretted' && c.fretted.frets).toEqual([-1, 3, 2, 0, 1, 0]);
  });

  it('returns the bundled ukulele shape', () => {
    const c = resolveChord(BUILTIN_UKULELE, 'C');
    expect(c?.kind === 'fretted' && c.fretted.frets).toEqual([0, 0, 0, 3]);
  });

  it('returns null for an unknown bundled chord', () => {
    expect(resolveChord(BUILTIN_GUITAR, 'Cmaj13#11')).toBeNull();
  });
});

describe('resolveChord — computed', () => {
  it('computes a bass root note on the lowest convenient string', () => {
    const c = resolveChord(BUILTIN_BASS, 'G');
    // Bass tuning E A D G; G is open on the 4th string (index 3) but also fret 3
    // on the low E string. Lowest fret wins → open G string.
    expect(c).toMatchObject({ kind: 'fretted', source: 'computed' });
    expect(c?.kind === 'fretted' && c.fretted.frets).toEqual([-1, -1, -1, 0]);
  });

  it('computes a bass root using the slash bass note', () => {
    const c = resolveChord(BUILTIN_BASS, 'C/E');
    // E is open on the low E string (index 0).
    expect(c?.kind === 'fretted' && c.fretted.frets).toEqual([0, -1, -1, -1]);
  });

  it('computes piano keys from chord tones with the root marked', () => {
    const c = resolveChord(BUILTIN_PIANO, 'C');
    expect(c).toMatchObject({ kind: 'keyboard', source: 'computed' });
    expect(c?.kind === 'keyboard' && c.keyboard).toMatchObject({
      notes: [0, 4, 7],
      rootPc: 0,
    });
  });
});

describe('resolveChord — user overrides', () => {
  it('prefers a user definition over the bundled library', () => {
    const userDefs: ChordDefinition[] = [
      {
        id: 'x',
        instrumentId: BUILTIN_GUITAR,
        name: 'C',
        fretted: { baseFret: 1, frets: [0, 3, 2, 0, 1, 0] },
        createdAt: 0,
        updatedAt: 0,
      },
    ];
    const c = resolveChord(BUILTIN_GUITAR, 'C', { userDefs });
    expect(c?.source).toBe('user');
    expect(c?.kind === 'fretted' && c.fretted.frets[0]).toBe(0);
  });
});

describe('compute helpers', () => {
  it('computeBassRootShape returns null for non-chords', () => {
    expect(computeBassRootShape('N.C.')).toBeNull();
  });

  it('computePianoShape returns null for non-chords', () => {
    expect(computePianoShape('N.C.')).toBeNull();
  });
});
