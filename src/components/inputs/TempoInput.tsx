// A tempo (BPM) control: click/tap the number to type a new value, with the
// usual −/+ nudge buttons alongside. The editable field is string-backed so it
// can go completely blank while you retype it — committing a blank or invalid
// value reverts to the last good tempo (a recurring frustration with plain
// number inputs). Commit on Enter or blur; Escape cancels. Values are clamped
// to the metronome's [TEMPO_MIN, TEMPO_MAX] range.

import { useEffect, useRef, useState } from 'react';
import { Minus, Plus } from 'lucide-react';
import { clampTempo } from '@/lib/metronome';

export function TempoInput({
  value,
  onChange,
  step = 1,
  showButtons = true,
  className,
  numberClassName = 'min-w-[2.5rem] text-center text-sm font-medium tabular-nums',
  buttonClassName = 'rounded-lg p-1 hover:bg-ink-200 dark:hover:bg-ink-700',
  ariaLabel = 'Tempo',
}: {
  value: number;
  onChange: (bpm: number) => void;
  step?: number;
  showButtons?: boolean;
  className?: string;
  /** Styling for both the static number and the editing input (kept identical so
   *  the field doesn't jump when you click it). */
  numberClassName?: string;
  buttonClassName?: string;
  ariaLabel?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.select();
  }, [editing]);

  const begin = () => {
    setDraft(String(value));
    setEditing(true);
  };

  const commit = () => {
    const n = Number(draft);
    if (draft.trim() !== '' && Number.isFinite(n)) onChange(clampTempo(n));
    setEditing(false); // blank/invalid → revert by simply discarding the draft
  };

  return (
    <div className={['flex items-center gap-1', className].filter(Boolean).join(' ')}>
      {showButtons && (
        <button
          type="button"
          className={buttonClassName}
          onClick={() => onChange(clampTempo(value - step))}
          aria-label="Slower"
        >
          <Minus size={16} />
        </button>
      )}

      {editing ? (
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          className={[numberClassName, 'bg-transparent outline-none ring-1 ring-accent rounded'].join(' ')}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commit();
            else if (e.key === 'Escape') setEditing(false);
          }}
          aria-label={ariaLabel}
        />
      ) : (
        <button
          type="button"
          className={[numberClassName, 'cursor-text rounded hover:bg-ink-200/60 dark:hover:bg-ink-700/60'].join(' ')}
          onClick={begin}
          aria-label={`${ariaLabel}: ${value} BPM. Click to edit.`}
        >
          {value}
        </button>
      )}

      {showButtons && (
        <button
          type="button"
          className={buttonClassName}
          onClick={() => onChange(clampTempo(value + step))}
          aria-label="Faster"
        >
          <Plus size={16} />
        </button>
      )}
    </div>
  );
}
