// Side-scrolling "highway" performance view. The song's chords (and the lyrics
// beneath them) lay out left-to-right on a beat grid. The view owns a playback
// origin (`playFrom`) and reads elapsed time off the shared metronome transport,
// so it can: scroll the whole song freely when stopped; set the start point by
// clicking the ruler; jump to any section; loop a section; count in 0/4/8 beats
// before motion; and switch into an edit mode that drags the chord onsets around
// (the same beat-grid editing as the end of a tag-beats session). Needs the
// song's beat-timing layer — if nothing is timed yet it points the user at the
// play-along beat tagger. Registers itself with the performance-view registry.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Eraser, Minus, MoveHorizontal, Pause, Pencil, Play, Plus, Repeat } from 'lucide-react';
import { saveSettings, updateSong, useSettings } from '@/db/repo';
import { defaultLabelForKind, parseBeat } from '@/lib/chordpro';
import {
  DEFAULT_TEMPO,
  DEFAULT_TS,
  buildTimeline,
  hasAnyBeats,
  quarterBeatsPerBar,
  type TimelineItem,
} from '@/lib/timeline';
import { transposeChordSymbol } from '@/lib/music';
import { registerView } from '@/lib/performance/registry';
import type { PerformanceViewProps } from '@/lib/performance/types';
import type { Beats, Section } from '@/types';

/** Lyric snippet shown under each timed chord: text from this chord's anchor up
 * to the next anchored chord on the same line. Anchorless events get nothing. */
