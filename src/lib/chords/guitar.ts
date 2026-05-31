// Common open-position guitar chord shapes (standard tuning EADGBE).
// `frets` is low→high (6th string first): -1 = muted (x), 0 = open, n = fret n.
// Shapes are intentionally the familiar beginner/teaching voicings.

import type { FrettedShape } from '@/types';

const m1 = (frets: number[], extra: Partial<FrettedShape> = {}): FrettedShape => ({
  baseFret: 1,
  frets,
  ...extra,
});

export const GUITAR_CHORDS: Record<string, FrettedShape> = {
  // Major triads
  C: m1([-1, 3, 2, 0, 1, 0]),
  D: m1([-1, -1, 0, 2, 3, 2]),
  E: m1([0, 2, 2, 1, 0, 0]),
  F: m1([1, 3, 3, 2, 1, 1], { barres: [{ fret: 1, fromString: 0, toString: 5 }] }),
  G: m1([3, 2, 0, 0, 0, 3]),
  A: m1([-1, 0, 2, 2, 2, 0]),
  B: m1([-1, 2, 4, 4, 4, 2], { barres: [{ fret: 2, fromString: 1, toString: 5 }] }),

  // Minor triads
  Am: m1([-1, 0, 2, 2, 1, 0]),
  Bm: m1([-1, 2, 4, 4, 3, 2], { barres: [{ fret: 2, fromString: 1, toString: 5 }] }),
  Dm: m1([-1, -1, 0, 2, 3, 1]),
  Em: m1([0, 2, 2, 0, 0, 0]),
  Fm: m1([1, 3, 3, 1, 1, 1], { barres: [{ fret: 1, fromString: 0, toString: 5 }] }),
  Gm: m1([3, 5, 5, 3, 3, 3], { barres: [{ fret: 3, fromString: 0, toString: 5 }] }),

  // Dominant 7ths
  C7: m1([-1, 3, 2, 3, 1, 0]),
  D7: m1([-1, -1, 0, 2, 1, 2]),
  E7: m1([0, 2, 0, 1, 0, 0]),
  G7: m1([3, 2, 0, 0, 0, 1]),
  A7: m1([-1, 0, 2, 0, 2, 0]),
  B7: m1([-1, 2, 1, 2, 0, 2]),

  // Minor 7ths
  Am7: m1([-1, 0, 2, 0, 1, 0]),
  Dm7: m1([-1, -1, 0, 2, 1, 1]),
  Em7: m1([0, 2, 2, 0, 3, 0]),

  // Major 7ths
  Cmaj7: m1([-1, 3, 2, 0, 0, 0]),
  Dmaj7: m1([-1, -1, 0, 2, 2, 2]),
  Fmaj7: m1([-1, -1, 3, 2, 1, 0]),
  Gmaj7: m1([3, 2, 0, 0, 0, 2]),
  Amaj7: m1([-1, 0, 2, 1, 2, 0]),

  // Sus / add
  Dsus2: m1([-1, -1, 0, 2, 3, 0]),
  Dsus4: m1([-1, -1, 0, 2, 3, 3]),
  Asus2: m1([-1, 0, 2, 2, 0, 0]),
  Asus4: m1([-1, 0, 2, 2, 3, 0]),
  Esus4: m1([0, 2, 2, 2, 0, 0]),
};
