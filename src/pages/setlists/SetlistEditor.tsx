import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  GripVertical,
  Play,
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
import { Modal } from '@/components/ui/Modal';
import {
  deleteSetlist,
  updateSetlist,
  useSetlist,
  useSongs,
  useSongsByIds,
} from '@/db/repo';
import type { Setlist, SetlistEntry } from '@/types';

export function SetlistEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const setlist = useSetlist(id);

  if (setlist === undefined) return <p className="text-sm text-ink-500">Loading…</p>;
  if (!setlist) {
    return (
      <div>
        <button className="btn-ghost mb-4" onClick={() => navigate('/setlists')}>
          <ArrowLeft size={16} /> Back
        </button>
        <p className="text-sm text-ink-500">Setlist not found.</p>
      </div>
    );
  }
  return <Editor key={setlist.id} setlist={setlist} />;
}

function Editor({ setlist }: { setlist: Setlist }) {
  const navigate = useNavigate();
  const [name, setName] = useState(setlist.name);
  const [description, setDescription] = useState(setlist.description ?? '');
  const [entries, setEntries] = useState<SetlistEntry[]>(setlist.entries);
  const [saved, setSaved] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  const songMap = useSongsByIds(entries.map((e) => e.songId));
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    setSaved(false);
    const h = setTimeout(() => {
      void updateSetlist(setlist.id, {
        name: name.trim() || 'Untitled setlist',
        description: description.trim() || undefined,
        entries,
      }).then(() => setSaved(true));
    }, 500);
    return () => clearTimeout(h);
  }, [name, description, entries, setlist.id]);

  function addSongs(ids: string[]) {
    setEntries((prev) => [...prev, ...ids.map((songId) => ({ songId }))]);
  }
  function removeAt(i: number) {
    setEntries((prev) => prev.filter((_, idx) => idx !== i));
  }
  function patchAt(i: number, patch: Partial<SetlistEntry>) {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e)));
  }
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = Number(active.id);
    const to = Number(over.id);
    setEntries((prev) => arrayMove(prev, from, to));
  }

  async function onDelete() {
    if (!confirm('Delete this setlist?')) return;
    await deleteSetlist(setlist.id);
    navigate('/setlists');
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button className="btn-ghost -ml-2" onClick={() => navigate('/setlists')}>
          <ArrowLeft size={16} /> Setlists
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
        title="Edit setlist"
        actions={
          <>
            <button
              className="btn-primary"
              onClick={() => navigate(`/setlists/${setlist.id}/run`)}
              disabled={entries.length === 0}
            >
              <Play size={15} /> Run
            </button>
            <button className="btn-ghost text-red-600" onClick={onDelete}>
              <Trash2 size={16} />
            </button>
          </>
        }
      />

      <section className="card mb-6 space-y-3 p-4">
        <label className="block">
          <span className="label mb-1">Name</span>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="label mb-1">Description</span>
          <input
            className="input"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional"
          />
        </label>
      </section>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext
          items={entries.map((_, i) => String(i))}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {entries.map((entry, i) => (
              <SortableEntry
                key={`${entry.songId}-${i}`}
                index={i}
                entry={entry}
                title={songMap?.get(entry.songId)?.title ?? '(missing song)'}
                songKey={songMap?.get(entry.songId)?.key}
                onPatch={(patch) => patchAt(i, patch)}
                onRemove={() => removeAt(i)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button className="btn-secondary mt-4 w-full" onClick={() => setAddOpen(true)}>
        <Plus size={16} /> Add songs
      </button>

      <AddSongsModal open={addOpen} onClose={() => setAddOpen(false)} onAdd={addSongs} />
    </div>
  );
}

function SortableEntry({
  index,
  entry,
  title,
  songKey,
  onPatch,
  onRemove,
}: {
  index: number;
  entry: SetlistEntry;
  title: string;
  songKey?: string;
  onPatch: (patch: Partial<SetlistEntry>) => void;
  onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: String(index),
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  const [open, setOpen] = useState(false);

  return (
    <div ref={setNodeRef} style={style} className="card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          className="cursor-grab touch-none text-ink-400 active:cursor-grabbing"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical size={16} />
        </button>
        <span className="w-5 text-center text-xs text-ink-400">{index + 1}</span>
        <button className="min-w-0 flex-1 text-left" onClick={() => setOpen((o) => !o)}>
          <div className="truncate text-sm font-medium">{title}</div>
          <div className="truncate text-xs text-ink-400">
            {[
              songKey && `Key ${songKey}`,
              entry.transpose ? `transpose ${entry.transpose > 0 ? '+' : ''}${entry.transpose}` : null,
              entry.capo ? `capo ${entry.capo}` : null,
            ]
              .filter(Boolean)
              .join(' · ') || 'Tap to set overrides'}
          </div>
        </button>
        <button className="btn-ghost p-1.5 text-red-600" onClick={onRemove} aria-label="Remove">
          <Trash2 size={15} />
        </button>
      </div>

      {open && (
        <div className="grid grid-cols-2 gap-3 border-t border-ink-200 bg-ink-50 px-3 py-3 dark:border-ink-800 dark:bg-ink-950/40">
          <label className="block">
            <span className="label mb-1">Transpose</span>
            <input
              className="input"
              type="number"
              value={entry.transpose ?? ''}
              onChange={(e) =>
                onPatch({ transpose: e.target.value === '' ? undefined : Number(e.target.value) })
              }
              placeholder="0"
            />
          </label>
          <label className="block">
            <span className="label mb-1">Capo</span>
            <input
              className="input"
              type="number"
              value={entry.capo ?? ''}
              onChange={(e) =>
                onPatch({ capo: e.target.value === '' ? undefined : Number(e.target.value) })
              }
              placeholder="0"
            />
          </label>
          <label className="col-span-2 block">
            <span className="label mb-1">Performance notes</span>
            <input
              className="input"
              value={entry.notes ?? ''}
              onChange={(e) => onPatch({ notes: e.target.value || undefined })}
              placeholder="Only shown in this setlist"
            />
          </label>
        </div>
      )}
    </div>
  );
}

function AddSongsModal({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (ids: string[]) => void;
}) {
  const songs = useSongs();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function commit() {
    if (selected.size) onAdd([...selected]);
    setSelected(new Set());
    setQuery('');
    onClose();
  }

  const filtered = (songs ?? []).filter((s) => {
    const q = query.trim().toLowerCase();
    return !q || s.title.toLowerCase().includes(q) || (s.artist ?? '').toLowerCase().includes(q);
  });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Add songs"
      footer={
        <>
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={commit} disabled={selected.size === 0}>
            Add {selected.size > 0 ? selected.size : ''}
          </button>
        </>
      }
    >
      <input
        className="input mb-3"
        placeholder="Search songs…"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      <ul className="max-h-[50vh] space-y-1 overflow-y-auto">
        {filtered.map((s) => (
          <li key={s.id}>
            <button
              onClick={() => toggle(s.id)}
              className={[
                'flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition',
                selected.has(s.id)
                  ? 'bg-accent text-accent-fg'
                  : 'hover:bg-ink-100 dark:hover:bg-ink-800',
              ].join(' ')}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">{s.title}</span>
                {s.artist && <span className="block truncate text-xs opacity-70">{s.artist}</span>}
              </span>
              {selected.has(s.id) && <Check size={16} />}
            </button>
          </li>
        ))}
        {filtered.length === 0 && (
          <li className="px-3 py-6 text-center text-sm text-ink-400">No songs found.</li>
        )}
      </ul>
    </Modal>
  );
}
