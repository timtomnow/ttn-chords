// Song block — the centerpiece. Renders a song (title + optional chord-chart
// strip + sections with chords-over-lyrics and rhythm boxes) onto the page.
// LIVE reference: it stores songId + view options, so edits to the song flow
// into the report. A deleted song degrades to a gentle placeholder.

import { useMemo } from 'react';
import { Music } from 'lucide-react';
import {
  useRhythmPatternsByIds,
  useRhythmSymbolMap,
  useSong,
  useSongs,
} from '@/db/repo';
import { ChordLine } from '@/components/chords/ChordLine';
import { ChordChart } from '@/components/chords/ChordChart';
import { useChartResolver } from '@/components/chords/useChartResolver';
import { RhythmChart } from '@/components/rhythm/RhythmChart';
import { defaultLabelForKind } from '@/lib/chordpro';
import { preferFlatsForKey, transposeChordSymbol } from '@/lib/music';
import { uniqueChords } from '@/lib/song';
import { registerBlock } from '../registry';
import type { BlockEditorProps, BlockRenderProps } from '../types';

type SongConfig = {
  songId?: string;
  transpose: number;
  showTitle: boolean;
  showCharts: boolean;
  showRhythm: boolean;
  showChords: boolean;
  /** null = all sections; otherwise an allow-list of section ids. */
  sectionIds: string[] | null;
};

function cfg(c: Record<string, unknown>): SongConfig {
  return {
    songId: typeof c.songId === 'string' && c.songId ? c.songId : undefined,
    transpose: typeof c.transpose === 'number' ? c.transpose : 0,
    showTitle: c.showTitle !== false,
    showCharts: c.showCharts === true,
    showRhythm: c.showRhythm !== false,
    showChords: c.showChords !== false,
    sectionIds: Array.isArray(c.sectionIds)
      ? (c.sectionIds.filter((x) => typeof x === 'string') as string[])
      : null,
  };
}

