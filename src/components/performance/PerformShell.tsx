// The performance shell: owns all chrome (top bar, view switcher, transpose,
// zoom, play/pause + speed, wake lock, optional prev/next for setlists) and
// renders whichever registered view is selected. Views are dumb about chrome;
// the shell is dumb about how a view renders. Capabilities decide which
// controls show.

import { useEffect, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Minus,
  Pause,
  Play,
  Plus,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { ChordPopover } from '@/components/chords/ChordPopover';
import { useWakeLock } from '@/hooks/useWakeLock';
import { getView, listViews } from '@/lib/performance/registry';
import { saveSettings } from '@/db/repo';
import { preferFlatsForKey } from '@/lib/music';
import '@/components/performance/views'; // register built-in views
import type { Song } from '@/types';

export type SetlistNav = {
  index: number;
  total: number;
  label?: string;
  onPrev?: () => void;
  onNext?: () => void;
  /** Per-entry transpose override coming from the setlist. */
  transpose?: number;
};

export function PerformShell({
  song,
  viewId,
  onExit,
  onViewChange,
  setlist,
}: {
  song: Song;
  viewId: string;
  onExit: () => void;
  onViewChange: (id: string) => void;
  setlist?: SetlistNav;
}) {
  const view = getView(viewId);
  const views = listViews();
  const caps = view?.capabilities ?? {};

  const [transpose, setTranspose] = useState(setlist?.transpose ?? 0);
  const [fontScale, setFontScale] = useState(1.25);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [popover, setPopover] = useState<{ chord: string; anchor: { x: number; y: number } } | null>(
    null,
  );

  const { held } = useWakeLock(true);

  // Reset per-song state when navigating a setlist.
  useEffect(() => {
    setTranspose(setlist?.transpose ?? 0);
    setPlaying(false);
  }, [song.id, setlist?.transpose]);

  const flats = preferFlatsForKey(song.key);
  const ViewComponent = view?.component;

  return (
    <div className="fixed inset-0 z-40 flex flex-col bg-ink-50 text-ink-900 dark:bg-ink-950 dark:text-ink-50">
      {/* Top bar */}
      <header
        className="flex items-center gap-2 border-b border-ink-200 px-3 py-2 dark:border-ink-800"
        style={{ paddingTop: 'calc(var(--safe-top) + 0.25rem)' }}
      >
        <button className="btn-ghost p-2" onClick={onExit} aria-label="Exit performance">
          <X size={18} />
        </button>

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{song.title}</div>
          {setlist && (
            <div className="truncate text-xs text-ink-400">
              {setlist.label ? `${setlist.label} · ` : ''}
              {setlist.index + 1} / {setlist.total}
            </div>
          )}
        </div>

        {/* View switcher */}
        <select
          className="input h-8 w-auto py-0 text-sm"
          value={view?.id}
          onChange={(e) => onViewChange(e.target.value)}
          title="Reading view"
        >
          {views.map((v) => (
            <option key={v.id} value={v.id}>
              {v.name}
            </option>
          ))}
        </select>
      </header>

      {/* The view */}
      <div className="relative min-h-0 flex-1">
        {ViewComponent ? (
          <ViewComponent
            song={song}
            transpose={transpose}
            preferFlats={flats}
            fontScale={fontScale}
            playback={{ playing, speed }}
            onReachEnd={() => setPlaying(false)}
            onChordClick={
              caps.transpose !== false
                ? (chord, anchor) => setPopover({ chord, anchor })
                : undefined
            }
          />
        ) : (
          <p className="p-8 text-center text-sm text-ink-500">No reading views registered.</p>
        )}
      </div>

      {/* Bottom control bar */}
      <footer
        className="flex items-center justify-center gap-2 border-t border-ink-200 px-3 py-2 dark:border-ink-800"
        style={{ paddingBottom: 'calc(var(--safe-bottom) + 0.25rem)' }}
      >
        {setlist && (
          <button
            className="btn-ghost p-2 disabled:opacity-30"
            onClick={setlist.onPrev}
            disabled={!setlist.onPrev}
            aria-label="Previous song"
          >
            <ChevronLeft size={20} />
          </button>
        )}

        {caps.transpose && (
          <ControlGroup label={transpose === 0 ? 'Key' : transpose > 0 ? `+${transpose}` : `${transpose}`}>
            <IconBtn onClick={() => setTranspose((t) => t - 1)} aria="Transpose down">
              <Minus size={16} />
            </IconBtn>
            <IconBtn onClick={() => setTranspose((t) => t + 1)} aria="Transpose up">
              <Plus size={16} />
            </IconBtn>
          </ControlGroup>
        )}

        {caps.zoom && (
          <ControlGroup label={`${Math.round(fontScale * 100)}%`}>
            <IconBtn onClick={() => setFontScale((s) => Math.max(0.6, +(s - 0.1).toFixed(2)))} aria="Zoom out">
              <ZoomOut size={16} />
            </IconBtn>
            <IconBtn onClick={() => setFontScale((s) => Math.min(3, +(s + 0.1).toFixed(2)))} aria="Zoom in">
              <ZoomIn size={16} />
            </IconBtn>
          </ControlGroup>
        )}

        {caps.autoScroll && (
          <>
            <button
              className="btn-primary px-3"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? 'Pause auto-scroll' : 'Start auto-scroll'}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <ControlGroup label={`${speed.toFixed(2)}×`}>
              <IconBtn onClick={() => setSpeed((s) => Math.max(0.25, +(s - 0.25).toFixed(2)))} aria="Slower">
                <Minus size={16} />
              </IconBtn>
              <IconBtn onClick={() => setSpeed((s) => Math.min(4, +(s + 0.25).toFixed(2)))} aria="Faster">
                <Plus size={16} />
              </IconBtn>
            </ControlGroup>
          </>
        )}

        {setlist && (
          <button
            className="btn-ghost p-2 disabled:opacity-30"
            onClick={setlist.onNext}
            disabled={!setlist.onNext}
            aria-label="Next song"
          >
            <ChevronRight size={20} />
          </button>
        )}
      </footer>

      {held && (
        <span
          className="pointer-events-none fixed right-3 z-50 h-2 w-2 animate-pulse rounded-full bg-green-500"
          style={{ top: 'calc(var(--safe-top) + 0.6rem)' }}
          title="Screen stays awake"
        />
      )}

      {popover && (
        <ChordPopover chord={popover.chord} anchor={popover.anchor} onClose={() => setPopover(null)} />
      )}
    </div>
  );
}

function ControlGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-ink-100 px-1.5 py-1 dark:bg-ink-800">
      {children}
      <span className="min-w-[2.5rem] text-center text-xs tabular-nums">{label}</span>
    </div>
  );
}

function IconBtn({
  onClick,
  aria,
  children,
}: {
  onClick: () => void;
  aria: string;
  children: React.ReactNode;
}) {
  return (
    <button
      className="rounded-lg p-1 hover:bg-ink-200 dark:hover:bg-ink-700"
      onClick={onClick}
      aria-label={aria}
    >
      {children}
    </button>
  );
}

/** Persist the user's preferred view id (used as the default next time). */
export function rememberView(id: string): void {
  void saveSettings({ performanceViewId: id });
}
