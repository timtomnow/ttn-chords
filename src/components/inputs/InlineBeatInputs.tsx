// Tiny inline inputs shared by the beat-grid editors (the Highway "Edit timing"
// mode and the beat-tagging fine-tune editor): typing a new chord/lyric onto a
// beat, and editing/splitting an existing lyric "text packet". Presentational —
// the host owns placement and what to do on commit.

import { useRef, useState } from 'react';

/** Auto-focused field for typing a new chord symbol or lyric. Enter commits a
 * non-empty value; Escape or blur cancels. */
export function AddBeatInput({
  kind,
  onCommit,
  onCancel,
}: {
  kind: 'chord' | 'lyric';
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState('');
  const lyric = kind === 'lyric';
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={onCancel}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          const v = value.trim();
          if (v) onCommit(v);
          else onCancel();
        } else if (e.key === 'Escape') {
          e.preventDefault();
          onCancel();
        }
      }}
      placeholder={lyric ? 'lyric' : 'chord'}
      className={[
        'rounded-lg border-2 border-accent bg-white px-2 py-1 text-sm font-semibold shadow dark:bg-ink-900',
        lyric ? 'w-40 text-ink-800 dark:text-ink-100' : 'w-20 text-accent',
      ].join(' ')}
    />
  );
}

/** Inline editor over an existing lyric packet: edit the text (Enter saves) or
 * split it at the caret into two packets (the host gives the second its own
 * beat). Escape or blur cancels. */
export function LyricEditor({
  initial,
  onCommit,
  onSplit,
  onCancel,
}: {
  initial: string;
  onCommit: (text: string) => void;
  onSplit: (caret: number, text: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const ref = useRef<HTMLInputElement>(null);
  return (
    <div
      className="flex items-center gap-1 rounded-lg border-2 border-accent bg-white p-1 shadow dark:bg-ink-900"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        ref={ref}
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={onCancel}
        onKeyDown={(e) => {
          e.stopPropagation();
          if (e.key === 'Enter') {
            e.preventDefault();
            onCommit(value);
          } else if (e.key === 'Escape') {
            e.preventDefault();
            onCancel();
          }
        }}
        placeholder="lyric"
        className="w-40 rounded bg-transparent px-1 py-0.5 text-sm font-semibold text-ink-800 outline-none dark:text-ink-100"
      />
      <button
        type="button"
        // Keep input focus so onBlur doesn't cancel before this fires.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onSplit(ref.current?.selectionStart ?? value.length, value)}
        className="rounded bg-ink-100 px-2 py-0.5 text-xs font-medium text-ink-600 hover:bg-accent hover:text-accent-fg dark:bg-ink-800 dark:text-ink-300"
        title="Split at the cursor; the second half gets its own beat"
      >
        Split
      </button>
    </div>
  );
}
