// Bar-grid chord authoring: type a progression the way a teacher writes one on a
// whiteboard, and get exact beat timing out of it for free.
//
//   | G | C | Am  D | G . . C |
//   |: G C | D :| x2
//   | G | % | C | % |
//
// Rules:
//   - `|` separates bars. A bar's tokens split it into equal slots, so one chord
//     per bar is a whole bar, two chords are half a bar each, and so on. That's
//     the "default beats per chord" intuition, expressed where the user already
//     thinks about it.
//   - `.` `/` `-` `_` are hold slots: they take up a slot without starting a new
//     chord, so `| G . . C |` in 4/4 is G on beat 1 and C on beat 4.
//   - `%` alone in a bar repeats the previous bar.
//   - `|: … :| xN` repeats the enclosed bars N times (default 2).
//   - A bar of rest is written with a hold token — `| G | - | C |` — so it takes
//     time without starting a chord. A *blank* chunk between two bar lines is
//     treated as layout, not a bar, which is what lets a grid wrap onto as many
//     rows as it likes.
//   - Newlines are just whitespace, so the grid can be laid out 4 bars per row.
//
// Output is ordinary `ChordEvent`s carrying `beat` and no `charIndex` — the same
// canonical model the tagger and the Highway already write, so nothing
// downstream has to know a grid was involved. Positions are computed in exact
// rational arithmetic (never floats), so a bar of three chords in 4/4 gives
// 0, 4/3, 8/3 exactly.
//
// The grid text is the *authored source* (stored in `Section.grid`); the compiled
// events stay canonical. `eventsToGrid` seeds the text when an existing section
// is switched into grid mode — that direction is approximate by nature (it can't
// recover `%` or repeat brackets), which is why the events, not the text, are
// the source of truth.
//
// Pure + unit-tested (chordGrid.test.ts). No React, no DB.

import { newId } from '@/lib/id';
import { reduceBeats } from '@/lib/chordpro';
import { parseChordSymbol } from '@/lib/music';
import type { Beats, ChordEvent, Section, TimeSignature } from '@/types';

/** Tokens that fill a slot without starting a chord. */
const HOLD_TOKENS = new Set(['.', '/', '-', '_', '·']);
/** Repeat-the-previous-bar token. */
const REPEAT_BAR = '%';
/** Widest slot division `eventsToGrid` will use before it starts approximating. */
const MAX_SLOTS = 16;

export type GridBar = {
  /** Raw tokens in the bar; empty means a bar of rest. */
  tokens: string[];
  /** 1-based bar number after repeats are expanded. */
  number: number;
};

export type GridParse = {
  bars: GridBar[];
  /** Human-readable problems: unbalanced repeats, tokens that aren't chords. */
  warnings: string[];
  /** Distinct tokens that don't parse as a chord symbol (for a nudge in the UI). */
  unknownChords: string[];
};

/** Bar length in quarter-note beats as an exact rational (4/4 → 4, 7/8 → 7/2). */
export function barBeatsOf(ts: TimeSignature): Beats {
  return reduceBeats(ts.beats * 4, ts.unit);
}

/** Is this token a chord (rather than a hold, a rest, or a bar repeat)? */
function isChordToken(tok: string): boolean {
  return !HOLD_TOKENS.has(tok) && tok !== REPEAT_BAR;
}

// ───────── Parse ─────────

type Tok =
  | { t: 'open' }
  | { t: 'close' }
  | { t: 'bar' }
  | { t: 'times'; n: number }
  | { t: 'word'; v: string };

/** Split grid text into structural tokens. Newlines count as whitespace. */
function tokenize(text: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  const s = text;
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (c === '|' && s[i + 1] === ':') {
      out.push({ t: 'open' });
      i += 2;
      continue;
    }
    if (c === ':' && s[i + 1] === '|') {
      out.push({ t: 'close' });
      i += 2;
      continue;
    }
    if (c === '|') {
      out.push({ t: 'bar' });
      i++;
      continue;
    }
    // A word runs to the next whitespace or bar-ish character.
    let j = i;
    while (j < s.length && !/\s/.test(s[j]) && s[j] !== '|' && !(s[j] === ':' && s[j + 1] === '|')) {
      j++;
    }
    const word = s.slice(i, j);
    i = j;
    // `x3` / `*3` right after a closing repeat is a repeat count, not a chord.
    const times = word.match(/^[x*×](\d+)$/i);
    if (times && out.length && out[out.length - 1].t === 'close') {
      out.push({ t: 'times', n: Number(times[1]) });
      continue;
    }
    out.push({ t: 'word', v: word });
  }
  return out;
}

