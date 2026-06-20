import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Copy,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
  SplitSquareVertical,
  Star,
  Trash2,
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
import { ChordLine } from '@/components/chords/ChordLine';
import { RhythmPatternEditor } from '@/components/rhythm/RhythmPatternEditor';
import { deleteSong, updateSong, useRhythmPatterns, useSong } from '@/db/repo';
import { newId } from '@/lib/id';
import {
  SECTION_KINDS,
  defaultLabelForKind,
  parseLines,
  serializeLines,
} from '@/lib/chordpro';
import { preferFlatsForKey } from '@/lib/music';
import type { Section, SectionKind, Song } from '@/types';

// Editor-local section: the body is kept as ChordPro TEXT while editing (so the
// textarea cursor is stable and partial `[` input doesn't churn), and is parsed
// to Line[] only on save.
type EditSection = {
  id: string;
  kind: SectionKind;
  label?: string;
  body: string;
  repeat?: number;
  rhythmPatternId?: string;
};

function toEdit(sections: Section[]): EditSection[] {
  return sections.map((s) => ({
    id: s.id,
    kind: s.kind,
    label: s.label,
    body: serializeLines(s.lines),
    repeat: s.repeat,
    rhythmPatternId: s.rhythmPatternId,
  }));
}

function fromEdit(sections: EditSection[]): Section[] {
  return sections.map((s) => ({
    id: s.id,
    kind: s.kind,
    label: s.label,
    lines: parseLines(s.body),
    repeat: s.repeat,
    rhythmPatternId: s.rhythmPatternId,
  }));
}

// Editor-local difficulty: keeps every variant's body in state so autosave
// writes them all back together (no flush-on-switch needed).
type EditDifficulty = {
  id: string;
  level: number;
  label?: string;
  sections: EditSection[];
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
    ).map((d) => ({ id: d.id, level: d.level, label: d.label, sections: toEdit(d.sections) })),
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
  const sections = activeDiff?.sections ?? [];

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
      const ts = parseTimeSig(timeSig);
      void updateSong(song.id, {
        title: title.trim() || 'Untitled song',
        artist: artist.trim() || undefined,
        key: key.trim() || undefined,
        capo: capo === '' ? undefined : Number(capo),
        tempo: tempo === '' ? undefined : Number(tempo),
        timeSignature: ts,
        tags,
        difficulties: diffs.map((d) => ({
          id: d.id,
          level: d.level,
          label: d.label,
          sections: fromEdit(d.sections),
        })),
        defaultDifficultyId: diffs.some((d) => d.id === defaultDiffId)
          ? defaultDiffId
          : diffs[0]?.id,
      }).then(() => setSaved(true));
    }, 600);
    return () => clearTimeout(handle);
  }, [title, artist, key, capo, tempo, timeSig, tags, diffs, defaultDiffId, song.id]);

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
    const copy: EditDifficulty = {
      id: newId(),
      level: Math.min(5, activeDiff.level + 1),
      label: activeDiff.label,
      sections: activeDiff.sections.map((s) => ({ ...s, id: newId() })),
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
    patchActiveSections((prev) => [...prev, { id: newId(), kind: 'verse', body: '' }]);
  }

  function updateSection(sid: string, patch: Partial<EditSection>) {
    patchActiveSections((prev) => prev.map((s) => (s.id === sid ? { ...s, ...patch } : s)));
  }

  function removeSection(sid: string) {
    patchActiveSections((prev) => prev.filter((s) => s.id !== sid));
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
        body: after,
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

  async function onDelete() {
    if (!confirm('Delete this song? This cannot be undone.')) return;
    await deleteSong(song.id);
    navigate('/songs');
  }

  const flats = preferFlatsForKey(key);

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
              title={preview ? 'Hide chord preview' : 'Show chord preview'}
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

      {/* Sections */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={sections.map((s) => s.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4">
            {sections.map((s) => (
              <SortableSection
                key={s.id}
                section={s}
                preview={preview}
                flats={flats}
                onChange={(patch) => updateSection(s.id, patch)}
                onRemove={() => removeSection(s.id)}
                onSplit={(atChar) => splitSection(s.id, atChar)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button className="btn-secondary mt-4 w-full" onClick={addSection}>
        <Plus size={16} /> Add section
      </button>
    </div>
  );
}

function SortableSection({
  section,
  preview,
  flats,
  onChange,
  onRemove,
  onSplit,
}: {
  section: EditSection;
  preview: boolean;
  flats: boolean;
  onChange: (patch: Partial<EditSection>) => void;
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

  // Special sentinel value the rhythm select uses to trigger inline creation.
  const CREATE = '__create__';

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
        <button
          className="btn-ghost p-1.5"
          onClick={() => onSplit(textareaRef.current?.selectionStart ?? caretRef.current)}
          title="Split here — move everything from the cursor down into a new section"
          aria-label="Split section at cursor"
        >
          <SplitSquareVertical size={15} />
        </button>
        <button className="btn-ghost p-1.5 text-red-600" onClick={onRemove} aria-label="Remove section">
          <Trash2 size={15} />
        </button>
      </header>

      <div className="grid gap-0 md:grid-cols-2">
        <textarea
          ref={textareaRef}
          className="input min-h-[8rem] resize-y rounded-none border-0 font-mono text-xs focus:ring-0 md:border-r md:border-ink-200 md:dark:border-ink-800"
          placeholder={'[G]Type lyrics with [C]inline chords…'}
          value={section.body}
          onChange={(e) => onChange({ body: e.target.value })}
          onSelect={(e) => {
            caretRef.current = e.currentTarget.selectionStart;
          }}
          spellCheck={false}
        />
        {preview && (
          <div className="min-h-[8rem] space-y-1 overflow-x-auto bg-ink-50/50 p-3 dark:bg-ink-950/30">
            {lines.some((l) => l.lyric || l.events.length) ? (
              lines.map((l) => <ChordLine key={l.id} line={l} preferFlats={flats} />)
            ) : (
              <p className="text-xs text-ink-400">Preview appears here.</p>
            )}
          </div>
        )}
      </div>

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
