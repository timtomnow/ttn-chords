// Chord-chart resolution: given an instrument and a chord symbol, return a
// renderable diagram. Resolution order:
//   1. A user ChordDefinition (override / custom) for this instrument + name.
//   2. The bundled library (guitar, ukulele) or a computed shape (bass, piano).
//   3. null — caller shows just the chord name with no diagram.
//
// The Phase-4 renderers consume `ResolvedChart`. Nothing here touches the DB;
// callers pass the user's definitions in (see repo hooks).

import type { ChordDefinition, FrettedShape, KeyboardShape } from '@/types';
import {
  BUILTIN_BASS,
  BUILTIN_GUITAR,
  BUILTIN_PIANO,
  BUILTIN_UKULELE,
  getInstrumentInfo,
  type InstrumentInfo,
} from './instruments';
import { GUITAR_CHORDS } from './guitar';
import { UKULELE_CHORDS } from './ukulele';
import { computeBassRootShape, computePianoShape } from './compute';

export * from './instruments';
export { GUITAR_CHORDS } from './guitar';
export { UKULELE_CHORDS } from './ukulele';
export { computeBassRootShape, computePianoShape } from './compute';

export type ResolvedChart =
  | { kind: 'fretted'; instrumentId: string; name: string; source: ChartSource; fretted: FrettedShape }
  | { kind: 'keyboard'; instrumentId: string; name: string; source: ChartSource; keyboard: KeyboardShape };

export type ChartSource = 'user' | 'bundled' | 'computed';

function userOverride(
  instrumentId: string,
  name: string,
  userDefs: ChordDefinition[],
): ResolvedChart | null {
  const def = userDefs.find((d) => d.instrumentId === instrumentId && d.name === name);
  if (!def) return null;
  if (def.fretted) {
    return { kind: 'fretted', instrumentId, name, source: 'user', fretted: def.fretted };
  }
  if (def.keyboard) {
    return { kind: 'keyboard', instrumentId, name, source: 'user', keyboard: def.keyboard };
  }
  return null;
}

/**
 * Resolve a chord chart for an instrument. `userDefs` and `userInstruments` come
 * from the DB (pass [] if none). Returns null when no diagram is available.
 */
export function resolveChord(
  instrumentId: string,
  chordName: string,
  opts: { userDefs?: ChordDefinition[]; instrument?: InstrumentInfo } = {},
): ResolvedChart | null {
  const name = chordName.trim();
  if (!name) return null;
  const userDefs = opts.userDefs ?? [];

  const fromUser = userOverride(instrumentId, name, userDefs);
  if (fromUser) return fromUser;

  const info = opts.instrument ?? getInstrumentInfo(instrumentId);

  switch (instrumentId) {
    case BUILTIN_GUITAR: {
      const shape = GUITAR_CHORDS[name];
      return shape
        ? { kind: 'fretted', instrumentId, name, source: 'bundled', fretted: shape }
        : null;
    }
    case BUILTIN_UKULELE: {
      const shape = UKULELE_CHORDS[name];
      return shape
        ? { kind: 'fretted', instrumentId, name, source: 'bundled', fretted: shape }
        : null;
    }
    case BUILTIN_BASS: {
      const shape = computeBassRootShape(name, info?.tuning);
      return shape
        ? { kind: 'fretted', instrumentId, name, source: 'computed', fretted: shape }
        : null;
    }
    case BUILTIN_PIANO: {
      const shape = computePianoShape(name);
      return shape
        ? { kind: 'keyboard', instrumentId, name, source: 'computed', keyboard: shape }
        : null;
    }
    default: {
      // User-defined instrument: only user charts are available (no bundled lib).
      // Piano-like custom keyboards still get a computed shape as a fallback.
      if (info?.kind === 'keyboard') {
        const shape = computePianoShape(name);
        return shape
          ? { kind: 'keyboard', instrumentId, name, source: 'computed', keyboard: shape }
          : null;
      }
      return null;
    }
  }
}
