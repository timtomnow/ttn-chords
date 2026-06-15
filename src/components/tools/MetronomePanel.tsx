// Full metronome control surface — used by the standalone tool. Self-contained:
// owns the engine (via useMetronome), renders the beat indicator + flash, and
// edits the passed-in settings through onChange so the parent can persist them.

import { useCallback, useRef } from 'react';
import { Pause, Play } from 'lucide-react';
import { useMetronome } from './useMetronome';
import { MetronomeFlash } from './MetronomeFlash';
import { MetronomeSettingsFields } from './MetronomeSettingsFields';
import { TempoInput } from '@/components/inputs/TempoInput';
import { TEMPO_MAX, TEMPO_MIN, clampTempo } from '@/lib/metronome';
import type { MetronomeSettings } from '@/types';

export function MetronomePanel({
  value,
  onChange,
}: {
  value: MetronomeSettings;
  onChange: (patch: Partial<MetronomeSettings>) => void;
}) {
  const { playing, pulse, toggle } = useMetronome(value);
  const tapTimes = useRef<number[]>([]);

  const setTempo = (bpm: number) => onChange({ tempo: clampTempo(bpm) });

  const tap = useCallback(() => {
    const now = performance.now();
    const taps = tapTimes.current;
    // Reset the running average if the user paused between taps.
    if (taps.length && now - taps[taps.length - 1] > 2000) taps.length = 0;
    taps.push(now);
    if (taps.length > 5) taps.shift();
    if (taps.length >= 2) {
      const intervals = taps.slice(1).map((t, i) => t - taps[i]);
      const avg = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      onChange({ tempo: clampTempo(60000 / avg) });
    }
  }, [onChange]);

  const beats = Math.max(1, value.beatsPerMeasure);
  const activeBeat = playing && pulse ? pulse.beat : -1;

  return (
    <div className="space-y-6">
      {value.flashEnabled && (
        <MetronomeFlash
          pulse={pulse}
          shape={value.flashShape}
          accentColor={value.flashAccentColor}
          beatColor={value.flashBeatColor}
        />
      )}

      {/* Tempo + transport */}
      <div className="card flex flex-col items-center gap-4 p-6">
        <div className="flex items-end gap-2">
          <TempoInput
            value={value.tempo}
            onChange={setTempo}
            showButtons={false}
            numberClassName="text-6xl font-semibold tabular-nums tracking-tight"
            ariaLabel="Tempo"
          />
          <span className="mb-2 text-sm text-ink-500">BPM</span>
        </div>

        <div className="flex items-center gap-2">
          <button className="btn-secondary px-3" onClick={() => setTempo(value.tempo - 5)} aria-label="-5 BPM">
            −5
          </button>
          <button className="btn-secondary px-3" onClick={() => setTempo(value.tempo - 1)} aria-label="-1 BPM">
            −1
          </button>
          <button className="btn-secondary px-3" onClick={() => setTempo(value.tempo + 1)} aria-label="+1 BPM">
            +1
          </button>
          <button className="btn-secondary px-3" onClick={() => setTempo(value.tempo + 5)} aria-label="+5 BPM">
            +5
          </button>
        </div>

        <input
          type="range"
          min={TEMPO_MIN}
          max={TEMPO_MAX}
          value={value.tempo}
          onChange={(e) => setTempo(Number(e.target.value))}
          className="w-full accent-accent"
          aria-label="Tempo"
        />

        {/* Beat indicator */}
        <div className="flex items-center gap-2">
          {Array.from({ length: beats }, (_, i) => (
            <span
              key={i}
              className="h-3 w-3 rounded-full bg-ink-200 transition-colors dark:bg-ink-700"
              style={{
                backgroundColor:
                  i === activeBeat
                    ? i === 0 && value.accentDownbeat
                      ? value.flashAccentColor
                      : value.flashBeatColor
                    : undefined,
              }}
            />
          ))}
        </div>

        <div className="flex w-full items-center gap-3">
          <button
            className="btn-primary flex-1 py-3 text-base"
            onClick={toggle}
            aria-label={playing ? 'Stop metronome' : 'Start metronome'}
          >
            {playing ? <Pause size={20} /> : <Play size={20} />}
            {playing ? 'Stop' : 'Start'}
          </button>
          <button className="btn-secondary py-3" onClick={tap}>
            Tap
          </button>
        </div>
      </div>

      <MetronomeSettingsFields value={value} onChange={onChange} />
    </div>
  );
}
