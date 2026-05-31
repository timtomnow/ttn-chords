// ChordPro parse/serialize engine + our beat-timing extension.
//
// Standard ChordPro this supports:
//   - Metadata directives: {title|t}, {subtitle|st|artist}, {key}, {capo},
//     {tempo}, {time}.
//   - Section directives: {start_of_verse|sov}…{end_of_verse|eov},
//     {start_of_chorus|soc}…, {start_of_bridge|sob}…, and the generic
//     {start_of_part|sop: Label}…{end_of_part|eop}. A label after a colon is
//     kept; for parts we map common labels (Intro, Solo, …) back to a kind.
//   - Inline chords: `[G]` anchored above the following lyric character.
//
// Beat-timing EXTENSION (ours):
//   - `[Chord@beat]` places the chord at an EXACT metric onset, measured in
//     quarter-note beats from the start of its section. The beat may be an
//     integer (`[G@2]`), a decimal (`[G@1.5]`), or an explicit fraction
//     (`[G@3/2]`). Decimals are snapped to an exact rational (down to 1/16,
//     plus triplet denominators) so timing round-trips losslessly.
//   - `[@beat]` (empty chord) is a rhythm-only onset — a strum/hit with no
//     chord change. It serializes back as `[@beat]`.
//   The display anchor (charIndex) and the metric onset (beat) are independent:
//   a chord can be positioned for reading AND carry precise timing.
//
// This file is pure and dependency-free apart from id generation. It is the
// single source of truth for the ChordPro <-> model mapping; the editor reuses
// parseLines/serializeLines per section.

import { newId } from '@/lib/id';
import type { Beats, ChordEvent, Line, Section, SectionKind, TimeSignature } from '@/types';

export const SECTION_KINDS: SectionKind[] = [
  'intro',
  'verse',
  'prechorus',
  'chorus',
  'bridge',
  'instrumental',
  'interlude',
  'solo',
  'outro',
  'tag',
  'custom',
];

export type ChordProMeta = {
  title?: string;
  artist?: string;
  key?: string;
  capo?: number;
  tempo?: number;
  timeSignature?: TimeSignature;
};

export type ChordProDoc = {
  meta: ChordProMeta;
  sections: Section[];
};

// ───────── Beats helpers ─────────

function gcd(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a || 1;
}

export function reduceBeats(n: number, d: number): Beats {
  if (d < 0) {
    n = -n;
    d = -d;
  }
  const g = gcd(n, d);
  return { n: n / g, d: d / g };
}

/** Snap a decimal beat value to an exact rational (1/16 + triplet support). */
function decimalToBeats(x: number): Beats {
  const denoms = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32];
  for (const d of denoms) {
    const v = x * d;
    if (Math.abs(v - Math.round(v)) < 1e-6) return reduceBeats(Math.round(v), d);
  }
  return reduceBeats(Math.round(x * 16), 16);
}

export function parseBeat(token: string): Beats | undefined {
  const t = token.trim();
  if (!t) return undefined;
  if (t.includes('/')) {
    const [a, b] = t.split('/').map((s) => Number(s.trim()));
    if (Number.isFinite(a) && Number.isFinite(b) && b !== 0) return reduceBeats(a, b);
    return undefined;
  }
  const num = Number(t);
  if (!Number.isFinite(num)) return undefined;
  return decimalToBeats(num);
}

export function beatToString(b: Beats): string {
  return b.d === 1 ? String(b.n) : `${b.n}/${b.d}`;
}

// ───────── Single line: inline [chord] <-> events ─────────

/** Parse one lyric line with inline `[chord]` / `[chord@beat]` markers. */
export function parseLine(text: string): Line {
  const events: ChordEvent[] = [];
  let lyric = '';
  let last = 0;
  const re = /\[([^\]]*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    lyric += text.slice(last, m.index);
    const ev = tokenToEvent(m[1], lyric.length);
    if (ev) events.push(ev);
    last = m.index + m[0].length;
  }
  lyric += text.slice(last);
  return { id: newId(), lyric, events };
}

