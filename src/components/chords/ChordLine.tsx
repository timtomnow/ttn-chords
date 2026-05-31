// Renders one lyric line with its chords positioned above, using a monospace
// grid so chord and lyric columns align. Chords with a display anchor
// (charIndex) sit over that character; anchorless chords (rhythm-only or
// trailing) are appended at the end of the chord row.
//
// `transpose` shifts every chord symbol; `preferFlats` controls enharmonics.
// `onChordClick` (Phase 4) opens the chord chart. This component is shared by
// the editor preview, the read view, and reports.

import { Fragment } from 'react';
import type { Line } from '@/types';
import { transposeChordSymbol } from '@/lib/music';

export function ChordLine({
  line,
  transpose = 0,
  preferFlats = false,
  onChordClick,
}: {
  line: Line;
  transpose?: number;
  preferFlats?: boolean;
  onChordClick?: (chord: string) => void;
}) {
  const anchored = line.events
    .filter((e) => e.charIndex !== undefined && e.chord)
    .sort((a, b) => (a.charIndex ?? 0) - (b.charIndex ?? 0));
  const trailing = line.events.filter((e) => e.charIndex === undefined && e.chord);

  // Build the chord row as a string with chords placed at their char columns.
  const lyric = line.lyric.length ? line.lyric : ' ';
  let chordRow = '';
  for (const e of anchored) {
    const col = Math.min(Math.max(e.charIndex ?? 0, 0), lyric.length);
    if (chordRow.length < col) chordRow += ' '.repeat(col - chordRow.length);
    const sym = transposeChordSymbol(e.chord, transpose, preferFlats);
    chordRow += sym + ' ';
  }

  const show = (sym: string) => transposeChordSymbol(sym, transpose, preferFlats);

  return (
    <div className="font-mono text-sm leading-tight">
      <div className="whitespace-pre font-semibold text-accent">
        {renderChordRow(chordRow, onChordClick)}
        {trailing.length > 0 && (
          <span>
            {anchored.length > 0 ? '  ' : ''}
            {trailing.map((e, i) => (
              <Fragment key={e.id}>
                <ClickableChord chord={show(e.chord)} onClick={onChordClick} />
                {i < trailing.length - 1 ? ' ' : ''}
              </Fragment>
            ))}
          </span>
        )}
      </div>
      <div className="whitespace-pre">{lyric}</div>
    </div>
  );
}

// The anchored chord row is built as plain text for alignment; to make chords
// clickable we re-split it on whitespace while preserving column positions.
function renderChordRow(row: string, onClick: ((c: string) => void) | undefined) {
  if (!row.trim()) return ' ';
  const parts: (string | { chord: string; at: number })[] = [];
  const re = /\S+/g;
  let m: RegExpExecArray | null;
  let last = 0;
  while ((m = re.exec(row)) !== null) {
    if (m.index > last) parts.push(' '.repeat(m.index - last));
    parts.push({ chord: m[0], at: m.index });
    last = m.index + m[0].length;
  }
  return parts.map((p, i) =>
    typeof p === 'string' ? (
      <span key={i}>{p}</span>
    ) : (
      <ClickableChord key={i} chord={p.chord} onClick={onClick} />
    ),
  );
}

function ClickableChord({
  chord,
  onClick,
}: {
  chord: string;
  onClick?: (c: string) => void;
}) {
  if (!onClick) return <span>{chord}</span>;
  return (
    <button
      type="button"
      className="rounded px-0.5 hover:bg-accent/10"
      onClick={() => onClick(chord)}
    >
      {chord}
    </button>
  );
}
