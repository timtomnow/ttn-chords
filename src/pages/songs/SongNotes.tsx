// A user's private/shared notes for a song. Your own note is editable (and can
// be flagged public); other people's public notes show read-only. Backed by
// Supabase song_notes with RLS (you only ever see your own + public notes).

import { useEffect, useMemo, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { useAuth } from '@/auth/AuthProvider';
import { deleteNote, saveMyNote, useSongNotes, type SongNote } from '@/db/repo';

export function SongNotes({ songId }: { songId: string }) {
  const { user } = useAuth();
  const { notes, reload } = useSongNotes(songId);

  const myNote = useMemo<SongNote | undefined>(
    () => notes?.find((n) => n.user_id === user?.id),
    [notes, user?.id],
  );
  const otherPublic = useMemo<SongNote[]>(
    () => (notes ?? []).filter((n) => n.user_id !== user?.id),
    [notes, user?.id],
  );

  const [body, setBody] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [saving, setSaving] = useState(false);

  // Seed the editor from the loaded note (once it arrives / changes).
  useEffect(() => {
    setBody(myNote?.body ?? '');
    setIsPublic(myNote?.is_public ?? false);
  }, [myNote?.id, myNote?.body, myNote?.is_public]);

  const dirty =
    body !== (myNote?.body ?? '') || isPublic !== (myNote?.is_public ?? false);

  async function save() {
    setSaving(true);
    try {
      await saveMyNote(songId, body, isPublic);
      await reload();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!myNote) return;
    setSaving(true);
    try {
      await deleteNote(myNote.id);
      await reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="mt-8 border-t border-ink-200 pt-6 dark:border-ink-800">
      <h2 className="label mb-2">My notes</h2>
      <textarea
        className="input min-h-[5rem] w-full resize-y"
        placeholder="Private notes for this song — fingering reminders, performance cues…"
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-ink-600 dark:text-ink-300">
          <input
            type="checkbox"
            className="accent-accent"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
          />
          Share this note publicly
        </label>
        <div className="ml-auto flex gap-2">
          {myNote && (
            <button className="btn-ghost" onClick={() => void remove()} disabled={saving}>
              <Trash2 size={15} /> Delete
            </button>
          )}
          <button className="btn-primary" onClick={() => void save()} disabled={saving || !dirty}>
            {saving ? 'Saving…' : 'Save note'}
          </button>
        </div>
      </div>

      {otherPublic.length > 0 && (
        <div className="mt-5 space-y-2">
          <h3 className="label">Shared notes</h3>
          {otherPublic.map((n) => (
            <p
              key={n.id}
              className="whitespace-pre-wrap rounded-lg border border-ink-200 px-3 py-2 text-sm text-ink-700 dark:border-ink-800 dark:text-ink-200"
            >
              {n.body}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
