import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  Eye,
  EyeOff,
  GripVertical,
  Plus,
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
import { deleteSong, updateSong, useSong } from '@/db/repo';
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
};

function toEdit(sections: Section[]): EditSection[] {
  return sections.map((s) => ({
    id: s.id,
    kind: s.kind,
    label: s.label,
    body: serializeLines(s.lines),
    repeat: s.repeat,
  }));
}

function fromEdit(sections: EditSection[]): Section[] {
  return sections.map((s) => ({
    id: s.id,
    kind: s.kind,
    label: s.label,
    lines: parseLines(s.body),
    repeat: s.repeat,
  }));
}

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
  const [sections, setSections] = useState<EditSection[]>(() => toEdit(song.sections));
  const [preview, setPreview] = useState(true);
  const [saved, setSaved] = useState(true);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  // Debounced autosave. The first run after mount is skipped so loading a song
  // doesn't immediately mark it dirty.
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
        sections: fromEdit(sections),
      }).then(() => setSaved(true));
    }, 600);
    return () => clearTimeout(handle);
  }, [title, artist, key, capo, tempo, timeSig, tags, sections, song.id]);

  function addSection() {
    setSections((prev) => [
      ...prev,
      { id: newId(), kind: 'verse', body: '' },
    ]);
  }

  function updateSection(sid: string, patch: Partial<EditSection>) {
    setSections((prev) => prev.map((s) => (s.id === sid ? { ...s, ...patch } : s)));
  }

  function removeSection(sid: string) {
    setSections((prev) => prev.filter((s) => s.id !== sid));
  }

  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    setSections((prev) => {
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
}: {
  section: EditSection;
  preview: boolean;
  flats: boolean;
  onChange: (patch: Partial<EditSection>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  const lines = useMemo(() => parseLines(section.body), [section.body]);

  return (
    <section ref={setNodeRef} style={style} className="card overflow-hidden">
      <header className="flex items-center gap-2 border-b border-ink-200 bg-ink-50 px-3 py-2 dark:border-ink-800 dark:bg-ink-950/40">
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
          className="input h-8 flex-1 py-0 text-sm"
          placeholder={`${defaultLabelForKind(section.kind)} label (optional)`}
          value={section.label ?? ''}
          onChange={(e) => onChange({ label: e.target.value || undefined })}
        />
        <button className="btn-ghost p-1.5 text-red-600" onClick={onRemove} aria-label="Remove section">
          <Trash2 size={15} />
        </button>
      </header>

      <div className="grid gap-0 md:grid-cols-2">
        <textarea
          className="input min-h-[8rem] resize-y rounded-none border-0 font-mono text-xs focus:ring-0 md:border-r md:border-ink-200 md:dark:border-ink-800"
          placeholder={'[G]Type lyrics with [C]inline chords…'}
          value={section.body}
          onChange={(e) => onChange({ body: e.target.value })}
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
