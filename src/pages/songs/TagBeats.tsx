// Play-along beat tagging. The metronome plays a count-in then the song's
// chords are presented one at a time; you tap a single button (or Space) on the
// beat each chord lands. Each tap reads the transport's continuous position,
// and on finish the absolute onsets are converted to section-relative beats
// (snapped to a 1/16 grid) and written to the song. A fine-tune editor then
// lets you drag each chord on a beat grid before saving.
//
// This is the easy way to put the beat-timing layer (ChordEvent.beat) onto a
// song without hand-typing @beat in ChordPro; it powers the Highway view.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Eraser, Minus, Plus, RotateCcw } from 'lucide-react';
import { updateSong, useSettings, useSong } from '@/db/repo';
import { useMetronome } from '@/components/tools/useMetronome';
import { parseBeat } from '@/lib/chordpro';
import { clampTempo } from '@/lib/metronome';
import { preferFlatsForKey, transposeChordSymbol } from '@/lib/music';
import {
  DEFAULT_TEMPO,
  DEFAULT_TS,
  buildTimeline,
  quarterBeatsPerBar,
} from '@/lib/timeline';
import type { Beats, Section, Song } from '@/types';

type Phase = 'idle' | 'countin' | 'recording' | 'review';

/** Flattened, ordered list of every chord event to tag. */
type TagItem = {
  eventId: string;
  chord: string;
  sectionIndex: number;
  /** Lyric context for display (the word/segment under this chord). */
  context: string;
};

const GRIDS = [
  { label: '1/4', den: 4 },
  { label: '1/8', den: 8 },
  { label: '1/16', den: 16 },
] as const;
const PX_PER_BEAT = 56;

function snap(x: number): Beats {
  return parseBeat(String(Math.max(0, x))) ?? { n: Math.round(Math.max(0, x)), d: 1 };
}

export function TagBeats() {
  const { id } = useParams<{ id: string }>();
  const song = useSong(id);
  const navigate = useNavigate();

  if (song === undefined) return <p className="text-sm text-ink-500">Loading…</p>;
  if (song === null) {
    return (
      <div>
        <button className="btn-ghost mb-4" onClick={() => navigate('/songs')}>
          <ArrowLeft size={16} /> Songs
        </button>
        <p className="text-sm text-ink-500">Song not found.</p>
      </div>
    );
  }
  return <Tagger key={song.id} song={song} />;
}