function tokenToEvent(token: string, charIndex: number): ChordEvent | null {
  const at = token.indexOf('@');
  const chord = (at === -1 ? token : token.slice(0, at)).trim();
  const beat = at === -1 ? undefined : parseBeat(token.slice(at + 1));
  if (chord === '' && beat === undefined) return null;
  const ev: ChordEvent = { id: newId(), chord, charIndex };
  if (beat) ev.beat = beat;
  return ev;
}

function eventToken(e: ChordEvent): string {
  const beat = e.beat ? '@' + beatToString(e.beat) : '';
  return e.chord + beat;
}

/** Serialize one line back to ChordPro text. */
export function serializeLine(line: Line): string {
  const withIdx = line.events
    .filter((e) => e.charIndex !== undefined)
    .sort((a, b) => (a.charIndex ?? 0) - (b.charIndex ?? 0));
  const without = line.events.filter((e) => e.charIndex === undefined);

  let out = '';
  let cursor = 0;
  for (const e of withIdx) {
    const idx = Math.min(Math.max(e.charIndex ?? 0, 0), line.lyric.length);
    out += line.lyric.slice(cursor, idx);
    out += `[${eventToken(e)}]`;
    cursor = idx;
  }
  out += line.lyric.slice(cursor);
  for (const e of without) out += `[${eventToken(e)}]`;
  return out;
}

/** Parse a multi-line section body (no directives) into Lines. */
export function parseLines(text: string): Line[] {
  return text.split('\n').map(parseLine);
}

/** Serialize Lines back to a section body. */
export function serializeLines(lines: Line[]): string {
  return lines.map(serializeLine).join('\n');
}

// ───────── Section kind <-> directive label ─────────

const LABEL_TO_KIND: Record<string, SectionKind> = {
  intro: 'intro',
  verse: 'verse',
  prechorus: 'prechorus',
  'pre-chorus': 'prechorus',
  'pre chorus': 'prechorus',
  chorus: 'chorus',
  bridge: 'bridge',
  instrumental: 'instrumental',
  interlude: 'interlude',
  solo: 'solo',
  outro: 'outro',
  tag: 'tag',
};

export function defaultLabelForKind(kind: SectionKind): string {
  switch (kind) {
    case 'intro':
      return 'Intro';
    case 'verse':
      return 'Verse';
    case 'prechorus':
      return 'Pre-Chorus';
    case 'chorus':
      return 'Chorus';
    case 'bridge':
      return 'Bridge';
    case 'instrumental':
      return 'Instrumental';
    case 'interlude':
      return 'Interlude';
    case 'solo':
      return 'Solo';
    case 'outro':
      return 'Outro';
    case 'tag':
      return 'Tag';
    case 'custom':
      return 'Part';
  }
}

function labelToKind(label: string | undefined): { kind: SectionKind; label?: string } {
  if (!label) return { kind: 'custom' };
  const norm = label.trim().toLowerCase();
  const kind = LABEL_TO_KIND[norm];
  if (kind) return { kind }; // recognized — drop the redundant label
  return { kind: 'custom', label: label.trim() };
}

// ───────── Whole document ─────────

type Directive = { name: string; value?: string };

function parseDirective(trimmed: string): Directive | null {
  const m = trimmed.match(/^\{([^}]*)\}$/);
  if (!m) return null;
  const body = m[1];
  const colon = body.indexOf(':');
  if (colon === -1) return { name: body.trim().toLowerCase() };
  return {
    name: body.slice(0, colon).trim().toLowerCase(),
    value: body.slice(colon + 1).trim(),
  };
}

function parseTimeSignature(value: string | undefined): TimeSignature | undefined {
  if (!value) return undefined;
  const m = value.match(/(\d+)\s*\/\s*(\d+)/);
  if (!m) return undefined;
  return { beats: Number(m[1]), unit: Number(m[2]) };
}

