import { describe, expect, it } from 'vitest';
import {
  beatsToNumber,
  buildTimeline,
  DEFAULT_TS,
  DEFAULT_TEMPO,
  hasAnyBeats,
  lyricPackets,
  quarterBeatsPerBar,
} from './timeline';
import type { Beats, ChordEvent, Section, Song, TimeSignature } from '@/types';

const defaults = { tempo: DEFAULT_TEMPO, timeSignature: DEFAULT_TS };

let n = 0;
const id = () => `id-${n++}`;

function ev(chord: string, beat?: Beats): ChordEvent {
  return beat ? { id: id(), chord, beat } : { id: id(), chord };
}
function section(events: ChordEvent[], extra: Partial<Section> = {}): Section {
  return {
    id: id(),
    kind: 'verse',
    lines: [{ id: id(), lyric: 'la la la', events }],
    ...extra,
  };
}
function evAt(chord: string, charIndex: number, beat?: Beats): ChordEvent {
  return beat ? { id: id(), chord, charIndex, beat } : { id: id(), chord, charIndex };
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

const b = (nn: number, d = 1): Beats => ({ n: nn, d });

describe('quarterBeatsPerBar', () => {
  it('maps common time signatures to quarter-note beats', () => {
    expect(quarterBeatsPerBar({ beats: 4, unit: 4 })).toBe(4);
    expect(quarterBeatsPerBar({ beats: 3, unit: 4 })).toBe(3);
    expect(quarterBeatsPerBar({ beats: 6, unit: 8 })).toBe(3);
    expect(quarterBeatsPerBar({ beats: 12, unit: 8 })).toBe(6);
  });
});

describe('beatsToNumber', () => {
  it('converts a rational to a float', () => {
    expect(beatsToNumber(b(3, 2))).toBeCloseTo(1.5);
  });
});

describe('hasAnyBeats', () => {
  it('is false for an untimed song and true once any event has a beat', () => {
    expect(hasAnyBeats(song([section([ev('G'), ev('C')])]))).toBe(false);
    expect(hasAnyBeats(song([section([ev('G', b(0)), ev('C', b(2))])]))).toBe(true);
  });
});

describe('buildTimeline', () => {
  it('places timed events at absolute beats and rounds the section to whole bars', () => {
    const tl = buildTimeline(song([section([ev('G', b(0)), ev('C', b(2))])]), defaults);
    expect(tl.items.map((i) => i.absBeat)).toEqual([0, 2]);
    // max event at 2 → rounds up to one 4/4 bar.
    expect(tl.totalBeats).toBe(4);
    expect(tl.bars).toHaveLength(1);
    expect(tl.bars[0]).toMatchObject({ absBeat: 0, beats: 4, number: 1 });
  });

  it('lays sections end-to-end honouring per-section time signatures', () => {
    const s1 = section([ev('G', b(0))]); // 4/4 default → 1 bar = 4 beats
    const s2 = section([ev('D', b(0))], { timeSignature: { beats: 3, unit: 4 } as TimeSignature });
    const tl = buildTimeline(song([s1, s2]), defaults);
    expect(tl.sections[0]).toMatchObject({ startBeat: 0, lengthBeats: 4 });
    expect(tl.sections[1]).toMatchObject({ startBeat: 4, lengthBeats: 3 });
    // s2's event sits at the start of the second section.
    expect(tl.items.find((i) => i.event.chord === 'D')?.absBeat).toBe(4);
    expect(tl.totalBeats).toBe(7);
  });

  it('duplicates items and length for repeated sections', () => {
    const tl = buildTimeline(
      song([section([ev('G', b(0)), ev('C', b(2))], { repeat: 2 })]),
      defaults,
    );
    expect(tl.items.map((i) => i.absBeat)).toEqual([0, 2, 4, 6]);
    expect(tl.totalBeats).toBe(8);
    expect(tl.bars.map((bar) => bar.absBeat)).toEqual([0, 4]);
  });

  it('runs a lyric packet on past line breaks and section ends until the next chord', () => {
    const g = evAt('G', 0, b(0));
    const c = evAt('C', 0, b(0));
    const s1 = section([g], {
      lines: [
        { id: id(), lyric: 'hello world', events: [g] },
        { id: id(), lyric: 'second line', events: [] }, // no chord → absorbed
      ],
    });
    const s2 = section([c], { lines: [{ id: id(), lyric: 'third', events: [c] }] });
    const packets = lyricPackets(buildTimeline(song([s1, s2]), defaults));
    expect(packets.get(g.id)).toBe('hello world second line');
    expect(packets.get(c.id)).toBe('third');
  });

  it('does not split a packet at a chord with no beat', () => {
    const g = evAt('G', 0, b(0));
    const x = evAt('X', 6); // anchored but untimed → not a boundary
    const s = section([g, x], {
      lines: [{ id: id(), lyric: 'hello world', events: [g, x] }],
    });
    const packets = lyricPackets(buildTimeline(song([s]), defaults));
    expect(packets.get(g.id)).toBe('hello world');
    expect(packets.has(x.id)).toBe(false);
  });

  it('falls back to one bar per lyric line for an untimed section', () => {
    const s = section([ev('G'), ev('C')], {
      lines: [
        { id: id(), lyric: 'line one', events: [] },
        { id: id(), lyric: 'line two', events: [] },
      ],
    });
    const tl = buildTimeline(song([s]), defaults);
    expect(tl.totalBeats).toBe(8); // 2 lyric lines × 4 beats
    expect(tl.items).toHaveLength(0); // no timed events
  });
});
