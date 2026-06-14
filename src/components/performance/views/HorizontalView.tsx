// Side-scrolling "highway" performance view. The song's chords (and the lyrics
// beneath them) lay out left-to-right on a beat grid and scroll horizontally,
// locked to the shared metronome transport, with a fixed playhead near the left
// and the next few bars of upcoming material always visible. Needs the song's
// beat-timing layer — if nothing is timed yet it points the user at the
// play-along beat tagger. Registers itself with the performance-view registry.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MoveHorizontal } from 'lucide-react';
import { saveSettings, useSettings } from '@/db/repo';
import {
  DEFAULT_TEMPO,
  DEFAULT_TS,
  buildTimeline,
  hasAnyBeats,
  quarterBeatsPerBar,
} from '@/lib/timeline';
import { transposeChordSymbol } from '@/lib/music';
import { registerView } from '@/lib/performance/registry';
import type { PerformanceViewProps } from '@/lib/performance/types';

/** Lyric snippet shown under each timed chord: text from this chord's anchor up
 * to the next anchored chord on the same line. Anchorless events get nothing. */
function lyricSegments(song: ReturnType<typeof buildTimeline>['items']): Map<string, string> {
  const map = new Map<string, string>();
  const byLine = new Map<string, { id: string; at: number }[]>();
  for (const item of song) {
    const idx = item.event.charIndex;
    if (idx === undefined) continue;
    const key = `${item.section.id}:${item.line.id}`;
    const arr = byLine.get(key) ?? [];
    arr.push({ id: item.event.id, at: idx });
    byLine.set(key, arr);
  }
  for (const item of song) {
    const idx = item.event.charIndex;
    if (idx === undefined) continue;
    const lyric = item.line.lyric;
    const anchors = (byLine.get(`${item.section.id}:${item.line.id}`) ?? [])
      .filter((a) => a.at > idx)
      .map((a) => a.at);
    const end = anchors.length ? Math.min(...anchors) : lyric.length;
    map.set(item.event.id, lyric.slice(idx, end).trim());
  }
  return map;
}

const PLAYHEAD_FRAC = 0.18;
const LYRIC_ROWS = 3;

