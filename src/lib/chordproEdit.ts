// Caret-aware edits to raw ChordPro text — the keyboard half of the song
// editor's input pass.
//
// The editor keeps a section's body as ChordPro TEXT while editing (so the
// textarea caret stays put and a half-typed `[` doesn't churn the model), which
// means the useful shortcuts are string surgery, not model edits: transpose the
// chord under the caret, nudge which syllable it sits over, hop between chords,
// drop a chord in from the palette. Keeping them here — pure, caret in / caret
// out — keeps the component free of string arithmetic and makes them testable.
//
// Every function returns the new text AND where the caret should land, because a
// textarea edit that loses the caret is worse than no shortcut at all.

import { transposeChordSymbol } from '@/lib/music';

export type TextEdit = { text: string; caret: number };

/** A `[...]` chord token located in the text. */
export type ChordToken = {
  /** Index of the `[`. */
  start: number;
  /** Index just past the `]`. */
  end: number;
  /** Token contents without the brackets, e.g. `G` or `Am@3/2`. */
  inner: string;
};

/** Every `[...]` token in the text, in order. */
export function chordTokens(text: string): ChordToken[] {
  const out: ChordToken[] = [];
  const re = /\[([^\]\n]*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    out.push({ start: m.index, end: m.index + m[0].length, inner: m[1] });
  }
  return out;
}

/**
 * The token the caret is "on": the one it sits inside, else the nearest one
 * before it on the same line. That second rule is what makes the shortcuts feel
 * right — you type `[G]Amazing`, and Alt+Up still transposes the G.
 */
export function chordTokenAt(text: string, caret: number): ChordToken | null {
  const tokens = chordTokens(text);
  const inside = tokens.find((t) => caret >= t.start && caret <= t.end);
  if (inside) return inside;
  const lineStart = text.lastIndexOf('\n', Math.max(0, caret - 1)) + 1;
  let best: ChordToken | null = null;
  for (const t of tokens) {
    if (t.end <= caret && t.start >= lineStart) best = t;
  }
  return best;
}

/** Split a token's contents into the chord symbol and our `@beat` suffix. */
function splitToken(inner: string): { chord: string; suffix: string } {
  const at = inner.indexOf('@');
  return at === -1
    ? { chord: inner, suffix: '' }
    : { chord: inner.slice(0, at), suffix: inner.slice(at) };
}

/**
 * Transpose the chord at the caret by `delta` semitones, leaving any `@beat`
 * suffix alone. Returns null when there's no chord to act on.
 */
export function transposeTokenAt(
  text: string,
  caret: number,
  delta: number,
  preferFlats = false,
): TextEdit | null {
  const token = chordTokenAt(text, caret);
  if (!token) return null;
  const { chord, suffix } = splitToken(token.inner);
  if (!chord.trim()) return null;
  const next = transposeChordSymbol(chord, delta, preferFlats);
  if (next === chord) return null; // unparseable (e.g. "N.C.") — leave it be
  const replacement = `[${next}${suffix}]`;
  return {
    text: text.slice(0, token.start) + replacement + text.slice(token.end),
    // Keep the caret's offset from the token start so repeated presses work.
    caret: token.start + replacement.length,
  };
}

/**
 * Slide the chord at the caret one character earlier or later in its lyric —
 * "this chord should land on the next syllable". Swaps the token with the
 * neighbouring character; refuses to cross a line break or another token.
 */
export function moveTokenAt(text: string, caret: number, dir: -1 | 1): TextEdit | null {
  const token = chordTokenAt(text, caret);
  if (!token) return null;
  const body = token.inner;

  if (dir === -1) {
    const prev = text[token.start - 1];
    if (token.start === 0 || prev === undefined || prev === '\n' || prev === ']') return null;
    const text2 =
      text.slice(0, token.start - 1) + `[${body}]` + prev + text.slice(token.end);
    return { text: text2, caret: token.start - 1 + body.length + 2 };
  }

  const next = text[token.end];
  if (next === undefined || next === '\n' || next === '[') return null;
  const text2 = text.slice(0, token.start) + next + `[${body}]` + text.slice(token.end + 1);
  return { text: text2, caret: token.start + 1 + body.length + 2 };
}

/**
 * Caret position for hopping to the next/previous chord: just inside the token's
 * brackets, so the symbol can be retyped immediately. Null when there's none in
 * that direction.
 */
export function nextTokenCaret(text: string, caret: number, dir: -1 | 1 = 1): number | null {
  const tokens = chordTokens(text);
  // Compare against the *inner* caret position (start + 1) so pressing Tab from
  // inside a token moves on rather than landing in the same one again.
  if (dir === 1) {
    const t = tokens.find((tok) => tok.start + 1 > caret);
    return t ? t.start + 1 : null;
  }
  const before = tokens.filter((tok) => tok.start + 1 < caret);
  const t = before[before.length - 1];
  return t ? t.start + 1 : null;
}

/**
 * Insert a chord at the caret. If the caret sits inside an existing token the
 * chord REPLACES it (tapping a palette chip with the caret on a chord is
 * obviously "change this chord", not "nest a bracket").
 */
export function insertChordAt(text: string, caret: number, chord: string): TextEdit {
  const symbol = chord.trim();
  if (!symbol) return { text, caret };
  const tokens = chordTokens(text);
  const inside = tokens.find((t) => caret > t.start && caret < t.end);
  if (inside) {
    const { suffix } = splitToken(inside.inner);
    const replacement = `[${symbol}${suffix}]`;
    return {
      text: text.slice(0, inside.start) + replacement + text.slice(inside.end),
      caret: inside.start + replacement.length,
    };
  }
  const token = `[${symbol}]`;
  return { text: text.slice(0, caret) + token + text.slice(caret), caret: caret + token.length };
}

/** Wrap empty brackets at the caret, ready to type a symbol into. */
export function insertEmptyBrackets(text: string, caret: number): TextEdit {
  return { text: text.slice(0, caret) + '[]' + text.slice(caret), caret: caret + 1 };
}

/** Distinct chord symbols in a ChordPro body, in first-appearance order. */
export function chordsInText(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of chordTokens(text)) {
    const { chord } = splitToken(t.inner);
    const sym = chord.trim();
    if (sym && !seen.has(sym)) {
      seen.add(sym);
      out.push(sym);
    }
  }
  return out;
}
