// The chord-sound controls, factored out so the same switches appear both in
// Settings and in the in-performance sheet (where you actually discover you want
// them). Purely presentational: it edits the passed-in ChordSoundSettings
// through onChange(patch) and the parent decides where the value lives.

import { Music4 } from 'lucide-react';
import {
  CHORD_MODE_LABELS,
  CHORD_SOURCE_LABELS,
  CHORD_TIMBRE_LABELS,
  CHORD_VOICING_LABELS,
} from '@/lib/chordAudio';
import type {
  ChordSoundMode,
  ChordSoundSettings,
  ChordSoundSource,
  ChordSoundTimbre,
  ChordSoundVoicing,
} from '@/types';

const MODE_HINTS: Record<ChordSoundMode, string> = {
  once: 'One hit on the chord’s beat.',
  held: 'Sounds from its beat and holds until the next chord.',
  repeat: 'Re-struck on every beat until the next chord.',
};

export function ChordSoundFields({
  value,
  onChange,
  /** How many chords have a recording — shown against the "My recordings" source. */
  recordingCount,
}: {
  value: ChordSoundSettings;
  onChange: (patch: Partial<ChordSoundSettings>) => void;
  recordingCount?: number;
}) {
  return (
    <div className="card divide-y divide-ink-200 dark:divide-ink-800">
      <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
        <span>
          <span className="text-sm font-medium">Play the chords</span>
          <span className="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">
            Sounds each chord in the Highway as you reach it, on top of the metronome.
          </span>
        </span>
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => onChange({ enabled: e.target.checked })}
          className="h-5 w-5 shrink-0 accent-accent"
        />
      </label>

      {value.enabled && (
        <>
          <Row label="Sound">
            {(Object.keys(CHORD_SOURCE_LABELS) as ChordSoundSource[]).map((s) => (
              <button
                key={s}
                className={value.source === s ? 'chip chip-active' : 'chip'}
                onClick={() => onChange({ source: s })}
              >
                {CHORD_SOURCE_LABELS[s]}
                {s === 'recording' && recordingCount !== undefined && (
                  <span className="ml-1 opacity-60">({recordingCount})</span>
                )}
              </button>
            ))}
          </Row>

          {value.source === 'recording' && (
            <p className="flex items-start gap-2 px-4 py-3 text-xs text-ink-500 dark:text-ink-400">
              <Music4 size={14} className="mt-0.5 shrink-0" />
              Chords you haven’t recorded fall back to the built-in tone, so a
              half-finished set still plays through.
            </p>
          )}

          {value.source === 'tone' && (
            <>
              <Row label="Voicing">
                {(Object.keys(CHORD_VOICING_LABELS) as ChordSoundVoicing[]).map((v) => (
                  <button
                    key={v}
                    className={value.voicing === v ? 'chip chip-active' : 'chip'}
                    onClick={() => onChange({ voicing: v })}
                  >
                    {CHORD_VOICING_LABELS[v]}
                  </button>
                ))}
              </Row>
              <Row label="Tone">
                {(Object.keys(CHORD_TIMBRE_LABELS) as ChordSoundTimbre[]).map((t) => (
                  <button
                    key={t}
                    className={value.timbre === t ? 'chip chip-active' : 'chip'}
                    onClick={() => onChange({ timbre: t })}
                  >
                    {CHORD_TIMBRE_LABELS[t]}
                  </button>
                ))}
              </Row>
            </>
          )}

          <Row label="When" hint={MODE_HINTS[value.mode]}>
            {(Object.keys(CHORD_MODE_LABELS) as ChordSoundMode[]).map((m) => (
              <button
                key={m}
                className={value.mode === m ? 'chip chip-active' : 'chip'}
                onClick={() => onChange({ mode: m })}
              >
                {CHORD_MODE_LABELS[m]}
              </button>
            ))}
          </Row>

          <div className="px-4 py-3">
            <span className="label">Chord volume · {Math.round(value.volume * 100)}%</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={value.volume}
              onChange={(e) => onChange({ volume: Number(e.target.value) })}
              className="mt-2 w-full accent-accent"
              aria-label="Chord volume"
            />
          </div>

          <p className="px-4 py-3 text-xs text-ink-500 dark:text-ink-400">
            Put a break in a song by placing <code className="font-mono">N.C.</code> on a beat —
            it stops whatever is sounding until the next chord.
          </p>
        </>
      )}
    </div>
  );
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="px-4 py-3">
      <span className="label">{label}</span>
      <div className="mt-2 flex flex-wrap gap-1">{children}</div>
      {hint && <p className="mt-2 text-xs text-ink-500 dark:text-ink-400">{hint}</p>}
    </div>
  );
}
