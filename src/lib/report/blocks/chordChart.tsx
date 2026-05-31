// Chord-chart strip: a row of diagrams for the active instrument. Chords are an
// explicit list (so a handout can show just the chords being taught); an editor
// helper can fill the list from a song's used chords.

import { Grid3x3 } from 'lucide-react';
import { useSongs } from '@/db/repo';
import { ChordChart } from '@/components/chords/ChordChart';
import { useChartResolver } from '@/components/chords/useChartResolver';
import { uniqueChords } from '@/lib/song';
import { registerBlock } from '../registry';
import type { BlockEditorProps, BlockRenderProps } from '../types';

function chords(c: Record<string, unknown>): string[] {
  return Array.isArray(c.chords) ? (c.chords.filter((x) => typeof x === 'string') as string[]) : [];
}
function size(c: Record<string, unknown>): 'sm' | 'md' | 'lg' {
  return c.size === 'md' || c.size === 'lg' ? c.size : 'sm';
}

function Render({ block, mode }: BlockRenderProps) {
  const list = chords(block.config);
  const { resolve, instrument } = useChartResolver();
  if (list.length === 0) {
    if (mode === 'print') return null;
    return (
      <div className="rounded-lg border border-dashed border-ink-300 px-3 py-4 text-center text-xs text-ink-400 dark:border-ink-700">
        Add chords to show diagrams
      </div>
    );
  }
  return (
    <div className="flex flex-wrap gap-3">
      {list.map((name) => {
        const chart = resolve(name);
        return chart ? (
          <ChordChart key={name} chart={chart} size={size(block.config)} />
        ) : (
          <figure key={name} className="inline-flex flex-col items-center gap-1">
            <div className="flex h-16 w-12 items-center justify-center rounded border border-dashed border-ink-300 text-xs text-ink-400 dark:border-ink-700">
              ?
            </div>
            <figcaption className="text-xs font-semibold">{name}</figcaption>
          </figure>
        );
      })}
      {mode === 'screen' && instrument && (
        <span className="sr-only">{instrument.name}</span>
      )}
    </div>
  );
}

function Editor({ block, onChange }: BlockEditorProps) {
  const songs = useSongs();
  const list = chords(block.config);

  function fillFromSong(songId: string) {
    const song = songs?.find((s) => s.id === songId);
    if (!song) return;
    onChange({ chords: uniqueChords(song.sections, 0, false) });
  }

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="label mb-1">Chords (comma-separated)</span>
        <input
          className="input"
          value={list.join(', ')}
          placeholder="G, C, D, Em"
          onChange={(e) =>
            onChange({
              chords: e.target.value
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean),
            })
          }
        />
      </label>
      <label className="block">
        <span className="label mb-1">Fill from song</span>
        <select
          className="input"
          value=""
          onChange={(e) => e.target.value && fillFromSong(e.target.value)}
        >
          <option value="">— choose a song —</option>
          {songs?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label mb-1">Size</span>
        <select
          className="input"
          value={size(block.config)}
          onChange={(e) => onChange({ size: e.target.value })}
        >
          <option value="sm">Small</option>
          <option value="md">Medium</option>
          <option value="lg">Large</option>
        </select>
      </label>
    </div>
  );
}

registerBlock({
  type: 'chordChart',
  label: 'Chord charts',
  icon: Grid3x3,
  defaultPlacement: { mode: 'flow' },
  defaultConfig: () => ({ chords: [], size: 'sm' }),
  Render,
  Editor,
});
