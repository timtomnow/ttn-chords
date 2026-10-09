// Side-scrolling "highway" performance view. The song's chords (and the lyrics
// beneath them) lay out left-to-right on a beat grid. The view owns a playback
// origin (`playFrom`) and reads elapsed time off the shared metronome transport,
// so it can: scroll the whole song freely when stopped; set the start point by
// clicking the ruler; jump to any section; loop a section; count in 0–4 bars
// before motion (laid out as real bars on the road, so the bar you're starting
// on is visibly coming at you rather than announced by a number); sound the
// chords as well as the click; and switch into an edit mode that drags the chord
// onsets around (the same beat-grid editing as the end of a tag-beats session).
// Needs the
// song's beat-timing layer — if nothing is timed yet it points the user at the
// play-along beat tagger. Registers itself with the performance-view registry.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Eraser, Minus, MoveHorizontal, Pencil, Plus, Repeat, Trash2, Type } from 'lucide-react';
import { saveSettings, updateDifficultySections, useChordSounds, useSettings } from '@/db/repo';
import { defaultLabelForKind, parseBeat } from '@/lib/chordpro';
import {
  DEFAULT_TEMPO,
  DEFAULT_TS,
  beatsToNumber,
  buildTimeline,
  hasAnyBeats,
  lyricPackets,
  lyricSegments,
  quarterBeatsPerBar,
  type TimelineItem,
} from '@/lib/timeline';
import { occurrenceLabel } from '@/lib/song';
import { buildChordCues, chordHits, type PlayMap } from '@/lib/chordCues';
import { DEFAULT_CHORD_SOUNDS } from '@/lib/chordAudio';
import { useChordAudio } from '@/components/tools/useChordAudio';
import {
  addChordEvent,
  addLyricAnchor,
  deleteBarAt,
  insertBarAt,
  isBlankBar,
  setEventLyric,
  spanForBeat,
  splitLyricEvent,
} from '@/lib/beatEdit';
import { AddBeatInput, LyricEditor } from '@/components/inputs/InlineBeatInputs';
import { transposeChordSymbol } from '@/lib/music';
import { registerView } from '@/lib/performance/registry';
import type { PerformanceViewProps } from '@/lib/performance/types';
import type { Beats, Section } from '@/types';

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
/** Bar-number label sizes (font px + the height of the top highlight band). */
const BAR_SIZES = {
  sm: { font: 10, band: 16 },
  md: { font: 15, band: 22 },
  lg: { font: 22, band: 30 },
} as const;
const COUNT_IN_BARS = [0, 1, 2, 3, 4];
/** How far ahead of the playhead chord sounds are queued, in seconds. */
const CHORD_LOOKAHEAD_S = 0.2;
const GRIDS = [
  { label: '1/4', den: 4 },
  { label: '1/8', den: 8 },
  { label: '1/16', den: 16 },
];

