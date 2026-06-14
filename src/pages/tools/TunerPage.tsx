import { useMemo } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { useTuner } from '@/components/tools/useTuner';
import { saveSettings, useSettings, useUserInstruments } from '@/db/repo';
import { allInstruments } from '@/lib/chords/instruments';
import { nearestTarget, readNote, stringTargets } from '@/lib/tuner';
import type { TunerSettings } from '@/types';

const DEFAULT_TUNER: TunerSettings = { instrumentId: '', a4: 440 };
const IN_TUNE_CENTS = 5;

export function TunerPage() {
  const settings = useSettings();
  const userInstruments = useUserInstruments();
  const { active, error, freq, start, stop } = useTuner();

  // Only fretted instruments carry a string tuning to target.
  const tunable = useMemo(
    () => allInstruments(userInstruments ?? []).filter((i) => i.tuning?.length),
    [userInstruments],
  );

  if (!settings) return <p className="text-sm text-ink-500">Loading…</p>;
  const cfg: TunerSettings = { ...DEFAULT_TUNER, ...settings.tuner };
  const save = (patch: Partial<TunerSettings>) =>
    void saveSettings({ tuner: { ...cfg, ...patch } });

  const instrument = tunable.find((i) => i.id === cfg.instrumentId);
  const targets = instrument?.tuning ? stringTargets(instrument.tuning, cfg.a4) : [];

  // Resolve the live frequency to a note. In instrument mode we measure against
  // the nearest open string; in chromatic mode against the nearest semitone.
  const target = freq && targets.length ? nearestTarget(freq, targets) : null;
  let label = '—';
  let cents = 0;
  let hasReading = false;
  if (freq) {
    hasReading = true;
    if (target) {
      label = target.label;
      cents = Math.round(1200 * Math.log2(freq / target.freq));
    } else {
      const note = readNote(freq, cfg.a4);
      label = note.label;
      cents = note.cents;
    }
  }
  const inTune = hasReading && Math.abs(cents) <= IN_TUNE_CENTS;
  const needle = Math.max(-50, Math.min(50, cents));

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Tuner" subtitle="Chromatic, or tuned to your instrument's strings." />

      {/* Mode + reference pitch */}
      <div className="card mb-5 divide-y divide-ink-200 dark:divide-ink-800">
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm font-medium">Mode</span>
          <select
            className="input h-9 w-auto py-0 text-sm"
            value={cfg.instrumentId}
            onChange={(e) => save({ instrumentId: e.target.value })}
          >
            <option value="">Chromatic</option>
            {tunable.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <span className="text-sm font-medium">Reference (A4)</span>
          <div className="flex items-center gap-2">
            <button className="btn-secondary px-2 py-1" onClick={() => save({ a4: cfg.a4 - 1 })}>
              −
            </button>
            <span className="w-16 text-center text-sm tabular-nums">{cfg.a4} Hz</span>
            <button className="btn-secondary px-2 py-1" onClick={() => save({ a4: cfg.a4 + 1 })}>
              +
            </button>
          </div>
        </div>
      </div>

      {/* Reading */}
      <div className="card flex flex-col items-center gap-5 p-6">
        <div className="text-center">
          <div
            className={[
              'text-7xl font-semibold tabular-nums tracking-tight transition-colors',
              inTune ? 'text-green-500' : '',
            ].join(' ')}
          >
            {label}
          </div>
          <div className="mt-1 h-5 text-sm text-ink-500">
            {hasReading ? `${freq!.toFixed(1)} Hz · ${cents > 0 ? '+' : ''}${cents}¢` : active ? 'Listening…' : ''}
          </div>
        </div>

        {/* Cents meter */}
        <div className="relative h-12 w-full max-w-sm">
          <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 rounded-full bg-ink-200 dark:bg-ink-800" />
          {/* In-tune zone */}
          <div
            className="absolute top-1/2 h-3 -translate-y-1/2 rounded-full bg-green-500/20"
            style={{ left: `${50 - IN_TUNE_CENTS}%`, width: `${IN_TUNE_CENTS * 2}%` }}
          />
          {/* Center line */}
          <div className="absolute left-1/2 top-1 h-10 w-px -translate-x-1/2 bg-ink-400" />
          {/* Needle */}
          {hasReading && (
            <div
              className={[
                'absolute top-1 h-10 w-1 -translate-x-1/2 rounded-full transition-all duration-75',
                inTune ? 'bg-green-500' : 'bg-accent',
              ].join(' ')}
              style={{ left: `${50 + needle}%` }}
            />
          )}
          <span className="absolute -bottom-5 left-0 text-xs text-ink-400">♭ −50</span>
          <span className="absolute -bottom-5 right-0 text-xs text-ink-400">+50 ♯</span>
        </div>

        {/* String targets (instrument mode) */}
        {targets.length > 0 && (
          <div className="flex flex-wrap justify-center gap-2 pt-2">
            {targets.map((t, i) => (
              <span
                key={`${t.label}-${i}`}
                className={
                  target && target.midi === t.midi && hasReading
                    ? 'chip chip-active'
                    : 'chip'
                }
              >
                {t.label}
              </span>
            ))}
          </div>
        )}

        <button
          className={active ? 'btn-secondary w-full py-3' : 'btn-primary w-full py-3'}
          onClick={() => (active ? stop() : void start())}
        >
          {active ? <MicOff size={18} /> : <Mic size={18} />}
          {active ? 'Stop' : 'Start tuning'}
        </button>
        {error && <p className="text-sm text-red-500">{error}</p>}
      </div>
    </div>
  );
}
