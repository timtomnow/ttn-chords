// The arrangement pane: assemble the performance order out of the parts you've
// authored, instead of copy-pasting a chorus four times.
//
// Each chip is one occurrence of a part. Reorder by dragging, add another
// occurrence from the "Add part" menu, and give any single occurrence its own
// repeat count, transpose or note (a last chorus up a tone, "softly this time").
// Every occurrence shares the part's chords and beats, so tagging the chorus once
// times all four of them — that's the whole point.
//
// Until the user opts in, `arrangement` stays undefined and the song plays its
// parts in order, exactly as before. "Reset" returns to that state.

import { useState } from 'react';
import {
  DndContext,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import { SortableContext, arrayMove, useSortable, rectSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { ListOrdered, Plus, RotateCcw, Settings2, Trash2, X } from 'lucide-react';
import { defaultLabelForKind } from '@/lib/chordpro';
import { appendToArrangement, arrangementOf, defaultArrangement, occurrenceLabel } from '@/lib/song';
import type { ArrangementEntry, Section } from '@/types';

export function ArrangementEditor({
  sections,
  arrangement,
  onChange,
}: {
  /** The pool of authored parts. */
  sections: Section[];
  /** Undefined = "play the parts in order" (the implicit arrangement). */
  arrangement?: ArrangementEntry[];
  onChange: (next: ArrangementEntry[] | undefined) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  // Resolve through the same helper the timeline uses, so the chips read exactly
  // as the perform view will ("Chorus 2", ×3, +2).
  const slots = arrangementOf({ id: 'edit', level: 0, sections, arrangement });

  if (!sections.length) {
    return (
      <p className="text-xs text-ink-400">Add a part below, then arrange the performance order.</p>
    );
  }

  const custom = Boolean(arrangement?.length);
  const entries = arrangement ?? [];

  function patch(entryId: string, p: Partial<ArrangementEntry>) {
    onChange(entries.map((e) => (e.id === entryId ? { ...e, ...p } : e)));
  }
  function remove(entryId: string) {
    const next = entries.filter((e) => e.id !== entryId);
    setOpenId(null);
    // Removing the last chip drops back to the implicit "parts in order", since
    // an empty arrangement would mean that anyway.
    onChange(next.length ? next : undefined);
  }
  function onDragEnd(e: DragEndEvent) {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = entries.findIndex((x) => x.id === active.id);
    const to = entries.findIndex((x) => x.id === over.id);
    if (from !== -1 && to !== -1) onChange(arrayMove(entries, from, to));
  }

  if (!custom) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-ink-500">
          Playing the {sections.length} part{sections.length === 1 ? '' : 's'} below in order.
        </span>
        <button
          type="button"
          className="btn-secondary px-2 py-1 text-xs"
          onClick={() => onChange(defaultArrangement(sections))}
        >
          <ListOrdered size={14} /> Build an arrangement
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={entries.map((e) => e.id)} strategy={rectSortingStrategy}>
          <div className="flex flex-wrap items-center gap-1.5">
            {slots.map((slot, i) => (
              <SlotChip
                key={slot.entryId}
                entryId={slot.entryId}
                label={occurrenceLabel(slots, i)}
                repeat={slot.repeat}
                transpose={slot.transpose}
                hasNote={Boolean(slot.notes)}
                open={openId === slot.entryId}
                onToggle={() => setOpenId((id) => (id === slot.entryId ? null : slot.entryId))}
              />
            ))}
            <AddPartMenu
              sections={sections}
              onAdd={(sectionId) => onChange(appendToArrangement(entries, sectionId))}
            />
          </div>
        </SortableContext>
      </DndContext>

      {openId && (
        <SlotSettings
          entry={entries.find((e) => e.id === openId)!}
          label={occurrenceLabel(
            slots,
            slots.findIndex((s) => s.entryId === openId),
          )}
          onPatch={(p) => patch(openId, p)}
          onRemove={() => remove(openId)}
          onClose={() => setOpenId(null)}
        />
      )}

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="btn-ghost px-2 py-1 text-xs"
          onClick={() => onChange(undefined)}
          title="Go back to playing the parts in order"
        >
          <RotateCcw size={13} /> Reset to parts order
        </button>
        <span className="text-xs text-ink-400">
          Drag to reorder · tap a part for repeats, transpose and notes
        </span>
      </div>
    </div>
  );
}

function SlotChip({
  entryId,
  label,
  repeat,
  transpose,
  hasNote,
  open,
  onToggle,
}: {
  entryId: string;
  label: string;
  repeat: number;
  transpose: number;
  hasNote: boolean;
  open: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: entryId,
  });
  return (
    <button
      ref={setNodeRef}
      type="button"
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      {...attributes}
      {...listeners}
      onClick={onToggle}
      className={[
        'flex cursor-grab touch-none items-baseline gap-1 rounded-lg px-2 py-1 text-xs font-medium active:cursor-grabbing',
        open ? 'bg-accent text-accent-fg ring-2 ring-accent' : 'bg-ink-100 dark:bg-ink-800',
      ].join(' ')}
    >
      {label}
      {repeat > 1 && <span className="opacity-60">×{repeat}</span>}
      {transpose !== 0 && (
        <span className="opacity-60">{transpose > 0 ? `+${transpose}` : transpose}</span>
      )}
      {hasNote && <Settings2 size={11} className="opacity-60" />}
    </button>
  );
}

/** Per-occurrence settings: repeat, transpose, note, remove. */
function SlotSettings({
  entry,
  label,
  onPatch,
  onRemove,
  onClose,
}: {
  entry: ArrangementEntry;
  label: string;
  onPatch: (p: Partial<ArrangementEntry>) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const repeat = entry.repeat ?? 1;
  const transpose = entry.transpose ?? 0;
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-xl border border-accent/40 bg-accent/5 p-3">
      <span className="text-xs font-semibold uppercase tracking-wide text-accent">{label}</span>

      <label className="block">
        <span className="label mb-1">Play</span>
        <select
          className="input h-8 w-auto py-0 text-sm"
          value={repeat}
          onChange={(e) => onPatch({ repeat: Number(e.target.value) || undefined })}
        >
          {[1, 2, 3, 4, 5, 6, 8].map((n) => (
            <option key={n} value={n}>
              {n === 1 ? 'once' : `${n}×`}
            </option>
          ))}
        </select>
      </label>

      <div>
        <span className="label mb-1 block">Transpose</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className="btn-secondary px-2 py-1"
            onClick={() => onPatch({ transpose: transpose - 1 || undefined })}
          >
            −
          </button>
          <span className="w-8 text-center text-sm tabular-nums">
            {transpose > 0 ? `+${transpose}` : transpose}
          </span>
          <button
            type="button"
            className="btn-secondary px-2 py-1"
            onClick={() => onPatch({ transpose: transpose + 1 || undefined })}
          >
            +
          </button>
        </div>
      </div>

      <label className="block min-w-[10rem] flex-1">
        <span className="label mb-1">Note for this time through</span>
        <input
          className="input h-8 py-0 text-sm"
          placeholder="e.g. quietly"
          value={entry.notes ?? ''}
          onChange={(e) => onPatch({ notes: e.target.value || undefined })}
        />
      </label>

      <button type="button" className="btn-ghost px-2 py-1 text-xs text-red-600" onClick={onRemove}>
        <Trash2 size={14} /> Remove
      </button>
      <button type="button" className="btn-ghost p-1.5" onClick={onClose} aria-label="Close">
        <X size={15} />
      </button>
    </div>
  );
}

/** "Add part" — a select that acts as a menu, so it works on touch. */
function AddPartMenu({
  sections,
  onAdd,
}: {
  sections: Section[];
  onAdd: (sectionId: string) => void;
}) {
  return (
    <label className="relative inline-flex items-center">
      <span className="pointer-events-none absolute left-2 flex items-center gap-1 text-xs font-medium text-ink-500">
        <Plus size={13} /> Add part
      </span>
      <select
        className="h-[1.875rem] cursor-pointer appearance-none rounded-lg border border-dashed border-ink-300 bg-transparent pl-[4.75rem] pr-2 text-xs text-transparent dark:border-ink-600"
        value=""
        onChange={(e) => {
          if (e.target.value) onAdd(e.target.value);
          e.currentTarget.selectedIndex = 0;
        }}
        aria-label="Add a part to the arrangement"
      >
        <option value="">Add part…</option>
        {sections.map((s) => (
          <option key={s.id} value={s.id}>
            {s.label || defaultLabelForKind(s.kind)}
          </option>
        ))}
      </select>
    </label>
  );
}
