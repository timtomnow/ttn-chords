// Common ukulele chord shapes (standard reentrant tuning gCEA).
// `frets` is low→high in string order G, C, E, A: -1 = muted, 0 = open, n = fret.

import type { FrettedShape } from '@/types';

const u = (frets: number[], extra: Partial<FrettedShape> = {}): FrettedShape => ({
  baseFret: 1,
  frets,
  ...extra,
});

export const UKULELE_CHORDS: Record<string, FrettedShape> = {
  // Major
  C: u([0, 0, 0, 3]),
  D: u([2, 2, 2, 0]),
  E: u([4, 4, 4, 2]),
  F: u([2, 0, 1, 0]),
  G: u([0, 2, 3, 2]),
  A: u([2, 1, 0, 0]),
  B: u([4, 3, 2, 2]),

  // Minor
  Am: u([2, 0, 0, 0]),
  Bm: u([4, 2, 2, 2]),
  Cm: u([0, 3, 3, 3]),
  Dm: u([2, 2, 1, 0]),
  Em: u([0, 4, 3, 2]),
  Fm: u([1, 0, 1, 3]),
  Gm: u([0, 2, 3, 1]),

  // Dominant 7ths
  C7: u([0, 0, 0, 1]),
  D7: u([2, 2, 2, 3]),
  E7: u([1, 2, 0, 2]),
  F7: u([2, 3, 1, 0]),
  G7: u([0, 2, 1, 2]),
  A7: u([0, 1, 0, 0]),
  B7: u([2, 3, 2, 2]),

  // Minor 7ths
  Am7: u([0, 0, 0, 0]),
  Dm7: u([2, 2, 1, 3]),
  Em7: u([0, 2, 0, 2]),

  // Major 7ths
  Cmaj7: u([0, 0, 0, 2]),
  Dmaj7: u([2, 2, 2, 4]),
  Fmaj7: u([2, 4, 1, 3]),
  Gmaj7: u([0, 2, 2, 2]),
  Amaj7: u([1, 1, 0, 0]),
};
