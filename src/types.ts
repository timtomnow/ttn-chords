// TTN Chords — single source of truth for all stored entity shapes.
//
// Design goals that shaped this model (see plan.md for the full rationale):
//   1. ChordPro-compatible. A song is a list of sections; each section is a
//      list of lines; chords are *events* anchored to lyrics. We can import
//      from and export to ChordPro losslessly.
//   2. Beat-accurate timing as a first-class, OPTIONAL layer. Every chord
//      event may carry an exact metric position (down to 1/16 and finer).
//   3. Forward-compatible with full rhythm notation. The timing types here
//      are a strict *subset* of a future notation model: a position-only
//      event becomes a full note by adding an optional `duration`. No stored
//      meaning has to change — only additive fields. See `Beats`.
//   4. Backup-compatible with ttn-backup (plain JSON; Blobs base64'd on
//      export). All entities carry a string `id` and timestamps.
//
// Dates are unix-ms numbers in the DB; format only at the view layer.
// IDs are crypto.randomUUID(), generated in the repo, never by callers.

// ─────────────────────────────────────────────────────────────────────────
// Timing primitives
// ─────────────────────────────────────────────────────────────────────────

/**
 * Exact metric time as a rational number of quarter-note beats, measured from
 * the start of the containing section. Rational (not float) so 1/16 notes,
 * triplets, dotted values, etc. are represented EXACTLY and round-trip cleanly.
 *
 * Examples (in 4/4): beat 1 = {n:0,d:1}; the "and" of 2 = {n:3,d:2};
 * the second 16th of bar 1 = {n:1,d:4}.
 *
 * Forward-compat: full notation later adds an optional `duration: Beats` to
 * events plus rests/ties — this type does not change.
 */
export type Beats = { n: number; d: number };

/** A time signature, e.g. 4/4 -> { beats: 4, unit: 4 }. */
export type TimeSignature = { beats: number; unit: number };

// ─────────────────────────────────────────────────────────────────────────
// Song body: sections → lines → chord events
// ─────────────────────────────────────────────────────────────────────────

export type SectionKind =
  | 'intro'
  | 'verse'
  | 'prechorus'
  | 'chorus'
  | 'bridge'
  | 'instrumental'
  | 'interlude'
  | 'solo'
  | 'outro'
  | 'tag'
  | 'custom';

/**
 * A chord (or rhythm-only hit) placed on a lyric line.
 * - `chord` is the chord symbol ("Gmaj7", "Am", "C/E"). Empty string means a
 *   rhythm-only event (e.g. a strum with no chord change).
 * - `charIndex` anchors the chord above a character in the line's lyric — this
 *   is the ChordPro-style display anchor.
 * - `beat` is the OPTIONAL exact metric onset within the section (the timing
 *   layer the teacher cares about). Independent of `charIndex` so a song can
 *   be laid out for reading AND carry precise timing.
 */
export type ChordEvent = {
  id: string;
  chord: string;
  charIndex?: number;
  beat?: Beats;
  // Forward-compat (full notation, later phases):
  // duration?: Beats;
  // tie?: boolean;
};

/** One lyric line plus the chords that sit above it. */
export type Line = {
  id: string;
  /** Lyric text; may be empty for chord-only / instrumental lines. */
  lyric: string;
  events: ChordEvent[];
};

/** A named, repeatable block of lines (verse, chorus, …). */
export type Section = {
  id: string;
  kind: SectionKind;
  /** Display label, e.g. "Verse 1" or a custom name when kind === 'custom'. */
  label?: string;
  lines: Line[];
  /** Optional per-section overrides of the song defaults. */
  timeSignature?: TimeSignature;
  tempo?: number; // BPM
  /** Optional strum/rhythm pattern attached to this section. */
  rhythmPatternId?: string;
  /** How many times the section repeats when performed. */
  repeat?: number;
};

// ─────────────────────────────────────────────────────────────────────────
// Rhythm / strum patterns (own entity so they're reusable + forward-compat)
// ─────────────────────────────────────────────────────────────────────────

export type StrumStroke = 'down' | 'up' | 'mute' | 'accent' | 'tap' | 'rest';

/** One cell in a strum grid. */
export type StrumStep = {
  stroke: StrumStroke;
  accent?: boolean;
};

/**
 * A strum/rhythm pattern on a fixed grid. `steps.length` must equal
 * `timeSignature.beats * stepsPerBeat`. `stepsPerBeat: 4` = sixteenth-note
 * resolution. Forward-compat to per-string notation: a step could later carry
 * an array of per-string actions.
 */
export type RhythmPattern = {
  id: string;
  name: string;
  timeSignature: TimeSignature;
  stepsPerBeat: number;
  steps: StrumStep[];
  createdAt: number;
  updatedAt: number;
};

// ─────────────────────────────────────────────────────────────────────────
// Song + Setlist
// ─────────────────────────────────────────────────────────────────────────

