import { describe, expect, it } from 'vitest';
import {
  freqToMidiFloat,
  midiToFreq,
  midiToLabel,
  nearestTarget,
  pitchClass,
  readNote,
  stringTargets,
} from './tuner';

describe('frequency ↔ note math', () => {
  it('round-trips A4 at the reference pitch', () => {
    expect(midiToFreq(69, 440)).toBeCloseTo(440, 5);
    expect(freqToMidiFloat(440, 440)).toBeCloseTo(69, 5);
  });

  it('honours a custom A4 reference', () => {
    expect(midiToFreq(69, 432)).toBeCloseTo(432, 5);
  });

  it('labels MIDI notes in scientific pitch notation', () => {
    expect(midiToLabel(69)).toBe('A4');
    expect(midiToLabel(60)).toBe('C4');
    expect(midiToLabel(40)).toBe('E2');
  });

  it('reads the nearest note and signed cents', () => {
    const inTune = readNote(440, 440);
    expect(inTune.label).toBe('A4');
    expect(inTune.cents).toBe(0);

    const sharp = readNote(444, 440);
    expect(sharp.label).toBe('A4');
    expect(sharp.cents).toBeGreaterThan(0);

    const flat = readNote(437, 440);
    expect(flat.cents).toBeLessThan(0);
  });
});

describe('pitchClass', () => {
  it('handles naturals, sharps and flats', () => {
    expect(pitchClass('C')).toBe(0);
    expect(pitchClass('E')).toBe(4);
    expect(pitchClass('A')).toBe(9);
    expect(pitchClass('C#')).toBe(1);
    expect(pitchClass('Bb')).toBe(10);
  });
});

describe('stringTargets', () => {
  it('reproduces standard guitar tuning with ascending octaves', () => {
    const targets = stringTargets(['E', 'A', 'D', 'G', 'B', 'E'], 440);
    expect(targets.map((t) => t.label)).toEqual(['E2', 'A2', 'D3', 'G3', 'B3', 'E4']);
    expect(targets[0].freq).toBeCloseTo(82.41, 1);
    expect(targets[5].freq).toBeCloseTo(329.63, 1);
  });

  it('picks the closest open string to a frequency', () => {
    const targets = stringTargets(['E', 'A', 'D', 'G', 'B', 'E'], 440);
    expect(nearestTarget(110, targets)?.label).toBe('A2');
    expect(nearestTarget(330, targets)?.label).toBe('E4');
  });
});
