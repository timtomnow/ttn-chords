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
  /**
   * Bar-grid source text for a chord-grid-authored section, e.g.
   * `|: G | C | Am  D :| x2` (see `lib/chordGrid.ts`). The COMPILED chord events
   * in `lines` stay canonical — this is the authored source the editor recompiles
   * from, exactly as `Song.source` is for a pasted song. A section with no `grid`
   * is lyric-authored (inline ChordPro `[G]` anchors). Additive/optional.
   */
  grid?: string;
};

// ─────────────────────────────────────────────────────────────────────────
// Rhythm / strum patterns (own entity so they're reusable + forward-compat)
// ─────────────────────────────────────────────────────────────────────────

export type StrumStroke = 'down' | 'up' | 'mute' | 'accent' | 'tap' | 'rest';

/**
 * One cell in a strum grid. A cell is either a built-in `stroke` OR a
 * user-defined symbol referenced by `customId` (see RhythmSymbol). When
 * `customId` is set it takes precedence over `stroke` for display; `stroke`
 * is left as 'rest' in that case. This keeps older data (stroke-only) valid.
 */
export type StrumStep = {
  stroke: StrumStroke;
  accent?: boolean;
  customId?: string;
};

/**
 * A user-defined rhythm symbol, addable in Settings (e.g. a "continue" slash
 * `/` or a "quick stop" `!`). Built-in strokes stay hardcoded; these extend the
 * palette. Stored in its own table so it travels with ttn-backup.
 */
