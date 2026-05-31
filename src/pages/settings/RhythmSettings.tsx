// Settings block: the rhythm-pattern library. Create/edit/delete reusable
// strum patterns (labelled like "Intro", "Chorus 2"); they can be attached to
// song sections and placed on reports/reading views.

import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { RhythmChart } from '@/components/rhythm/RhythmChart';
import { RhythmPatternEditor } from '@/components/rhythm/RhythmPatternEditor';
import { deleteRhythmPattern, useRhythmPatterns, useRhythmSymbolMap } from '@/db/repo';
import type { RhythmPattern } from '@/types';

export function RhythmSettings() {
  const patterns = useRhythmPatterns();
  const symbolMap = useRhythmSymbolMap();
  const [editing, setEditing] = useState<RhythmPattern | null>(null);
  const [creating, setCreating] = useState(false);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="label">Rhythm patterns</h2>
        <button className="btn-ghost text-xs" onClick={() => setCreating(true)}>
          <Plus size={14} /> New
        </button>
      </div>

      {patterns && patterns.length > 0 ? (
        <div className="space-y-3">
          {patterns.map((p) => (
            <div key={p.id} className="card flex items-center justify-between gap-3 p-3">
              <div className="min-w-0 overflow-x-auto">
                <RhythmChart pattern={p} symbols={symbolMap} size="sm" />
              </div>
              <div className="flex shrink-0 gap-1">
                <button className="btn-ghost p-1.5" onClick={() => setEditing(p)} aria-label="Edit">
                  <Pencil size={15} />
                </button>
                <button
                  className="btn-ghost p-1.5 text-red-600"
                  onClick={() => {
                    if (confirm(`Delete pattern "${p.name}"?`)) void deleteRhythmPattern(p.id);
                  }}
                  aria-label="Delete"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-ink-400">
          No patterns yet. Create labelled strum patterns (e.g. Intro, Chorus 2)
          to attach to song sections and place on reports.
        </p>
      )}

      {creating && (
        <RhythmPatternEditor open onClose={() => setCreating(false)} />
      )}
      {editing && (
        <RhythmPatternEditor open initial={editing} onClose={() => setEditing(null)} />
      )}
    </section>
  );
}
