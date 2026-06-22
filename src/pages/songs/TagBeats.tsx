// Play-along beat tagging. The metronome plays a count-in then the song's
// chords are presented one at a time; you tap a single button (or press Space,
// B, or F) on the beat each chord lands. Each tap reads the transport's position,
// and on finish the absolute onsets are converted to section-relative beats
// (snapped to the chosen grid, default 1/8) and written to the song. A fine-tune
// editor then lets you drag each chord on a beat grid, re-quantize everything,
// and insert/delete whole bars before saving.
//
// This is the easy way to put the beat-timing layer (ChordEvent.beat) onto a
// song without hand-typing @beat in ChordPro; it powers the Highway view.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Eraser, Minus, Plus, RotateCcw, Trash2, Type, Wand2 } from 'lucide-react';
import { updateDifficultySections, useSettings, useSong } from '@/db/repo';
import { sectionsOf } from '@/lib/song';
import { TempoInput } from '@/components/inputs/TempoInput';
import { AddBeatInput, LyricEditor } from '@/components/inputs/InlineBeatInputs';
import { useMetronome, type MetronomePulse } from '@/components/tools/useMetronome';
import { parseBeat } from '@/lib/chordpro';
import { clampTempo } from '@/lib/metronome';
import { preferFlatsForKey, transposeChordSymbol } from '@/lib/music';
import {
  DEFAULT_TEMPO,
  DEFAULT_TS,
  beatsToNumber,
  buildTimeline,
  lyricSegments,
  quarterBeatsPerBar,
} from '@/lib/timeline';
import type { TimelineBar, TimelineItem } from '@/lib/timeline';
import {
  addLyricAnchor,
  deleteBarAt,
  insertBarAt,
  isBlankBar,
  setEventLyric,
  spanForBeat,
  splitLyricEvent,
} from '@/lib/beatEdit';
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
const DEFAULT_GRID = 8;
const PX_PER_BEAT = 56;
const EPS = 1e-9;

function snap(x: number): Beats {
  return parseBeat(String(Math.max(0, x))) ?? { n: Math.round(Math.max(0, x)), d: 1 };
}

/** Snap a quarter-beat value onto the chosen grid (grid is a note denominator:
 * 4 = quarter, 8 = eighth, 16 = sixteenth → step = 4/grid quarter-beats). */
function snapToGrid(x: number, grid: number): Beats {
  const step = 4 / grid;
  return snap(Math.round(Math.max(0, x) / step) * step);
}

/** How the count-in / beat metronome makes itself heard or seen while tagging. */
type MetroMode = 'flash' | 'sound' | 'both';
const METRO_MODES: { value: MetroMode; label: string }[] = [
  { value: 'flash', label: 'Flash' },
  { value: 'sound', label: 'Sound' },
  { value: 'both', label: 'Both' },
];
const metroHasSound = (m: MetroMode) => m !== 'flash';
const metroHasFlash = (m: MetroMode) => m !== 'sound';