/**
 * Parse grid text into a flat list of bars with repeats expanded. Lenient: a
 * missing leading/trailing `|` is fine, and an unbalanced repeat is reported as
 * a warning rather than throwing.
 */
export function parseChordGrid(text: string): GridParse {
  const toks = tokenize(text);
  const warnings: string[] = [];
  const unknown = new Set<string>();

  // Bars accumulate here; `open` pushes a marker so `close` knows what to repeat.
  const bars: string[][] = [];
  const openAt: number[] = [];
  let current: string[] = [];
  // The most recently closed repeat group, so a trailing `xN` can re-expand it.
  let lastGroup: { start: number; onePass: string[][] } | null = null;

  /**
   * Close off `current` as a bar. Empty chunks are always dropped: `| G |` has
   * one on each side, a wrapped row (`… |\n| …`) has one in the middle, and
   * `:| x3 |` has one after the count — none of them is a bar. A real bar of rest
   * is written explicitly with a hold token (`| - |`).
   */
  const flush = () => {
    if (current.length) bars.push(current);
    current = [];
  };

  for (const tok of toks) {
    switch (tok.t) {
      case 'word':
        current.push(tok.v);
        if (isChordToken(tok.v) && !parseChordSymbol(tok.v)) unknown.add(tok.v);
        break;
      case 'bar':
        flush();
        break;
      case 'open':
        flush();
        openAt.push(bars.length);
        break;
      case 'close': {
        flush();
        const start = openAt.pop();
        if (start === undefined) {
          warnings.push('A “:|” has no matching “|:”.');
          break;
        }
        // A bare `:|` means play it twice; a following `xN` rewrites that.
        const onePass = bars.slice(start).map((b) => [...b]);
        bars.push(...onePass.map((b) => [...b]));
        lastGroup = { start, onePass };
        break;
      }
      case 'times': {
        if (!lastGroup) {
          warnings.push('A repeat count (“x2”) must follow a “:|”.');
          break;
        }
        const { start, onePass } = lastGroup;
        const want = Math.max(1, tok.n);
        bars.length = start;
        for (let r = 0; r < want; r++) bars.push(...onePass.map((b) => [...b]));
        lastGroup = null;
        break;
      }
    }
  }
  flush();
  if (openAt.length) warnings.push('A “|:” has no matching “:|”.');

  return {
    bars: bars.map((tokens, i) => ({ tokens, number: i + 1 })),
    warnings,
    unknownChords: [...unknown],
  };
}

// ───────── Compile to events ─────────

/**
 * Compile grid text into beat-only chord events (no lyric anchors), measured in
 * quarter-note beats from the section start. Exact rationals throughout.
 *
 * `idPrefix` makes the generated event ids DETERMINISTIC (`<prefix>:bar:slot`)
 * rather than fresh uuids. The editor recompiles on every keystroke and autosaves
 * every 600ms, so random ids would rewrite the whole section's event identity
 * constantly — breaking any selection elsewhere and churning the stored song.
 * Callers that aren't recompiling in place can omit it.
 */
export function gridToEvents(text: string, ts: TimeSignature, idPrefix?: string): ChordEvent[] {
  const { bars } = parseChordGrid(text);
  const bb = barBeatsOf(ts);
  const events: ChordEvent[] = [];
  let prev: string[] = [];

  bars.forEach((bar, barIndex) => {
    let tokens = bar.tokens;
    if (tokens.length === 1 && tokens[0] === REPEAT_BAR) tokens = prev;
    else if (tokens.length) prev = tokens;

    const slots = Math.max(1, tokens.length);
    tokens.forEach((tok, k) => {
      if (!isChordToken(tok)) return;
      // beat = bb * (barIndex + k/slots) = bb.n * (barIndex*slots + k) / (bb.d*slots)
      const beat = reduceBeats(bb.n * (barIndex * slots + k), bb.d * slots);
      const id = idPrefix ? `${idPrefix}:${barIndex}:${k}` : newId();
      events.push({ id, chord: tok, beat });
    });
  });

  return events;
}

