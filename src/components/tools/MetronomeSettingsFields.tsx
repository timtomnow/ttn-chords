// The Meter / Sound / Light settings for the metronome, factored out of
// MetronomePanel so the same controls can be reused in the in-performance
// metronome settings sheet (PerformShell). Purely presentational: it edits the
// passed-in MetronomeSettings through onChange(patch); the parent decides where
// the value lives (the standalone tool's local engine, or AppSettings.metronome).

import { SOUND_LABELS } from '@/lib/metronome';
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

export function MetronomeSettingsFields({
  value,
  onChange,
}: {
  value: MetronomeSettings;
  onChange: (patch: Partial<MetronomeSettings>) => void;
}) {
  return (
    <div className="space-y-6">
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
