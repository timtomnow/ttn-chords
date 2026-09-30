import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Copy,
  Eye,
  EyeOff,
  Grid3x3,
  GripVertical,
  Plus,
  SplitSquareVertical,
  Star,
  Trash2,
  Type,
} from 'lucide-react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { PageHeader } from '@/components/ui/PageHeader';
import { TagInput } from '@/components/inputs/TagInput';
import { ChordPalette } from '@/components/inputs/ChordPalette';
import { SpacingPanel } from '@/components/inputs/SpacingPanel';
import { ChordLineEditor } from '@/components/chords/ChordLineEditor';
import { ArrangementEditor } from '@/components/songs/ArrangementEditor';
import { RhythmPatternEditor } from '@/components/rhythm/RhythmPatternEditor';
import { deleteSong, saveSettings, updateSong, useRhythmPatterns, useSettings, useSong } from '@/db/repo';
import { newId } from '@/lib/id';
import {
  SECTION_KINDS,
  defaultLabelForKind,
  parseLines,
  serializeLine,
  serializeLines,
} from '@/lib/chordpro';
import {
  chordsInText,
  insertChordAt,
  insertEmptyBrackets,
  moveTokenAt,
  nextTokenCaret,
  transposeTokenAt,
} from '@/lib/chordproEdit';
import { applyGridToSection, eventsToGrid, gridBarCount, parseChordGrid } from '@/lib/chordGrid';
import { clearAllBeats, spaceSections } from '@/lib/spacing';
import type { SpacingMode, SpacingOptions } from '@/lib/spacing';
import { diatonicChords, parseChordSymbol, preferFlatsForKey } from '@/lib/music';
import { pruneArrangement } from '@/lib/song';
import { DEFAULT_TS, quarterBeatsPerBar } from '@/lib/timeline';
import type { ArrangementEntry, Line, Section, SectionKind, Song, TimeSignature } from '@/types';

/** How a section's chords are authored. See `lib/chordGrid.ts`. */
type SectionMode = 'lyrics' | 'grid';

// Editor-local section: the body is kept as ChordPro TEXT while editing (so the
// textarea cursor is stable and partial `[` input doesn't churn), and is parsed
// to Line[] only on save. A grid-authored section additionally keeps its bar-grid
// source; BOTH texts live in editor state so flipping modes mid-session never
// throws work away (see `fromEdit` for what actually gets stored).
type EditSection = {
  id: string;
  kind: SectionKind;
  label?: string;
  mode: SectionMode;
  /** ChordPro body. In grid mode this holds the lyrics only (chords live in the grid). */
  body: string;
  /** Bar-grid source, e.g. `|: G | C :| x2`. Empty for a lyric-authored section. */
  grid: string;
  repeat?: number;
  rhythmPatternId?: string;
};

function toEdit(sections: Section[]): EditSection[] {
  return sections.map((s) => {
    const grid = s.grid ?? '';
    const isGrid = grid.trim().length > 0;
    return {
      id: s.id,
      kind: s.kind,
      label: s.label,
      mode: isGrid ? ('grid' as const) : ('lyrics' as const),
      // A grid section's chords live in the grid, so its ChordPro body is the
      // lyric lines alone; a lyric section's body is everything.
      body: serializeLines(isGrid ? s.lines.filter((l) => l.lyric.trim().length > 0) : s.lines),
      grid,
      repeat: s.repeat,
      rhythmPatternId: s.rhythmPatternId,
    };
  });
}

function fromEdit(sections: EditSection[], ts: TimeSignature): Section[] {
  return sections.map((s) => {
    const base: Section = {
      id: s.id,
      kind: s.kind,
      label: s.label,
      lines: parseLines(s.body),
      repeat: s.repeat,
      rhythmPatternId: s.rhythmPatternId,
    };
    // Grid mode compiles the bar grid into the section's chords (beat-timed, no
    // lyric anchors) and keeps the lyric lines beneath them.
    return s.mode === 'grid' && s.grid.trim() ? applyGridToSection(base, s.grid, ts) : base;
  });
}

// Editor-local difficulty: keeps every variant's body in state so autosave
// writes them all back together (no flush-on-switch needed).
type EditDifficulty = {
  id: string;
  level: number;
  label?: string;
  sections: EditSection[];
  arrangement?: ArrangementEntry[];
};

