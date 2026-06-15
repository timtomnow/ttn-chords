// Lists the "standard" chord diagrams an instrument ships with, for the
// Chord Diagrams browser tool. Fretted builtins (guitar, ukulele) expose their
// bundled library keys in their teaching order. Computed instruments (bass,
// piano, and custom keyboards) have no fixed library — every chord is derived
// on demand — so we offer a common teaching vocabulary that resolveChord() can
// compute. Custom fretted instruments ship nothing, so they return [].

import { mod12, parseChordSymbol, type PitchClass } from '@/lib/music';
import { BUILTIN_BASS, BUILTIN_GUITAR, BUILTIN_PIANO, BUILTIN_UKULELE, type InstrumentInfo } from './instruments';
import { GUITAR_CHORDS } from './guitar';
import { UKULELE_CHORDS } from './ukulele';

// A compact, teaching-friendly chord vocabulary for instruments whose diagrams
// are computed rather than bundled (bass roots, piano voicings).
export const COMMON_CHORD_NAMES: string[] = [
  'C', 'D', 'E', 'F', 'G', 'A', 'B',
  'Cm', 'Dm', 'Em', 'Fm', 'Gm', 'Am', 'Bm',
  'C7', 'D7', 'E7', 'G7', 'A7', 'B7',
  'Cmaj7', 'Dmaj7', 'Fmaj7', 'Gmaj7', 'Amaj7',
  'Am7', 'Dm7', 'Em7',
];

/**
 * The standard chord names available for an instrument, in display order.
 * `instrument` is only needed to read the `kind` of custom instruments.
 */
export function standardChordNames(
  instrumentId: string,
  instrument?: InstrumentInfo,
): string[] {
  switch (instrumentId) {
    case BUILTIN_GUITAR:
      return Object.keys(GUITAR_CHORDS);
    case BUILTIN_UKULELE:
      return Object.keys(UKULELE_CHORDS);
    case BUILTIN_BASS:
    case BUILTIN_PIANO:
      return COMMON_CHORD_NAMES;
    default:
      // Custom keyboards still compute shapes; custom fretted ship nothing.
      return instrument?.kind === 'keyboard' ? COMMON_CHORD_NAMES : [];
  }
}

// ───────── Browser filtering & sorting ─────────

export type ChordSort = 'library' | 'alpha' | 'root' | 'fifths';

/** Twelve key labels, indexed by pitch class — for the key/root filter. */
export const KEY_LABELS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

// Circle-of-fifths position for each pitch class (C=0, G=1, D=2, …).
const FIFTHS_INDEX: Record<number, number> = (() => {
  const order = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
  const m: Record<number, number> = {};
  order.forEach((pc, i) => (m[pc] = i));
  return m;
})();

type TriadFamily = 'maj' | 'min' | 'dim' | 'aug' | 'sus';

/** The underlying triad type a chord quality is built on. */
function triadFamily(quality: string): TriadFamily {
  if (/dim|°|ø|m7b5|m7♭5/.test(quality)) return 'dim';
  if (/aug|\+/.test(quality)) return 'aug';
  if (/^sus/.test(quality)) return 'sus';
  if (/^(m|min|-)/.test(quality) && !/^(maj|M)/.test(quality)) return 'min';
  return 'maj';
}

/** A 7th or richer extension (vs. a plain triad / power / sus chord). */
function isExtended(quality: string): boolean {
  return /(?:6|7|9|11|13|add)/.test(quality);
}

// Diatonic chords of a major key: scale-degree offset + its triad quality.
const MAJOR_DEGREES: { semi: number; fam: TriadFamily }[] = [
  { semi: 0, fam: 'maj' }, // I
  { semi: 2, fam: 'min' }, // ii
  { semi: 4, fam: 'min' }, // iii
  { semi: 5, fam: 'maj' }, // IV
  { semi: 7, fam: 'maj' }, // V
  { semi: 9, fam: 'min' }, // vi
  { semi: 11, fam: 'dim' }, // vii°
];

/** True when a chord belongs to the given major key (root + triad quality). */
function isInKey(rootPc: PitchClass, quality: string, keyPc: PitchClass): boolean {
  const degree = MAJOR_DEGREES.find((d) => mod12(keyPc + d.semi) === rootPc);
  if (!degree) return false;
  const fam = triadFamily(quality);
  return fam === degree.fam || fam === 'sus';
}

/**
 * Filter + sort a list of chord-bearing items by name. Generic over the item so
 * it works for both bundled chord names (string) and user definitions (object).
 * `library` sort preserves the input (teaching) order.
 */
export function arrangeChords<T>(
  items: T[],
  getName: (item: T) => string,
  opts: { keyPc?: PitchClass | null; includeSevenths?: boolean; sort?: ChordSort } = {},
): T[] {
  const { keyPc = null, includeSevenths = true, sort = 'library' } = opts;

  const filtered = items.filter((item) => {
    const parsed = parseChordSymbol(getName(item));
    if (!parsed) return keyPc === null; // keep unparseable names only when not key-filtering
    if (!includeSevenths && isExtended(parsed.quality)) return false;
    if (keyPc !== null && !isInKey(parsed.rootPc, parsed.quality, keyPc)) return false;
    return true;
  });

  // Alphabetical ignores the key — it's a pure name sort.
  if (sort === 'alpha') {
    return [...filtered].sort((a, b) => getName(a).localeCompare(getName(b)));
  }

  // Default order with no key keeps the bundled teaching order.
  if (sort === 'library' && keyPc === null) return filtered;

  // Default (with a key), chromatic, and circle-of-fifths are all root-based.
  // When a key is set, ranks are measured from the tonic so the key's own root
  // sorts first and the others follow it around.
  return [...filtered].sort((a, b) => {
    const pa = parseChordSymbol(getName(a));
    const pb = parseChordSymbol(getName(b));
    if (!pa || !pb) return getName(a).localeCompare(getName(b));
    const ra = rootRank(pa.rootPc, sort, keyPc);
    const rb = rootRank(pb.rootPc, sort, keyPc);
    if (ra !== rb) return ra - rb;
    return getName(a).localeCompare(getName(b)); // group qualities under each root
  });
}

/**
 * Ordering position for a chord's root. Circle-of-fifths uses the fifths ring;
 * everything else uses chromatic order. With a key selected, both are measured
 * relative to the tonic so the key's root comes first.
 */
function rootRank(pc: PitchClass, sort: ChordSort, keyPc: PitchClass | null): number {
  if (sort === 'fifths') {
    const idx = FIFTHS_INDEX[pc];
    return keyPc === null ? idx : mod12(idx - FIFTHS_INDEX[keyPc]);
  }
  return keyPc === null ? pc : mod12(pc - keyPc);
}
