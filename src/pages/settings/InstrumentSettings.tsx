// Settings block: choose "my instrument" (drives chord charts everywhere),
// define custom instruments, and add/override/delete chord diagrams.

import { useState } from 'react';
import { Guitar, Pencil, Plus, Trash2 } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { CustomChordEditor } from '@/components/chords/CustomChordEditor';
import {
  createInstrument,
  deleteChordDefinition,
  deleteInstrument,
  saveSettings,
  useChordDefinitions,
  useSettings,
  useUserInstruments,
} from '@/db/repo';
import { BUILTIN_GUITAR, allInstruments, getInstrumentInfo } from '@/lib/chords';
import type { InstrumentKind } from '@/types';

export function InstrumentSettings() {
  const settings = useSettings();
  const userInstruments = useUserInstruments();
  const userDefs = useChordDefinitions();

  const [addInstrumentOpen, setAddInstrumentOpen] = useState(false);
  const [chordEditor, setChordEditor] = useState<{ instrumentId: string; defId?: string } | null>(
    null,
  );

  const instruments = allInstruments(userInstruments ?? []);
  const myInstrumentId = settings?.myInstrumentId || BUILTIN_GUITAR;
  const editorInstrument = chordEditor
    ? getInstrumentInfo(chordEditor.instrumentId, userInstruments ?? [])
    : undefined;

  return (
    <section className="space-y-3">
      <h2 className="label">Instrument & chords</h2>
      <div className="card divide-y divide-ink-200 dark:divide-ink-800">
        {/* My instrument */}
        <div className="flex items-center justify-between gap-3 px-4 py-3">
          <div>
            <span className="text-sm font-medium">My instrument</span>
            <p className="text-xs text-ink-500 dark:text-ink-400">
              Chord charts in songs use this instrument.
            </p>
          </div>
          <select
            className="input h-9 w-auto py-0"
            value={myInstrumentId}
            onChange={(e) => void saveSettings({ myInstrumentId: e.target.value })}
          >
            {instruments.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
                {i.builtin ? '' : ' (custom)'}
              </option>
            ))}
          </select>
        </div>

        {/* Custom instruments */}
        <div className="px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Custom instruments</span>
            <button className="btn-ghost text-xs" onClick={() => setAddInstrumentOpen(true)}>
              <Plus size={14} /> Add
            </button>
          </div>
          {userInstruments && userInstruments.length > 0 ? (
            <ul className="space-y-1">
              {userInstruments.map((i) => (
                <li
                  key={i.id}
                  className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-sm dark:bg-ink-950/40"
                >
                  <span>
                    {i.name}{' '}
                    <span className="text-xs text-ink-400">
                      ({i.kind === 'fretted' ? `${i.strings ?? '?'} strings` : 'keyboard'})
                    </span>
                  </span>
                  <button
                    className="btn-ghost p-1 text-red-600"
                    onClick={() => {
                      if (confirm(`Delete instrument "${i.name}"?`)) void deleteInstrument(i.id);
                    }}
                  >
                    <Trash2 size={14} />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink-400">
              None yet. The chart engine is tuning-driven, so you can add any
              fretted or keyboard instrument.
            </p>
          )}
        </div>

        {/* Custom / overridden chords */}
        <div className="px-4 py-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium">Custom chord charts</span>
            <button
              className="btn-ghost text-xs"
              onClick={() => setChordEditor({ instrumentId: myInstrumentId })}
            >
              <Plus size={14} /> Add for {getInstrumentInfo(myInstrumentId, userInstruments ?? [])?.name}
            </button>
          </div>
          {userDefs && userDefs.length > 0 ? (
            <ul className="space-y-1">
              {userDefs.map((d) => {
                const inst = getInstrumentInfo(d.instrumentId, userInstruments ?? []);
                return (
                  <li
                    key={d.id}
                    className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-sm dark:bg-ink-950/40"
                  >
                    <span className="flex items-center gap-2">
                      <Guitar size={14} className="text-ink-400" />
                      <span className="font-medium">{d.name}</span>
                      <span className="text-xs text-ink-400">{inst?.name ?? d.instrumentId}</span>
                    </span>
                    <span className="flex items-center gap-1">
                      <button
                        className="btn-ghost p-1"
                        onClick={() => setChordEditor({ instrumentId: d.instrumentId, defId: d.id })}
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="btn-ghost p-1 text-red-600"
                        onClick={() => void deleteChordDefinition(d.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-xs text-ink-400">
              Add a chord here to override a bundled shape or to chart a chord
              that isn&apos;t in the library yet.
            </p>
          )}
        </div>
      </div>

      <AddInstrumentModal open={addInstrumentOpen} onClose={() => setAddInstrumentOpen(false)} />

      {editorInstrument && (
        <CustomChordEditor
          open
          onClose={() => setChordEditor(null)}
          instrument={editorInstrument}
          initial={
            chordEditor?.defId ? userDefs?.find((d) => d.id === chordEditor.defId) : undefined
          }
        />
      )}
    </section>
  );
}

function AddInstrumentModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [kind, setKind] = useState<InstrumentKind>('fretted');
  const [tuning, setTuning] = useState('E A D G B E');

  async function save() {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (kind === 'fretted') {
      const notes = tuning.trim().split(/\s+/).filter(Boolean);
      await createInstrument({
        name: trimmed,
        kind: 'fretted',
        strings: notes.length,
        tuning: notes,
      });
    } else {
      await createInstrument({ name: trimmed, kind: 'keyboard' });
    }
    setName('');
    setTuning('E A D G B E');
    setKind('fretted');
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add custom instrument"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={save} disabled={!name.trim()}>
            Add instrument
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <label className="block">
          <span className="label mb-1">Name</span>
          <input
            className="input"
            placeholder="e.g. Mandolin, Baritone Uke"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label className="block">
          <span className="label mb-1">Type</span>
          <select
            className="input"
            value={kind}
            onChange={(e) => setKind(e.target.value as InstrumentKind)}
          >
            <option value="fretted">Fretted (strings)</option>
            <option value="keyboard">Keyboard</option>
          </select>
        </label>
        {kind === 'fretted' && (
          <label className="block">
            <span className="label mb-1">Tuning (low → high, space-separated)</span>
            <input
              className="input"
              value={tuning}
              onChange={(e) => setTuning(e.target.value)}
              placeholder="G D A E"
            />
            <p className="mt-1 text-xs text-ink-400">
              Number of strings is inferred from the tuning.
            </p>
          </label>
        )}
      </div>
    </Modal>
  );
}
