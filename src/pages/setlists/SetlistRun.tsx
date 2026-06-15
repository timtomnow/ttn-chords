import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useSetlist, useSettings, useSongsByIds } from '@/db/repo';
import { PerformShell, rememberView } from '@/components/performance/PerformShell';
import { DEFAULT_VIEW_ID } from '@/lib/performance/registry';

// Setlist performance: walks the entries in order through the same PerformShell
// used for single songs, passing a SetlistNav for prev/next + per-entry
// transpose overrides. Missing songs (deleted after being added) are skipped
// over by index but still occupy a slot, so we guard for the lookup.
export function SetlistRun() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const setlist = useSetlist(id);
  const settings = useSettings();
  const songMap = useSongsByIds(setlist?.entries.map((e) => e.songId) ?? []);

  const [index, setIndex] = useState(0);
  const [viewId, setViewId] = useState<string | null>(null);

  if (setlist === undefined || settings === undefined || songMap === undefined) {
    return <p className="p-8 text-sm text-ink-500">Loading…</p>;
  }
  if (!setlist || setlist.entries.length === 0) {
    return (
      <div className="p-8">
        <button className="btn-ghost mb-4" onClick={() => navigate('/setlists')}>
          <ArrowLeft size={16} /> Back
        </button>
        <p className="text-sm text-ink-500">This setlist has no songs.</p>
      </div>
    );
  }

  const safeIndex = Math.min(index, setlist.entries.length - 1);
  const entry = setlist.entries[safeIndex];
  const song = songMap.get(entry.songId);
  const activeView = viewId ?? settings.performanceViewId ?? DEFAULT_VIEW_ID;

  if (!song) {
    // Missing song slot: offer to skip rather than dead-end.
    return (
      <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-ink-50 p-8 text-center dark:bg-ink-950">
        <p className="text-sm text-ink-500">
          Song {safeIndex + 1} of {setlist.entries.length} is missing (it may have been deleted).
        </p>
        <div className="flex gap-2">
          <button className="btn-ghost" onClick={() => navigate(`/setlists/${setlist.id}`)}>
            Exit
          </button>
          <button
            className="btn-primary"
            onClick={() => setIndex((i) => Math.min(i + 1, setlist.entries.length - 1))}
            disabled={safeIndex >= setlist.entries.length - 1}
          >
            Skip
          </button>
        </div>
      </div>
    );
  }

  return (
    <PerformShell
      key={song.id + safeIndex}
      song={song}
      viewId={activeView}
      onViewChange={(v) => {
        setViewId(v);
        rememberView(v);
      }}
      onExit={() => navigate(`/setlists/${setlist.id}`)}
      setlist={{
        index: safeIndex,
        total: setlist.entries.length,
        label: setlist.name,
        transpose: entry.transpose,
        difficultyId: entry.difficultyId,
        onPrev: safeIndex > 0 ? () => setIndex(safeIndex - 1) : undefined,
        onNext:
          safeIndex < setlist.entries.length - 1 ? () => setIndex(safeIndex + 1) : undefined,
      }}
    />
  );
}
