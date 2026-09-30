// One-tap chord entry for the song editor.
//
// Two groups, in the order you actually reach for them: the chords already used
// in this song (so a second verse is all taps), then the diatonic chords of the
// song's key with their roman numerals (so a *first* verse mostly is too). Both
// beat hunting for `[`, `#` and `/` on a tablet keyboard, which is the real cost
// of the ChordPro textarea.
//
// Presentational: the host decides what a pick means (insert at the caret,
// replace the chord under it, place it on a beat).

import { Music2 } from 'lucide-react';
import { diatonicChords } from '@/lib/music';

export function ChordPalette({
  songKey,
  used = [],
  onPick,
  className = '',
}: {
  /** The song's key, e.g. "G" or "Em". Drives the diatonic suggestions. */
  songKey?: string;
  /** Chords already in the song, in first-appearance order. */
  used?: string[];
  onPick: (chord: string) => void;
  className?: string;
}) {
  const diatonic = diatonicChords(songKey);
  // Don't offer the same chord twice — the song's own chords win the slot.
  const usedSet = new Set(used);
  const extra = diatonic.filter((d) => !usedSet.has(d.symbol));

  if (!used.length && !extra.length) {
    return (
      <p className={`flex items-center gap-1.5 text-xs text-ink-400 ${className}`}>
        <Music2 size={13} />
        Set the song key above to get one-tap chords.
      </p>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className}`}>
      {used.map((sym) => (
        <Chip key={`used-${sym}`} label={sym} title="Used in this song" onPick={onPick} />
      ))}
      {used.length > 0 && extra.length > 0 && (
        <span aria-hidden className="mx-1 h-4 w-px bg-ink-200 dark:bg-ink-700" />
      )}
      {extra.map((d) => (
        <Chip
          key={`key-${d.symbol}`}
          label={d.symbol}
          sub={d.numeral}
          title={`${d.numeral} of ${songKey}`}
          onPick={onPick}
        />
      ))}
    </div>
  );
}

function Chip({
  label,
  sub,
  title,
  onPick,
}: {
  label: string;
  sub?: string;
  title: string;
  onPick: (chord: string) => void;
}) {
  return (
    <button
      type="button"
      title={title}
      // Keep the textarea's focus and caret: the host inserts at the caret, and
      // a button stealing focus first would lose it.
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => onPick(label)}
      className="flex items-baseline gap-1 rounded-lg bg-ink-100 px-2 py-1 text-xs font-semibold text-accent transition-colors hover:bg-accent hover:text-accent-fg dark:bg-ink-800"
    >
      {label}
      {sub && <span className="text-[0.65rem] font-normal opacity-60">{sub}</span>}
    </button>
  );
}
