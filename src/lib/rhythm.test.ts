import { describe, expect, it } from 'vitest';
import {
  cycleStroke,
  isAccented,
  makeSteps,
  resizeSteps,
  stepCount,
} from './rhythm';

describe('stepCount / makeSteps', () => {
  it('multiplies beats by resolution', () => {
    expect(stepCount({ beats: 4, unit: 4 }, 4)).toBe(16);
    expect(stepCount({ beats: 3, unit: 4 }, 2)).toBe(6);
  });

  it('makes an all-rest grid of the right length', () => {
    const steps = makeSteps({ beats: 4, unit: 4 }, 2);
    expect(steps).toHaveLength(8);
    expect(steps.every((s) => s.stroke === 'rest')).toBe(true);
  });
});

describe('resizeSteps', () => {
  it('truncates when shrinking', () => {
    const steps = makeSteps({ beats: 4, unit: 4 }, 4);
    steps[0] = { stroke: 'down' };
    const smaller = resizeSteps(steps, { beats: 2, unit: 4 }, 4);
    expect(smaller).toHaveLength(8);
    expect(smaller[0].stroke).toBe('down');
  });

  it('pads with rests when growing', () => {
    const steps = makeSteps({ beats: 2, unit: 4 }, 4);
    steps[7] = { stroke: 'up' };
    const bigger = resizeSteps(steps, { beats: 4, unit: 4 }, 4);
    expect(bigger).toHaveLength(16);
    expect(bigger[7].stroke).toBe('up');
    expect(bigger[15].stroke).toBe('rest');
  });

  it('returns the same array when already the right size', () => {
    const steps = makeSteps({ beats: 4, unit: 4 }, 4);
    expect(resizeSteps(steps, { beats: 4, unit: 4 }, 4)).toBe(steps);
  });
});

describe('cycleStroke', () => {
  it('cycles through the strokes and back to rest', () => {
    expect(cycleStroke('rest')).toBe('down');
    expect(cycleStroke('down')).toBe('up');
    expect(cycleStroke('up')).toBe('accent');
    expect(cycleStroke('accent')).toBe('mute');
    expect(cycleStroke('mute')).toBe('tap');
    expect(cycleStroke('tap')).toBe('rest');
  });
});

describe('isAccented', () => {
  it('is true for the accent stroke or the accent flag', () => {
    expect(isAccented({ stroke: 'accent' })).toBe(true);
    expect(isAccented({ stroke: 'down', accent: true })).toBe(true);
    expect(isAccented({ stroke: 'down' })).toBe(false);
    expect(isAccented({ stroke: 'rest' })).toBe(false);
  });
});