export function parseChordPro(text: string): ChordProDoc {
  const meta: ChordProMeta = {};
  const sections: Section[] = [];
  let current: Section | null = null;

  const ensureSection = (): Section => {
    if (!current) {
      current = { id: newId(), kind: 'verse', lines: [] };
      sections.push(current);
    }
    return current;
  };

  const startSection = (kind: SectionKind, label?: string) => {
    current = { id: newId(), kind, lines: [] };
    if (label) current.label = label;
    sections.push(current);
  };

  for (const raw of text.split('\n')) {
    const trimmed = raw.trim();
    const dir = trimmed.startsWith('{') ? parseDirective(trimmed) : null;

    if (dir) {
      switch (dir.name) {
        case 'title':
        case 't':
          meta.title = dir.value;
          break;
        case 'subtitle':
        case 'st':
        case 'artist':
          meta.artist = dir.value;
          break;
        case 'key':
          meta.key = dir.value;
          break;
        case 'capo':
          meta.capo = dir.value ? Number(dir.value) : undefined;
          break;
        case 'tempo':
          meta.tempo = dir.value ? Number(dir.value) : undefined;
          break;
        case 'time':
        case 'timesignature':
          meta.timeSignature = parseTimeSignature(dir.value);
          break;
        case 'start_of_verse':
        case 'sov':
          startSection('verse', dir.value);
          break;
        case 'start_of_chorus':
        case 'soc':
          startSection('chorus', dir.value);
          break;
        case 'start_of_bridge':
        case 'sob':
          startSection('bridge', dir.value);
          break;
        case 'start_of_part':
        case 'sop': {
          const { kind, label } = labelToKind(dir.value);
          startSection(kind, label);
          break;
        }
        case 'end_of_verse':
        case 'eov':
        case 'end_of_chorus':
        case 'eoc':
        case 'end_of_bridge':
        case 'eob':
        case 'end_of_part':
        case 'eop':
          current = null;
          break;
        default:
          // Unknown/unsupported directive — ignored.
          break;
      }
      continue;
    }

    // Content line. Skip leading blank lines that sit outside any section.
    if (current === null && trimmed === '') continue;
    ensureSection().lines.push(parseLine(raw));
  }

  return { meta, sections };
}

function startDirective(section: Section): { open: string; close: string } {
  const label = section.label;
  switch (section.kind) {
    case 'verse':
      return { open: label ? `{start_of_verse: ${label}}` : '{start_of_verse}', close: '{end_of_verse}' };
    case 'chorus':
      return { open: label ? `{start_of_chorus: ${label}}` : '{start_of_chorus}', close: '{end_of_chorus}' };
    case 'bridge':
      return { open: label ? `{start_of_bridge: ${label}}` : '{start_of_bridge}', close: '{end_of_bridge}' };
    default:
      return {
        open: `{start_of_part: ${label ?? defaultLabelForKind(section.kind)}}`,
        close: '{end_of_part}',
      };
  }
}

export function serializeChordPro(doc: ChordProDoc): string {
  const out: string[] = [];
  const { meta } = doc;
  if (meta.title) out.push(`{title: ${meta.title}}`);
  if (meta.artist) out.push(`{artist: ${meta.artist}}`);
  if (meta.key) out.push(`{key: ${meta.key}}`);
  if (meta.capo !== undefined) out.push(`{capo: ${meta.capo}}`);
  if (meta.tempo !== undefined) out.push(`{tempo: ${meta.tempo}}`);
  if (meta.timeSignature) out.push(`{time: ${meta.timeSignature.beats}/${meta.timeSignature.unit}}`);
  if (out.length) out.push('');

  doc.sections.forEach((section, i) => {
    const { open, close } = startDirective(section);
    out.push(open);
    for (const line of section.lines) out.push(serializeLine(line));
    out.push(close);
    if (i < doc.sections.length - 1) out.push('');
  });

  return out.join('\n');
}