function lyricSegments(items: TimelineItem[]): Map<string, string> {
  const map = new Map<string, string>();
  const byLine = new Map<string, { at: number }[]>();
  for (const item of items) {
    const idx = item.event.charIndex;
    if (idx === undefined) continue;
    const key = `${item.section.id}:${item.line.id}`;
    const arr = byLine.get(key) ?? [];
    arr.push({ at: idx });
    byLine.set(key, arr);
  }
  for (const item of items) {
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

function snapBeats(x: number): Beats {
  return parseBeat(String(Math.max(0, x))) ?? { n: Math.round(Math.max(0, x)), d: 1 };
}

function setEventBeat(sections: Section[], id: string, beat: Beats): Section[] {
  return sections.map((s) => ({
    ...s,
    lines: s.lines.map((l) => ({
      ...l,
      events: l.events.map((e) => (e.id === id ? { ...e, beat } : e)),
    })),
  }));
}

function clearEventBeat(sections: Section[], id: string): Section[] {
  return sections.map((s) => ({
    ...s,
    lines: s.lines.map((l) => ({
      ...l,
      events: l.events.map((e) => {
        if (e.id !== id) return e;
        const { beat: _b, ...rest } = e;
        void _b;
        return rest;
      }),
    })),
  }));
}

const PLAYHEAD_FRAC = 0.18;
const LYRIC_ROWS = 3;
const RULER_H = 28;
const COUNT_INS = [0, 4, 8];
const GRIDS = [
  { label: '1/4', den: 4 },
  { label: '1/8', den: 8 },
  { label: '1/16', den: 16 },
];

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
  const scrollRef = useRef<HTMLDivElement>(null);

  const [width, setWidth] = useState(0);
  const [nBars, setNBars] = useState(() => settings?.horizontalBars ?? 4);
  const [countIn, setCountIn] = useState(() => settings?.horizontalCountIn ?? 4);
  const [playFrom, setPlayFrom] = useState(0);
  const [looping, setLooping] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [grid, setGrid] = useState(16);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [countNum, setCountNum] = useState(0);
  const [drag, setDrag] = useState<{ id: string; absBeat: number } | null>(null);

  const defaultTempo = settings?.defaultTempo ?? DEFAULT_TEMPO;
  const defaultTs = settings?.defaultTimeSignature ?? DEFAULT_TS;
  const defaults = useMemo(
    () => ({ tempo: defaultTempo, timeSignature: defaultTs }),
    [defaultTempo, defaultTs],
  );
  const timeline = useMemo(() => buildTimeline(song, defaults), [song, defaults]);
  const segments = useMemo(() => lyricSegments(timeline.items), [timeline.items]);
  const timed = useMemo(() => hasAnyBeats(song), [song]);

  const refBarBeats = quarterBeatsPerBar(song.timeSignature ?? defaults.timeSignature);
  const beatsVisible = Math.max(1, nBars * refBarBeats);
  const pxPerBeat = width > 0 ? width / beatsVisible : 0;
  const playheadX = width * PLAYHEAD_FRAC;

  // The section that contains the play origin — the loop target.
  const loopSpan = useMemo(
    () =>
      timeline.sections.find(
        (s) => playFrom >= s.startBeat - 1e-6 && playFrom < s.startBeat + s.lengthBeats - 1e-6,
      ) ?? null,
    [timeline.sections, playFrom],
  );

  // Lane-pack lyrics across up to LYRIC_ROWS rows so close words never overlap.
  const lyricRows = useMemo(() => {
    const map = new Map<string, number>();
    if (pxPerBeat <= 0) return map;
    const charW = fontScale * 16 * 0.55;
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

  // Stable handles for the rAF loop so it doesn't restart on every tick.
  const transportRef = useRef(transport);
  transportRef.current = transport;
  const currentBeatRef = useRef(0);
  const playingRef = useRef(false);
  const endedRef = useRef(false);

  // Measure responsively.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  // Stop playback when entering edit mode.
  useEffect(() => {
    if (editMode && transportRef.current.playing) transportRef.current.toggle();
  }, [editMode]);

  // Playback loop. While playing (and not editing) it drives scrollLeft so the
  // current beat sits at the fixed playhead, after an optional count-in, looping
  // the active section if asked. While stopped, motion is the user's (free
  // native scroll); we only track the highlighted chord at the play origin.
  useEffect(() => {
    const tick = () => {
      const t = transportRef.current;
      const el = scrollRef.current;
      const playing = t.playing && !editMode;

      if (playing && !playingRef.current) endedRef.current = false;
      if (!playing && playingRef.current) setPlayFrom(clamp(currentBeatRef.current, 0, timeline.totalBeats));
      playingRef.current = playing;

      const pos = t.getPosition();
      let beat = playFrom;
      let counting = 0;

      if (playing) {
        if (pos < countIn) {
          counting = countIn - Math.floor(pos);
          beat = looping && loopSpan ? loopSpan.startBeat : playFrom;
        } else {
          const elapsed = pos - countIn;
          if (looping && loopSpan && loopSpan.lengthBeats > 0) {
            beat = loopSpan.startBeat + ((elapsed) % loopSpan.lengthBeats);
          } else {
            beat = playFrom + elapsed;
            if (beat >= timeline.totalBeats && !endedRef.current) {
              endedRef.current = true;
              if (t.playing) t.toggle();
            }
          }
        }
        if (el && pxPerBeat > 0) el.scrollLeft = Math.max(0, beat * pxPerBeat - playheadX);
      }

      currentBeatRef.current = beat;
      setCountNum((p) => (p === counting ? p : counting));

      let id: string | null = null;
      for (const item of timeline.items) {
        if (item.absBeat <= beat + 1e-6) id = item.id;
        else break;
      }
      setCurrentId((prev) => (prev === id ? prev : id));

      rafRef.current = requestAnimationFrame(tick);
    };
    const rafRef = { current: requestAnimationFrame(tick) as number | null };
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [pxPerBeat, playheadX, playFrom, countIn, looping, loopSpan, editMode, timeline]);

  function persistBars(n: number) {
    setNBars(n);
    void saveSettings({ horizontalBars: n });
  }
  function persistCountIn(n: number) {
    setCountIn(n);
    void saveSettings({ horizontalCountIn: n });
  }

  function beatFromClientX(clientX: number): number | null {
    const el = scrollRef.current;
    if (!el || pxPerBeat <= 0) return null;
    const rect = el.getBoundingClientRect();
    return (el.scrollLeft + (clientX - rect.left)) / pxPerBeat;
  }

  function setStartFromClientX(clientX: number) {
    const b = beatFromClientX(clientX);
    if (b === null) return;
    setPlayFrom(clamp(Math.round(b), 0, timeline.totalBeats));
  }

  function jumpTo(index: number) {
    const s = timeline.sections[index];
    if (!s) return;
    setPlayFrom(s.startBeat);
    setSelectedId(null);
    const el = scrollRef.current;
    if (el && pxPerBeat > 0) el.scrollLeft = Math.max(0, s.startBeat * pxPerBeat - playheadX);
  }

  // ── Edit-mode beat editing ──
  const step = 4 / grid;
  function commitItem(item: TimelineItem, absBeat: number) {
    const span = timeline.sections[item.sectionIndex];
    if (!span) return;
    const passStart = span.startBeat + item.repetition * span.passBeats;
    const rel = clamp(absBeat - passStart, 0, span.passBeats);
    const snapped = Math.round(rel / step) * step;
    void updateSong(song.id, { sections: setEventBeat(song.sections, item.id, snapBeats(snapped)) });
  }
  function nudge(dir: -1 | 1) {
    const item = timeline.items.find((i) => i.id === selectedId);
    if (item) commitItem(item, item.absBeat + dir * step);
  }
  function clearSelected() {
    if (!selectedId) return;
    void updateSong(song.id, { sections: clearEventBeat(song.sections, selectedId) });
    setSelectedId(null);
  }
  function onMarkerDown(e: React.PointerEvent, item: TimelineItem) {
    if (!editMode) return;
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(item.id);
    const move = (ev: PointerEvent) => {
      const b = beatFromClientX(ev.clientX);
      if (b !== null) setDrag({ id: item.id, absBeat: b });
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const b = beatFromClientX(ev.clientX);
      if (b !== null) commitItem(item, b);
      setDrag(null);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
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

  const playing = transport.playing && !editMode;
  const laneWidth = pxPerBeat > 0 ? timeline.totalBeats * pxPerBeat + width : 0;

  return (
    <div className="flex h-full flex-col bg-ink-50 dark:bg-ink-950">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-3 py-2 text-sm dark:border-ink-800">
        {!editMode ? (
          <>
            <button className="btn-primary px-3 py-1.5" onClick={() => transport.toggle()} aria-label={playing ? 'Pause' : 'Play'}>
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>

            <select
              className="input h-8 w-auto py-0"
              value=""
              onChange={(e) => {
                if (e.target.value !== '') jumpTo(Number(e.target.value));
                e.currentTarget.selectedIndex = 0;
              }}
              title="Jump to section"
            >
              <option value="">Jump to…</option>
              {timeline.sections.map((s, i) => (
                <option key={s.section.id + i} value={i}>
                  {s.section.label || defaultLabelForKind(s.section.kind)}
                </option>
              ))}
            </select>

            <button
              className={['btn-secondary px-2 py-1.5', looping ? 'ring-2 ring-accent' : ''].join(' ')}
              onClick={() => setLooping((v) => !v)}
              aria-pressed={looping}
              title={loopSpan ? `Loop ${loopSpan.section.label || defaultLabelForKind(loopSpan.section.kind)}` : 'Loop section'}
            >
              <Repeat size={15} /> Loop
            </button>

            <label className="flex items-center gap-1 text-ink-500">
              Count-in
              <select className="input h-8 w-auto py-0" value={countIn} onChange={(e) => persistCountIn(Number(e.target.value))}>
                {COUNT_INS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : (
          <>
            <span className="font-medium text-accent">Edit timing</span>
            <div className="flex items-center gap-1 rounded-xl bg-ink-100 p-1 dark:bg-ink-800">
              {GRIDS.map((g) => (
                <button
                  key={g.den}
                  onClick={() => setGrid(g.den)}
                  className={[
                    'rounded-lg px-2 py-0.5 font-medium',
                    grid === g.den ? 'bg-accent text-accent-fg' : 'hover:bg-ink-200 dark:hover:bg-ink-700',
                  ].join(' ')}
                >
                  {g.label}
                </button>
              ))}
            </div>
            <button className="btn-secondary px-2 py-1.5 disabled:opacity-40" disabled={!selectedId} onClick={() => nudge(-1)} aria-label="Nudge earlier">
              <Minus size={15} />
            </button>
            <button className="btn-secondary px-2 py-1.5 disabled:opacity-40" disabled={!selectedId} onClick={() => nudge(1)} aria-label="Nudge later">
              <Plus size={15} />
            </button>
            <button className="btn-secondary px-2 py-1.5 disabled:opacity-40" disabled={!selectedId} onClick={clearSelected} aria-label="Clear beat">
              <Eraser size={15} />
            </button>
          </>
        )}

        <div className="ml-auto flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-xl bg-ink-100 px-1.5 py-1 dark:bg-ink-800">
            <span className="px-1 text-xs text-ink-500">Bars</span>
            {[4, 8].map((n) => (
              <button
                key={n}
                onClick={() => persistBars(n)}
                className={[
                  'rounded-lg px-2 py-0.5 text-xs font-medium',
                  nBars === n ? 'bg-accent text-accent-fg' : 'hover:bg-ink-200 dark:hover:bg-ink-700',
                ].join(' ')}
              >
                {n}
              </button>
            ))}
          </div>
          <button
            className={['btn-secondary px-2 py-1.5', editMode ? 'ring-2 ring-accent' : ''].join(' ')}
            onClick={() => {
              setEditMode((v) => !v);
              setSelectedId(null);
            }}
            aria-pressed={editMode}
          >
            {editMode ? <Check size={15} /> : <Pencil size={15} />} {editMode ? 'Done' : 'Edit'}
          </button>
        </div>
      </div>

      {/* Stage */}
      <div className="relative flex-1 overflow-hidden">
        <div
          ref={scrollRef}
          className={['absolute inset-0 overflow-y-hidden', playing ? 'overflow-x-hidden' : 'overflow-x-auto'].join(' ')}
        >
          <div
            className="relative h-full"
            style={{ width: laneWidth || '100%' }}
            onClick={(e) => {
              if (playing) return;
              if (editMode) setSelectedId(null);
              else setStartFromClientX(e.clientX);
            }}
          >
            {/* Bar grid */}
            {pxPerBeat > 0 &&
              timeline.bars.map((bar) => (
                <div key={bar.number} className="absolute inset-y-0" style={{ left: bar.absBeat * pxPerBeat }}>
                  <div className="h-full w-px bg-ink-300 dark:bg-ink-700" />
                  <span className="absolute left-1 text-[10px] tabular-nums text-ink-400" style={{ top: RULER_H + 2 }}>
                    {bar.number}
                  </span>
                  {Array.from({ length: Math.max(0, Math.round(bar.beats) - 1) }, (_, k) => (
                    <div key={k} className="absolute inset-y-0 w-px bg-ink-200/70 dark:bg-ink-800/70" style={{ left: (k + 1) * pxPerBeat }} />
                  ))}
                </div>
              ))}

            {/* Start marker */}
            {pxPerBeat > 0 && (
              <div className="pointer-events-none absolute inset-y-0" style={{ left: playFrom * pxPerBeat }}>
                <div className="h-full w-0.5 bg-emerald-500/70" />
                <div className="absolute -left-1.5 h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-emerald-500" style={{ top: RULER_H }} />
              </div>
            )}

            {/* Chords + lyrics */}
            {pxPerBeat > 0 &&
              timeline.items.map((item) => {
                const dispAbs = drag?.id === item.id ? drag.absBeat : item.absBeat;
                const left = dispAbs * pxPerBeat;
                const sym = item.event.chord
                  ? transposeChordSymbol(item.event.chord, transpose, preferFlats)
                  : '·';
                const lyric = segments.get(item.event.id);
                const active = item.id === currentId;
                const selected = editMode && item.id === selectedId;
                const row = lyricRows.get(item.event.id) ?? 0;
                return (
                  <div key={`${item.id}-${item.repetition}`} className="absolute" style={{ left, top: '34%' }}>
                    <button
                      type="button"
                      onPointerDown={(e) => onMarkerDown(e, item)}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (editMode) return;
                        if (!item.event.chord || !onChordClick) return;
                        const r = e.currentTarget.getBoundingClientRect();
                        onChordClick(sym, { x: r.left + r.width / 2, y: r.bottom });
                      }}
                      className={[
                        'whitespace-nowrap rounded-lg px-2 py-1 font-semibold leading-none transition-colors',
                        editMode ? 'cursor-grab touch-none active:cursor-grabbing' : '',
                        selected
                          ? 'bg-accent text-accent-fg ring-2 ring-accent'
                          : active
                            ? 'bg-accent text-accent-fg'
                            : 'bg-ink-100 text-accent dark:bg-ink-800',
                      ].join(' ')}
                      style={{ fontSize: `${fontScale * 1.1}rem` }}
                    >
                      {sym}
                    </button>
                    {lyric && (
                      <div
                        className="pointer-events-none absolute whitespace-nowrap text-ink-700 dark:text-ink-300"
                        style={{ fontSize: `${fontScale}rem`, top: `${fontScale * 2 + row * fontScale * 1.35}rem` }}
                      >
                        {lyric}
                      </div>
                    )}
                  </div>
                );
              })}
          </div>
        </div>

        {/* Ruler (click to set start) — fixed, doesn't scroll */}
        {!editMode && (
          <div
            className="absolute inset-x-0 top-0 cursor-pointer border-b border-ink-200/70 bg-ink-100/60 backdrop-blur dark:border-ink-800/70 dark:bg-ink-900/60"
            style={{ height: RULER_H }}
            title="Click to set the start point"
            onClick={(e) => !playing && setStartFromClientX(e.clientX)}
          >
            <span className="px-2 text-[10px] leading-7 text-ink-400">click to set start ▸</span>
          </div>
        )}

        {/* Fixed playhead */}
        {playing && (
          <div className="pointer-events-none absolute inset-y-0 z-10" style={{ left: playheadX }}>
            <div className="h-full w-0.5 bg-accent" />
            <div className="absolute -left-1.5 top-2 h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-accent" />
          </div>
        )}

        {/* Count-in overlay */}
        {countNum > 0 && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
            <span className="text-8xl font-bold tabular-nums text-accent drop-shadow">{countNum}</span>
          </div>
        )}
      </div>
    </div>
  );
}

function clamp(x: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, x));
}

registerView({
  id: 'horizontal',
  name: 'Highway',
  description: 'Chords & lyrics scroll sideways on a beat grid, locked to the metronome.',
  icon: MoveHorizontal,
  capabilities: { zoom: true, transpose: true, beatClock: true },
  component: HorizontalView,
});
