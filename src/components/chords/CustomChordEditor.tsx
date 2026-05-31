// Add or override a chord diagram for an instrument. Fretted instruments get a
// per-string fret editor with a live preview; keyboard instruments take a
// chord symbol and derive the keys (with an optional manual pitch-class list).
// Saves to the chordDefinitions table; a user definition overrides the bundled
// library in resolveChord().

import { useMemo, useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { ChordChart } from './ChordChart';
import { saveChordDefinition } from '@/db/repo';
import { resolveChord, type InstrumentInfo } from '@/lib/chords';
import { computePianoShape } from '@/lib/chords/compute';
import type { ChordDefinition, FrettedShape } from '@/types';

export function CustomChordEditor({
  open,
  onClose,
  instrument,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  instrument: InstrumentInfo;
  initial?: ChordDefinition;
}) {
  const stringCount = instrument.strings ?? 6;
  const [name, setName] = useState(initial?.name ?? '');
  const [baseFret, setBaseFret] = useState(initial?.fretted?.baseFret ?? 1);
  const [frets, setFrets] = useState<number[]>(
    initial?.fretted?.frets ?? Array.from({ length: stringCount }, () => 0),
  );

  const fretted = instrument.kind === 'fretted';

  const previewShape: FrettedShape = useMemo(
    () => ({ baseFret, frets }),
    [baseFret, frets],
  );

  const keyboardPreview = useMemo(
    () => (!fretted && name.trim() ? computePianoShape(name.trim()) : null),
    [fretted, name],
  );

  function setString(i: number, value: number) {
    setFrets((prev) => prev.map((f, idx) => (idx === i ? value : f)));
  }

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (fretted) {
      await saveChordDefinition({
        id: initial?.id,
        instrumentId: instrument.id,
        name: trimmed,
        fretted: { baseFret, frets },
      });
    } else {
      const shape = computePianoShape(trimmed);
      if (!shape) return;
      await saveChordDefinition({
        id: initial?.id,
        instrumentId: instrument.id,
        name: trimmed,
        keyboard: shape,
      });
    }
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={initial ? `Edit ${initial.name}` : `Add chord · ${instrument.name}`}
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={!name.trim()}>
            Save chord
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="label mb-1">Chord name</span>
          <input
            className="input"
            placeholder="e.g. G, Cmaj7, F#m"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>

        {fretted ? (
          <>
            <label className="block">
              <span className="label mb-1">Base fret</span>
              <input
                className="input w-24"
                type="number"
                min={1}
                value={baseFret}
                onChange={(e) => setBaseFret(Math.max(1, Number(e.target.value) || 1))}
              />
            </label>

            <div>
              <span className="label mb-1">Frets per string (low → high)</span>
              <div className="flex flex-wrap gap-2">
                {frets.map((f, i) => (
                  <div key={i} className="flex flex-col items-center">
                    <span className="text-[10px] text-ink-400">
                      {instrument.tuning?.[i] ?? i + 1}
                    </span>
                    <input
                      className="input w-14 text-center"
                      type="number"
                      min={-1}
                      value={f}
                      onChange={(e) => setString(i, Number(e.target.value))}
                    />
                  </div>
                ))}
              </div>
              <p className="mt-1 text-xs text-ink-400">-1 = muted (✕), 0 = open (○).</p>
            </div>

            <div className="flex justify-center rounded-2xl border border-ink-200 p-4 dark:border-ink-800">
              <ChordChart
                chart={{
                  kind: 'fretted',
                  instrumentId: instrument.id,
                  name: name || '?',
                  source: 'user',
                  fretted: previewShape,
                }}
                size="lg"
              />
            </div>
          </>
        ) : (
          <div className="flex justify-center rounded-2xl border border-ink-200 p-4 dark:border-ink-800">
            {keyboardPreview ? (
              <ChordChart
                chart={{
                  kind: 'keyboard',
                  instrumentId: instrument.id,
                  name: name || '?',
                  source: 'user',
                  keyboard: keyboardPreview,
                }}
                size="lg"
              />
            ) : (
              <p className="py-6 text-sm text-ink-400">
                Enter a chord name to preview the keyboard diagram.
              </p>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}

/** True when a user definition already exists for this instrument + name. */
export function hasUserChart(
  defs: ChordDefinition[],
  instrumentId: string,
  name: string,
): boolean {
  return defs.some((d) => d.instrumentId === instrumentId && d.name === name);
}

/** Resolve a chart for preview without DB access (used by tooling/tests). */
export function previewResolve(instrumentId: string, name: string) {
  return resolveChord(instrumentId, name);
}