function Tagger({ song }: { song: Song }) {
  const navigate = useNavigate();
  const settings = useSettings();
  const flats = preferFlatsForKey(song.key);

  const defaults = {
    tempo: settings?.defaultTempo ?? DEFAULT_TEMPO,
    timeSignature: settings?.defaultTimeSignature ?? DEFAULT_TS,
  };
  const ts = song.timeSignature ?? defaults.timeSignature;
  const barBeats = quarterBeatsPerBar(ts);

  // Ordered list of chord events to tag, with lyric context for display.
  const items = useMemo<TagItem[]>(() => {
    const out: TagItem[] = [];
    song.sections.forEach((section, sectionIndex) => {
      for (const line of section.lines) {
        const anchors = line.events
          .filter((e) => e.charIndex !== undefined)
          .map((e) => e.charIndex as number)
          .sort((a, b) => a - b);
        for (const e of line.events) {
          let context = '';
          if (e.charIndex !== undefined) {
            const next = anchors.find((a) => a > (e.charIndex as number));
            context = line.lyric.slice(e.charIndex, next ?? line.lyric.length).trim();
          }
          out.push({ eventId: e.id, chord: e.chord, sectionIndex, context });
        }
      }
    });
    return out;
  }, [song.sections]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [tempo, setTempo] = useState(() => clampTempo(song.tempo ?? defaults.tempo));
  const [index, setIndex] = useState(0);
  const [posBeat, setPosBeat] = useState(0);
  const [working, setWorking] = useState<Section[]>(song.sections);
  const [grid, setGrid] = useState(16);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const recorded = useRef<(number | undefined)[]>([]);

  const metro = useMetronome({
    tempo,
    beatsPerMeasure: ts.beats,
    subdivision: 1,
    soundEnabled: settings?.metronome?.soundEnabled ?? true,
    sound: settings?.metronome?.sound ?? 'beep',
    accentDownbeat: settings?.metronome?.accentDownbeat ?? true,
    volume: settings?.metronome?.volume ?? 0.7,
  });

  const finishRecording = useCallback(() => {
    metro.stop();
    // Convert absolute onsets → section-relative beats, grouped by section.
    const next = song.sections.map((s) => ({ ...s, lines: s.lines.map((l) => ({ ...l, events: l.events.map((e) => ({ ...e })) })) }));
    const eventsById = new Map(next.flatMap((s) => s.lines.flatMap((l) => l.events.map((e) => [e.id, e] as const))));

    for (let si = 0; si < next.length; si++) {
      const secItems = items
        .map((it, i) => ({ it, abs: recorded.current[i] }))
        .filter((x) => x.it.sectionIndex === si && x.abs !== undefined) as { it: TagItem; abs: number }[];
      if (!secItems.length) continue;
      const secTs = next[si].timeSignature ?? ts;
      const secBar = quarterBeatsPerBar(secTs);
      const minAbs = Math.min(...secItems.map((x) => x.abs));
      const origin = Math.floor(minAbs / secBar) * secBar;
      for (const { it, abs } of secItems) {
        const ev = eventsById.get(it.eventId);
        if (ev) ev.beat = snap(abs - origin);
      }
    }
    setWorking(next);
    setPhase('review');
  }, [items, metro, song.sections, ts]);

  const tap = useCallback(() => {
    if (phase !== 'recording') return;
    const abs = Math.max(0, metro.getPosition() - barBeats);
    recorded.current[index] = abs;
    if (index + 1 >= items.length) finishRecording();
    else setIndex((i) => i + 1);
  }, [phase, metro, barBeats, index, items.length, finishRecording]);

  // Drive count-in → recording, and a live position readout, while playing.
  useEffect(() => {
    if (phase !== 'countin' && phase !== 'recording') return;
    let raf = 0;
    const loop = () => {
      const pos = metro.getPosition();
      setPosBeat(pos);
      if (phase === 'countin' && pos >= barBeats) setPhase('recording');
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [phase, metro, barBeats]);

  // Space bar taps during recording.
  useEffect(() => {
    if (phase !== 'recording') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        tap();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, tap]);

  function start() {
    recorded.current = new Array(items.length).fill(undefined);
    setIndex(0);
    setPosBeat(0);
    setPhase('countin');
    metro.start();
  }

  function cancelTake() {
    metro.stop();
    setPhase('idle');
  }

  async function save() {
    await updateSong(song.id, { sections: working });
    navigate(`/songs/${song.id}/perform`);
  }

  if (!items.length) {
    return (
      <div>
        <button className="btn-ghost mb-4" onClick={() => navigate(`/songs/${song.id}`)}>
          <ArrowLeft size={16} /> Back
        </button>
        <p className="text-sm text-ink-500">This song has no chords to tag yet. Add some in the editor first.</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="mb-4 flex items-center justify-between">
        <button
          className="btn-ghost -ml-2"
          onClick={() => (phase === 'idle' || phase === 'review' ? navigate(`/songs/${song.id}`) : cancelTake())}
        >
          <ArrowLeft size={16} /> {phase === 'idle' || phase === 'review' ? 'Back' : 'Stop'}
        </button>
        <div className="text-sm text-ink-500">
          Tag beats · {song.title} · {ts.beats}/{ts.unit}
        </div>
      </div>

      {phase === 'idle' && (
        <div className="mx-auto max-w-md space-y-6 py-8 text-center">
          <p className="text-ink-600 dark:text-ink-300">
            Press <strong>Start</strong> for a one-bar count-in, then tap the big button (or the
            <strong> spacebar</strong>) on the beat as each chord lands. You can fine-tune
            everything afterwards.
          </p>
          <div className="flex items-center justify-center gap-2">
            <span className="label">Tempo</span>
            <button className="btn-secondary px-2 py-1" onClick={() => setTempo((t) => clampTempo(t - 1))}>
              <Minus size={14} />
            </button>
            <span className="w-14 text-center text-lg font-semibold tabular-nums">{tempo}</span>
            <button className="btn-secondary px-2 py-1" onClick={() => setTempo((t) => clampTempo(t + 1))}>
              <Plus size={14} />
            </button>
            <span className="text-sm text-ink-500">BPM</span>
          </div>
          <button className="btn-primary px-6 py-2 text-base" onClick={start}>
            Start
          </button>
        </div>
      )}

      {phase === 'countin' && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2">
          <p className="text-sm uppercase tracking-wide text-ink-500">Count-in</p>
          <p className="text-7xl font-bold tabular-nums text-accent">
            {Math.min(ts.beats, Math.floor(posBeat) + 1)}
          </p>
        </div>
      )}

      {phase === 'recording' && (
        <RecordingView
          items={items}
          index={index}
          tempo={tempo}
          transpose={0}
          flats={flats}
          onTap={tap}
          onDone={finishRecording}
        />
      )}

      {phase === 'review' && (
        <ReviewEditor
          song={song}
          working={working}
          setWorking={setWorking}
          defaults={defaults}
          flats={flats}
          grid={grid}
          setGrid={setGrid}
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          onRetake={() => setPhase('idle')}
          onSave={save}
        />
      )}
    </div>
  );
}

function RecordingView({
  items,
  index,
  tempo,
  transpose,
  flats,
  onTap,
  onDone,
}: {
  items: TagItem[];
  index: number;
  tempo: number;
  transpose: number;
  flats: boolean;
  onTap: () => void;
  onDone: () => void;
}) {
  const current = items[index];
  const upcoming = items.slice(index + 1, index + 4);
  const show = (c: string) => (c ? transposeChordSymbol(c, transpose, flats) : '·');

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-2 flex items-center justify-between text-sm text-ink-500">
        <span>
          {index + 1} / {items.length}
        </span>
        <span className="tabular-nums">{tempo} BPM</span>
        <button className="btn-ghost text-sm" onClick={onDone}>
          Done
        </button>
      </div>

      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          onTap();
        }}
        className="flex flex-1 select-none flex-col items-center justify-center gap-6 rounded-3xl border-2 border-dashed border-accent/40 bg-accent/5 active:bg-accent/15"
      >
        <span className="text-sm uppercase tracking-wide text-ink-500">Tap on the beat</span>
        <span className="text-7xl font-bold text-accent">{show(current.chord)}</span>
        {current.context && <span className="text-xl text-ink-600 dark:text-ink-300">{current.context}</span>}
        <span className="mt-4 flex items-center gap-3 text-2xl text-ink-400">
          {upcoming.map((u, i) => (
            <span key={i} className="opacity-60">
              {show(u.chord)}
            </span>
          ))}
        </span>
      </button>
    </div>
  );
}

