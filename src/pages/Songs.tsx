import { useState } from 'react';
import { Music, Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { createSong, useSongs } from '@/db/repo';

// Phase 1 scaffold: a minimal but live Song library so the data layer is wired
// end-to-end. The full editor (sections, chord events, beat timing) and the
// detail/perform views land in Phases 3–5 (see plan.md).
export function Songs() {
  const songs = useSongs();
  const [title, setTitle] = useState('');

  async function add() {
    const t = title.trim();
    if (!t) return;
    await createSong({ title: t });
    setTitle('');
  }

  return (
    <div>
      <PageHeader title="Songs" subtitle="Your songbook" />

      <div className="mb-6 flex gap-2">
        <input
          className="input"
          placeholder="Add a song title…"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && add()}
        />
        <button className="btn-primary shrink-0" onClick={add}>
          <Plus size={16} /> Add
        </button>
      </div>

      {songs === undefined ? null : songs.length === 0 ? (
        <EmptyState
          icon={Music}
          title="No songs yet"
          description="Add your first song above. Lyrics, chords, rhythms, and chord charts come together in the song editor (Phase 3)."
        />
      ) : (
        <ul className="space-y-2">
          {songs.map((s) => (
            <li key={s.id} className="card flex items-center justify-between px-4 py-3">
              <div>
                <div className="font-medium">{s.title}</div>
                {s.artist && (
                  <div className="text-sm text-ink-500 dark:text-ink-400">{s.artist}</div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