export type Song = {
  id: string;
  title: string;
  artist?: string;
  /** Musical key, e.g. "G", "Am". */
  key?: string;
  capo?: number;
  tempo?: number; // default BPM
  timeSignature?: TimeSignature;
  tags: string[];

  /** Structured body — the canonical representation used by the app. */
  sections: Section[];

  /**
   * Original imported/pasted text (ChordPro or a scraped page) kept for
   * round-tripping and re-parsing a draft. Optional.
   */
  source?: string;
  /** Where `source` came from (e.g. an Ultimate Guitar URL). */
  sourceUrl?: string;

  notes?: string;
  /** User-controlled ordering in the library. */
  order: number;
  createdAt: number;
  updatedAt: number;
};

/** A song's slot inside a setlist, with per-performance overrides. */
export type SetlistEntry = {
  songId: string;
  /** Transpose this performance by N semitones (does not mutate the song). */
  transpose?: number;
  /** Capo override for this performance. */
  capo?: number;
  /** Performance notes shown only within this setlist. */
  notes?: string;
};

export type Setlist = {
  id: string;
  name: string;
  description?: string;
  entries: SetlistEntry[];
  order: number;
  createdAt: number;
  updatedAt: number;
};

// ─────────────────────────────────────────────────────────────────────────
// Instruments + chord diagrams
// ─────────────────────────────────────────────────────────────────────────

export type InstrumentKind = 'fretted' | 'keyboard';

/**
 * An instrument the user can author/view chord charts for. The bundled
 * defaults (guitar, ukulele, bass, piano) live as static data in
 * src/lib/chords/; this table stores USER-defined instruments only, so the
 * chart engine is fully extensible without code changes.
 */
export type Instrument = {
  id: string;
  name: string;
  kind: InstrumentKind;
  /** Fretted only: number of strings and their tuning, low → high. */
  strings?: number;
  tuning?: string[];
  createdAt: number;
  updatedAt: number;
};

/** A fretted-instrument chord diagram (guitar/ukulele/bass/…). */
export type FrettedShape = {
  /** Lowest fret shown; chords played higher up the neck set this > 1. */
  baseFret: number;
  /** Per string low→high. -1 = muted (x), 0 = open, n = fret n. */
  frets: number[];
  /** Optional finger numbers per string (0/undefined = none). */
  fingers?: number[];
  /** Optional barres. */
  barres?: { fret: number; fromString: number; toString: number }[];
};

/** A keyboard chord diagram. */
export type KeyboardShape = {
  /** MIDI note numbers pressed (or pitch classes 0–11 for a one-octave view). */
  notes: number[];
  /** Pitch class of the root, for highlighting. */
  rootPc?: number;
};

/**
 * A chord diagram for a specific instrument. The bundled common library lives
 * as static data (src/lib/chords/); this table stores user-created or
 * user-overridden charts only, which keeps backups small and the defaults
 * versioned in code.
 */
export type ChordDefinition = {
  id: string;
  instrumentId: string;
  /** Chord symbol this diagram represents, e.g. "G", "Cmaj7". */
  name: string;
  fretted?: FrettedShape;
  keyboard?: KeyboardShape;
  createdAt: number;
  updatedAt: number;
};

// ─────────────────────────────────────────────────────────────────────────
// Report templates (PDF generator — fleshed out in Phase 8)
// ─────────────────────────────────────────────────────────────────────────

export type PageSize = 'letter' | 'a4' | 'legal';

/**
 * A report = an arrangement of songs, chord charts, images/logos, and rhythm
 * patterns laid out across one or more pages. Multi-page layout support is a
 * hard requirement (see plan.md), so the model is page-oriented. The concrete
 * block schema is finalized in Phase 8; kept intentionally open here.
 */
export type ReportBlock = {
  id: string;
  type: 'song' | 'chordChart' | 'image' | 'logo' | 'rhythm' | 'text' | 'spacer';
  /** Free-form, block-type-specific config resolved at render time. */
  config: Record<string, unknown>;
};

export type ReportPage = {
  id: string;
  blocks: ReportBlock[];
};

export type ReportTemplate = {
  id: string;
  name: string;
  pageSize: PageSize;
  orientation: 'portrait' | 'landscape';
  pages: ReportPage[];
  createdAt: number;
  updatedAt: number;
};

// ─────────────────────────────────────────────────────────────────────────
// Shared: photos/images + app settings
// ─────────────────────────────────────────────────────────────────────────

/** Binary image (logos, photos) stored as a Blob; base64'd only on export. */
export type Photo = {
  id: string;
  blob: Blob;
  mime: string;
  createdAt: number;
};

/**
 * Singleton app settings (id === 'app'). Stored in the DB — not just
 * localStorage — so they travel with ttn-backup. Theme stays in localStorage
 * because it's device-specific; accent is mirrored to localStorage for the
 * no-flash bootstrap but is the source of truth here for backup.
 */
export type AppSettings = {
  id: 'app';
  /** Accent color as a hex string, e.g. "#4f46e5". */
  accentColor: string;
  /** Optional secondary accent. */
  accentColor2?: string;
  /** Which instrument's charts to show by default. '' = bundled guitar. */
  myInstrumentId: string;
  defaultTimeSignature?: TimeSignature;
  defaultTempo?: number;
  updatedAt: number;
};
