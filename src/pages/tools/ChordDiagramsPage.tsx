// Browse the chord diagrams available for an instrument. Pick an instrument,
// then see its bundled "Standard" charts up top and any user-added "Custom"
// charts below. Filters (key, 7th chords) and sort orders (alphabetical, root,
// circle of fifths) narrow and reorder both lists. Anyone — not just admins —
// can add a new chart or override/edit/delete a custom one right here.

import { useMemo, useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { ChordChart } from '@/components/chords/ChordChart';
import { CustomChordEditor } from '@/components/chords/CustomChordEditor';
import {
  deleteChordDefinition,
  useChordDefinitions,
  useSettings,
  useUserInstruments,
} from '@/db/repo';
import {
  BUILTIN_GUITAR,
  KEY_LABELS,
  allInstruments,
  arrangeChords,
  resolveChord,
  standardChordNames,
  type ChordSort,
  type ResolvedChart,
} from '@/lib/chords';
import type { ChordDefinition } from '@/types';

type EditorState =
  | { initial: ChordDefinition; seed?: undefined }
  | { initial?: undefined; seed?: { name?: string; baseFret?: number; frets?: number[] } };

const SORTS: { value: ChordSort; label: string }[] = [
  { value: 'library', label: 'Default order' },
  { value: 'alpha', label: 'Alphabetical' },
  { value: 'root', label: 'By root (chromatic)' },
  { value: 'fifths', label: 'Circle of fifths' },
];

export function ChordDiagramsPage() {
  const settings = useSettings();
  const userInstruments = useUserInstruments();
  const userDefs = useChordDefinitions();

  const instruments = useMemo(
    () => allInstruments(userInstruments ?? []),
    [userInstruments],
  );

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [keyPc, setKeyPc] = useState<number | null>(null);
  const [includeSevenths, setIncludeSevenths] = useState(true);
  const [sort, setSort] = useState<ChordSort>('library');
  const [editor, setEditor] = useState<EditorState | null>(null);

  // Prefer an explicit pick, then "my instrument", then guitar — and fall back
  // to the first available instrument if that id no longer resolves (e.g. a
  // deleted custom instrument, or the empty default).
  const preferredId = selectedId || settings?.myInstrumentId || BUILTIN_GUITAR;
  const instrument =
    instruments.find((i) => i.id === preferredId) ?? instruments[0];
  const instrumentId = instrument?.id ?? BUILTIN_GUITAR;

  // Standard (bundled / computed) charts for this instrument.
  const standard = useMemo<ResolvedChart[]>(() => {
    if (!instrument) return [];
    const names = arrangeChords(
      standardChordNames(instrumentId, instrument),
      (n) => n,
      { keyPc, includeSevenths, sort },
    );
    return names
      .map((name) => resolveChord(instrumentId, name, { instrument }))
      .filter((c): c is ResolvedChart => c !== null);
  }, [instrumentId, instrument, keyPc, includeSevenths, sort]);

  // User-added charts for this instrument, with their definitions for editing.
  const custom = useMemo<{ def: ChordDefinition; chart: ResolvedChart }[]>(() => {
    if (!instrument || !userDefs) return [];
    const defs = arrangeChords(
      userDefs.filter((d) => d.instrumentId === instrumentId),
      (d) => d.name,
      { keyPc, includeSevenths, sort },
    );
    return defs
      .map((def) => {
        const chart = resolveChord(instrumentId, def.name, { instrument, userDefs });
        return chart ? { def, chart } : null;
      })
      .filter((x): x is { def: ChordDefinition; chart: ResolvedChart } => x !== null);
  }, [instrumentId, instrument, userDefs, keyPc, includeSevenths, sort]);

  if (!settings) return <p className="text-sm text-ink-500">Loading…</p>;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Chord Diagrams"
        subtitle="Browse the chord charts available for each instrument."
        actions={
          instrument && (
            <button className="btn-primary text-sm" onClick={() => setEditor({})}>
              <Plus size={16} /> Add chord
            </button>
          )
        }
      />

      {/* Instrument picker */}
      <div className="mb-4 flex flex-wrap gap-2">
        {instruments.map((i) => {
          const active = i.id === instrumentId;
          return (
            <button
              key={i.id}
              onClick={() => setSelectedId(i.id)}
              className={
                active
                  ? 'rounded-full bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg'
                  : 'rounded-full border border-ink-200 px-3 py-1.5 text-sm text-ink-600 transition hover:border-accent dark:border-ink-700 dark:text-ink-300'
              }
            >
              {i.name}
              {!i.builtin && <span className="ml-1 text-xs opacity-70">(custom)</span>}
            </button>
          );
        })}
      </div>

      {/* Filters & sort */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="label mb-1">Key</span>
          <select
            className="input h-9 w-auto py-0"
            value={keyPc ?? ''}
            onChange={(e) => setKeyPc(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">All keys</option>
            {KEY_LABELS.map((label, pc) => (
              <option key={pc} value={pc}>
                {label} major
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="label mb-1">Sort</span>
          <select
            className="input h-9 w-auto py-0"
            value={sort}
            onChange={(e) => setSort(e.target.value as ChordSort)}
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex h-9 cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-accent"
            checked={includeSevenths}
            onChange={(e) => setIncludeSevenths(e.target.checked)}
          />
          Show 7th &amp; extended chords
        </label>
      </div>

      <ChartSection
        title="Standard"
        hint="Ships with the app."
        charts={standard.map((chart) => ({
          chart,
          // Seed the editor from the standard shape so it can be customized.
          onEdit: () =>
            setEditor({
              seed: {
                name: chart.name,
                ...(chart.kind === 'fretted'
                  ? { baseFret: chart.fretted.baseFret, frets: chart.fretted.frets }
                  : {}),
              },
            }),
          editLabel: 'Customize this chord',
        }))}
        emptyText="No charts match the current filters."
      />

      <ChartSection
        title="Custom"
        hint="Added by you."
        charts={custom.map(({ def, chart }) => ({
          chart,
          onEdit: () => setEditor({ initial: def }),
          editLabel: 'Edit',
          onDelete: () => {
            if (confirm(`Delete custom chart "${def.name}"?`)) void deleteChordDefinition(def.id);
          },
        }))}
        emptyText="No custom charts for this instrument yet. Use “Add chord” to create one."
      />

      {editor && instrument && (
        <CustomChordEditor
          open
          onClose={() => setEditor(null)}
          instrument={instrument}
          initial={editor.initial}
          seed={editor.seed}
        />
      )}
    </div>
  );
}

type Cell = {
  chart: ResolvedChart;
  onEdit: () => void;
  editLabel: string;
  onDelete?: () => void;
};

function ChartSection({
  title,
  hint,
  charts,
  emptyText,
}: {
  title: string;
  hint: string;
  charts: Cell[];
  emptyText: string;
}) {
  return (
    <section className="mb-8">
      <div className="mb-3 flex items-baseline gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-700 dark:text-ink-300">
          {title}
        </h2>
        <span className="text-xs text-ink-400">
          {charts.length > 0 ? `${charts.length} · ${hint}` : hint}
        </span>
      </div>
      {charts.length > 0 ? (
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-4 md:grid-cols-5">
          {charts.map(({ chart, onEdit, editLabel, onDelete }) => (
            <div
              key={chart.name}
              className="group relative flex items-center justify-center rounded-xl border border-ink-100 bg-ink-50/50 p-3 dark:border-ink-800 dark:bg-ink-950/30"
            >
              <div className="absolute right-1 top-1 flex gap-0.5 opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100">
                <button
                  className="rounded-md bg-ink-100/80 p-1 text-ink-500 hover:text-accent dark:bg-ink-800/80"
                  title={editLabel}
                  aria-label={editLabel}
                  onClick={onEdit}
                >
                  <Pencil size={13} />
                </button>
                {onDelete && (
                  <button
                    className="rounded-md bg-ink-100/80 p-1 text-ink-500 hover:text-red-600 dark:bg-ink-800/80"
                    title="Delete"
                    aria-label="Delete"
                    onClick={onDelete}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
              <ChordChart chart={chart} size="sm" />
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-ink-400">{emptyText}</p>
      )}
    </section>
  );
}
