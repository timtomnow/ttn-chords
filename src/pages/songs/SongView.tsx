import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Minus, Pencil, Play, Plus } from 'lucide-react';
import { useSong } from '@/db/repo';
import { ChordLine } from '@/components/chords/ChordLine';
import { ChordChart } from '@/components/chords/ChordChart';
import { ChordPopover } from '@/components/chords/ChordPopover';
import { useChartResolver } from '@/components/chords/useChartResolver';
import { defaultLabelForKind } from '@/lib/chordpro';
import { preferFlatsForKey, transposeChordSymbol } from '@/lib/music';
import { uniqueChords } from '@/lib/song';
import type { Song } from '@/types';

export function SongView() {
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
  return <View key={song.id} song={song} />;
}

function View({ song }: { song: Song }) {
  const navigate = useNavigate();
  const [transpose, setTranspose] = useState(0);
  const [popover, setPopover] = useState<{ chord: string; anchor: { x: number; y: number } } | null>(
    null,
  );
  const { resolve, instrument } = useChartResolver();

  const flats = preferFlatsForKey(song.key);
  const chords = useMemo(
    () => uniqueChords(song.sections, transpose, flats),
    [song.sections, transpose, flats],
  );

  const shownKey = song.key
    ? transposeChordSymbol(song.key, transpose, flats)
    : undefined;

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <button className="btn-ghost -ml-2" onClick={() => navigate('/songs')}>
          <ArrowLeft size={16} /> Songs
        </button>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={() => navigate('edit')}>
            <Pencil size={15} /> Edit
          </button>
          <button className="btn-primary" onClick={() => navigate('perform')}>
            <Play size={15} /> Perform
          </button>
        </div>
      </div>

      <header className="mb-5">
        <h1 className="text-2xl font-semibold tracking-tight">{song.title}</h1>
        <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">
          {[
            song.artist,
            shownKey && `Key ${shownKey}`,
            song.capo ? `Capo ${song.capo}` : null,
            song.tempo && `${song.tempo} BPM`,
            song.timeSignature && `${song.timeSignature.beats}/${song.timeSignature.unit}`,
          ]
            .filter(Boolean)
            .join(' · ') || '—'}
        </p>
      </header>

      {/* Transpose control */}
      <div className="mb-5 flex items-center gap-2">
        <span className="label">Transpose</span>
        <div className="flex items-center gap-1">
          <button className="btn-secondary px-2 py-1" onClick={() => setTranspose((t) => t - 1)}>
            <Minus size={14} />
          </button>
          <span className="w-10 text-center text-sm tabular-nums">
            {transpose > 0 ? `+${transpose}` : transpose}
          </span>
          <button className="btn-secondary px-2 py-1" onClick={() => setTranspose((t) => t + 1)}>
            <Plus size={14} />
          </button>
          {transpose !== 0 && (
            <button className="btn-ghost ml-1 text-xs" onClick={() => setTranspose(0)}>
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Chart strip: every chord used, for the active instrument */}
      {chords.length > 0 && (
        <section className="mb-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="label">Chords · {instrument?.name}</h2>
          </div>
          <div className="flex flex-wrap gap-4 overflow-x-auto rounded-2xl border border-ink-200 p-4 dark:border-ink-800">
            {chords.map((c) => {
              const chart = resolve(c);
              return chart ? (
                <ChordChart key={c} chart={chart} size="sm" />
              ) : (
                <figure key={c} className="inline-flex flex-col items-center justify-center gap-1">
                  <div className="flex h-16 w-12 items-center justify-center rounded border border-dashed border-ink-300 text-xs text-ink-400 dark:border-ink-700">
                    ?
                  </div>
                  <figcaption className="text-xs font-semibold text-ink-500">{c}</figcaption>
                </figure>
              );
            })}
          </div>
        </section>
      )}

      {/* Body */}
      <div className="space-y-6">
        {song.sections.map((section) => (
          <section key={section.id}>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-accent">
              {section.label || defaultLabelForKind(section.kind)}
            </h3>
            <div className="space-y-2">
              {section.lines.map((line) => (
                <ChordLine
                  key={line.id}
                  line={line}
                  transpose={transpose}
                  preferFlats={flats}
                  onChordClick={(chord, anchor) => setPopover({ chord, anchor })}
                />
              ))}
            </div>
          </section>
        ))}
      </div>

      {popover && (
        <ChordPopover
          chord={popover.chord}
          anchor={popover.anchor}
          onClose={() => setPopover(null)}
        />
      )}
    </div>
  );
}
