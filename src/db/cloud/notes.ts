// Song notes: a user's own notes layered on a song, optionally shared publicly.
// RLS returns your own notes + any public note + (for admins) all. Notes are
// low-frequency, so this uses a simple per-song fetch hook rather than a cached
// reactive list.

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase/client';
import type { SongNoteRow } from '@/lib/supabase/types';
import { requireUserId } from './auth';

export type SongNote = SongNoteRow;

export function useSongNotes(songId: string | undefined): {
  notes: SongNote[] | undefined;
  reload: () => Promise<void>;
} {
  const [notes, setNotes] = useState<SongNote[] | undefined>(undefined);

  const reload = useCallback(async () => {
    if (!songId) {
      setNotes([]);
      return;
    }
    const { data, error } = await supabase
      .from('song_notes')
      .select('*')
      .eq('song_id', songId)
      .order('created_at', { ascending: true });
    if (error) {
      console.error('[notes] load failed', error.message);
      setNotes([]);
      return;
    }
    setNotes(data ?? []);
  }, [songId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { notes, reload };
}

/** Insert or update the signed-in user's single note for a song. */
export async function saveMyNote(
  songId: string,
  body: string,
  isPublic: boolean,
): Promise<void> {
  const user_id = await requireUserId();
  const { data: existing, error: selErr } = await supabase
    .from('song_notes')
    .select('id')
    .eq('song_id', songId)
    .eq('user_id', user_id)
    .maybeSingle();
  if (selErr) throw selErr;

  if (existing) {
    const { error } = await supabase
      .from('song_notes')
      .update({ body, is_public: isPublic, updated_at: new Date().toISOString() })
      .eq('id', existing.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from('song_notes')
      .insert({ user_id, song_id: songId, body, is_public: isPublic });
    if (error) throw error;
  }
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from('song_notes').delete().eq('id', id);
  if (error) throw error;
}
