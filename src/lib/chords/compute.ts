// Computed chord diagrams for instruments where a static library isn't needed:
//   - Bass: just the root note on the lowest convenient string (per the spec).
//   - Piano: the chord tones as pressed keys (derived from music.chordTones).
// Both derive from the chord symbol, so they cover any chord automatically.

import type { FrettedShape, KeyboardShape } from '@/types';
import { chordTones, mod12, parseChordSymbol, parseNote } from '@/lib/music';

/**
 * Root-note shape for a fretted bass. Finds the root on the lowest string where
 * it sits within the first few frets, so the diagram stays in open position.
 */
export function computeBassRootShape(
  symbol: string,
  tuning: string[] = ['E', 'A', 'D', 'G'],
): FrettedShape | null {
  const parsed = parseChordSymbol(symbol);
  if (!parsed) return null;
  // A slash chord on bass should show the bass note.
  const targetPc = parsed.bassPc ?? parsed.rootPc;

  const openPcs = tuning.map((n) => parseNote(n));
  if (openPcs.some((pc) => pc === null)) return null;

  let best: { string: number; fret: number } | null = null;
  openPcs.forEach((openPc, i) => {
    const fret = mod12(targetPc - (openPc as number));
    if (best === null || fret < best.fret || (fret === best.fret && i < best.string)) {
      best = { string: i, fret };
    }
  });
  if (best === null) return null;
  // TS narrowing inside forEach above doesn't carry out; re-read explicitly.
  const chosen = best as { string: number; fret: number };

  const frets = tuning.map((_, i) => (i === chosen.string ? chosen.fret : -1));
  return { baseFret: 1, frets };
}

/** Keyboard diagram: chord tones as pitch classes, with the root highlighted. */
export function computePianoShape(symbol: string): KeyboardShape | null {
  const tones = chordTones(symbol);
  if (tones.length === 0) return null;
  const parsed = parseChordSymbol(symbol);
  return { notes: tones, rootPc: parsed?.rootPc };
}
