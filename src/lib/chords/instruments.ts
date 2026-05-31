// Bundled instrument definitions. These are versioned in code (NOT in the DB),
// so backups stay small and the defaults can improve over time. The
// `instruments` Dexie table holds only USER-created instruments. Builtin ids
// are namespaced with a `builtin:` prefix and are stable forever.

import type { Instrument, InstrumentKind } from '@/types';

/** Minimal instrument shape shared by builtin defs and user rows. */
export type InstrumentInfo = {
  id: string;
  name: string;
  kind: InstrumentKind;
  /** Fretted only: string count + tuning, low → high. */
  strings?: number;
  tuning?: string[];
  builtin: boolean;
};

export const BUILTIN_GUITAR = 'builtin:guitar';
export const BUILTIN_UKULELE = 'builtin:ukulele';
export const BUILTIN_BASS = 'builtin:bass';
export const BUILTIN_PIANO = 'builtin:piano';

export const BUILTIN_INSTRUMENTS: InstrumentInfo[] = [
  {
    id: BUILTIN_GUITAR,
    name: 'Guitar',
    kind: 'fretted',
    strings: 6,
    tuning: ['E', 'A', 'D', 'G', 'B', 'E'],
    builtin: true,
  },
  {
    id: BUILTIN_UKULELE,
    name: 'Ukulele',
    kind: 'fretted',
    strings: 4,
    tuning: ['G', 'C', 'E', 'A'],
    builtin: true,
  },
  {
    id: BUILTIN_BASS,
    name: 'Bass',
    kind: 'fretted',
    strings: 4,
    tuning: ['E', 'A', 'D', 'G'],
    builtin: true,
  },
  {
    id: BUILTIN_PIANO,
    name: 'Piano',
    kind: 'keyboard',
    builtin: true,
  },
];

/** Builtin instruments plus the user's, as a single lookup-friendly list. */
export function allInstruments(user: Instrument[] = []): InstrumentInfo[] {
  return [
    ...BUILTIN_INSTRUMENTS,
    ...user.map((u) => ({
      id: u.id,
      name: u.name,
      kind: u.kind,
      strings: u.strings,
      tuning: u.tuning,
      builtin: false,
    })),
  ];
}

export function getInstrumentInfo(
  id: string,
  user: Instrument[] = [],
): InstrumentInfo | undefined {
  return allInstruments(user).find((i) => i.id === id);
}
