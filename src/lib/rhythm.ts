// Strum/rhythm-pattern helpers. A pattern is a fixed grid: `steps.length` ===
// timeSignature.beats * stepsPerBeat. stepsPerBeat 4 = sixteenth-note
// resolution in a /4 meter. Pure + tested; the editor and renderer build on it.
//
// This is a CUSTOM model — strum direction (down/up/mute/accent) has no
// standard in ChordPro or other lightweight formats (see plan.md §Phase 7). It
// is deliberately a strict subset of a future per-string notation layer: a
// StrumStep can later carry per-string actions without changing existing data.

import type { RhythmPattern, StrumStep, StrumStroke, TimeSignature } from '@/types';
import { newId } from '@/lib/id';

export const DEFAULT_TIME_SIGNATURE: TimeSignature = { beats: 4, unit: 4 };
export const DEFAULT_STEPS_PER_BEAT = 4;

/** Total grid cells for a meter + resolution. */
export function stepCount(ts: TimeSignature, stepsPerBeat: number): number {
  return Math.max(1, ts.beats) * Math.max(1, stepsPerBeat);
}

export function emptyStep(): StrumStep {
  return { stroke: 'rest' };
}

export function makeSteps(ts: TimeSignature, stepsPerBeat: number): StrumStep[] {
  return Array.from({ length: stepCount(ts, stepsPerBeat) }, emptyStep);
}

/**
 * Resize a steps array to a new meter/resolution, preserving as many existing
 * cells as possible (truncate or pad with rests).
 */
export function resizeSteps(
  steps: StrumStep[],
  ts: TimeSignature,
  stepsPerBeat: number,
): StrumStep[] {
  const target = stepCount(ts, stepsPerBeat);
  if (steps.length === target) return steps;
  if (steps.length > target) return steps.slice(0, target);
  return [...steps, ...Array.from({ length: target - steps.length }, emptyStep)];
}

// Click-cycle order for the editor. 'rest' is the empty state; the rest are the
// common teaching strokes. Accent is its own stroke here (an accented down).
const CYCLE: StrumStroke[] = ['rest', 'down', 'up', 'accent', 'mute', 'tap'];

export function cycleStroke(current: StrumStroke): StrumStroke {
  const i = CYCLE.indexOf(current);
  return CYCLE[(i + 1) % CYCLE.length];
}

export type StrokeMeta = { symbol: string; label: string };

/** Display metadata per stroke. `symbol` is the glyph drawn in the grid. */
export const STROKE_META: Record<StrumStroke, StrokeMeta> = {
  down: { symbol: '↓', label: 'Down strum' },
  up: { symbol: '↑', label: 'Up strum' },
  accent: { symbol: '↓', label: 'Accented down' }, // rendered heavier + a ">"
  mute: { symbol: '✕', label: 'Muted / chunk' },
  tap: { symbol: '•', label: 'Tap / percussive' },
  rest: { symbol: '', label: 'Rest' },
};

/** True for strokes that should render with an accent mark. */
export function isAccented(step: StrumStep): boolean {
  return step.stroke === 'accent' || step.accent === true;
}

export function makePattern(
  name: string,
  ts: TimeSignature = DEFAULT_TIME_SIGNATURE,
  stepsPerBeat: number = DEFAULT_STEPS_PER_BEAT,
): Omit<RhythmPattern, 'createdAt' | 'updatedAt'> {
  return {
    id: newId(),
    name,
    timeSignature: ts,
    stepsPerBeat,
    steps: makeSteps(ts, stepsPerBeat),
  };
}
