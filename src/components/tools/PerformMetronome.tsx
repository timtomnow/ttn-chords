// Compact metronome for the performance shell. Presets to the song's tempo and
// time signature, reuses the user's saved sound/light preferences, and renders
// its flash overlay above the reading view. Tempo can be nudged live without
// touching the stored song.

import { useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { useMetronome } from './useMetronome';
import { MetronomeFlash } from './MetronomeFlash';
import { useSettings } from '@/db/repo';
import { DEFAULT_METRONOME, clampTempo } from '@/lib/metronome';
import type { Song } from '@/types';

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

export function PerformMetronome({ song }: { song: Song }) {
  const settings = useSettings();
  const prefs = { ...DEFAULT_METRONOME, ...settings?.metronome };

  const [tempo, setTempo] = useState(() =>
    clampTempo(song.tempo ?? prefs.tempo),
  );
  const beatsPerMeasure = song.timeSignature?.beats ?? prefs.beatsPerMeasure;

  const { playing, pulse, toggle } = useMetronome({
    tempo,
    beatsPerMeasure,
    subdivision: 1,
    soundEnabled: prefs.soundEnabled,
    sound: prefs.sound,
    accentDownbeat: prefs.accentDownbeat,
    volume: prefs.volume,
  });

  return (
    <>
      {playing && prefs.flashEnabled && (
        <MetronomeFlash
          pulse={pulse}
          shape={prefs.flashShape}
          accentColor={prefs.flashAccentColor}
          beatColor={prefs.flashBeatColor}
        />
      )}

      <div className="flex items-center gap-1 rounded-xl bg-ink-100 px-1.5 py-1 dark:bg-ink-800">
        <button
          className={[
            'flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium transition',
            playing ? 'bg-accent text-accent-fg' : 'hover:bg-ink-200 dark:hover:bg-ink-700',
          ].join(' ')}
          onClick={toggle}
          aria-label={playing ? 'Stop metronome' : 'Start metronome'}
          aria-pressed={playing}
        >
          <MetronomeIcon size={16} />
          <span className="tabular-nums">{tempo}</span>
        </button>
        <button
          className="rounded-lg p-1 hover:bg-ink-200 dark:hover:bg-ink-700"
          onClick={() => setTempo((t) => clampTempo(t - 1))}
          aria-label="Slower"
        >
          <Minus size={16} />
        </button>
        <button
          className="rounded-lg p-1 hover:bg-ink-200 dark:hover:bg-ink-700"
          onClick={() => setTempo((t) => clampTempo(t + 1))}
          aria-label="Faster"
        >
          <Plus size={16} />
        </button>
      </div>
    </>
  );
}