function ReviewEditor({
  song,
  working,
  setWorking,
  defaults,
  flats,
  grid,
  setGrid,
  selectedId,
  setSelectedId,
  onRetake,
  onSave,
}: {
  song: Song;
  working: Section[];
  setWorking: React.Dispatch<React.SetStateAction<Section[]>>;
  defaults: { tempo: number; timeSignature: typeof DEFAULT_TS };
  flats: boolean;
  grid: number;
  setGrid: (n: number) => void;
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  onRetake: () => void;
  onSave: () => void;
}) {
  const laneRef = useRef<HTMLDivElement>(null);
  const timeline = useMemo(
    () => buildTimeline({ ...song, sections: working }, defaults),
    [song, working, defaults],
  );
  const step = 4 / grid; // quarter-beats per grid division

  const setEventBeat = useCallback(
    (eventId: string, sectionIndex: number, absBeat: number) => {
      const span = timeline.sections[sectionIndex];
      if (!span) return;
      const rel = Math.max(0, Math.min(span.lengthBeats, absBeat - span.startBeat));
      const snapped = Math.round(rel / step) * step;
      const beat = snap(snapped);
      setWorking((prev) =>
        prev.map((s, si) =>
          si !== sectionIndex
            ? s
            : {
                ...s,
                lines: s.lines.map((l) => ({
                  ...l,
                  events: l.events.map((e) => (e.id === eventId ? { ...e, beat } : e)),
                })),
              },
        ),
      );
    },
    [timeline.sections, step, setWorking],
  );

  function onMarkerDown(e: React.PointerEvent, eventId: string, sectionIndex: number) {
    e.preventDefault();
    setSelectedId(eventId);
    const lane = laneRef.current;
    if (!lane) return;
    const move = (ev: PointerEvent) => {
      const rect = lane.getBoundingClientRect();
      const x = ev.clientX - rect.left + lane.scrollLeft;
      setEventBeat(eventId, sectionIndex, x / PX_PER_BEAT);
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  function nudge(dir: -1 | 1) {
    if (!selectedId) return;
    const item = timeline.items.find((i) => i.id === selectedId);
    if (!item) return;
    setEventBeat(selectedId, item.sectionIndex, item.absBeat + dir * step);
  }

  function clearSelected() {
    if (!selectedId) return;
    setWorking((prev) =>
      prev.map((s) => ({
        ...s,
        lines: s.lines.map((l) => ({
          ...l,
          events: l.events.map((e) => {
            if (e.id !== selectedId) return e;
            const { beat: _drop, ...rest } = e;
            void _drop;
            return rest;
          }),
        })),
      })),
    );
    setSelectedId(null);
  }

  const laneWidth = timeline.totalBeats * PX_PER_BEAT + 80;

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="label">Snap</span>
        <div className="flex items-center gap-1 rounded-xl bg-ink-100 p-1 dark:bg-ink-800">
          {GRIDS.map((g) => (
            <button
              key={g.den}
              onClick={() => setGrid(g.den)}
              className={[
                'rounded-lg px-2 py-0.5 text-sm font-medium',
                grid === g.den ? 'bg-accent text-accent-fg' : 'hover:bg-ink-200 dark:hover:bg-ink-700',
              ].join(' ')}
            >
              {g.label}
            </button>
          ))}
        </div>

        <div className="ml-2 flex items-center gap-1">
          <button className="btn-secondary px-2 py-1 disabled:opacity-40" disabled={!selectedId} onClick={() => nudge(-1)} aria-label="Nudge earlier">
            <Minus size={14} />
          </button>
          <button className="btn-secondary px-2 py-1 disabled:opacity-40" disabled={!selectedId} onClick={() => nudge(1)} aria-label="Nudge later">
            <Plus size={14} />
          </button>
          <button className="btn-secondary px-2 py-1 disabled:opacity-40" disabled={!selectedId} onClick={clearSelected} aria-label="Clear beat">
            <Eraser size={14} />
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <button className="btn-ghost" onClick={onRetake}>
            <RotateCcw size={15} /> Re-tag
          </button>
          <button className="btn-primary" onClick={onSave}>
            Save
          </button>
        </div>
      </div>

      <p className="mb-2 text-xs text-ink-500">Drag a chord to move it; tap to select, then nudge or clear.</p>

      <div ref={laneRef} className="relative flex-1 overflow-x-auto rounded-2xl border border-ink-200 dark:border-ink-800">
        <div className="relative h-full min-h-[16rem]" style={{ width: laneWidth }}>
          {/* Bar grid */}
          {timeline.bars.map((bar) => (
            <div key={bar.number} className="absolute inset-y-0" style={{ left: bar.absBeat * PX_PER_BEAT }}>
              <div className="h-full w-px bg-ink-300 dark:bg-ink-700" />
              <span className="absolute left-1 top-1 text-[10px] tabular-nums text-ink-400">{bar.number}</span>
              {Array.from({ length: Math.max(0, Math.round(bar.beats) - 1) }, (_, k) => (
                <div key={k} className="absolute inset-y-0 w-px bg-ink-200/70 dark:bg-ink-800/70" style={{ left: (k + 1) * PX_PER_BEAT }} />
              ))}
            </div>
          ))}

          {/* Chord markers */}
          {timeline.items.map((item) => {
            const sym = item.event.chord ? transposeChordSymbol(item.event.chord, 0, flats) : '·';
            const selected = item.id === selectedId;
            return (
              <button
                key={`${item.id}-${item.repetition}`}
                onPointerDown={(e) => onMarkerDown(e, item.id, item.sectionIndex)}
                className={[
                  'absolute top-1/2 -translate-y-1/2 cursor-grab touch-none whitespace-nowrap rounded-lg px-2 py-1 text-sm font-semibold active:cursor-grabbing',
                  selected ? 'bg-accent text-accent-fg ring-2 ring-accent' : 'bg-ink-100 text-accent dark:bg-ink-800',
                ].join(' ')}
                style={{ left: item.absBeat * PX_PER_BEAT }}
              >
                {sym}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
