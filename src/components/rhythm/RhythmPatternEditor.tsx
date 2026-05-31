// Grid editor for a strum pattern. Click a cell to cycle its stroke
// (rest → down → up → accent → mute → tap). Meter and resolution are
// adjustable; changing them resizes the grid (preserving existing cells). Live
// RhythmChart preview. Saves to the rhythmPatterns table.

import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { RhythmChart } from './RhythmChart';
import {
  createRhythmPattern,
  updateRhythmPattern,
} from '@/db/repo';
import {
  STROKE_META,
  cycleStroke,
  isAccented,
  makeSteps,
  resizeSteps,
} from '@/lib/rhythm';
import { newId } from '@/lib/id';
import type { RhythmPattern, StrumStep, TimeSignature } from '@/types';

const RESOLUTIONS = [
  { value: 1, label: 'Quarter (1)' },
  { value: 2, label: 'Eighth (2)' },
  { value: 3, label: 'Triplet (3)' },
  { value: 4, label: 'Sixteenth (4)' },
];

export function RhythmPatternEditor({
  open,
  onClose,
  initial,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial?: RhythmPattern;
  /** Called with the saved pattern id (useful when creating inline). */
  onSaved?: (id: string) => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [ts, setTs] = useState<TimeSignature>(
    initial?.timeSignature ?? { beats: 4, unit: 4 },
  );
  const [stepsPerBeat, setStepsPerBeat] = useState(initial?.stepsPerBeat ?? 4);
  const [steps, setSteps] = useState<StrumStep[]>(
    initial?.steps ?? makeSteps({ beats: 4, unit: 4 }, 4),
  );

  function changeMeter(next: Partial<TimeSignature>, nextSpb?: number) {
    const newTs = { ...ts, ...next };
    const spb = nextSpb ?? stepsPerBeat;
    setTs(newTs);
    if (nextSpb !== undefined) setStepsPerBeat(spb);
    setSteps((prev) => resizeSteps(prev, newTs, spb));
  }

  function toggleCell(i: number) {
    setSteps((prev) =>
      prev.map((s, idx) => (idx === i ? { stroke: cycleStroke(s.stroke) } : s)),
    );
  }

  function clearAll() {
    setSteps(makeSteps(ts, stepsPerBeat));
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (initial) {
      await updateRhythmPattern(initial.id, {
        name: trimmed,
        timeSignature: ts,
        stepsPerBeat,
        steps,
      });
      onSaved?.(initial.id);
    } else {
      const id = newId();
      await createRhythmPattern({ id, name: trimmed, timeSignature: ts, stepsPerBeat, steps });
      onSaved?.(id);
    }
    onClose();
  }

  const preview: RhythmPattern = {
    id: initial?.id ?? 'preview',
    name: name || 'Preview',
    timeSignature: ts,
    stepsPerBeat,
    steps,
    createdAt: 0,
    updatedAt: 0,
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? 'Edit rhythm pattern' : 'New rhythm pattern'}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={!name.trim()}>
            Save pattern
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="label mb-1">Name</span>
          <input
            className="input"
            placeholder="e.g. Verse, Chorus 2, Island strum"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <label className="block">
            <span className="label mb-1">Beats</span>
            <input
              className="input"
              type="number"
              min={1}
              max={12}
              value={ts.beats}
              onChange={(e) => changeMeter({ beats: Math.max(1, Number(e.target.value) || 1) })}
            />
          </label>
          <label className="block">
            <span className="label mb-1">Unit</span>
            <select
              className="input"
              value={ts.unit}
              onChange={(e) => changeMeter({ unit: Number(e.target.value) })}
            >
              {[2, 4, 8, 16].map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="label mb-1">Subdivision</span>
            <select
              className="input"
              value={stepsPerBeat}
              onChange={(e) => changeMeter({}, Number(e.target.value))}
            >
              {RESOLUTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        {/* Editable grid */}
        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="label">Pattern · tap cells to cycle</span>
            <button className="btn-ghost text-xs" onClick={clearAll}>
              Clear
            </button>
          </div>
          <div className="flex flex-wrap gap-1 rounded-xl border border-ink-200 p-2 dark:border-ink-800">
            {steps.map((step, i) => {
              const beatStart = i % stepsPerBeat === 0;
              const accent = isAccented(step);
              return (
                <button
                  key={i}
                  onClick={() => toggleCell(i)}
                  className={[
                    'flex h-9 w-8 items-center justify-center rounded text-sm transition',
                    beatStart
                      ? 'bg-ink-100 dark:bg-ink-800'
                      : 'bg-ink-50 dark:bg-ink-950/40',
                    step.stroke !== 'rest' ? 'ring-1 ring-accent' : 'hover:bg-ink-200 dark:hover:bg-ink-700',
                  ].join(' ')}
                  title={STROKE_META[step.stroke].label}
                >
                  <span className={accent ? 'font-black' : ''}>
                    {accent ? `>${STROKE_META[step.stroke].symbol}` : STROKE_META[step.stroke].symbol}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-1 text-xs text-ink-400">
            ↓ down · ↑ up · {'>'}↓ accent · ✕ mute · • tap · blank rest
          </p>
        </div>

        {/* Preview */}
        <div>
          <span className="label mb-1 block">Preview</span>
          <RhythmChart pattern={preview} size="md" />
        </div>
      </div>
    </Modal>
  );
}