/** Total bars the grid spans (after repeats), for a "12 bars" readout. */
export function gridBarCount(text: string): number {
  return parseChordGrid(text).bars.length;
}

/**
 * Rewrite a section so its chords come from `grid`. The compiled chords live on
 * their own leading chord-only line; any lyric lines are kept (with their own
 * chord anchors removed, since the grid is now the chord source) so switching
 * modes doesn't throw the words away.
 */
export function applyGridToSection(section: Section, grid: string, ts: TimeSignature): Section {
  // Event ids are derived from the section id + grid position, so recompiling the
  // same grid yields the same events (see gridToEvents) and two grid sections can
  // never collide.
  const events = gridToEvents(grid, ts, `${section.id}:g`);
  const lyricLines = section.lines
    .filter((l) => l.lyric.trim().length > 0)
    .map((l) => ({ ...l, events: [] }));
  // Reuse an existing chord-only line's id for the grid line; never a lyric
  // line's, since that line is kept below and ids must stay unique.
  const gridLineId = section.lines.find((l) => !l.lyric.trim())?.id ?? `${section.id}:gridline`;
  return {
    ...section,
    grid,
    lines: [{ id: gridLineId, lyric: '', events }, ...lyricLines],
  };
}

// ───────── Seed grid text from existing events ─────────

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}
function lcm(a: number, b: number): number {
  return (a * b) / gcd(a, b);
}

/**
 * Best-effort grid text for a section that already has timed chords — used to
 * seed the editor when a lyric-authored section is switched into grid mode.
 * Approximate by design: onsets are snapped to the finest slot division up to
 * MAX_SLOTS, and `%`/repeat shorthand is never inferred.
 */
export function eventsToGrid(section: Section, ts: TimeSignature): string {
  const bb = barBeatsOf(ts);
  const barBeats = bb.n / bb.d;
  const onsets: { beat: number; chord: string }[] = [];
  for (const line of section.lines) {
    for (const e of line.events) {
      if (!e.chord) continue;
      onsets.push({ beat: e.beat ? e.beat.n / e.beat.d : 0, chord: e.chord });
    }
  }
  if (!onsets.length) return '';
  onsets.sort((a, b) => a.beat - b.beat);

  const totalBars = Math.max(1, Math.ceil((onsets[onsets.length - 1].beat + 1e-9) / barBeats));
  const rows: string[] = [];
  for (let b = 0; b < totalBars; b++) {
    const start = b * barBeats;
    const inBar = onsets.filter((o) => o.beat >= start - 1e-9 && o.beat < start + barBeats - 1e-9);
    if (!inBar.length) {
      // An explicit hold token, so the rest bar survives a re-parse (a blank
      // chunk between bar lines is treated as layout, not a bar).
      rows.push('| - ');
      continue;
    }
    // Smallest slot count that lands every onset on a slot boundary.
    let slots = 1;
    for (const o of inBar) {
      const frac = (o.beat - start) / barBeats; // 0 ≤ frac < 1
      for (let d = 1; d <= MAX_SLOTS; d++) {
        if (Math.abs(frac * d - Math.round(frac * d)) < 1e-6) {
          slots = Math.min(MAX_SLOTS, lcm(slots, d));
          break;
        }
      }
    }
    const cells = new Array<string>(slots).fill('.');
    for (const o of inBar) {
      const k = Math.min(slots - 1, Math.round(((o.beat - start) / barBeats) * slots));
      cells[k] = o.chord;
    }
    // Trim trailing holds — `| G |` reads better than `| G . . . |`.
    while (cells.length > 1 && cells[cells.length - 1] === '.') cells.pop();
    rows.push(`| ${cells.join(' ')} `);
  }

  // Four bars per line keeps it readable.
  const lines: string[] = [];
  for (let i = 0; i < rows.length; i += 4) lines.push(rows.slice(i, i + 4).join('') + '|');
  return lines.join('\n');
}
