// Music theory primitives: pitch classes, note naming, chord-symbol parsing,
// transposition, and chord-tone spelling. Pure, dependency-free, well-tested —
// this is the foundation the chord-chart library, transpose UI, and ChordPro
// engine all build on.
//
// A "pitch class" (pc) is an integer 0–11: C=0, C#=1, … B=11. Octaves are not
// modeled here; the chart renderers decide octave placement.

export type PitchClass = number; // 0–11

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const LETTER_PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** Wrap any integer into 0–11. */
export function mod12(n: number): PitchClass {
  return ((n % 12) + 12) % 12;
}

/** Parse a note name ("C", "C#", "Db", "Bb") to a pitch class, or null. */
export function parseNote(name: string): PitchClass | null {
  const m = name.trim().match(/^([A-Ga-g])([#b♯♭]?)/);
  if (!m) return null;
  const base = LETTER_PC[m[1].toUpperCase()];
  if (base === undefined) return null;
  const acc = m[2];
  const delta = acc === '#' || acc === '♯' ? 1 : acc === 'b' || acc === '♭' ? -1 : 0;
  return mod12(base + delta);
}

/** Name a pitch class. `preferFlats` chooses Db over C#, etc. */
export function noteName(pc: PitchClass, preferFlats = false): string {
  return (preferFlats ? FLAT_NAMES : SHARP_NAMES)[mod12(pc)];
}

/**
 * Keys that are conventionally spelled with flats. Used to pick enharmonics
 * when transposing so results read naturally (e.g. transposing into Eb shows
 * Bb, not A#).
 */
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb', 'Dm', 'Gm', 'Cm', 'Fm', 'Bbm']);

export function preferFlatsForKey(key: string | undefined): boolean {
  if (!key) return false;
  const k = key.trim();
  if (FLAT_KEYS.has(k)) return true;
  // Explicit flat in the key name → prefer flats.
  return /b|♭/.test(k.replace(/^[A-G]/, ''));
}

// ───────── Chord symbols ─────────

export type ParsedChord = {
  rootPc: PitchClass;
  /** Text of the root as written, e.g. "Bb". */
  rootText: string;
  /** Everything after the root and before a slash, e.g. "m7", "sus4", "". */
  quality: string;
  /** Slash-bass pitch class, if any. */
  bassPc?: PitchClass;
  bassText?: string;
};

const CHORD_RE = /^([A-G][#b♯♭]?)([^/]*)(?:\/([A-G][#b♯♭]?))?$/;

/** Parse a chord symbol ("Gmaj7", "C/E", "F#m7b5"). Returns null if unparseable. */
export function parseChordSymbol(symbol: string): ParsedChord | null {
  const s = symbol.trim();
  const m = s.match(CHORD_RE);
  if (!m) return null;
  const rootPc = parseNote(m[1]);
  if (rootPc === null) return null;
  const parsed: ParsedChord = { rootPc, rootText: m[1], quality: m[2] ?? '' };
  if (m[3]) {
    const bassPc = parseNote(m[3]);
    if (bassPc !== null) {
      parsed.bassPc = bassPc;
      parsed.bassText = m[3];
    }
  }
  return parsed;
}

/** Transpose a chord symbol by `semitones`, preserving its quality/slash. */
export function transposeChordSymbol(
  symbol: string,
  semitones: number,
  preferFlats = false,
): string {
  const p = parseChordSymbol(symbol);
  if (!p) return symbol; // leave annotations like "N.C." untouched
  const root = noteName(p.rootPc + semitones, preferFlats);
  const bass =
    p.bassPc !== undefined ? '/' + noteName(p.bassPc + semitones, preferFlats) : '';
  return root + p.quality + bass;
}

// ───────── Key → diatonic chords ─────────

/** Scale degrees of a major key, as semitones from the tonic, with qualities. */
const MAJOR_DEGREES: { semitones: number; quality: string; numeral: string }[] = [
  { semitones: 0, quality: '', numeral: 'I' },
  { semitones: 2, quality: 'm', numeral: 'ii' },
  { semitones: 4, quality: 'm', numeral: 'iii' },
  { semitones: 5, quality: '', numeral: 'IV' },
  { semitones: 7, quality: '', numeral: 'V' },
  { semitones: 9, quality: 'm', numeral: 'vi' },
  { semitones: 11, quality: 'dim', numeral: 'vii°' },
];

/** Natural-minor degrees (relative to the minor tonic). */
const MINOR_DEGREES: { semitones: number; quality: string; numeral: string }[] = [
  { semitones: 0, quality: 'm', numeral: 'i' },
  { semitones: 2, quality: 'dim', numeral: 'ii°' },
  { semitones: 3, quality: '', numeral: 'III' },
  { semitones: 5, quality: 'm', numeral: 'iv' },
  { semitones: 7, quality: 'm', numeral: 'v' },
  { semitones: 8, quality: '', numeral: 'VI' },
  { semitones: 10, quality: '', numeral: 'VII' },
];

export type DiatonicChord = { symbol: string; numeral: string };

/**
 * The seven diatonic triads of a key, in scale order — the chords a song in that
 * key is overwhelmingly likely to use. Drives the chord palette in the song
 * editor so common chords are one tap away instead of typed character by
 * character (the `[`, `#` and `/` keys are the worst part of a phone keyboard).
 *
 * Accepts "G", "Em", "Bb", "F#m". Returns [] for anything it can't read. The
 * dominant seventh of the V chord is appended as an eighth entry, since it's the
 * next most likely chord after the triads.
 */
export function diatonicChords(key: string | undefined): DiatonicChord[] {
  if (!key) return [];
  const trimmed = key.trim();
  const tonic = parseNote(trimmed);
  if (tonic === null) return [];
  // "Em" / "F#min" / "Am" are minor; anything else is treated as major.
  const isMinor = /^[A-G][#b♯♭]?\s*(m|min|minor)\b/i.test(trimmed);
  const flats = preferFlatsForKey(trimmed);
  const degrees = isMinor ? MINOR_DEGREES : MAJOR_DEGREES;
  const out = degrees.map((d) => ({
    symbol: noteName(tonic + d.semitones, flats) + d.quality,
    numeral: d.numeral,
  }));
  // The dominant seventh — the one non-triad worth a permanent slot. Its root is
  // the fifth degree in both modes; a minor key borrows the major quality from
  // the harmonic minor (A minor → E7, not Em7).
  out.push({ symbol: `${noteName(tonic + 7, flats)}7`, numeral: 'V7' });
  return out;
}

// ───────── Chord tones ─────────

// Intervals (semitones from the root, root included) for common qualities.
// Used to spell keyboard diagrams and any future voicing logic. Order matters
// only for readability; callers treat the result as a set.
const QUALITY_INTERVALS: Record<string, number[]> = {
  '': [0, 4, 7],
  maj: [0, 4, 7],
  M: [0, 4, 7],
  m: [0, 3, 7],
  min: [0, 3, 7],
  '-': [0, 3, 7],
  dim: [0, 3, 6],
  '°': [0, 3, 6],
  aug: [0, 4, 8],
  '+': [0, 4, 8],
  sus2: [0, 2, 7],
  sus4: [0, 5, 7],
  sus: [0, 5, 7],
  '5': [0, 7],
  '6': [0, 4, 7, 9],
  m6: [0, 3, 7, 9],
  '7': [0, 4, 7, 10],
  maj7: [0, 4, 7, 11],
  M7: [0, 4, 7, 11],
  '△7': [0, 4, 7, 11],
  m7: [0, 3, 7, 10],
  min7: [0, 3, 7, 10],
  '7sus4': [0, 5, 7, 10],
  m7b5: [0, 3, 6, 10],
  ø: [0, 3, 6, 10],
  dim7: [0, 3, 6, 9],
  '°7': [0, 3, 6, 9],
  '9': [0, 4, 7, 10, 14],
  maj9: [0, 4, 7, 11, 14],
  m9: [0, 3, 7, 10, 14],
  add9: [0, 4, 7, 14],
};

/**
 * A chord symbol spelled out as actual intervals above its root — what you need
 * to *voice* it (sound it, draw it on a staff), as opposed to `chordTones`,
 * which collapses the same information into unordered pitch classes.
 */
export type ChordSpelling = {
  rootPc: PitchClass;
  /** Semitones above the root, ascending; always starts at 0 (the root). */
  intervals: number[];
  /** Slash-bass pitch class, when the symbol names one. */
  bassPc?: PitchClass;
};

/**
 * Spell a chord symbol. Falls back to the major triad for an unrecognized
 * quality (with a recognized root); null if the symbol isn't a chord at all
 * (e.g. "N.C.").
 */
export function chordSpelling(symbol: string): ChordSpelling | null {
  const p = parseChordSymbol(symbol);
  if (!p) return null;
  const intervals = QUALITY_INTERVALS[p.quality] ?? QUALITY_INTERVALS[''];
  return { rootPc: p.rootPc, intervals, bassPc: p.bassPc };
}

/**
 * The pitch classes that make up a chord symbol, root first. Falls back to the
 * major triad for an unrecognized quality (with a recognized root). Returns []
 * if the symbol can't be parsed at all.
 */
export function chordTones(symbol: string): PitchClass[] {
  const spelling = chordSpelling(symbol);
  if (!spelling) return [];
  const tones = spelling.intervals.map((i) => mod12(spelling.rootPc + i));
  if (spelling.bassPc !== undefined && !tones.includes(spelling.bassPc)) {
    tones.unshift(spelling.bassPc);
  }
  return tones;
}

// ───────── Capo ─────────

/**
 * With a capo on `fret`, shapes are played `fret` semitones lower than they
 * sound. To keep the SOUNDING chords the same while showing easier shapes,
 * displayed chord symbols are transposed DOWN by the capo fret. This returns
 * that delta (negative).
 */
export function capoTransposeDelta(capoFret: number): number {
  const f = Math.abs(capoFret | 0);
  return f === 0 ? 0 : -f;
}
