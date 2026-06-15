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
  Sliders,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { ChordPopover } from '@/components/chords/ChordPopover';
import { PerformMetronome } from '@/components/tools/PerformMetronome';
import { MetronomeSettingsFields } from '@/components/tools/MetronomeSettingsFields';
import { useMetronome } from '@/components/tools/useMetronome';
import { useWakeLock } from '@/hooks/useWakeLock';
import { getView, listViews } from '@/lib/performance/registry';
import type { Transport } from '@/lib/performance/types';
import { saveSettings, useSettings } from '@/db/repo';
import { DEFAULT_METRONOME, clampTempo } from '@/lib/metronome';
import { preferFlatsForKey } from '@/lib/music';
import { getDifficulty, sortedDifficulties } from '@/lib/song';
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
  /** Per-entry difficulty variant chosen in the setlist. */
  difficultyId?: string;
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
  const [activeDifficultyId, setActiveDifficultyId] = useState<string | undefined>(
    setlist?.difficultyId ?? song.defaultDifficultyId,
  );
  const [fontScale, setFontScale] = useState(1.25);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [popover, setPopover] = useState<{ chord: string; anchor: { x: number; y: number } } | null>(
    null,
  );
  const [showMetroSettings, setShowMetroSettings] = useState(false);

  const { held } = useWakeLock(true);

  // Shared transport: one metronome instance drives both the audible click and
  // a beat-clock view's scroll. Seeded from the song; tempo nudgeable live.
  const settings = useSettings();
  const prefs = { ...DEFAULT_METRONOME, ...settings?.metronome };
  const [tempo, setTempo] = useState(() => clampTempo(song.tempo ?? prefs.tempo));
  const timeSignature = song.timeSignature ?? { beats: prefs.beatsPerMeasure, unit: 4 };
  const metro = useMetronome({
    tempo,
    beatsPerMeasure: timeSignature.beats,
    subdivision: 1,
    soundEnabled: prefs.soundEnabled,
    sound: prefs.sound,
    accentDownbeat: prefs.accentDownbeat,
    volume: prefs.volume,
  });

  const transport: Transport = {
    playing: metro.playing,
    tempo,
    timeSignature,
    getPosition: metro.getPosition,
    toggle: metro.toggle,
    setTempo: (bpm) => setTempo(clampTempo(bpm)),
  };

  // Reset per-song state when navigating a setlist.
  useEffect(() => {
    setTranspose(setlist?.transpose ?? 0);
    setActiveDifficultyId(setlist?.difficultyId ?? song.defaultDifficultyId);
    setPlaying(false);
    setTempo(clampTempo(song.tempo ?? prefs.tempo));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id, setlist?.transpose, setlist?.difficultyId]);

  const flats = preferFlatsForKey(song.key);
  const ViewComponent = view?.component;

  const difficulties = sortedDifficulties(song);
  const activeDiff = getDifficulty(song, activeDifficultyId);
  const sections = activeDiff?.sections ?? [];

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

        {/* Difficulty switcher (only when the song has more than one variant) */}
        {difficulties.length > 1 && (
          <select
            className="input h-8 w-auto py-0 text-sm"
            value={activeDiff?.id ?? ''}
            onChange={(e) => setActiveDifficultyId(e.target.value)}
            title="Difficulty"
          >
            {difficulties.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label ? `${d.label} (L${d.level})` : `Level ${d.level}`}
              </option>
            ))}
          </select>
        )}

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
            sections={sections}
            difficultyId={activeDiff?.id}
            transpose={transpose}
            preferFlats={flats}
            fontScale={fontScale}
            playback={{ playing, speed }}
            transport={transport}
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

        <PerformMetronome
          playing={metro.playing}
          tempo={tempo}
          pulse={metro.pulse}
          onToggle={metro.toggle}
          onTempoChange={(bpm) => setTempo(clampTempo(bpm))}
          flash={{
            enabled: prefs.flashEnabled,
            shape: prefs.flashShape,
            accentColor: prefs.flashAccentColor,
            beatColor: prefs.flashBeatColor,
          }}
        />

        <button
          className="btn-ghost p-2"
          onClick={() => setShowMetroSettings(true)}
          aria-label="Metronome settings"
          title="Metronome settings"
        >
          <Sliders size={18} />
        </button>

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

      {showMetroSettings && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center"
          onClick={() => setShowMetroSettings(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-ink-50 p-4 dark:bg-ink-900 sm:rounded-2xl"
            style={{ paddingBottom: 'calc(var(--safe-bottom) + 1rem)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Metronome settings</h2>
              <button
                className="btn-ghost p-2"
                onClick={() => setShowMetroSettings(false)}
                aria-label="Close metronome settings"
              >
                <X size={18} />
              </button>
            </div>
            <MetronomeSettingsFields
              value={prefs}
              onChange={(patch) => void saveSettings({ metronome: { ...prefs, ...patch } })}
            />
          </div>
        </div>
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
