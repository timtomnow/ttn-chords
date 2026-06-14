// The metronome control + flash for the performance shell. Presentational: the
// shell owns the single shared metronome/transport (so the audible click and a
// beat-clock view's scroll lock together) and passes its state in. Tempo can be
// nudged live without touching the stored song.

import { Minus, Plus } from 'lucide-react';
import { MetronomeFlash } from './MetronomeFlash';
import type { MetronomePulse } from './useMetronome';
import { clampTempo } from '@/lib/metronome';
import type { MetronomeFlashShape } from '@/types';

// A small metronome glyph (lucide has no dedicated one).
function MetronomeIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M7 21h10" />
      <path d="M9 21 12 4l3 17" />
      <path d="M12 4 17 9" />
    </svg>
  );
}

export type MetronomeFlashPrefs = {
  enabled: boolean;
  shape: MetronomeFlashShape;
  accentColor: string;
  beatColor: string;
};

export function PerformMetronome({
  playing,
  tempo,
  pulse,
  onToggle,
  onTempoChange,
  flash,
}: {
  playing: boolean;
  tempo: number;
  pulse: MetronomePulse | null;
  onToggle: () => void;
  onTempoChange: (bpm: number) => void;
  flash: MetronomeFlashPrefs;
}) {
  return (
    <>
      {playing && flash.enabled && (
        <MetronomeFlash
          pulse={pulse}
          shape={flash.shape}
          accentColor={flash.accentColor}
          beatColor={flash.beatColor}
        />
      )}

      <div className="flex items-center gap-1 rounded-xl bg-ink-100 px-1.5 py-1 dark:bg-ink-800">
        <button
          className={[
            'flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium transition',
            playing ? 'bg-accent text-accent-fg' : 'hover:bg-ink-200 dark:hover:bg-ink-700',
          ].join(' ')}
          onClick={onToggle}
          aria-label={playing ? 'Stop metronome' : 'Start metronome'}
          aria-pressed={playing}
        >
          <MetronomeIcon size={16} />
          <span className="tabular-nums">{tempo}</span>
        </button>
        <button
          className="rounded-lg p-1 hover:bg-ink-200 dark:hover:bg-ink-700"
          onClick={() => onTempoChange(clampTempo(tempo - 1))}
          aria-label="Slower"
        >
          <Minus size={16} />
        </button>
        <button
          className="rounded-lg p-1 hover:bg-ink-200 dark:hover:bg-ink-700"
          onClick={() => onTempoChange(clampTempo(tempo + 1))}
          aria-label="Faster"
        >
          <Plus size={16} />
        </button>
      </div>
    </>
  );
}