export function SongEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const song = useSong(id);

  if (song === undefined) return <p className="text-sm text-ink-500">Loading…</p>;
  if (song === null) {
    return (
      <div>
        <button className="btn-ghost mb-4" onClick={() => navigate('/songs')}>
          <ArrowLeft size={16} /> Back
        </button>
        <p className="text-sm text-ink-500">Song not found.</p>
      </div>
    );
  }
  return <Editor key={song.id} song={song} />;
}

function Editor({ song }: { song: Song }) {
  const navigate = useNavigate();
  const settings = useSettings();
  const [title, setTitle] = useState(song.title);
  const [artist, setArtist] = useState(song.artist ?? '');
  const [key, setKey] = useState(song.key ?? '');
  const [capo, setCapo] = useState(song.capo?.toString() ?? '');
  const [tempo, setTempo] = useState(song.tempo?.toString() ?? '');
  const [timeSig, setTimeSig] = useState(
    song.timeSignature ? `${song.timeSignature.beats}/${song.timeSignature.unit}` : '',
  );
  const [tags, setTags] = useState<string[]>(song.tags);
  const [diffs, setDiffs] = useState<EditDifficulty[]>(() =>
    (song.difficulties.length
      ? song.difficulties
      : [{ id: newId(), level: 3, sections: [] }]
    ).map((d) => ({
      id: d.id,
      level: d.level,
      label: d.label,
      sections: toEdit(d.sections),
      arrangement: d.arrangement,
    })),
  );
  const [activeDiffId, setActiveDiffId] = useState(
    () => song.defaultDifficultyId ?? song.difficulties[0]?.id ?? '',
  );
  const [defaultDiffId, setDefaultDiffId] = useState(activeDiffId);
  const [preview, setPreview] = useState(true);
  const [saved, setSaved] = useState(true);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // The variant currently being edited (fall back to the first if it vanished).
  const activeDiff = diffs.find((d) => d.id === activeDiffId) ?? diffs[0];
  // Memoized so the `?? []` fallback doesn't hand the memos below a fresh array
  // on every render.
  const sections = useMemo(() => activeDiff?.sections ?? [], [activeDiff]);

  // Effective time signature: the song's, else the app default. Grid compilation
  // and chord spacing both need a bar length.
  const ts = parseTimeSig(timeSig) ?? settings?.defaultTimeSignature ?? DEFAULT_TS;
  const barBeats = quarterBeatsPerBar(ts);

  // Every chord already used in this variant, for the palette's first row.
  const usedChords = useMemo(
    () => chordsInText(sections.map((s) => `${s.body}\n${s.grid}`).join('\n')),
    [sections],
  );

  // Debounced autosave. The first run after mount is skipped so loading a song
  // doesn't immediately mark it dirty. Every variant's body is written together.
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSaved(false);
    const handle = setTimeout(() => {
      void updateSong(song.id, {
        title: title.trim() || 'Untitled song',
        artist: artist.trim() || undefined,
        key: key.trim() || undefined,
        capo: capo === '' ? undefined : Number(capo),
        tempo: tempo === '' ? undefined : Number(tempo),
        timeSignature: parseTimeSig(timeSig),
        tags,
        difficulties: diffs.map((d) => {
          const built = fromEdit(d.sections, ts);
          return {
            id: d.id,
            level: d.level,
            label: d.label,
            sections: built,
            // Never store an arrangement referencing a part that's been deleted.
            arrangement: pruneArrangement(d.arrangement, built),
          };
        }),
        defaultDifficultyId: diffs.some((d) => d.id === defaultDiffId)
          ? defaultDiffId
          : diffs[0]?.id,
      }).then(() => setSaved(true));
    }, 600);
    return () => clearTimeout(handle);
    // `ts` is derived from `timeSig` + settings, both of which are listed.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, artist, key, capo, tempo, timeSig, tags, diffs, defaultDiffId, song.id, ts.beats, ts.unit]);

  // ── Difficulty management ──
  function patchActiveSections(updater: (prev: EditSection[]) => EditSection[]) {
    setDiffs((prev) =>
      prev.map((d) => (d.id === activeDiff?.id ? { ...d, sections: updater(d.sections) } : d)),
    );
  }
  function patchActiveDiff(patch: Partial<EditDifficulty>) {
    setDiffs((prev) => prev.map((d) => (d.id === activeDiff?.id ? { ...d, ...patch } : d)));
  }
  function nextFreeLevel(): number {
    const used = new Set(diffs.map((d) => d.level));
    for (let l = 1; l <= 5; l++) if (!used.has(l)) return l;
    return 3;
  }
  function addDifficulty() {
    const d: EditDifficulty = { id: newId(), level: nextFreeLevel(), sections: [] };
    setDiffs((prev) => [...prev, d]);
    setActiveDiffId(d.id);
  }
  function duplicateDifficulty() {
    if (!activeDiff) return;
    // Fresh section ids, so the copy's arrangement has to be remapped onto them.
    const idMap = new Map(activeDiff.sections.map((s) => [s.id, newId()]));
    const copy: EditDifficulty = {
      id: newId(),
      level: Math.min(5, activeDiff.level + 1),
      label: activeDiff.label,
      sections: activeDiff.sections.map((s) => ({ ...s, id: idMap.get(s.id) as string })),
      arrangement: activeDiff.arrangement?.map((e) => ({
        ...e,
        id: newId(),
        sectionId: idMap.get(e.sectionId) ?? e.sectionId,
      })),
    };
    setDiffs((prev) => [...prev, copy]);
    setActiveDiffId(copy.id);
  }
  function deleteDifficulty() {
    if (diffs.length <= 1 || !activeDiff) return;
    if (!confirm('Delete this difficulty variant? This cannot be undone.')) return;
    const remaining = diffs.filter((d) => d.id !== activeDiff.id);
    setDiffs(remaining);
    setActiveDiffId(remaining[0].id);
    if (defaultDiffId === activeDiff.id) setDefaultDiffId(remaining[0].id);
  }

  function addSection() {
    patchActiveSections((prev) => [
      ...prev,
      { id: newId(), kind: 'verse', mode: 'lyrics', body: '', grid: '' },
    ]);
  }

  function updateSection(sid: string, patch: Partial<EditSection>) {
    patchActiveSections((prev) => prev.map((s) => (s.id === sid ? { ...s, ...patch } : s)));
  }

  function removeSection(sid: string) {
    patchActiveSections((prev) => prev.filter((s) => s.id !== sid));
    // Drop any arrangement slots that played the part just deleted.
    setDiffs((prev) =>
      prev.map((d) =>
        d.id === activeDiff?.id
          ? { ...d, arrangement: d.arrangement?.filter((e) => e.sectionId !== sid) }
          : d,
      ),
    );
  }

  /**
   * Switch a section between lyric and grid authoring. Going into grid mode seeds
   * the grid from whatever chords the section already has (so nothing is lost —
   * the chords move into the grid) and strips them from the ChordPro body.
   */
  function setSectionMode(sid: string, mode: SectionMode) {
    patchActiveSections((prev) =>
      prev.map((s) => {
        if (s.id !== sid || s.mode === mode) return s;
        if (mode === 'lyrics') return { ...s, mode, grid: '' };
        const seeded =
          s.grid.trim() ||
          eventsToGrid({ id: s.id, kind: s.kind, lines: parseLines(s.body) }, ts) ||
          '| ';
        // Keep the lyrics, drop their now-redundant chord anchors.
        const lyricsOnly = parseLines(s.body)
          .map((l) => serializeLine({ ...l, events: [] }))
          .join('\n');
        return { ...s, mode, grid: seeded, body: lyricsOnly };
      }),
    );
  }

  // Split a section at the textarea caret: everything from the caret onward moves
  // into a fresh section card right below (inheriting kind + rhythm). Used to
  // break a whole song pasted into one card into per-section cards.
  function splitSection(sid: string, atChar: number) {
    patchActiveSections((prev) => {
      const idx = prev.findIndex((s) => s.id === sid);
      if (idx === -1) return prev;
      const s = prev[idx];
      const before = s.body.slice(0, atChar).replace(/\n+$/, '');
      const after = s.body.slice(atChar).replace(/^\n+/, '');
      if (after.trim() === '') return prev; // nothing to move
      const moved: EditSection = {
        id: newId(),
        kind: s.kind,
        mode: 'lyrics',
        body: after,
        grid: '',
        rhythmPatternId: s.rhythmPatternId,
      };
      const next = [...prev];
      next[idx] = { ...s, body: before };
      next.splice(idx + 1, 0, moved);
      return next;
    });
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    patchActiveSections((prev) => {
      const from = prev.findIndex((s) => s.id === active.id);
      const to = prev.findIndex((s) => s.id === over.id);
      return from === -1 || to === -1 ? prev : arrayMove(prev, from, to);
    });
  }

  // ── Beat spacing (lib/spacing) ──
  // Grid sections are excluded: their timing is authored by the grid, so spacing
  // them would silently overwrite it.
  const [spacingMode, setSpacingMode] = useState<SpacingMode>(
    () => (settings?.defaultSpacingMode as SpacingMode) ?? 'line',
  );
  const [beatsPerChord, setBeatsPerChord] = useState(() => settings?.defaultChordBeats ?? 2);
  const [spacingGrid, setSpacingGrid] = useState(8);

  const lyricSections = useMemo(() => sections.filter((s) => s.mode !== 'grid'), [sections]);
  const spacingTargets = useMemo(() => fromEdit(lyricSections, ts), [lyricSections, ts]);

  function applySpacing(opts: SpacingOptions) {
    // Remember the choice — the tagger's Space panel reads the same defaults.
    void saveSettings({ defaultChordBeats: opts.beatsPerChord, defaultSpacingMode: opts.mode });
    const spaced = spaceSections(spacingTargets, opts);
    const byId = new Map(spaced.map((s) => [s.id, s]));
    patchActiveSections((prev) =>
      prev.map((s) => {
        const next = byId.get(s.id);
        return next && s.mode !== 'grid' ? { ...s, body: serializeLines(next.lines) } : s;
      }),
    );
  }
  function clearBeats() {
    if (!confirm('Remove every beat from this variant? The chords and lyrics stay.')) return;
    const cleared = clearAllBeats(fromEdit(lyricSections, ts));
    const byId = new Map(cleared.map((s) => [s.id, s]));
    patchActiveSections((prev) =>
      prev.map((s) => {
        const next = byId.get(s.id);
        return next && s.mode !== 'grid' ? { ...s, body: serializeLines(next.lines) } : s;
      }),
    );
  }

  async function onDelete() {
    if (!confirm('Delete this song? This cannot be undone.')) return;
    await deleteSong(song.id);
    navigate('/songs');
  }

  const flats = preferFlatsForKey(key);
  // Parts the arrangement can reference — plain Sections, freshly built from the
  // edit state so labels and kinds are current.
  const partsForArrangement = useMemo(
    () =>
      sections.map<Section>((s) => ({ id: s.id, kind: s.kind, label: s.label, lines: [] })),
    [sections],
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button className="btn-ghost -ml-2" onClick={() => navigate(`/songs/${song.id}`)}>
          <ArrowLeft size={16} /> Done
        </button>
        <span className="flex items-center gap-1 text-xs text-ink-400">
          {saved ? (
            <>
              <Check size={14} /> Saved
            </>
          ) : (
            'Saving…'
          )}
        </span>
      </div>

      <PageHeader
        title="Edit song"
        actions={
          <>
            <button
              className="btn-ghost"
              onClick={() => setPreview((p) => !p)}
              title={preview ? 'Hide chord chart' : 'Show chord chart'}
            >
              {preview ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
            <button className="btn-ghost text-red-600" onClick={onDelete}>
              <Trash2 size={16} />
            </button>
          </>
        }
      />

      {/* Metadata */}
      <section className="card mb-6 grid grid-cols-2 gap-3 p-4 sm:grid-cols-3">
        <Field label="Title" className="col-span-2 sm:col-span-3">
          <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label="Artist" className="col-span-2 sm:col-span-3">
          <input className="input" value={artist} onChange={(e) => setArtist(e.target.value)} />
        </Field>
        <Field label="Key">
          <input className="input" value={key} onChange={(e) => setKey(e.target.value)} placeholder="G" />
        </Field>
        <Field label="Capo">
          <input
            className="input"
            type="number"
            value={capo}
            onChange={(e) => setCapo(e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="Tempo (BPM)">
          <input
            className="input"
            type="number"
            value={tempo}
            onChange={(e) => setTempo(e.target.value)}
            placeholder="120"
          />
        </Field>
        <Field label="Time">
          <input
            className="input"
            value={timeSig}
            onChange={(e) => setTimeSig(e.target.value)}
            placeholder="4/4"
          />
        </Field>
        <Field label="Tags" className="col-span-2 sm:col-span-2">
          <TagInput tags={tags} onChange={setTags} placeholder="Add a tag…" />
        </Field>
      </section>

      {/* Difficulty variants */}
      <section className="card mb-6 space-y-3 p-4">
        <div className="flex items-center justify-between">
          <span className="label">Difficulty variants</span>
          <button className="btn-ghost text-xs" onClick={addDifficulty}>
            <Plus size={14} /> Add
          </button>
        </div>
        <div className="flex flex-wrap gap-1">
          {[...diffs]
            .sort((a, b) => a.level - b.level)
            .map((d) => (
              <button
                key={d.id}
                className={d.id === activeDiff?.id ? 'chip chip-active' : 'chip'}
                onClick={() => setActiveDiffId(d.id)}
                title={d.id === defaultDiffId ? 'Default variant' : undefined}
              >
                {d.id === defaultDiffId && <Star size={11} className="mr-1 inline fill-current" />}
                {d.label ? `${d.label} (L${d.level})` : `Level ${d.level}`}
              </button>
            ))}
        </div>
        {activeDiff && (
          <div className="flex flex-wrap items-end gap-3 border-t border-ink-200 pt-3 dark:border-ink-800">
            <label className="block">
              <span className="label mb-1">Level (1–5)</span>
              <select
                className="input h-8 w-auto py-0 text-sm"
                value={activeDiff.level}
                onChange={(e) => patchActiveDiff({ level: Number(e.target.value) })}
              >
                {[1, 2, 3, 4, 5].map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <label className="block flex-1">
              <span className="label mb-1">Label (optional)</span>
              <input
                className="input h-8 py-0 text-sm"
                placeholder="e.g. Beginner"
                value={activeDiff.label ?? ''}
                onChange={(e) => patchActiveDiff({ label: e.target.value || undefined })}
              />
            </label>
            <button
              className="btn-ghost text-xs"
              onClick={() => setDefaultDiffId(activeDiff.id)}
              disabled={defaultDiffId === activeDiff.id}
            >
              <Star size={14} /> Set default
            </button>
            <button className="btn-ghost text-xs" onClick={duplicateDifficulty} title="Copy this variant as a starting point">
              <Copy size={14} /> Duplicate
            </button>
            <button
              className="btn-ghost text-xs text-red-600 disabled:opacity-40"
              onClick={deleteDifficulty}
              disabled={diffs.length <= 1}
            >
              <Trash2 size={14} /> Delete
            </button>
          </div>
        )}
      </section>

      {/* Arrangement — performance order over the parts below */}
      <section className="card mb-6 space-y-3 p-4">
        <div className="flex items-center justify-between">
          <span className="label">Arrangement</span>
          <span className="text-xs text-ink-400">
            One part, played many times — tag its beats once
          </span>
        </div>
        <ArrangementEditor
          sections={partsForArrangement}
          arrangement={activeDiff?.arrangement}
          onChange={(arrangement) => patchActiveDiff({ arrangement })}
        />
      </section>

      {/* Beat spacing */}
      <section className="card mb-6 space-y-2 p-4">
        <div className="flex items-center justify-between">
          <span className="label">Beats</span>
          <span className="text-xs text-ink-400">
            {ts.beats}/{ts.unit} · {barBeats} beats per bar
          </span>
        </div>
        <SpacingPanel
          sections={spacingTargets}
          barBeats={barBeats}
          mode={spacingMode}
          setMode={setSpacingMode}
          beatsPerChord={beatsPerChord}
          setBeatsPerChord={setBeatsPerChord}
          grid={spacingGrid}
          setGrid={setSpacingGrid}
          onApply={applySpacing}
          onClear={clearBeats}
        />
        <p className="text-xs text-ink-400">
          Gives every chord a beat so the Highway view and play-along work without
          tagging. Chord-grid parts are timed by their grid and are never respaced.
        </p>
      </section>

      {/* Parts */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {sections.map((s) => (
              <SortableSection
                key={s.id}
                section={s}
                preview={preview}
                songKey={key}
                usedChords={usedChords}
                flats={flats}
                timeSignature={ts}
                onChange={(patch) => updateSection(s.id, patch)}
                onSetMode={(mode) => setSectionMode(s.id, mode)}
                onRemove={() => removeSection(s.id)}
                onSplit={(atChar) => splitSection(s.id, atChar)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button className="btn-secondary mt-4 w-full" onClick={addSection}>
        <Plus size={16} /> Add part
      </button>
    </div>
  );
}

function SortableSection({
  section,
  preview,
  songKey,
  usedChords,
  flats,
  timeSignature,
  onChange,
  onSetMode,
  onRemove,
  onSplit,
}: {
  section: EditSection;
  preview: boolean;
  songKey: string;
  usedChords: string[];
  flats: boolean;
  timeSignature: TimeSignature;
  onChange: (patch: Partial<EditSection>) => void;
  onSetMode: (mode: SectionMode) => void;
  onRemove: () => void;
  onSplit: (atChar: number) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const patterns = useRhythmPatterns();
  const [newPatternOpen, setNewPatternOpen] = useState(false);
  const lines = useMemo(() => parseLines(section.body), [section.body]);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Last known caret offset — read on demand so the toolbar Split button works
  // even though clicking it blurs the textarea.
  const caretRef = useRef(0);
  const grid = section.mode === 'grid';

  // Special sentinel value the rhythm select uses to trigger inline creation.
  const CREATE = '__create__';

  /** Apply a caret-aware text edit and restore the caret, keeping focus. */
  function applyEdit(edit: { text: string; caret: number } | null) {
    if (!edit) return;
    onChange({ body: edit.text });
    const el = textareaRef.current;
    caretRef.current = edit.caret;
    if (el) {
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(edit.caret, edit.caret);
      });
    }
  }

  function caret(): number {
    return textareaRef.current?.selectionStart ?? caretRef.current;
  }

  /**
   * Keyboard shortcuts over the raw ChordPro text (see `lib/chordproEdit`). Alt
   * is the modifier throughout so plain arrows keep moving the caret:
   *   Alt+↑/↓  transpose the chord at the caret
   *   Alt+←/→  slide it one character (one syllable) earlier/later
   *   Tab      hop to the next chord (Shift+Tab the previous)
   *   Cmd/Ctrl+K  drop empty brackets ready to type into
   */
  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    const at = caret();
    if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      applyEdit(transposeTokenAt(section.body, at, e.key === 'ArrowUp' ? 1 : -1, flats));
      return;
    }
    if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault();
      applyEdit(moveTokenAt(section.body, at, e.key === 'ArrowRight' ? 1 : -1));
      return;
    }
    if (e.key === 'Tab') {
      const next = nextTokenCaret(section.body, at, e.shiftKey ? -1 : 1);
      if (next === null) return; // let Tab move focus out of the field
      e.preventDefault();
      textareaRef.current?.setSelectionRange(next, next);
      caretRef.current = next;
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      applyEdit(insertEmptyBrackets(section.body, at));
    }
  }

  /** Replace one line in the body — the write path for tap-to-place editing. */
  function replaceLine(index: number, next: Line) {
    const updated = lines.map((l, i) => (i === index ? next : l));
    onChange({ body: serializeLines(updated) });
  }

  const suggestions = useMemo(
    () => [
      ...usedChords.map((symbol) => ({ symbol })),
      ...diatonicChords(songKey)
        .filter((d) => !usedChords.includes(d.symbol))
        .map((d) => ({ symbol: d.symbol, numeral: d.numeral })),
    ],
    [usedChords, songKey],
  );

  // Symbols that don't parse as chords. Not an error — "N.C." and section cues
  // are legitimate — but a typo like "Bm7b5b" is worth pointing at.
  const unknown = useMemo(() => {
    const source = grid ? parseChordGrid(section.grid).unknownChords : [];
    const fromBody = chordsInText(section.body).filter((sym) => !parseChordSymbol(sym));
    return [...new Set([...source, ...fromBody])];
  }, [grid, section.grid, section.body]);

  const gridInfo = useMemo(
    () => (grid ? parseChordGrid(section.grid) : null),
    [grid, section.grid],
  );

  return (
    <section ref={setNodeRef} style={style} className="card overflow-hidden">
      <header className="flex flex-wrap items-center gap-2 border-b border-ink-200 bg-ink-50 px-3 py-2 dark:border-ink-800 dark:bg-ink-950/40">
        <button
          className="cursor-grab touch-none text-ink-400 active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical size={16} />
        </button>
        <select
          className="input h-8 w-auto py-0 text-sm"
          value={section.kind}
          onChange={(e) => onChange({ kind: e.target.value as SectionKind })}
        >
          {SECTION_KINDS.map((k) => (
            <option key={k} value={k}>
              {defaultLabelForKind(k)}
            </option>
          ))}
        </select>
        <input
          className="input h-8 min-w-[6rem] flex-1 py-0 text-sm"
          placeholder={`${defaultLabelForKind(section.kind)} label (optional)`}
          value={section.label ?? ''}
          onChange={(e) => onChange({ label: e.target.value || undefined })}
        />

        {/* Lyrics vs. chord-grid authoring */}
        <div className="flex items-center gap-1 rounded-xl bg-ink-100 p-1 dark:bg-ink-800">
          {(
            [
              ['lyrics', 'Lyrics', Type],
              ['grid', 'Grid', Grid3x3],
            ] as const
          ).map(([mode, label, Icon]) => (
            <button
              key={mode}
              onClick={() => onSetMode(mode)}
              title={
                mode === 'grid'
                  ? 'Type the progression in bars — timing comes out for free'
                  : 'Chords anchored to lyrics (ChordPro)'
              }
              className={[
                'flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium',
                section.mode === mode
                  ? 'bg-accent text-accent-fg'
                  : 'hover:bg-ink-200 dark:hover:bg-ink-700',
              ].join(' ')}
            >
              <Icon size={12} /> {label}
            </button>
          ))}
        </div>

        <select
          className="input h-8 w-auto py-0 text-sm"
          value={section.rhythmPatternId ?? ''}
          title="Rhythm pattern"
          onChange={(e) => {
            if (e.target.value === CREATE) setNewPatternOpen(true);
            else onChange({ rhythmPatternId: e.target.value || undefined });
          }}
        >
          <option value="">No rhythm</option>
          {patterns?.map((p) => (
            <option key={p.id} value={p.id}>
              ♪ {p.name}
            </option>
          ))}
          <option value={CREATE}>+ New pattern…</option>
        </select>
        {!grid && (
          <button
            className="btn-ghost p-1.5"
            onClick={() => onSplit(caret())}
            title="Split here — move everything from the cursor down into a new part"
            aria-label="Split section at cursor"
          >
            <SplitSquareVertical size={15} />
          </button>
        )}
        <button className="btn-ghost p-1.5 text-red-600" onClick={onRemove} aria-label="Remove part">
          <Trash2 size={15} />
        </button>
      </header>

      {/* Chord palette — one tap instead of typing brackets. */}
      <div className="border-b border-ink-200 px-3 py-2 dark:border-ink-800">
        <ChordPalette
          songKey={songKey}
          used={usedChords}
          onPick={(chord) =>
            grid
              ? onChange({ grid: appendGridToken(section.grid, chord) })
              : applyEdit(insertChordAt(section.body, caret(), chord))
          }
        />
      </div>

      {grid ? (
        <div className="grid gap-0 md:grid-cols-2">
          <textarea
            className="input min-h-[8rem] resize-y rounded-none border-0 font-mono text-xs focus:ring-0 md:border-r md:border-ink-200 md:dark:border-ink-800"
            placeholder={'| G | C | Am  D | G . . C |\n|: G | C :| x2'}
            value={section.grid}
            onChange={(e) => onChange({ grid: e.target.value })}
            spellCheck={false}
          />
          <GridPreview
            grid={section.grid}
            timeSignature={timeSignature}
            warnings={gridInfo?.warnings ?? []}
            unknown={unknown}
          />
        </div>
      ) : (
        <div className="grid gap-0 md:grid-cols-2">
          <textarea
            ref={textareaRef}
            className="input min-h-[8rem] resize-y rounded-none border-0 font-mono text-xs focus:ring-0 md:border-r md:border-ink-200 md:dark:border-ink-800"
            placeholder={'[G]Type lyrics with [C]inline chords…'}
            value={section.body}
            onChange={(e) => onChange({ body: e.target.value })}
            onKeyDown={onKeyDown}
            onSelect={(e) => {
              caretRef.current = e.currentTarget.selectionStart;
            }}
            spellCheck={false}
          />
          {preview && (
            <div className="min-h-[8rem] space-y-1 overflow-x-auto bg-ink-50/50 p-3 dark:bg-ink-950/30">
              {lines.some((l) => l.lyric || l.events.length) ? (
                <>
                  {lines.map((l, i) => (
                    <ChordLineEditor
                      key={l.id}
                      line={l}
                      suggestions={suggestions}
                      onChange={(next) => replaceLine(i, next)}
                    />
                  ))}
                  <p className="pt-2 text-[0.65rem] leading-snug text-ink-400">
                    Tap a letter to put a chord on it; tap a chord to change or remove
                    it; drag one sideways to move it. In the text: Alt+↑/↓ transposes,
                    Alt+←/→ nudges, Tab hops between chords.
                  </p>
                </>
              ) : (
                <p className="text-xs text-ink-400">
                  Type lyrics on the left, then tap a letter here to put a chord on it.
                </p>
              )}
              {unknown.length > 0 && <UnknownChords unknown={unknown} />}
            </div>
          )}
        </div>
      )}

      {newPatternOpen && (
        <RhythmPatternEditor
          open
          onClose={() => setNewPatternOpen(false)}
          onSaved={(id) => onChange({ rhythmPatternId: id })}
        />
      )}
    </section>
  );
}

/** Compiled view of a chord grid: the bars it makes and how long it runs. */
function GridPreview({
  grid,
  timeSignature,
  warnings,
  unknown,
}: {
  grid: string;
  timeSignature: TimeSignature;
  warnings: string[];
  unknown: string[];
}) {
  const parsed = useMemo(() => parseChordGrid(grid), [grid]);
  const bars = gridBarCount(grid);

  return (
    <div className="min-h-[8rem] space-y-2 overflow-x-auto bg-ink-50/50 p-3 dark:bg-ink-950/30">
      {bars === 0 ? (
        <div className="space-y-1 text-xs text-ink-400">
          <p>Type the progression in bars, one chord per slot:</p>
          <ul className="ml-4 list-disc space-y-0.5">
            <li>
              <code>| G | C |</code> — a bar each
            </li>
            <li>
              <code>| G C |</code> — half a bar each
            </li>
            <li>
              <code>| G . . C |</code> — G on 1, C on 4
            </li>
            <li>
              <code>|: G | C :| x4</code> — repeat four times
            </li>
            <li>
              <code>| G | % |</code> — repeat the bar · <code>| - |</code> a bar of rest
            </li>
          </ul>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-1 font-mono text-xs">
            {parsed.bars.map((bar) => (
              <span
                key={bar.number}
                className="rounded border border-ink-200 px-1.5 py-1 dark:border-ink-700"
                title={`Bar ${bar.number}`}
              >
                {bar.tokens.length ? bar.tokens.join(' ') : '–'}
              </span>
            ))}
          </div>
          <p className="text-xs text-ink-400">
            {bars} bar{bars === 1 ? '' : 's'} · {timeSignature.beats}/{timeSignature.unit} · chords
            land on exact beats, so this part needs no tagging.
          </p>
        </>
      )}
      {warnings.map((w) => (
        <p key={w} className="text-xs text-amber-600 dark:text-amber-400">
          {w}
        </p>
      ))}
      {unknown.length > 0 && <UnknownChords unknown={unknown} />}
    </div>
  );
}

function UnknownChords({ unknown }: { unknown: string[] }) {
  return (
    <p className="text-xs text-amber-600 dark:text-amber-400">
      Not recognised as chord{unknown.length === 1 ? '' : 's'}:{' '}
      {unknown.map((u) => (
        <code key={u} className="mx-0.5">
          {u}
        </code>
      ))}
      {' — fine for cues like N.C., worth a look otherwise.'}
    </p>
  );
}

/** Append a chord to a grid, opening a new bar when the text ends on a bar line. */
function appendGridToken(grid: string, chord: string): string {
  const trimmed = grid.replace(/\s+$/, '');
  if (!trimmed) return `| ${chord} `;
  return /\|$/.test(trimmed) ? `${trimmed} ${chord} ` : `${trimmed} ${chord} `;
}

function Field({
  label,
  className = '',
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="label mb-1">{label}</span>
      {children}
    </label>
  );
}

function parseTimeSig(value: string) {
  const m = value.match(/(\d+)\s*\/\s*(\d+)/);
  return m ? { beats: Number(m[1]), unit: Number(m[2]) } : undefined;
}