function HorizontalView({
  song,
  sections,
  difficultyId,
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
  const [countInBars, setCountInBars] = useState(() => settings?.horizontalCountInBars ?? 1);
  const [playFrom, setPlayFrom] = useState(0);
  const [looping, setLooping] = useState(false);
  const [editMode, setEditMode] = useState(false);
  // What a stage click adds: nothing, a chord, or a lyric text packet.
  const [addKind, setAddKind] = useState<'none' | 'chord' | 'lyric'>('none');
  const [grid, setGrid] = useState(16);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  // Which beat of the count-in is sounding (0-based); -1 when not counting in.
  const [countIdx, setCountIdx] = useState(-1);
  const [currentBeatIdx, setCurrentBeatIdx] = useState(0);
  const [drag, setDrag] = useState<{ id: string; absBeat: number } | null>(null);
  // Open inline "type a chord / lyric" input. `beat` is the section-relative
  // onset; an absent lineId/charIndex means a beat-only chord (no lyric anchor).
  const [adding, setAdding] = useState<{
    kind: 'chord' | 'lyric';
    left: number;
    sectionIndex: number;
    beat: Beats;
    lineId?: string;
    charIndex?: number;
  } | null>(null);
  // Inline editor over an existing lyric packet (click a packet to edit/split).
  const [editingLyric, setEditingLyric] = useState<{ id: string; left: number; text: string } | null>(
    null,
  );

  const defaultTempo = settings?.defaultTempo ?? DEFAULT_TEMPO;
  const defaultTs = settings?.defaultTimeSignature ?? DEFAULT_TS;
  const defaults = useMemo(
    () => ({ tempo: defaultTempo, timeSignature: defaultTs }),
    [defaultTempo, defaultTs],
  );
  const timeline = useMemo(
    () => buildTimeline(song, defaults, difficultyId),
    [song, defaults, difficultyId],
  );
  // `packets` are the run-on text shown beneath chords (across line breaks);
  // `segments` are the per-line editable slices the inline lyric editor rewrites.
  const packets = useMemo(() => lyricPackets(timeline), [timeline]);
  const segments = useMemo(() => lyricSegments(timeline.items), [timeline.items]);
  const timed = useMemo(() => hasAnyBeats(song, difficultyId), [song, difficultyId]);

  // ── Chord sounds ──
  // The view knows what chord is due when, so it owns the scheduling; the engine
  // just makes the noise, on the transport's own AudioContext.
  const chordSounds = useChordSounds();
  const storedChordCfg = settings?.chordSounds;
  const chordCfg = useMemo(
    () => ({ ...DEFAULT_CHORD_SOUNDS, ...storedChordCfg }),
    [storedChordCfg],
  );
  const chordEngine = useChordAudio(chordCfg, chordSounds);
  const cues = useMemo(
    () => buildChordCues(timeline, transpose, preferFlats),
    [timeline, transpose, preferFlats],
  );

  const refBarBeats = quarterBeatsPerBar(song.timeSignature ?? defaults.timeSignature);
  // Count-in is authored in whole bars; the transport clock runs in beats, so
  // convert. Whole bars guarantee the downbeat accent lands on beat 1.
  const countIn = countInBars * refBarBeats;
  const beatsVisible = Math.max(1, nBars * refBarBeats);
  const pxPerBeat = width > 0 ? width / beatsVisible : 0;
  const playheadX = width * PLAYHEAD_FRAC;
  // The lane is padded on the left by the count-in (which gets real estate on
  // the road, so you watch the target bar come to you instead of reading a
  // number off an overlay) PLUS the playhead's own offset. Without that second
  // part `scrollLeft` clamps at 0 near the start of the song and the playhead
  // stops agreeing with the beat under it. `xOf` maps a song beat to its x on
  // the lane; `beatFromClientX` is its inverse.
  const leadPx = playheadX + countIn * pxPerBeat;
  const xOf = (absBeat: number) => leadPx + absBeat * pxPerBeat;

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
      const text = packets.get(item.event.id);
      if (!text) continue;
      const left = item.absBeat * pxPerBeat;
      const wpx = text.length * charW + 8;
      let row = rowRight.findIndex((r) => r + gap <= left);
      if (row === -1) row = rowRight.indexOf(Math.min(...rowRight));
      rowRight[row] = left + wpx;
      map.set(item.event.id, row);
    }
    return map;
  }, [timeline.items, packets, pxPerBeat, fontScale]);

  // Stable handles for the rAF loop so it doesn't restart on every tick.
  const transportRef = useRef(transport);
  transportRef.current = transport;
  const currentBeatRef = useRef(0);
  const playingRef = useRef(false);
  const endedRef = useRef(false);
  // The bar-aligned beat this run actually started from (the snapped `playFrom`).
  // A ref, not state, so chord scheduling never reads a stale origin on the frame
  // the snap happens.
  const originRef = useRef(0);
  // How far ahead chord sounds have been queued, as a playback position.
  const chordCursorRef = useRef(-1);
  // Whether the last frame was still inside the count-in.
  const countingRef = useRef(false);

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

      if (playing && !playingRef.current) {
        endedRef.current = false;
        chordCursorRef.current = -1;
        // Snap the start back to the top of the bar it sits in (always backwards)
        // so the metronome's downbeat accent lands on beat 1 — never mid-bar.
        let barStart = 0;
        for (const bar of timeline.bars) {
          if (bar.absBeat <= playFrom + 1e-6) barStart = bar.absBeat;
          else break;
        }
        originRef.current = barStart;
        if (Math.abs(barStart - playFrom) > 1e-6) {
          setPlayFrom(barStart);
          currentBeatRef.current = barStart;
        }
      }
      if (!playing && playingRef.current) {
        chordEngine.stopAll();
        // Pausing leaves the play head where it stopped — but stopping *during*
        // the count-in never moves the start point: you hadn't got there yet.
        if (!countingRef.current) {
          setPlayFrom(clamp(currentBeatRef.current, 0, timeline.totalBeats));
        }
      }
      if (!playing) originRef.current = playFrom;
      playingRef.current = playing;

      // Adopt the transport's context as soon as it has one — it only builds it
      // on the first tap of Play — so recordings get decoded before the beat
      // that needs them. Cheap: a no-op unless the context actually changed.
      if (chordCfg.enabled) chordEngine.setContext(t.getContext());

      const pos = t.getPosition();
      const origin = looping && loopSpan ? loopSpan.startBeat : originRef.current;
      let beat = playFrom;
      let counting = -1;

      if (playing) {
        if (pos < countIn) {
          // Roll in from `countIn` beats BEFORE the origin so the count-in bars
          // scroll past and the start bar arrives at the playhead exactly as the
          // count ends. `xOf` keeps that negative stretch on-canvas.
          counting = Math.min(Math.round(countIn) - 1, Math.floor(pos));
          beat = origin - (countIn - pos);
        } else {
          const elapsed = pos - countIn;
          if (looping && loopSpan && loopSpan.lengthBeats > 0) {
            beat = loopSpan.startBeat + ((elapsed) % loopSpan.lengthBeats);
          } else {
            beat = origin + elapsed;
            if (beat >= timeline.totalBeats && !endedRef.current) {
              endedRef.current = true;
              if (t.playing) t.toggle();
            }
          }
        }
        if (el && pxPerBeat > 0) {
          // xOf(beat) - playheadX, with the lead-in padding cancelling out.
          el.scrollLeft = Math.max(0, (beat + countIn) * pxPerBeat);
        }

        // Chord sounds: queue everything falling inside a short lookahead window
        // so each hit is placed on the audio clock rather than fired by whichever
        // frame happened to notice it. Tempo changes only affect what hasn't been
        // queued yet, which is why the window stays short.
        if (chordCfg.enabled) {
          const map: PlayMap = {
            countIn,
            from: originRef.current,
            totalBeats: timeline.totalBeats,
            loop:
              looping && loopSpan
                ? { startBeat: loopSpan.startBeat, lengthBeats: loopSpan.lengthBeats }
                : undefined,
          };
          const until = pos + (CHORD_LOOKAHEAD_S * t.tempo) / 60;
          // Never reach further back than half a beat: if scheduling was off for
          // a while (chord sounds toggled mid-song), resume from now instead of
          // firing everything that was missed in one burst.
          const from = Math.max(chordCursorRef.current, pos - 0.5);
          for (const hit of chordHits(cues, map, chordCfg.mode, from, until)) {
            chordEngine.play(hit.symbol, t.timeAtBeat(hit.posBeat), hit.sustain);
          }
          chordCursorRef.current = until;
        }
      }

      currentBeatRef.current = beat;
      countingRef.current = counting >= 0;
      setCountIdx((p) => (p === counting ? p : counting));
      const bi = Math.floor(beat + 1e-6);
      setCurrentBeatIdx((p) => (p === bi ? p : bi));

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
  }, [
    pxPerBeat,
    playheadX,
    playFrom,
    countIn,
    looping,
    loopSpan,
    editMode,
    timeline,
    cues,
    chordCfg.enabled,
    chordCfg.mode,
    chordEngine,
  ]);

  // Never leave a chord ringing behind the view.
  useEffect(() => () => chordEngine.stopAll(), [chordEngine]);

  function persistBars(n: number) {
    setNBars(n);
    void saveSettings({ horizontalBars: n });
  }
  function persistCountInBars(n: number) {
    setCountInBars(n);
    void saveSettings({ horizontalCountInBars: n });
  }

  function beatFromClientX(clientX: number): number | null {
    const el = scrollRef.current;
    if (!el || pxPerBeat <= 0) return null;
    const rect = el.getBoundingClientRect();
    return (el.scrollLeft + (clientX - rect.left) - leadPx) / pxPerBeat;
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
    if (el && pxPerBeat > 0) el.scrollLeft = Math.max(0, xOf(s.startBeat) - playheadX);
  }

  // ── Edit-mode beat editing ──
  // All edits read from the active difficulty's `sections` (prop) and write back
  // to that same variant, never clobbering the others.
  const writeSections = (next: Section[]) =>
    void updateDifficultySections(song.id, difficultyId, next);
  const step = 4 / grid;
  function commitItem(item: TimelineItem, absBeat: number) {
    // Span lookup is by performance-order slot; the WRITE below is by pool index
    // (item.sectionIndex), so editing one occurrence retimes them all.
    const span = timeline.sections[item.slotIndex];
    if (!span) return;
    const passStart = span.startBeat + item.repetition * span.passBeats;
    const rel = clamp(absBeat - passStart, 0, span.passBeats);
    const snapped = Math.round(rel / step) * step;
    writeSections(setEventBeat(sections, item.id, snapBeats(snapped)));
  }
  function nudge(dir: -1 | 1) {
    const item = timeline.items.find((i) => i.id === selectedId);
    if (item) commitItem(item, item.absBeat + dir * step);
  }
  function clearSelected() {
    if (!selectedId) return;
    writeSections(clearEventBeat(sections, selectedId));
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

  // ── Edit-mode bar + chord editing (shared logic in lib/beatEdit) ──
  function doInsertBar(absBeat: number) {
    writeSections(insertBarAt(sections, timeline, absBeat));
    setSelectedId(null);
    setAdding(null);
  }
  function doDeleteBar(absBeat: number) {
    writeSections(deleteBarAt(sections, timeline, absBeat));
    setSelectedId(null);
    setAdding(null);
  }

  /** Snap an absolute beat to the grid, expressed relative to one pass of a slot. */
  function snappedRel(slotIndex: number, repetition: number, absBeat: number): Beats {
    const span = timeline.sections[slotIndex];
    const passStart = span.startBeat + repetition * span.passBeats;
    const rel = clamp(absBeat - passStart, 0, span.passBeats);
    return snapBeats(Math.round(rel / step) * step);
  }

  /** Open the inline chord/lyric input from a click, given the resolved placement. */
  function openAdd(p: {
    kind: 'chord' | 'lyric';
    /** Pool index — where the new event is written. */
    sectionIndex: number;
    /** Performance-order index — where on the timeline the input appears. */
    slotIndex: number;
    repetition: number;
    beat: Beats;
    lineId?: string;
    charIndex?: number;
  }) {
    const span = timeline.sections[p.slotIndex];
    const abs = span.startBeat + p.repetition * span.passBeats + beatsToNumber(p.beat);
    setSelectedId(null);
    setEditingLyric(null);
    setAdding({
      kind: p.kind,
      left: xOf(abs),
      sectionIndex: p.sectionIndex,
      beat: p.beat,
      lineId: p.lineId,
      charIndex: p.charIndex,
    });
  }

  /** Click on empty grid in add-mode → a chord or lyric anchor at that beat. */
  function onStageAdd(clientX: number, kind: 'chord' | 'lyric') {
    const absBeat = beatFromClientX(clientX);
    if (absBeat === null) return;
    const span = spanForBeat(timeline, absBeat);
    if (!span) return;
    const rep = clamp(
      Math.floor((absBeat - span.startBeat) / span.passBeats),
      0,
      Math.max(0, Math.round(span.lengthBeats / span.passBeats) - 1),
    );
    openAdd({
      kind,
      sectionIndex: span.sectionIndex,
      slotIndex: span.slotIndex,
      repetition: rep,
      beat: snappedRel(span.slotIndex, rep, absBeat),
    });
  }

  /** Click a lyric character in chord-add mode → a chord anchored over that letter. */
  function onLyricCharClick(clientX: number, item: TimelineItem, charOffset: number) {
    const absBeat = beatFromClientX(clientX);
    if (absBeat === null) return;
    openAdd({
      kind: 'chord',
      sectionIndex: item.sectionIndex,
      slotIndex: item.slotIndex,
      repetition: item.repetition,
      beat: snappedRel(item.slotIndex, item.repetition, absBeat),
      lineId: item.line.id,
      charIndex: (item.event.charIndex ?? 0) + charOffset,
    });
  }

  function commitAdd(text: string) {
    if (!adding) return;
    writeSections(
      adding.kind === 'lyric'
        ? addLyricAnchor(sections, { sectionIndex: adding.sectionIndex, beat: adding.beat, text })
        : addChordEvent(sections, {
            sectionIndex: adding.sectionIndex,
            chord: text,
            beat: adding.beat,
            lineId: adding.lineId,
            charIndex: adding.charIndex,
          }),
    );
    setAdding(null);
  }

  // ── Edit an existing lyric packet ──
  function openLyricEdit(item: TimelineItem) {
    setSelectedId(null);
    setAdding(null);
    setEditingLyric({ id: item.id, left: xOf(item.absBeat), text: segments.get(item.event.id) ?? '' });
  }
  function commitLyricEdit(text: string) {
    if (!editingLyric) return;
    writeSections(setEventLyric(sections, editingLyric.id, text));
    setEditingLyric(null);
  }
  /** Split the packet at the caret: the second half becomes a chord-less anchor
   * one grid step later so it can be dragged onto its own beat. */
  function splitLyricEdit(caret: number, text: string) {
    if (!editingLyric) return;
    const item = timeline.items.find((i) => i.id === editingLyric.id);
    if (!item) return;
    const span = timeline.sections[item.slotIndex];
    const passStart = span.startBeat + item.repetition * span.passBeats;
    const rel = clamp(item.absBeat - passStart + step, 0, span.passBeats);
    writeSections(splitLyricEvent(sections, editingLyric.id, caret, text, snapBeats(rel)));
    setEditingLyric(null);
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
        <button
          className="btn-primary"
          onClick={() =>
            navigate(
              `/songs/${song.id}/tag${difficultyId ? `?d=${encodeURIComponent(difficultyId)}` : ''}`,
            )
          }
        >
          Tag beats
        </button>
      </div>
    );
  }

  const playing = transport.playing && !editMode;
  const laneWidth = pxPerBeat > 0 ? xOf(timeline.totalBeats) + width : 0;

  // Bar-number sizing + which bar/beat is current (for the tracking highlight).
  // Plain computations (this is past the early `!timed` return, so no hooks here).
  const barSize = BAR_SIZES[settings?.horizontalBarSize ?? 'sm'];
  // Where the count-in lane sits: immediately before whatever playback starts
  // from (the loop head when looping, otherwise the start marker).
  const countOrigin = looping && loopSpan ? loopSpan.startBeat : playFrom;
  const countCells = Math.max(0, Math.round(countIn));
  const beatsPerBarLabel = Math.max(1, Math.round(refBarBeats));
  let currentBarNumber = 0;
  for (const bar of timeline.bars) {
    if (currentBeatIdx + 1e-6 >= bar.absBeat) currentBarNumber = bar.number;
    else break;
  }

  return (
    <div className="flex h-full flex-col bg-ink-50 dark:bg-ink-950">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-ink-200 px-3 py-2 text-sm dark:border-ink-800">
        {!editMode ? (
          <>
            {/* Play/pause lives in the performance header now (big & centered). */}
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
                <option key={`${s.entryId}#${i}`} value={i}>
                  {occurrenceLabel(timeline.sections, i)}
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
              <select className="input h-8 w-auto py-0" value={countInBars} onChange={(e) => persistCountInBars(Number(e.target.value))}>
                {COUNT_IN_BARS.map((n) => (
                  <option key={n} value={n}>
                    {n === 0 ? 'Off' : n === 1 ? '1 bar' : `${n} bars`}
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
            <button
              className={['btn-secondary px-2 py-1.5', addKind === 'chord' ? 'ring-2 ring-accent' : ''].join(' ')}
              onClick={() => {
                setAddKind((k) => (k === 'chord' ? 'none' : 'chord'));
                setAdding(null);
                setEditingLyric(null);
                setSelectedId(null);
              }}
              aria-pressed={addKind === 'chord'}
              title="Click the grid or a lyric letter to add a chord"
            >
              <Plus size={15} /> Chord
            </button>
            <button
              className={['btn-secondary px-2 py-1.5', addKind === 'lyric' ? 'ring-2 ring-accent' : ''].join(' ')}
              onClick={() => {
                setAddKind((k) => (k === 'lyric' ? 'none' : 'lyric'));
                setAdding(null);
                setEditingLyric(null);
                setSelectedId(null);
              }}
              aria-pressed={addKind === 'lyric'}
              title="Click the grid to add a lyric on its own beat"
            >
              <Type size={15} /> Lyric
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
              setAddKind('none');
              setAdding(null);
              setEditingLyric(null);
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
              if (editMode && addKind !== 'none') onStageAdd(e.clientX, addKind);
              else if (editMode) {
                setSelectedId(null);
                setEditingLyric(null);
              } else setStartFromClientX(e.clientX);
            }}
          >
            {/* Current-beat tracking highlight — the WHOLE column, top to bottom,
                so the eye tracks one stripe down the road instead of a thin band
                up at the bar numbers. Chords and lyrics carry their own opaque
                chips (below) so they stay readable through the wash. */}
            {pxPerBeat > 0 && (
              <div
                className="pointer-events-none absolute z-[1] bg-accent/20 ring-1 ring-inset ring-accent/40"
                style={{
                  left: xOf(currentBeatIdx),
                  width: pxPerBeat,
                  top: RULER_H,
                  bottom: 0,
                }}
              >
                {/* A denser cap at the bar-number band keeps the beat readable
                    against the ruler even on a pale accent. */}
                <div className="w-full bg-accent/30" style={{ height: barSize.band }} />
              </div>
            )}

            {/* Bar grid */}
            {pxPerBeat > 0 &&
              timeline.bars.map((bar) => (
                <div key={bar.number} className="absolute inset-y-0 z-[2]" style={{ left: xOf(bar.absBeat) }}>
                  <div className="h-full w-px bg-ink-300 dark:bg-ink-700" />
                  <span
                    className={[
                      'absolute left-1 rounded px-1 font-medium tabular-nums leading-none',
                      bar.number === currentBarNumber
                        ? 'bg-accent font-bold text-accent-fg'
                        : 'text-ink-400',
                    ].join(' ')}
                    style={{ top: RULER_H + 2, fontSize: barSize.font }}
                  >
                    {bar.number}
                  </span>
                  {Array.from({ length: Math.max(0, Math.round(bar.beats) - 1) }, (_, k) => (
                    <div key={k} className="absolute inset-y-0 w-px bg-ink-200/70 dark:bg-ink-800/70" style={{ left: (k + 1) * pxPerBeat }} />
                  ))}
                  {/* Insert a blank bar before this one; delete it if it's empty. */}
                  {editMode && (
                    <>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          doInsertBar(bar.absBeat);
                        }}
                        className="absolute bottom-2 z-20 rounded-full bg-ink-100 p-1 text-ink-500 hover:bg-accent hover:text-accent-fg dark:bg-ink-800"
                        style={{ left: bar.absBeat < 1e-6 ? 2 : -10 }}
                        title="Insert a bar here"
                        aria-label="Insert a bar here"
                      >
                        <Plus size={12} />
                      </button>
                      {isBlankBar(timeline, bar) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            doDeleteBar(bar.absBeat);
                          }}
                          className="absolute top-1/2 z-20 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-100 p-1.5 text-ink-500 hover:bg-rose-500 hover:text-white dark:bg-ink-800"
                          style={{ left: (bar.beats / 2) * pxPerBeat }}
                          title="Delete this empty bar"
                          aria-label="Delete this empty bar"
                        >
                          <Trash2 size={14} />
                        </button>
                      )}
                    </>
                  )}
                </div>
              ))}

            {/* Count-in lane. Drawn ON the road, in the stretch immediately
                before the start point, so the bar you're counting into is
                visibly approaching. It masks whatever song content sits under
                that stretch (you're not playing it yet) and lights one cell per
                count. */}
            {pxPerBeat > 0 && countIdx >= 0 && countCells > 0 && (
              <div
                className="pointer-events-none absolute z-[3] overflow-hidden rounded-l-lg border-y border-l border-accent/50 bg-ink-100 dark:bg-ink-900"
                style={{
                  left: xOf(countOrigin - countIn),
                  width: countIn * pxPerBeat,
                  top: RULER_H,
                  bottom: 0,
                }}
              >
                <span className="absolute left-2 top-1 text-[10px] font-semibold uppercase tracking-wide text-ink-400">
                  Count-in
                </span>
                {Array.from({ length: countCells }, (_, i) => {
                  const done = i < countIdx;
                  const active = i === countIdx;
                  const downbeat = i % beatsPerBarLabel === 0;
                  return (
                    <div
                      key={i}
                      className={[
                        'absolute inset-y-0 flex items-center justify-center border-l',
                        downbeat ? 'border-accent/50' : 'border-ink-300/70 dark:border-ink-700/70',
                        active ? 'bg-accent/30' : done ? 'bg-accent/10' : '',
                      ].join(' ')}
                      style={{ left: i * pxPerBeat, width: pxPerBeat }}
                    >
                      <span
                        className={[
                          'font-bold tabular-nums leading-none transition-opacity',
                          active ? 'text-accent opacity-100' : 'text-ink-400 opacity-60',
                        ].join(' ')}
                        style={{ fontSize: `${fontScale * (active ? 2.2 : 1.5)}rem` }}
                      >
                        {(i % beatsPerBarLabel) + 1}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Start marker */}
            {pxPerBeat > 0 && (
              <div className="pointer-events-none absolute inset-y-0" style={{ left: xOf(playFrom) }}>
                <div className="h-full w-0.5 bg-emerald-500/70" />
                <div className="absolute -left-1.5 h-0 w-0 border-x-[6px] border-t-[8px] border-x-transparent border-t-emerald-500" style={{ top: RULER_H }} />
              </div>
            )}

            {/* Chords + lyrics */}
            {pxPerBeat > 0 &&
              timeline.items.map((item) => {
                const dispAbs = drag?.id === item.id ? drag.absBeat : item.absBeat;
                const left = xOf(dispAbs);
                const sym = item.event.chord
                  ? transposeChordSymbol(item.event.chord, transpose + item.transpose, preferFlats)
                  : '·';
                // A placeholder onset (no chord, or a bare ".") isn't a real
                // chord — render it muted so it reads as a faint timing dot.
                const marker = !item.event.chord || item.event.chord === '.';
                // Add-chord mode maps per-character clicks to a charIndex within
                // the event's own line, so it must use the per-line `segments`;
                // normal display shows the run-on `packets` (across line breaks).
                const lyric =
                  editMode && addKind === 'chord'
                    ? segments.get(item.event.id)
                    : packets.get(item.event.id);
                const active = item.id === currentId;
                const selected = editMode && item.id === selectedId;
                const row = lyricRows.get(item.event.id) ?? 0;
                return (
                  <div key={item.key} className="absolute" style={{ left, top: '34%' }}>
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
                        'whitespace-nowrap rounded-lg px-2 py-1 leading-none transition-colors',
                        marker ? 'font-normal' : 'font-semibold',
                        editMode ? 'cursor-grab touch-none active:cursor-grabbing' : '',
                        selected
                          ? 'bg-accent text-accent-fg ring-2 ring-accent'
                          : active
                            ? marker
                              ? 'bg-ink-200 text-ink-400 dark:bg-ink-800 dark:text-ink-500'
                              : 'bg-accent text-accent-fg'
                            : marker
                              ? 'bg-ink-100/60 text-ink-400 dark:bg-ink-800/50 dark:text-ink-600'
                              : 'bg-ink-100 text-accent dark:bg-ink-800',
                      ].join(' ')}
                      style={{ fontSize: `${fontScale * 1.1}rem` }}
                    >
                      {sym}
                    </button>
                    {lyric && editingLyric?.id !== item.id && (
                      <div
                        className={[
                          // Own opaque chip: the current-beat column washes accent
                          // over the full height, and words must stay readable
                          // through it.
                          'absolute whitespace-nowrap rounded bg-ink-50/90 px-1 text-ink-700 dark:bg-ink-950/90 dark:text-ink-300',
                          editMode ? '' : 'pointer-events-none',
                          editMode && addKind !== 'chord'
                            ? 'cursor-text rounded hover:bg-accent/15'
                            : '',
                        ].join(' ')}
                        style={{ fontSize: `${fontScale}rem`, top: `${fontScale * 2 + row * fontScale * 1.35}rem` }}
                        onClick={
                          editMode && addKind !== 'chord'
                            ? (e) => {
                                e.stopPropagation();
                                openLyricEdit(item);
                              }
                            : undefined
                        }
                      >
                        {editMode && addKind === 'chord'
                          ? Array.from(lyric).map((ch, ci) => (
                              <span
                                key={ci}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onLyricCharClick(e.clientX, item, ci);
                                }}
                                className="cursor-pointer rounded hover:bg-accent hover:text-accent-fg"
                              >
                                {ch}
                              </span>
                            ))
                          : lyric}
                      </div>
                    )}
                  </div>
                );
              })}

            {/* Inline "type a chord / lyric" input opened by an add-mode click. */}
            {adding && (
              <div className="absolute z-30" style={{ left: adding.left, top: '34%' }}>
                <AddBeatInput
                  kind={adding.kind}
                  onCommit={commitAdd}
                  onCancel={() => setAdding(null)}
                />
              </div>
            )}

            {/* Inline editor over an existing lyric packet (edit / split). */}
            {editingLyric && (
              <div className="absolute z-30" style={{ left: editingLyric.left, top: '34%' }}>
                <LyricEditor
                  initial={editingLyric.text}
                  onCommit={commitLyricEdit}
                  onSplit={splitLyricEdit}
                  onCancel={() => setEditingLyric(null)}
                />
              </div>
            )}
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

        {/* Count-in badge. The count itself lives on the road (above); this is
            just a corner readout so the number is legible however narrow the
            bars are zoomed. */}
        {countIdx >= 0 && (
          <div className="pointer-events-none absolute right-3 z-20 flex items-center gap-2 rounded-full bg-accent px-3 py-1.5 text-accent-fg shadow-lg" style={{ top: RULER_H + 8 }}>
            <span className="text-[10px] font-semibold uppercase tracking-wide opacity-80">
              Count-in
            </span>
            <span className="text-2xl font-bold tabular-nums leading-none">
              {(countIdx % beatsPerBarLabel) + 1}
            </span>
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