function Render({ block, mode }: BlockRenderProps) {
  const c = cfg(block.config);
  const song = useSong(c.songId);
  const flats = preferFlatsForKey(song?.key);
  const { resolve } = useChartResolver();

  const sectionIds = c.sectionIds;
  const sections = useMemo(() => {
    if (!song) return [];
    if (!sectionIds) return song.sections;
    return song.sections.filter((s) => sectionIds.includes(s.id));
  }, [song, sectionIds]);

  const patternIds = useMemo(
    () => sections.map((s) => s.rhythmPatternId).filter((id): id is string => Boolean(id)),
    [sections],
  );
  const patterns = useRhythmPatternsByIds(patternIds);
  const symbolMap = useRhythmSymbolMap();

  const chartChords = useMemo(
    () => (c.showCharts ? uniqueChords(sections, c.transpose, flats) : []),
    [c.showCharts, sections, c.transpose, flats],
  );

  if (!c.songId) {
    if (mode === 'print') return null;
    return (
      <div className="rounded-lg border border-dashed border-ink-300 px-3 py-6 text-center text-sm text-ink-400 dark:border-ink-700">
        Choose a song
      </div>
    );
  }
  if (song === undefined) return <div className="text-xs text-ink-400">Loading…</div>;
  if (song === null) {
    if (mode === 'print') return null;
    return (
      <div className="rounded-lg border border-dashed border-ink-300 px-3 py-6 text-center text-sm text-ink-400 dark:border-ink-700">
        Song no longer exists
      </div>
    );
  }

  const shownKey = song.key ? transposeChordSymbol(song.key, c.transpose, flats) : undefined;

  return (
    <div className="space-y-3">
      {c.showTitle && (
        <header>
          <h2 className="text-lg font-semibold leading-tight">{song.title}</h2>
          {(song.artist || shownKey || song.capo || song.tempo) && (
            <p className="text-xs text-ink-500 dark:text-ink-400">
              {[
                song.artist,
                shownKey && `Key ${shownKey}`,
                song.capo ? `Capo ${song.capo}` : null,
                song.tempo && `${song.tempo} BPM`,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </header>
      )}

      {chartChords.length > 0 && (
        <div className="flex flex-wrap gap-3 rounded-lg border border-ink-200 p-2 dark:border-ink-800">
          {chartChords.map((name) => {
            const chart = resolve(name);
            return chart ? <ChordChart key={name} chart={chart} size="sm" /> : null;
          })}
        </div>
      )}

      <div className="space-y-3">
        {sections.map((section) => {
          const pattern = section.rhythmPatternId
            ? patterns?.get(section.rhythmPatternId)
            : undefined;
          return (
            <section key={section.id} data-section-id={section.id} className="break-inside-avoid">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-accent [break-after:avoid]">
                {section.label || defaultLabelForKind(section.kind)}
              </h3>
              {c.showRhythm && pattern && (
                <div className="mb-2 break-inside-avoid">
                  <RhythmChart pattern={pattern} symbols={symbolMap} size="sm" />
                </div>
              )}
              {c.showChords ? (
                <div className="space-y-1">
                  {section.lines.map((line) => (
                    // Keep each line's chords welded to its lyric across a page break.
                    <div key={line.id} className="break-inside-avoid">
                      <ChordLine line={line} transpose={c.transpose} preferFlats={flats} />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="whitespace-pre-wrap font-mono text-sm leading-tight">
                  {section.lines.map((l) => l.lyric).join('\n')}
                </div>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Editor({ block, onChange }: BlockEditorProps) {
  const c = cfg(block.config);
  const songs = useSongs();
  const song = useSong(c.songId);

  const toggle = (key: keyof SongConfig) => () => onChange({ [key]: !c[key] });

  return (
    <div className="space-y-3">
      <label className="block">
        <span className="label mb-1">Song</span>
        <select
          className="input"
          value={c.songId ?? ''}
          onChange={(e) => onChange({ songId: e.target.value, sectionIds: null })}
        >
          <option value="">— choose a song —</option>
          {songs?.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-2">
        <span className="label">Transpose</span>
        <button className="btn-secondary px-2 py-1" onClick={() => onChange({ transpose: c.transpose - 1 })}>
          −
        </button>
        <span className="w-8 text-center text-sm tabular-nums">
          {c.transpose > 0 ? `+${c.transpose}` : c.transpose}
        </span>
        <button className="btn-secondary px-2 py-1" onClick={() => onChange({ transpose: c.transpose + 1 })}>
          +
        </button>
      </div>

      <div className="space-y-1.5">
        {(
          [
            ['showTitle', 'Title & metadata'],
            ['showChords', 'Chords over lyrics'],
            ['showCharts', 'Chord-chart strip'],
            ['showRhythm', 'Rhythm boxes'],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={c[key] as boolean} onChange={toggle(key)} />
            {label}
          </label>
        ))}
      </div>

      {song && song.sections.length > 0 && (
        <div>
          <span className="label mb-1">Sections</span>
          <div className="space-y-1">
            {song.sections.map((s) => {
              const checked = c.sectionIds === null || c.sectionIds.includes(s.id);
              return (
                <label key={s.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => {
                      const all = song.sections.map((x) => x.id);
                      const current = c.sectionIds === null ? all : c.sectionIds;
                      const next = checked
                        ? current.filter((id) => id !== s.id)
                        : [...current, s.id];
                      // Collapse "everything selected" back to null (= all).
                      onChange({ sectionIds: next.length === all.length ? null : next });
                    }}
                  />
                  {s.label || defaultLabelForKind(s.kind)}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

registerBlock({
  type: 'song',
  label: 'Song',
  icon: Music,
  defaultPlacement: { mode: 'flow' },
  defaultConfig: () => ({
    songId: '',
    transpose: 0,
    showTitle: true,
    showCharts: false,
    showRhythm: true,
    showChords: true,
    sectionIds: null,
  }),
  Render,
  Editor,
});
