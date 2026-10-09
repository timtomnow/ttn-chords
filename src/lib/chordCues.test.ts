import { describe, expect, it } from 'vitest';
import { buildChordCues, chordHits, isStopChord, isTimingDot, type ChordCue } from './chordCues';
import { DEFAULT_TEMPO, DEFAULT_TS, buildTimeline } from './timeline';
import type { Beats, ChordEvent, Section, Song } from '@/types';

const defaults = { tempo: DEFAULT_TEMPO, timeSignature: DEFAULT_TS };

let n = 0;
const id = () => `id-${n++}`;
const b = (nn: number, d = 1): Beats => ({ n: nn, d });

function ev(chord: string, beat?: Beats): ChordEvent {
  return beat ? { id: id(), chord, beat } : { id: id(), chord };
}
function section(events: ChordEvent[], extra: Partial<Section> = {}): Section {
  return { id: id(), kind: 'verse', lines: [{ id: id(), lyric: 'la la', events }], ...extra };
}
function song(sections: Section[], extra: Partial<Song> = {}): Song {
  return {
    id: id(),
    title: 'Test',
    tags: [],
    difficulties: [{ id: 'd', level: 3, sections }],
    order: 0,
    createdAt: 0,
    updatedAt: 0,
    ...extra,
  };
}

describe('isStopChord / isTimingDot', () => {
  it('recognizes the ways a break gets written', () => {
    for (const s of ['N.C.', 'n.c.', 'NC', 'nc', 'Stop', 'X', '-', 'rest']) {
      expect(isStopChord(s), s).toBe(true);
    }
  });

  it('does not mistake a chord for a stop', () => {
    for (const s of ['C', 'G', 'Am', 'Xm']) expect(isStopChord(s), s).toBe(false);
  });

  it('treats blank and bare-dot events as timing markers', () => {
    expect(isTimingDot(undefined)).toBe(true);
    expect(isTimingDot('')).toBe(true);
    expect(isTimingDot('.')).toBe(true);
    expect(isTimingDot('C')).toBe(false);
  });
});

describe('buildChordCues', () => {
  it('runs each chord up to the next, and the last to the end of the song', () => {
    const t = buildTimeline(song([section([ev('C', b(0)), ev('G', b(2))])]), defaults);
    expect(buildChordCues(t)).toEqual([
      { symbol: 'C', startBeat: 0, endBeat: 2 },
      { symbol: 'G', startBeat: 2, endBeat: 4 },
    ]);
  });

  it('skips timing dots so a held chord rings through them', () => {
    const t = buildTimeline(song([section([ev('C', b(0)), ev('.', b(1)), ev('G', b(2))])]), defaults);
    expect(buildChordCues(t).map((c) => c.symbol)).toEqual(['C', 'G']);
  });

  it('turns a stop chord into a silence cue', () => {
    const t = buildTimeline(song([section([ev('C', b(0)), ev('N.C.', b(2))])]), defaults);
    expect(buildChordCues(t)).toEqual([
      { symbol: 'C', startBeat: 0, endBeat: 2 },
      { symbol: null, startBeat: 2, endBeat: 4 },
    ]);
  });

  it('transposes to the chord you can actually hear', () => {
    const t = buildTimeline(song([section([ev('C', b(0)), ev('G', b(2))])]), defaults);
    expect(buildChordCues(t, 2).map((c) => c.symbol)).toEqual(['D', 'A']);
  });

  it('keeps only the first of two events on the same beat', () => {
    const t = buildTimeline(song([section([ev('C', b(0)), ev('Am', b(0)), ev('G', b(2))])]), defaults);
    expect(buildChordCues(t).map((c) => c.symbol)).toEqual(['C', 'G']);
  });
});

describe('chordHits', () => {
  const cues: ChordCue[] = [
    { symbol: 'C', startBeat: 0, endBeat: 4 },
    { symbol: 'G', startBeat: 4, endBeat: 8 },
  ];
  const map = { countIn: 4, from: 0, totalBeats: 8 };

  it('offsets song beats by the count-in', () => {
    expect(chordHits(cues, map, 'once', -1, 20)).toEqual([
      { symbol: 'C', posBeat: 4, sustain: false },
      { symbol: 'G', posBeat: 8, sustain: false },
      { symbol: null, posBeat: 12, sustain: false },
    ]);
  });

  it('only returns what falls in the window, so nothing is scheduled twice', () => {
    expect(chordHits(cues, map, 'once', -1, 5).map((h) => h.posBeat)).toEqual([4]);
    expect(chordHits(cues, map, 'once', 5, 20).map((h) => h.posBeat)).toEqual([8, 12]);
  });

  it('marks held chords as sustaining, but never a stop', () => {
    const hits = chordHits(cues, map, 'held', -1, 20);
    expect(hits.map((h) => h.sustain)).toEqual([true, true, false]);
  });

  it('re-strikes every beat until the next chord in repeat mode', () => {
    expect(chordHits(cues, map, 'repeat', -1, 20).map((h) => h.posBeat)).toEqual([
      4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
  });

  it('sounds the chord already in force when you start mid-song', () => {
    const mid = { countIn: 0, from: 2, totalBeats: 8 };
    expect(chordHits(cues, mid, 'once', -1, 10)).toEqual([
      { symbol: 'C', posBeat: 0, sustain: false },
      { symbol: 'G', posBeat: 2, sustain: false },
      { symbol: null, posBeat: 6, sustain: false },
    ]);
  });

  it('replays the loop on every pass', () => {
    const loop = { countIn: 0, from: 0, totalBeats: 8, loop: { startBeat: 4, lengthBeats: 4 } };
    expect(chordHits(cues, loop, 'once', -1, 9).map((h) => [h.symbol, h.posBeat])).toEqual([
      ['G', 0],
      [null, 4],
      ['G', 4],
      [null, 8],
      ['G', 8],
    ]);
  });

  it('is silent when there is nothing to play', () => {
    expect(chordHits([], map, 'once', -1, 20)).toEqual([]);
    expect(chordHits(cues, map, 'once', 10, 10)).toEqual([]);
  });
});