/** Flash / Sound / Both segmented control for the start screen. */
function MetroModeSelector({ mode, setMode }: { mode: MetroMode; setMode: (m: MetroMode) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-xl bg-ink-100 p-1 dark:bg-ink-800">
      {METRO_MODES.map((m) => (
        <button
          key={m.value}
          onClick={() => setMode(m.value)}
          className={[
            'rounded-lg px-2 py-0.5 text-sm font-medium',
            mode === m.value ? 'bg-accent text-accent-fg' : 'hover:bg-ink-200 dark:hover:bg-ink-700',
          ].join(' ')}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}

/** Small circle that blinks on each beat (count-in + recording). Sits below the
 * chords so it stays out of the way; accent beats use a distinct color. Driven
 * by the metronome `pulse` — works whether or not the click sound is enabled. */
function BeatFlash({
  pulse,
  accentColor,
  beatColor,
}: {
  pulse: MetronomePulse | null;
  accentColor: string;
  beatColor: string;
}) {
  const [on, setOn] = useState(false);
  // Subdivisions don't flash — only actual beats — to keep it readable.
  const isBeat = pulse?.level !== 'sub';
  const color = pulse?.level === 'accent' ? accentColor : beatColor;

  useEffect(() => {
    if (!pulse || !isBeat) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), 90);
    return () => clearTimeout(t);
    // Re-run on every pulse via its monotonically increasing counter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulse?.n]);

  return (
    <div
      aria-hidden
      className="h-7 w-7 rounded-full transition-all duration-100 ease-out"
      style={{
        backgroundColor: color,
        opacity: on ? 0.9 : 0.15,
        transform: on ? 'scale(1)' : 'scale(0.7)',
      }}
    />
  );
}

/** A 1/4 · 1/8 · 1/16 segmented control, shared by the start screen + editor. */
function SnapSelector({ grid, setGrid }: { grid: number; setGrid: (n: number) => void }) {
  return (
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
  );
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
  const [searchParams] = useSearchParams();
  const flats = preferFlatsForKey(song.key);

  // Which difficulty variant we're tagging (from the ?d= query param).
  const difficultyId = searchParams.get('d') ?? song.defaultDifficultyId;
  const baseSections = useMemo(() => sectionsOf(song, difficultyId), [song, difficultyId]);

  const defaults = {
    tempo: settings?.defaultTempo ?? DEFAULT_TEMPO,
    timeSignature: settings?.defaultTimeSignature ?? DEFAULT_TS,
  };
  const ts = song.timeSignature ?? defaults.timeSignature;
  const barBeats = quarterBeatsPerBar(ts);

  // Ordered list of chord events to tag, with lyric context for display.
  const items = useMemo<TagItem[]>(() => {
    const out: TagItem[] = [];
    baseSections.forEach((section, sectionIndex) => {
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
  }, [baseSections]);

  const [phase, setPhase] = useState<Phase>('idle');
  const [tempo, setTempo] = useState(() => clampTempo(song.tempo ?? defaults.tempo));
  const [index, setIndex] = useState(0);
  const [posBeat, setPosBeat] = useState(0);
  const [working, setWorking] = useState<Section[]>(baseSections);
  const [grid, setGrid] = useState(DEFAULT_GRID);
  const [metroMode, setMetroMode] = useState<MetroMode>('both');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const recorded = useRef<(number | undefined)[]>([]);

  const flashAccentColor = settings?.metronome?.flashAccentColor ?? '#22c55e';
  const flashBeatColor = settings?.metronome?.flashBeatColor ?? '#64748b';

  const metro = useMetronome({
    tempo,
    beatsPerMeasure: ts.beats,
    subdivision: 1,
    soundEnabled: metroHasSound(metroMode),
    sound: settings?.metronome?.sound ?? 'beep',
    accentDownbeat: settings?.metronome?.accentDownbeat ?? true,
    volume: settings?.metronome?.volume ?? 0.7,
  });

  const finishRecording = useCallback(() => {
    metro.stop();
    // Convert absolute onsets → section-relative beats, grouped by section.
    const next = baseSections.map((s) => ({ ...s, lines: s.lines.map((l) => ({ ...l, events: l.events.map((e) => ({ ...e })) })) }));
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
        if (ev) ev.beat = snapToGrid(abs - origin, grid);
      }
    }
    setWorking(next);
    setPhase('review');
  }, [items, metro, baseSections, ts, grid]);

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

  // Keyboard taps during recording: Space, B, or F. `e.repeat` is ignored so a
  // held key doesn't auto-advance through every chord, and Space is prevented
  // from scrolling the page.
  useEffect(() => {
    if (phase !== 'recording') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (e.code === 'Space' || e.code === 'KeyB' || e.code === 'KeyF') {
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
    await updateDifficultySections(song.id, difficultyId, working);
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
            Press <strong>Start</strong> for a one-bar count-in, then tap the big button (or press
            <strong> Space</strong>, <strong>B</strong>, or <strong>F</strong>) on the beat as each
            chord lands. You can fine-tune everything afterwards.
          </p>
          <div className="flex items-center justify-center gap-2">
            <span className="label">Tempo</span>
            <TempoInput
              value={tempo}
              onChange={(bpm) => setTempo(clampTempo(bpm))}
              buttonClassName="btn-secondary px-2 py-1"
              numberClassName="w-14 text-center text-lg font-semibold tabular-nums"
              ariaLabel="Tag-beats tempo"
            />
            <span className="text-sm text-ink-500">BPM</span>
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className="label">Snap</span>
            <SnapSelector grid={grid} setGrid={setGrid} />
          </div>
          <div className="flex items-center justify-center gap-2">
            <span className="label">Metronome</span>
            <MetroModeSelector mode={metroMode} setMode={setMetroMode} />
          </div>
          <button className="btn-primary px-6 py-2 text-base" onClick={start}>
            Start
          </button>
        </div>
      )}

      {(phase === 'countin' || phase === 'recording') && (
        <RecordingView
          items={items}
          index={index}
          tempo={tempo}
          transpose={0}
          flats={flats}
          countNum={phase === 'countin' ? Math.max(1, ts.beats - Math.floor(posBeat)) : 0}
          flashEnabled={metroHasFlash(metroMode)}
          pulse={metro.pulse}
          flashAccentColor={flashAccentColor}
          flashBeatColor={flashBeatColor}
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
  countNum,
  flashEnabled,
  pulse,
  flashAccentColor,
  flashBeatColor,
  onTap,
  onDone,
}: {
  items: TagItem[];
  index: number;
  tempo: number;
  transpose: number;
  flats: boolean;
  /** > 0 during the count-in (the beats remaining); 0 once recording. */
  countNum: number;
  /** Whether to show the visual beat flash below the chords. */
  flashEnabled: boolean;
  /** Metronome pulse that drives the flash. */
  pulse: MetronomePulse | null;
  flashAccentColor: string;
  flashBeatColor: string;
  onTap: () => void;
  onDone: () => void;
}) {
  const current = items[index];
  const next1 = items[index + 1];
  const next2 = items[index + 2];
  const show = (c: string) => (c ? transposeChordSymbol(c, transpose, flats) : '·');
  const counting = countNum > 0;

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

      {/* Count-in banner — shown on top while the chords stay visible so you
          can see what's coming and get ready. */}
      {counting && (
        <div className="mb-2 flex items-center justify-center gap-3 rounded-2xl bg-accent/10 py-2">
          <span className="text-sm uppercase tracking-wide text-ink-500">Count-in</span>
          <span className="text-4xl font-bold tabular-nums text-accent">{countNum}</span>
        </div>
      )}

      <button
        type="button"
        onPointerDown={(e) => {
          e.preventDefault();
          onTap();
        }}
        className={[
          'flex flex-1 select-none flex-col items-center justify-center gap-6 rounded-3xl border-2 border-dashed transition-colors',
          counting
            ? 'border-ink-300 bg-ink-100/50 dark:border-ink-700 dark:bg-ink-900/40'
            : 'border-accent/40 bg-accent/5 active:bg-accent/15',
        ].join(' ')}
      >
        <span className="text-sm uppercase tracking-wide text-ink-500">
          {counting ? 'Get ready…' : 'Tap, or press Space / B / F, on the beat'}
        </span>

        {/* Current block (prominent) + the next one(s) to look ahead. On each
            tap the index advances so the next block slides into the main spot. */}
        <div className="flex items-end justify-center gap-10">
          <ChordBlock chord={show(current.chord)} context={current.context} variant="current" />
          {next1 && <ChordBlock chord={show(next1.chord)} context={next1.context} variant="next" />}
          {next2 && <ChordBlock chord={show(next2.chord)} context={next2.context} variant="upcoming" />}
        </div>

        {/* Visual metronome — a small circle, well below the chords so it stays
            out of the way of what you're reading. Only present when flash is on. */}
        {flashEnabled && (
          <BeatFlash pulse={pulse} accentColor={flashAccentColor} beatColor={flashBeatColor} />
        )}
      </button>
    </div>
  );
}

/** One chord + its lyric in the recording view. `current` is the prominent one
 * you're tagging now; `next`/`upcoming` are dimmer look-aheads. */
function ChordBlock({
  chord,
  context,
  variant,
}: {
  chord: string;
  context?: string;
  variant: 'current' | 'next' | 'upcoming';
}) {
  const styles = {
    current: { wrap: '', chord: 'text-7xl font-bold text-accent', ctx: 'text-xl text-ink-600 dark:text-ink-300' },
    next: { wrap: 'opacity-70', chord: 'text-5xl font-semibold text-ink-500', ctx: 'text-base text-ink-400' },
    upcoming: { wrap: 'opacity-40', chord: 'text-3xl font-semibold text-ink-500', ctx: 'text-sm text-ink-400' },
  }[variant];
  return (
    <div className={['flex flex-col items-center gap-2', styles.wrap].join(' ')}>
      <span className={styles.chord}>{chord}</span>
      {context && <span className={['max-w-[8rem] truncate', styles.ctx].join(' ')}>{context}</span>}
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
  // buildTimeline resolves sections from the song's difficulties; feed it a
  // synthetic single-variant song carrying the in-progress `working` sections.
  const timeline = useMemo(
    () =>
      buildTimeline(
        { ...song, difficulties: [{ id: 'tmp', level: 1, sections: working }], defaultDifficultyId: 'tmp' },
        defaults,
      ),
    [song, working, defaults],
  );
  const step = 4 / grid; // quarter-beats per grid division
  const segments = useMemo(() => lyricSegments(timeline.items), [timeline.items]);

  // Add a lyric on its own beat; edit/split an existing lyric packet. Same
  // canonical-model edits as the Highway view (lib/beatEdit), so changes flow
  // back to the Scroll view and ChordPro export.
  const [addLyric, setAddLyric] = useState(false);
  const [adding, setAdding] = useState<{ left: number; sectionIndex: number; beat: Beats } | null>(
    null,
  );
  const [editingLyric, setEditingLyric] = useState<{ id: string; left: number; text: string } | null>(
    null,
  );

  function absBeatFromClientX(clientX: number): number | null {
    const lane = laneRef.current;
    if (!lane) return null;
    const rect = lane.getBoundingClientRect();
    return (clientX - rect.left + lane.scrollLeft) / PX_PER_BEAT;
  }

  /** Snap an absolute beat onto the grid, relative to one pass of its section. */
  function snappedRel(sectionIndex: number, repetition: number, absBeat: number): Beats {
    const span = timeline.sections[sectionIndex];
    const passStart = span.startBeat + repetition * span.passBeats;
    const rel = Math.max(0, Math.min(span.passBeats, absBeat - passStart));
    return snap(Math.round(rel / step) * step);
  }

  function onLaneAddLyric(clientX: number) {
    const absBeat = absBeatFromClientX(clientX);
    if (absBeat === null) return;
    const span = spanForBeat(timeline, absBeat);
    if (!span) return;
    const rep = Math.max(
      0,
      Math.min(
        Math.floor((absBeat - span.startBeat) / span.passBeats),
        Math.max(0, Math.round(span.lengthBeats / span.passBeats) - 1),
      ),
    );
    setSelectedId(null);
    setEditingLyric(null);
    setAdding({
      left: absBeat * PX_PER_BEAT,
      sectionIndex: span.sectionIndex,
      beat: snappedRel(span.sectionIndex, rep, absBeat),
    });
  }
  function commitAddLyric(text: string) {
    if (!adding) return;
    setWorking((prev) => addLyricAnchor(prev, { sectionIndex: adding.sectionIndex, beat: adding.beat, text }));
    setAdding(null);
  }

  function openLyricEdit(item: TimelineItem) {
    setSelectedId(null);
    setAdding(null);
    setEditingLyric({ id: item.id, left: item.absBeat * PX_PER_BEAT, text: segments.get(item.event.id) ?? '' });
  }
  function commitLyricEdit(text: string) {
    if (!editingLyric) return;
    setWorking((prev) => setEventLyric(prev, editingLyric.id, text));
    setEditingLyric(null);
  }
  function splitLyricEdit(caret: number, text: string) {
    if (!editingLyric) return;
    const item = timeline.items.find((i) => i.id === editingLyric.id);
    if (!item) return;
    const span = timeline.sections[item.sectionIndex];
    const passStart = span.startBeat + item.repetition * span.passBeats;
    const rel = Math.max(0, Math.min(span.passBeats, item.absBeat - passStart + step));
    setWorking((prev) => splitLyricEvent(prev, editingLyric.id, caret, text, snap(rel)));
    setEditingLyric(null);
  }

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

  /** Re-snap every tagged chord in the song onto the current grid. */
  function quantizeAll() {
    setWorking((prev) =>
      prev.map((s) => ({
        ...s,
        lines: s.lines.map((l) => ({
          ...l,
          events: l.events.map((e) =>
            e.beat ? { ...e, beat: snapToGrid(beatsToNumber(e.beat), grid) } : e,
          ),
        })),
      })),
    );
  }

  // ── Bar insert / delete (shared logic in lib/beatEdit) ──────────────────
  // Beats are section-relative, so a bar op shifts every event at or after the
  // bar within its section by ±one bar; the section length is derived from its
  // last event, so the timeline (and all repeats) follow automatically.
  function insertBar(absBeat: number) {
    setWorking((prev) => insertBarAt(prev, timeline, absBeat));
    setSelectedId(null);
  }
  function deleteBar(bar: TimelineBar) {
    setWorking((prev) => deleteBarAt(prev, timeline, bar.absBeat));
    setSelectedId(null);
  }

  const laneWidth = timeline.totalBeats * PX_PER_BEAT + 80;

  return (
    <div className="flex flex-1 flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="label">Snap</span>
        <SnapSelector grid={grid} setGrid={setGrid} />
        <button className="btn-secondary px-2 py-1" onClick={quantizeAll} title="Snap every chord to the grid">
          <Wand2 size={14} /> Quantize
        </button>

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

        <button
          className={['btn-secondary px-2 py-1', addLyric ? 'ring-2 ring-accent' : ''].join(' ')}
          onClick={() => {
            setAddLyric((v) => !v);
            setAdding(null);
            setEditingLyric(null);
            setSelectedId(null);
          }}
          aria-pressed={addLyric}
          title="Click the lane to add a lyric on its own beat"
        >
          <Type size={14} /> Lyric
        </button>

        <div className="ml-auto flex items-center gap-2">
          <button className="btn-ghost" onClick={onRetake}>
            <RotateCcw size={15} /> Re-tag
          </button>
          <button className="btn-primary" onClick={onSave}>
            Save
          </button>
        </div>
      </div>

      <p className="mb-2 text-xs text-ink-500">
        Drag a chord to move it; tap to select, then nudge or clear. Click a lyric to edit or
        split it; <Type size={11} className="inline" /> Lyric drops a word on its own beat. Use{' '}
        <Plus size={11} className="inline" /> to insert a bar (pushing the rest of the song over);
        blank bars show <Trash2 size={11} className="inline" /> to delete them.
      </p>

      <div ref={laneRef} className="relative flex-1 overflow-x-auto rounded-2xl border border-ink-200 dark:border-ink-800">
        <div
          className="relative h-full min-h-[16rem]"
          style={{ width: laneWidth }}
          onClick={(e) => {
            if (addLyric) onLaneAddLyric(e.clientX);
            else {
              setSelectedId(null);
              setEditingLyric(null);
            }
          }}
        >
          {/* Bar grid */}
          {timeline.bars.map((bar) => {
            const blank = isBlankBar(timeline, bar);
            return (
              <div key={bar.number} className="absolute inset-y-0" style={{ left: bar.absBeat * PX_PER_BEAT }}>
                <div className="h-full w-px bg-ink-300 dark:bg-ink-700" />
                <span className="absolute left-1 top-1 text-[10px] tabular-nums text-ink-400">{bar.number}</span>
                {Array.from({ length: Math.max(0, Math.round(bar.beats) - 1) }, (_, k) => (
                  <div key={k} className="absolute inset-y-0 w-px bg-ink-200/70 dark:bg-ink-800/70" style={{ left: (k + 1) * PX_PER_BEAT }} />
                ))}
                {/* Insert a bar before this one (nudged right on bar 1 so it
                    isn't clipped at the lane's left edge). */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    insertBar(bar.absBeat);
                  }}
                  className="absolute bottom-1 z-10 rounded-full bg-ink-100 p-1 text-ink-500 hover:bg-accent hover:text-accent-fg dark:bg-ink-800"
                  style={{ left: bar.absBeat < EPS ? 2 : -10 }}
                  title="Insert a bar here"
                  aria-label="Insert a bar here"
                >
                  <Plus size={12} />
                </button>
                {/* Delete this bar if it's empty. */}
                {blank && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteBar(bar);
                    }}
                    className="absolute top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ink-100 p-1.5 text-ink-500 hover:bg-rose-500 hover:text-white dark:bg-ink-800"
                    style={{ left: (bar.beats / 2) * PX_PER_BEAT }}
                    title="Delete this empty bar"
                    aria-label="Delete this empty bar"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            );
          })}

          {/* Chord / lyric markers, with each anchor's lyric packet beneath it */}
          {timeline.items.map((item) => {
            const sym = item.event.chord ? transposeChordSymbol(item.event.chord, 0, flats) : '·';
            const selected = item.id === selectedId;
            const lyric = segments.get(item.event.id);
            return (
              <div
                key={`${item.id}-${item.repetition}`}
                className="absolute top-1/2 -translate-y-1/2"
                style={{ left: item.absBeat * PX_PER_BEAT }}
              >
                <button
                  onPointerDown={(e) => onMarkerDown(e, item.id, item.sectionIndex)}
                  onClick={(e) => e.stopPropagation()}
                  className={[
                    'cursor-grab touch-none whitespace-nowrap rounded-lg px-2 py-1 text-sm font-semibold active:cursor-grabbing',
                    selected ? 'bg-accent text-accent-fg ring-2 ring-accent' : 'bg-ink-100 text-accent dark:bg-ink-800',
                  ].join(' ')}
                >
                  {sym}
                </button>
                {lyric && editingLyric?.id !== item.id && (
                  <div
                    className="absolute left-0 top-full mt-1 cursor-text whitespace-nowrap rounded text-sm text-ink-700 hover:bg-accent/15 dark:text-ink-300"
                    onClick={(e) => {
                      e.stopPropagation();
                      openLyricEdit(item);
                    }}
                  >
                    {lyric}
                  </div>
                )}
              </div>
            );
          })}

          {/* Inline add-a-lyric input (from a + Lyric lane click) */}
          {adding && (
            <div className="absolute top-1/2 z-20 -translate-y-1/2" style={{ left: adding.left }}>
              <AddBeatInput kind="lyric" onCommit={commitAddLyric} onCancel={() => setAdding(null)} />
            </div>
          )}

          {/* Inline editor over an existing lyric packet (edit / split) */}
          {editingLyric && (
            <div className="absolute top-1/2 z-20 mt-1 -translate-y-1/2" style={{ left: editingLyric.left }}>
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
    </div>
  );
}
