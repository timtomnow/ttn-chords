// Full metronome control surface — used by the standalone tool. Self-contained:
// owns the engine (via useMetronome), renders the beat indicator + flash, and
// edits the passed-in settings through onChange so the parent can persist them.

import { useCallback, useRef } from 'react';
import { Pause, Play } from 'lucide-react';
import { useMetronome } from './useMetronome';
import { MetronomeFlash } from './MetronomeFlash';
import {
  SOUND_LABELS,
  TEMPO_MAX,
  TEMPO_MIN,
  clampTempo,
} from '@/lib/metronome';
import type { MetronomeSettings, MetronomeSound, MetronomeFlashShape } from '@/types';

const SUBDIVISIONS: { value: number; label: string }[] = [
  { value: 1, label: 'Quarter' },
  { value: 2, label: 'Eighth' },
  { value: 3, label: 'Triplet' },
  { value: 4, label: 'Sixteenth' },
];

const FLASH_SHAPES: { value: MetronomeFlashShape; label: string }[] = [
  { value: 'circle', label: 'Circle' },
  { value: 'border', label: 'Border' },
  { value: 'fullscreen', label: 'Full screen' },
];

const FLASH_COLORS = ['#22c55e', '#3b82f6', '#ef4444', '#f59e0b', '#a855f7', '#ec4899', '#64748b'];

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
          <span className="text-6xl font-semibold tabular-nums tracking-tight">{value.tempo}</span>
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

      {/* Meter */}
      <section className="space-y-3">
        <h2 className="label">Meter</h2>
        <div className="card space-y-4 p-4">
          <Field label="Beats per measure">
            <div className="flex flex-wrap gap-1">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 12].map((n) => (
                <button
                  key={n}
                  className={value.beatsPerMeasure === n ? 'chip chip-active' : 'chip'}
                  onClick={() => onChange({ beatsPerMeasure: n })}
                >
                  {n}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Subdivision">
            <div className="flex flex-wrap gap-1">
              {SUBDIVISIONS.map((s) => (
                <button
                  key={s.value}
                  className={value.subdivision === s.value ? 'chip chip-active' : 'chip'}
                  onClick={() => onChange({ subdivision: s.value })}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </Field>
        </div>
      </section>

      {/* Sound */}
      <section className="space-y-3">
        <h2 className="label">Sound</h2>
        <div className="card divide-y divide-ink-200 dark:divide-ink-800">
          <ToggleRow
            label="Sound on"
            checked={value.soundEnabled}
            onChange={(v) => onChange({ soundEnabled: v })}
          />
          <div className="px-4 py-3">
            <Field label="Voice">
              <div className="flex flex-wrap gap-1">
                {(Object.keys(SOUND_LABELS) as MetronomeSound[]).map((s) => (
                  <button
                    key={s}
                    className={value.sound === s ? 'chip chip-active' : 'chip'}
                    onClick={() => onChange({ sound: s })}
                  >
                    {SOUND_LABELS[s]}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <ToggleRow
            label="Accent the downbeat (two-sound)"
            hint="Beat 1 gets a distinct, higher click; off = every beat equal."
            checked={value.accentDownbeat}
            onChange={(v) => onChange({ accentDownbeat: v })}
          />
          <div className="px-4 py-3">
            <Field label={`Volume · ${Math.round(value.volume * 100)}%`}>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={value.volume}
                onChange={(e) => onChange({ volume: Number(e.target.value) })}
                className="w-full accent-accent"
                aria-label="Volume"
              />
            </Field>
          </div>
        </div>
      </section>

      {/* Light */}
      <section className="space-y-3">
        <h2 className="label">Light</h2>
        <div className="card divide-y divide-ink-200 dark:divide-ink-800">
          <ToggleRow
            label="Flash on"
            checked={value.flashEnabled}
            onChange={(v) => onChange({ flashEnabled: v })}
          />
          <div className="px-4 py-3">
            <Field label="Shape">
              <div className="flex flex-wrap gap-1">
                {FLASH_SHAPES.map((s) => (
                  <button
                    key={s.value}
                    className={value.flashShape === s.value ? 'chip chip-active' : 'chip'}
                    onClick={() => onChange({ flashShape: s.value })}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </Field>
          </div>
          <div className="px-4 py-3">
            <ColorRow
              label="Downbeat color"
              value={value.flashAccentColor}
              onChange={(c) => onChange({ flashAccentColor: c })}
            />
          </div>
          <div className="px-4 py-3">
            <ColorRow
              label="Beat color"
              value={value.flashBeatColor}
              onChange={(c) => onChange({ flashBeatColor: c })}
            />
          </div>
        </div>
      </section>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <span className="label">{label}</span>
      {children}
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
      <span>
        <span className="text-sm font-medium">{label}</span>
        {hint && <span className="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">{hint}</span>}
      </span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-5 w-5 shrink-0 accent-accent"
      />
    </label>
  );
}

function ColorRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (c: string) => void;
}) {
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        {FLASH_COLORS.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            title={c}
            className={[
              'h-7 w-7 rounded-full transition',
              value.toLowerCase() === c.toLowerCase()
                ? 'ring-2 ring-offset-2 ring-ink-900 ring-offset-white dark:ring-ink-50 dark:ring-offset-ink-900'
                : '',
            ].join(' ')}
            style={{ backgroundColor: c }}
          />
        ))}
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-7 w-9 cursor-pointer rounded border border-ink-200 bg-transparent dark:border-ink-800"
          aria-label={`${label} custom`}
        />
      </div>
    </Field>
  );
}
