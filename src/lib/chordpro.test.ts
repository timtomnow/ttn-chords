import { describe, expect, it } from 'vitest';
import {
  beatToString,
  parseBeat,
  parseChordPro,
  parseLine,
  reduceBeats,
  serializeChordPro,
  serializeLine,
} from './chordpro';
import type { ChordProDoc } from './chordpro';

describe('beats', () => {
  it('reduces fractions', () => {
    expect(reduceBeats(2, 4)).toEqual({ n: 1, d: 2 });
    expect(reduceBeats(4, 2)).toEqual({ n: 2, d: 1 });
  });

  it('parses integers, decimals, and fractions to exact rationals', () => {
    expect(parseBeat('2')).toEqual({ n: 2, d: 1 });
    expect(parseBeat('1.5')).toEqual({ n: 3, d: 2 });
    expect(parseBeat('0.25')).toEqual({ n: 1, d: 4 });
    expect(parseBeat('3/2')).toEqual({ n: 3, d: 2 });
  });

  it('snaps a sixteenth-note decimal exactly', () => {
    expect(parseBeat('0.0625')).toEqual({ n: 1, d: 16 });
  });

  it('serializes whole vs fractional beats', () => {
    expect(beatToString({ n: 2, d: 1 })).toBe('2');
    expect(beatToString({ n: 3, d: 2 })).toBe('3/2');
  });
});

describe('parseLine / serializeLine', () => {
  it('extracts chords and anchors them to lyric character positions', () => {
    const line = parseLine('[G]Amazing [C]grace');
    expect(line.lyric).toBe('Amazing grace');
    expect(line.events.map((e) => [e.chord, e.charIndex])).toEqual([
      ['G', 0],
      ['C', 8],
    ]);
  });

  it('round-trips a plain chord line', () => {
    const text = '[G]Amazing [C]grace how [G]sweet';
    expect(serializeLine(parseLine(text))).toBe(text);
  });

  it('parses the beat-timing extension', () => {
    const line = parseLine('[G@1.5]Hey [C@3/2]now');
    expect(line.events[0]).toMatchObject({ chord: 'G', beat: { n: 3, d: 2 }, charIndex: 0 });
    expect(line.events[1]).toMatchObject({ chord: 'C', beat: { n: 3, d: 2 } });
  });

  it('round-trips beat-timed chords', () => {
    const text = '[G@2]Hey [C@3/2]now';
    expect(serializeLine(parseLine(text))).toBe(text);
  });

  it('parses a rhythm-only onset (empty chord with a beat)', () => {
    const line = parseLine('strum[@2]here');
    expect(line.lyric).toBe('strumhere');
    expect(line.events[0]).toMatchObject({ chord: '', beat: { n: 2, d: 1 } });
    expect(serializeLine(line)).toBe('strum[@2]here');
  });

  it('ignores empty markers with no chord and no beat', () => {
    const line = parseLine('a[]b');
    expect(line.lyric).toBe('ab');
    expect(line.events).toHaveLength(0);
  });
});

describe('parseChordPro', () => {
  it('reads metadata directives', () => {
    const doc = parseChordPro(
      ['{title: Amazing Grace}', '{artist: Traditional}', '{key: G}', '{capo: 2}', '{tempo: 90}', '{time: 3/4}'].join(
        '\n',
      ),
    );
    expect(doc.meta).toEqual({
      title: 'Amazing Grace',
      artist: 'Traditional',
      key: 'G',
      capo: 2,
      tempo: 90,
      timeSignature: { beats: 3, unit: 4 },
    });
  });

  it('maps section directives to kinds', () => {
    const doc = parseChordPro(
      [
        '{start_of_verse}',
        '[G]Line one',
        '{end_of_verse}',
        '{start_of_chorus}',
        '[C]Chorus line',
        '{end_of_chorus}',
        '{start_of_part: Solo}',
        '[Am]',
        '{end_of_part}',
      ].join('\n'),
    );
    expect(doc.sections.map((s) => s.kind)).toEqual(['verse', 'chorus', 'solo']);
    expect(doc.sections[0].lines[0].lyric).toBe('Line one');
  });

  it('keeps a custom part label that is not a known kind', () => {
    const doc = parseChordPro(['{start_of_part: Coda Riff}', '[G]', '{end_of_part}'].join('\n'));
    expect(doc.sections[0]).toMatchObject({ kind: 'custom', label: 'Coda Riff' });
  });

  it('puts loose content into an implicit verse', () => {
    const doc = parseChordPro('[G]Just a line');
    expect(doc.sections).toHaveLength(1);
    expect(doc.sections[0].kind).toBe('verse');
  });
});

describe('round-trip', () => {
  it('parse -> serialize -> parse is stable', () => {
    const src = [
      '{title: Test Song}',
      '{key: G}',
      '',
      '{start_of_verse}',
      '[G]Amazing [C@1.5]grace how [G]sweet',
      '{end_of_verse}',
      '',
      '{start_of_chorus}',
      '[D]Sing it [G]out',
      '{end_of_chorus}',
    ].join('\n');

    const once = parseChordPro(src);
    const text = serializeChordPro(once);
    const twice = parseChordPro(text);

    const strip = (doc: ChordProDoc) =>
      JSON.stringify(doc, (k, v) => (k === 'id' ? undefined : v));
    expect(strip(twice)).toEqual(strip(once));
  });

  it('serializes a document to expected ChordPro', () => {
    const doc = parseChordPro(
      ['{title: T}', '{start_of_verse}', '[G]Hello', '{end_of_verse}'].join('\n'),
    );
    expect(serializeChordPro(doc)).toBe(
      ['{title: T}', '', '{start_of_verse}', '[G]Hello', '{end_of_verse}'].join('\n'),
    );
  });
});
