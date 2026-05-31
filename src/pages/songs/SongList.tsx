import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Music, Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { createSong, useSongs } from '@/db/repo';
import { parseChordPro } from '@/lib/chordpro';

export function SongList() {
  const songs = useSongs();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  const filtered = useMemo(() => {
    if (!songs) return undefined;
    const q = query.trim().toLowerCase();
    if (!q) return songs;
    return songs.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.artist ?? '').toLowerCase().includes(q) ||
        s.tags.some((t) => t.includes(q)),
    );
  }, [songs, query]);

  async function quickAdd() {
    const id = await createSong({ title: 'Untitled song' });
    navigate(`${id}/edit`);
  }

  return (
    <div>
      <PageHeader
        title="Songs"
        subtitle="Your songbook"
        actions={
          <>
            <button className="btn-secondary" onClick={() => setImportOpen(true)}>
              Import
            </button>
            <button className="btn-primary" onClick={quickAdd}>
              <Plus size={16} /> New
            </button>
          </>
        }
      />

      {songs && songs.length > 0 && (
        <div className="relative mb-5">
          <Search
            size={16}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400"
          />
          <input
            className="input pl-9"
            placeholder="Search title, artist, or tag…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      )}

      {songs === undefined ? null : songs.length === 0 ? (
        <EmptyState
          icon={Music}
          title="No songs yet"
          description="Create a song or import ChordPro to get started."
          action={
            <button className="btn-primary" onClick={quickAdd}>
              <Plus size={16} /> New song
            </button>
          }
        />
      ) : (
        <ul className="space-y-2">
          {filtered?.map((s) => (
            <li key={s.id}>
              <button
                onClick={() => navigate(s.id)}
                className="card flex w-full items-center justify-between px-4 py-3 text-left transition hover:border-accent"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{s.title}</div>
                  <div className="truncate text-sm text-ink-500 dark:text-ink-400">
                    {[s.artist, s.key && `Key ${s.key}`].filter(Boolean).join(' · ') || '—'}
                  </div>
                </div>
                {s.tags.length > 0 && (
                  <div className="ml-3 hidden shrink-0 gap-1 sm:flex">
                    {s.tags.slice(0, 3).map((t) => (
                      <span key={t} className="chip">
                        {t}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <ImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  );
}

function ImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const navigate = useNavigate();
  const [text, setText] = useState('');
  const [error, setError] = useState('');

  async function doImport() {
    setError('');
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      const doc = parseChordPro(trimmed);
      const id = await createSong({
        title: doc.meta.title || 'Imported song',
        artist: doc.meta.artist,
        key: doc.meta.key,
        capo: doc.meta.capo,
        tempo: doc.meta.tempo,
        timeSignature: doc.meta.timeSignature,
        sections: doc.sections,
        source: trimmed,
      });
      setText('');
      onClose();
      navigate(id);
    } catch (e) {
      setError(String(e));
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Import ChordPro"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={doImport}>
            Import as draft
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm text-ink-500 dark:text-ink-400">
        Paste ChordPro text. Chords use <code>[G]</code> markers; timing uses the{' '}
        <code>[G@beat]</code> extension. You can clean it up after importing.
      </p>
      <textarea
        className="input min-h-[40vh] font-mono text-xs"
        placeholder={'{title: Song}\n{start_of_verse}\n[G]Amazing [C]grace\n{end_of_verse}'}
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