export type RhythmSymbol = {
  id: string;
  /** Human name, e.g. "Continue", "Quick stop". */
  name: string;
  /** Glyph(s) drawn in the grid, e.g. "/", "!". Kept short. */
  symbol: string;
  createdAt: number;
  updatedAt: number;
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

/**
 * One difficulty variant of a song — its own arrangement (sections, chords and
 * beat timing). The same song can ship a simple Level-1 version and a richer
 * Level-3 version; the Perform view toggles between whichever exist. Each
 * variant is tagged for beats independently. `level` is 1 (easiest)–5 (hardest).
 */
/**
 * One slot in a variant's performance order — a *reference* to a section in the
 * pool rather than a copy of it. This is what lets a chorus be authored (and
 * beat-tagged) once but played four times: the arrangement names it four times,
 * and every occurrence shares the one set of chords and beats.
 *
 * `Section.repeat` is still the way to say "play this block twice back to back";
 * an arrangement entry's `repeat` overrides it for this occurrence only.
 */
export type ArrangementEntry = {
  id: string;
  /** Which section in the variant's `sections` pool this slot plays. */
  sectionId: string;
  /** Back-to-back passes for this occurrence; falls back to `Section.repeat`. */
  repeat?: number;
  /** Semitones to transpose this occurrence (e.g. a last chorus up a tone). */
  transpose?: number;
  /** Performance note shown only for this occurrence. */
  notes?: string;
};

export type SongDifficulty = {
  id: string;
  level: number;
  /** Optional display label, e.g. "Beginner", "Standard". */
  label?: string;
  /**
   * The POOL of unique sections — each authored and beat-tagged once. Play order
   * comes from `arrangement`; when that's absent the pool order IS the play
   * order, which is why every pre-arrangement song stays valid unchanged.
   */
  sections: Section[];
  /**
   * Performance order as references into `sections`. Optional: absent or empty
   * means "play the pool in order, once each". Resolve it with `lib/song.ts`
   * `slotsOf()` / `arrangementOf()` — never walk `sections` directly for
   * playback, reading or PDF output.
   */
  arrangement?: ArrangementEntry[];
};

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

  /**
   * Difficulty variants of the song — always at least one. The body lives here
   * (each variant has its own `sections`); use `lib/song.ts` `sectionsOf()` /
   * `getDifficulty()` to resolve the one to show. Migrated from the former
   * flat `sections` field in Dexie v3.
   */
  difficulties: SongDifficulty[];
  /** Id of the variant shown by default; falls back to the first/lowest level. */
  defaultDifficultyId?: string;

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
  /** Which difficulty variant to perform; falls back to the song default. */
  difficultyId?: string;
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
export type Orientation = 'portrait' | 'landscape';

/**
 * Block types the report generator can place on a page. Each type is backed by
 * a self-registering module in src/lib/report/blocks/ (block→component
 * registry, mirroring the Phase-5 performance-view registry). Adding a type =
 * a new module + this union entry.
 */
export type ReportBlockType =
  | 'song'
  | 'text'
  | 'image'
  | 'chordChart'
  | 'rhythm'
  | 'spacer';

/**
 * Where a block sits on its page — the two-tier model (see plan.md §Phase 8):
 *   - `flow`: stacks in the page's vertical column (array order = stacking
 *     order) and reflows; long flow content spills onto a continuation sheet.
 *   - `floating`: free placement. `x`/`y`/`w`/`h` are PERCENTAGES of the page's
 *     content box (0–100), so positions are resolution-independent and stay
 *     anchored to the nominal sheet even when flow content spills.
 */
export type BlockPlacement =
  | { mode: 'flow' }
  | { mode: 'floating'; x: number; y: number; w: number; h?: number };

/**
 * A report = an arrangement of songs, chord charts, images/logos, rhythm
 * patterns and text laid out across one or more pages. Multi-page layout is a
 * hard requirement (see plan.md), so the model is page-oriented. `config` is
 * intentionally loose — each block module owns and validates its own shape, so
 * new block types never touch this file beyond the union above.
 */
export type ReportBlock = {
  id: string;
  type: ReportBlockType;
  placement: BlockPlacement;
  /**
   * Uniform content scale (default 1) — the per-block "size" control. Applied
   * by the renderer for every block type (text reflows + grows, SVG charts and
   * images zoom), so one knob resizes any block. Additive/optional.
   */
  scale?: number;
  /** Block-type-specific config; resolved at render time by the block module. */
  config: Record<string, unknown>;
};

export type ReportPage = {
  id: string;
  blocks: ReportBlock[];
};

/**
 * One header/footer band: three independent slots. Each slot supports the
 * tokens {page} {pages} {title} {date}, expanded at render time.
 */
export type ReportBand = {
  left?: string;
  center?: string;
  right?: string;
};

/**
 * Template-level header/footer config. When `firstPageDifferent` is set, page 1
 * uses `firstHeader`/`firstFooter` (either may be blank for a clean cover).
 */
export type ReportChrome = {
  header?: ReportBand;
  footer?: ReportBand;
  firstPageDifferent?: boolean;
  firstHeader?: ReportBand;
  firstFooter?: ReportBand;
};

export type ReportTemplate = {
  id: string;
  name: string;
  pageSize: PageSize;
  orientation: Orientation;
  chrome?: ReportChrome;
  pages: ReportPage[];
  createdAt: number;
  updatedAt: number;
};

// ─────────────────────────────────────────────────────────────────────────
// Music tools (metronome + tuner) — preferences only; the tools are stateless
// otherwise. Stored inside AppSettings so they travel with ttn-backup.
// ─────────────────────────────────────────────────────────────────────────

/** Built-in click voices the metronome can synthesize via Web Audio. */
export type MetronomeSound = 'beep' | 'click' | 'woodblock' | 'cowbell';

/** How (or whether) the metronome flashes the screen in time. */
export type MetronomeFlashShape = 'circle' | 'border' | 'fullscreen';

export type MetronomeSettings = {
  tempo: number; // BPM
  /** Time-signature numerator: accent lands every N beats. */
  beatsPerMeasure: number;
  /** Clicks per beat: 1 = quarters, 2 = eighths, 3 = triplets, 4 = sixteenths. */
  subdivision: number;
  soundEnabled: boolean;
  sound: MetronomeSound;
  /** Two-sound mode: give beat 1 a distinct accent voice (vs. every beat equal). */
  accentDownbeat: boolean;
  /** 0–1. */
  volume: number;
  flashEnabled: boolean;
  flashShape: MetronomeFlashShape;
  /** Flash color for beat 1 (the accent). */
  flashAccentColor: string;
  /** Flash color for the other beats. */
  flashBeatColor: string;
};

// ─────────────────────────────────────────────────────────────────────────
// Chord sounds — the Highway can play the chords, not just the click
// ─────────────────────────────────────────────────────────────────────────

/** Where a chord's sound comes from: the built-in synth, or your own recordings. */
export type ChordSoundSource = 'tone' | 'recording';

/** Timbre of the built-in (computer-generated) chord tone. */
export type ChordSoundTimbre = 'pluck' | 'strings' | 'organ';

/** How much of the chord the built-in tone sounds. */
export type ChordSoundVoicing = 'root' | 'full';

/**
 * When a chord sounds across its span (from its own beat up to the next chord):
 * - `once`   — one hit on the chord's beat, then silence
 * - `held`   — sounds from its beat and holds until the next chord
 * - `repeat` — re-struck on every beat until the next chord
 * A stop chord (`N.C.`) silences whatever is sounding in all three.
 */
export type ChordSoundMode = 'once' | 'held' | 'repeat';

export type ChordSoundSettings = {
  enabled: boolean;
  source: ChordSoundSource;
  timbre: ChordSoundTimbre;
  voicing: ChordSoundVoicing;
  mode: ChordSoundMode;
  /** 0–1. */
  volume: number;
};

/**
 * A user recording that stands in for one chord symbol — strum a G once and
 * every G in every song can play it back. Keyed by the *sounding* (transposed)
 * symbol, normalized by `normalizeChordKey` in `lib/chordAudio.ts`. The audio
 * is a Blob in IndexedDB, base64 only on JSON export (same deal as Photo).
 */
export type ChordSound = {
  id: string;
  /** Normalized chord symbol, e.g. "G", "Am7", "F#m7b5". */
  chord: string;
  blob: Blob;
  mime: string;
  /** Length in ms, measured at record time (for the list UI). */
  durationMs: number;
  createdAt: number;
  updatedAt: number;
};

export type TunerSettings = {
  /** Instrument whose tuning drives the string targets. '' = chromatic. */
  instrumentId: string;
  /** Reference pitch for A4 in Hz (default 440). */
  a4: number;
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
  /**
   * Admin / authoring mode. When false (default) the app is read + perform
   * focused for "light" users and authoring affordances (create/edit/delete/tag,
   * difficulty + library authoring) are hidden; true reveals them for "heavy"
   * users. A stepping stone toward future teacher/student roles. Additive.
   */
  adminMode?: boolean;
  /** Last-used performance reading view id (see lib/performance/registry). */
  performanceViewId?: string;
  /** Bars visible at once in the Highway (side-scrolling) view. Additive. */
  horizontalBars?: number;
  /** @deprecated Count-in measured in beats; superseded by horizontalCountInBars. */
  horizontalCountIn?: number;
  /** Count-in measured in whole bars before Highway playback (0–4). Additive. */
  horizontalCountInBars?: number;
  /** Bar-number label size in the Highway view. Default 'sm'. Additive. */
  horizontalBarSize?: 'sm' | 'md' | 'lg';
  defaultTimeSignature?: TimeSignature;
  defaultTempo?: number;
  /**
   * Default quarter-note beats per chord for the "space chords evenly" tool
   * (see `lib/spacing.ts`). 2 and 4 are the usual answers. Additive; non-indexed.
   */
  defaultChordBeats?: number;
  /** Last-used spacing mode for that tool ('line' | 'fixed' | 'proportional'). */
  defaultSpacingMode?: string;
  /** Metronome tool preferences (Music Tools). Additive; non-indexed. */
  metronome?: MetronomeSettings;
  /** Tuner tool preferences (Music Tools). Additive; non-indexed. */
  tuner?: TunerSettings;
  /** Chord-sound (play-along) preferences for the Highway. Additive; non-indexed. */
  chordSounds?: ChordSoundSettings;
  updatedAt: number;
};
