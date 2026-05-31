// Admin section (Phase 7B): manage user-defined rhythm symbols, e.g. a
// "continue" slash "/" or a "quick stop" "!". Built-in strokes (down/up/mute/
// accent/tap) stay hardcoded and are listed read-only for reference. Custom
// symbols become brushes in the rhythm-pattern editor.

import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import {
  createRhythmSymbol,
  deleteRhythmSymbol,
  updateRhythmSymbol,
  useRhythmSymbols,
} from '@/db/repo';
import { STROKE_META } from '@/lib/rhythm';
import type { StrumStroke } from '@/types';

const BUILT_INS: StrumStroke[] = ['down', 'up', 'accent', 'mute', 'tap'];

export function RhythmSymbolSettings() {
  const symbols = useRhythmSymbols();
  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);

  async function submit() {
    const n = name.trim();
    const g = symbol.trim();
    if (!n || !g) return;
    if (editingId) await updateRhythmSymbol(editingId, { name: n, symbol: g });
    else await createRhythmSymbol(n, g);
    setName('');
    setSymbol('');
    setEditingId(null);
  }

  return (
    <section className="space-y-3">
      <h2 className="label">Rhythm symbols</h2>
      <div className="card space-y-4 p-4">
        {/* Built-in reference */}
        <div>
          <span className="label mb-1.5 block">Built-in</span>
          <div className="flex flex-wrap gap-1.5">
            {BUILT_INS.map((s) => {
              const meta = STROKE_META[s];
              return (
                <span key={s} className="chip" title={meta.label}>
                  <span className="font-semibold">
                    {s === 'accent' ? `>${meta.symbol}` : meta.symbol}
                  </span>
                  {meta.label}
                </span>
              );
            })}
          </div>
        </div>

        {/* Custom list */}
        <div>
          <span className="label mb-1.5 block">Custom</span>
          {symbols && symbols.length > 0 ? (
            <ul className="space-y-1">
              {symbols.map((sym) => (
                <li
                  key={sym.id}
                  className="flex items-center justify-between rounded-lg bg-ink-50 px-3 py-2 text-sm dark:bg-ink-950/40"
                >
                  <span className="flex items-center gap-2">
                    <span className="flex h-7 w-7 items-center justify-center rounded bg-white font-semibold dark:bg-ink-800">
                      {sym.symbol}
                    </span>
                    {sym.name}
                  </span>
                  <span className="flex gap-1">
                    <button
                      className="btn-ghost p-1"
                      onClick={() => {
                        setEditingId(sym.id);
                        setName(sym.name);
                        setSymbol(sym.symbol);
                      }}
                      aria-label="Edit"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      className="btn-ghost p-1 text-red-600"
                      onClick={() => {
                        if (confirm(`Delete symbol "${sym.name}"?`)) void deleteRhythmSymbol(sym.id);
                      }}
                      aria-label="Delete"
                    >
                      <Trash2 size={14} />
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-xs text-ink-400">
              None yet. Add a symbol like a “continue” slash or a “quick stop”.
            </p>
          )}
        </div>

        {/* Add / edit form */}
        <div className="flex items-end gap-2">
          <label className="block w-20">
            <span className="label mb-1">Symbol</span>
            <input
              className="input text-center font-semibold"
              maxLength={3}
              placeholder="/"
              value={symbol}
              onChange={(e) => setSymbol(e.target.value)}
            />
          </label>
          <label className="block flex-1">
            <span className="label mb-1">Name</span>
            <input
              className="input"
              placeholder="e.g. Continue, Quick stop"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && submit()}
            />
          </label>
          <button className="btn-primary shrink-0" onClick={submit} disabled={!name.trim() || !symbol.trim()}>
            {editingId ? (
              'Save'
            ) : (
              <>
                <Plus size={16} /> Add
              </>
            )}
          </button>
          {editingId && (
            <button
              className="btn-ghost shrink-0"
              onClick={() => {
                setEditingId(null);
                setName('');
                setSymbol('');
              }}
            >
              Cancel
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
