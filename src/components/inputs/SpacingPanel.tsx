// The "space chords evenly" control — the front end of `lib/spacing.ts`.
//
// Shared by the song editor (space a whole variant while authoring) and the
// tag-beats review step (space first, then fix only what's actually irregular),
// so the two places offer the same modes and remember the same defaults.

import { useState } from 'react';
import { Eraser, Wand2 } from 'lucide-react';
import { SPACING_MODES, spacingPreview } from '@/lib/spacing';
import type { SpacingMode, SpacingOptions } from '@/lib/spacing';
import type { Section } from '@/types';

const BEATS_PER_CHORD = [1, 2, 3, 4, 6, 8];
const GRIDS = [
  { label: '1/4', den: 4 },
  { label: '1/8', den: 8 },
  { label: '1/16', den: 16 },
];

export function SpacingPanel({
  sections,
  barBeats,
  mode,
  setMode,
  beatsPerChord,
  setBeatsPerChord,
  grid,
  setGrid,
  onApply,
  onClear,
  compact = false,
}: {
  /** The sections a run would touch — used only for the "what will happen" line. */
  sections: Section[];
  barBeats: number;
  mode: SpacingMode;
  setMode: (m: SpacingMode) => void;
  beatsPerChord: number;
  setBeatsPerChord: (n: number) => void;
  grid: number;
  setGrid: (n: number) => void;
  onApply: (opts: SpacingOptions) => void;
  /** Omit to hide the "clear every beat" escape hatch. */
  onClear?: () => void;
  /** Inline layout for the tagger toolbar rather than a settings card. */
  compact?: boolean;
}) {
  const [skipTimed, setSkipTimed] = useState(true);
  const opts: SpacingOptions = { mode, beatsPerChord, barBeats, grid, skipTimedSections: skipTimed };
  const preview = spacingPreview(sections, opts);
  const hint = SPACING_MODES.find((m) => m.value === mode)?.hint;

  return (
    <div className={compact ? 'flex flex-wrap items-center gap-2' : 'space-y-3'}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="label">Spacing</span>
        <div className="flex items-center gap-1 rounded-xl bg-ink-100 p-1 dark:bg-ink-800">
          {SPACING_MODES.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => setMode(m.value)}
              title={m.hint}
              className={[
                'rounded-lg px-2 py-0.5 text-xs font-medium',
                mode === m.value
                  ? 'bg-accent text-accent-fg'
                  : 'hover:bg-ink-200 dark:hover:bg-ink-700',
              ].join(' ')}
            >
              {m.label}
            </button>
          ))}
        </div>

        <label className="flex items-center gap-1 text-xs text-ink-500">
          Beats per chord
          <select
            className="input h-7 w-auto py-0 text-xs"
            value={beatsPerChord}
            onChange={(e) => setBeatsPerChord(Number(e.target.value))}
          >
            {BEATS_PER_CHORD.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1 text-xs text-ink-500">
          Snap
          <select
            className="input h-7 w-auto py-0 text-xs"
            value={grid}
            onChange={(e) => setGrid(Number(e.target.value))}
          >
            {GRIDS.map((g) => (
              <option key={g.den} value={g.den}>
                {g.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-1.5 text-xs text-ink-500">
          <input
            type="checkbox"
            checked={skipTimed}
            onChange={(e) => setSkipTimed(e.target.checked)}
          />
          Keep parts I’ve already timed
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn-secondary px-2 py-1 text-xs disabled:opacity-40"
          disabled={preview.chords === 0}
          onClick={() => onApply(opts)}
        >
          <Wand2 size={14} /> Space chords
        </button>
        {onClear && (
          <button
            type="button"
            className="btn-ghost px-2 py-1 text-xs text-red-600"
            onClick={onClear}
            title="Remove every beat from this variant"
          >
            <Eraser size={14} /> Clear all beats
          </button>
        )}
        <span className="text-xs text-ink-400">
          {preview.chords === 0
            ? preview.skipped > 0
              ? 'Every part is already timed.'
              : 'No chords to space yet.'
            : `${preview.chords} chord${preview.chords === 1 ? '' : 's'} in ${preview.sections} part${
                preview.sections === 1 ? '' : 's'
              }${preview.skipped ? `, ${preview.skipped} left alone` : ''} · ${hint}`}
        </span>
      </div>
    </div>
  );
}