function HorizontalView({
  song,
  transpose,
  preferFlats,
  fontScale,
  transport,
  onChordClick,
}: PerformanceViewProps) {
  const navigate = useNavigate();
  const settings = useSettings();
  const laneRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);

  const [width, setWidth] = useState(0);
  const [nBars, setNBars] = useState(() => settings?.horizontalBars ?? 4);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const defaultTempo = settings?.defaultTempo ?? DEFAULT_TEMPO;
  const defaultTs = settings?.defaultTimeSignature ?? DEFAULT_TS;
  const defaults = useMemo(
    () => ({ tempo: defaultTempo, timeSignature: defaultTs }),
    [defaultTempo, defaultTs],
  );
  const timeline = useMemo(() => buildTimeline(song, defaults), [song, defaults]);
  const segments = useMemo(() => lyricSegments(timeline.items), [timeline.items]);
  const timed = useMemo(() => hasAnyBeats(song), [song]);

  // Quarter-beats across one screen → px per quarter-beat. Based on the song's
  // (or default) time signature so "N bars" is a steady musical window.
  const refBarBeats = quarterBeatsPerBar(song.timeSignature ?? defaults.timeSignature);
  const beatsVisible = Math.max(1, nBars * refBarBeats);
  const pxPerBeat = width > 0 ? width / beatsVisible : 0;
  const playheadX = width * PLAYHEAD_FRAC;

  // Stack lyrics across up to LYRIC_ROWS rows so closely-spaced words don't
  // collide: each segment goes on the lowest row whose previous word has ended
  // before this one begins, falling back to the soonest-free row when all are
  // busy. This naturally cycles back to row 0 as soon as there's space.
  const lyricRows = useMemo(() => {
    const map = new Map<string, number>();
    if (pxPerBeat <= 0) return map;
    const charW = fontScale * 16 * 0.55; // rough advance width per character
    const gap = 6;
    const rowRight = new Array(LYRIC_ROWS).fill(-Infinity);
    for (const item of timeline.items) {
      const text = segments.get(item.event.id);
      if (!text) continue;
      const left = item.absBeat * pxPerBeat;
      const wpx = text.length * charW + 8;
      let row = rowRight.findIndex((r) => r + gap <= left);
      if (row === -1) row = rowRight.indexOf(Math.min(...rowRight));
      rowRight[row] = left + wpx;
      map.set(item.event.id, row);
    }
    return map;
  }, [timeline.items, segments, pxPerBeat, fontScale]);

  // Measure the lane width responsively.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Scroll loop: translate the lane so the current transport beat sits at the
  // playhead. Set transform imperatively to avoid a re-render every frame; only
  // setState when the highlighted chord changes.
  useEffect(() => {
    const tick = () => {
      const beat = transport.getPosition();
      if (laneRef.current && pxPerBeat > 0) {
        laneRef.current.style.transform = `translateX(${playheadX - beat * pxPerBeat}px)`;
      }
      // Highlight the most recent chord at or before the playhead.
      let id: string | null = null;
      for (const item of timeline.items) {
        if (item.absBeat <= beat + 1e-6) id = item.id;
        else break;
      }
      setCurrentId((prev) => (prev === id ? prev : id));
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [transport, pxPerBeat, playheadX, timeline.items]);

  function changeBars(n: number) {
    setNBars(n);
    void saveSettings({ horizontalBars: n });
  }

  if (!timed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <MoveHorizontal size={40} className="text-ink-300 dark:text-ink-600" />
        <div>
          <p className="font-medium">This song isn’t timed yet</p>
          <p className="mt-1 text-sm text-ink-500">
            The scrolling view needs beats. Tag them by playing along once.
          </p>
        </div>
        <button className="btn-primary" onClick={() => navigate(`/songs/${song.id}/tag`)}>
          Tag beats
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapRef} className="relative h-full overflow-hidden bg-ink-50 dark:bg-ink-950">
      {/* Bars toggle */}
      <div className="absolute right-3 top-3 z-20 flex items-center gap-1 rounded-xl bg-ink-100/90 px-1.5 py-1 text-xs backdrop-blur dark:bg-ink-800/90">
        <span className="px-1 text-ink-500">Bars</span>
        {[4, 8].map((n) => (
          <button
            key={n}
            onClick={() => changeBars(n)}
            className={[
              'rounded-lg px-2 py-0.5 font-medium',
              nBars === n ? 'bg-accent text-accent-fg' : 'hover:bg-ink-200 dark:hover:bg-ink-700',
            ].join(' ')}
          >
            {n}
          </button>
        ))}
      </div>

      {/* Fixed playhead */}
      <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: playheadX }}>
        <div className="h-full w-0.5 bg-accent" />
        <div
          className="absolute -left-1.5 top-2 h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-accent"
        />
      </div>

      {/* Moving lane */}
      <div
        ref={laneRef}
        className="absolute inset-y-0 left-0 will-change-transform"
        style={{ width: pxPerBeat > 0 ? timeline.totalBeats * pxPerBeat + width : '100%' }}
      >
        {/* Bar grid */}
        {pxPerBeat > 0 &&
          timeline.bars.map((bar) => (
            <div key={`${bar.number}`} className="absolute inset-y-0" style={{ left: bar.absBeat * pxPerBeat }}>
              <div className="h-full w-px bg-ink-300 dark:bg-ink-700" />
              <span className="absolute left-1 top-1 text-[10px] tabular-nums text-ink-400">{bar.number}</span>
              {Array.from({ length: Math.max(0, Math.round(bar.beats) - 1) }, (_, k) => (
                <div
                  key={k}
                  className="absolute inset-y-0 w-px bg-ink-200/70 dark:bg-ink-800/70"
                  style={{ left: (k + 1) * pxPerBeat }}
                />
              ))}
            </div>
          ))}

        {/* Chords + lyrics */}
        {pxPerBeat > 0 &&
          timeline.items.map((item) => {
            const left = item.absBeat * pxPerBeat;
            const sym = item.event.chord
              ? transposeChordSymbol(item.event.chord, transpose, preferFlats)
              : '·';
            const lyric = segments.get(item.event.id);
            const active = item.id === currentId;
            const row = lyricRows.get(item.event.id) ?? 0;
            return (
              <div key={`${item.id}-${item.repetition}`} className="absolute" style={{ left, top: '34%' }}>
                <button
                  type="button"
                  onClick={(e) => {
                    if (!item.event.chord || !onChordClick) return;
                    const r = e.currentTarget.getBoundingClientRect();
                    onChordClick(sym, { x: r.left + r.width / 2, y: r.bottom });
                  }}
                  className={[
                    'whitespace-nowrap rounded-lg px-2 py-1 font-semibold leading-none transition-colors',
                    active
                      ? 'bg-accent text-accent-fg'
                      : 'bg-ink-100 text-accent dark:bg-ink-800',
                  ].join(' ')}
                  style={{ fontSize: `${fontScale * 1.1}rem` }}
                >
                  {sym}
                </button>
                {lyric && (
                  <div
                    className="absolute whitespace-nowrap text-ink-700 dark:text-ink-300"
                    style={{
                      fontSize: `${fontScale}rem`,
                      top: `${fontScale * 2 + row * fontScale * 1.35}rem`,
                    }}
                  >
                    {lyric}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
}

registerView({
  id: 'horizontal',
  name: 'Highway',
  description: 'Chords & lyrics scroll sideways on a beat grid, locked to the metronome.',
  icon: MoveHorizontal,
  capabilities: { zoom: true, transpose: true, beatClock: true },
  component: HorizontalView,
});
