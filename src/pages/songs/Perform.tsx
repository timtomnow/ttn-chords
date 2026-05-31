import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useSettings, useSong } from '@/db/repo';
import { PerformShell, rememberView } from '@/components/performance/PerformShell';
import { DEFAULT_VIEW_ID } from '@/lib/performance/registry';

// Single-song performance. Setlist performance reuses PerformShell directly
// with a SetlistNav (see Setlists Run), so this page stays focused on one song.
export function Perform() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const song = useSong(id);
  const settings = useSettings();

  const [viewId, setViewId] = useState<string | null>(null);

  if (song === undefined || settings === undefined) {
    return <p className="p-8 text-sm text-ink-500">Loading…</p>;
  }
  if (song === null) {
    return (
      <div className="p-8">
        <button className="btn-ghost mb-4" onClick={() => navigate('/songs')}>
          <ArrowLeft size={16} /> Back
        </button>
        <p className="text-sm text-ink-500">Song not found.</p>
      </div>
    );
  }

  const activeView = viewId ?? settings.performanceViewId ?? DEFAULT_VIEW_ID;

  return (
    <PerformShell
      song={song}
      viewId={activeView}
      onViewChange={(v) => {
        setViewId(v);
        rememberView(v);
      }}
      onExit={() => navigate(`/songs/${song.id}`)}
    />
  );
}
