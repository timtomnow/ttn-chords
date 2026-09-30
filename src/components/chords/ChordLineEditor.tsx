// Tap-to-place chord editing over a lyric line — the editor's answer to typing
// `[G]` brackets by hand.
//
// Why: the ChordPro textarea is the only way to put a chord on a word today, and
// `[`, `#` and `/` are all buried behind modifier keys on a phone or tablet
// keyboard. Here the chart itself is the input: tap a letter and a chord popover
// opens over it (with the key's diatonic chords and the song's own chords one tap
// away), tap an existing chord to retype or remove it, and drag a chord sideways
// to move which syllable it sits over.
//
// This edits the SAME model the textarea does (`Line.lyric` + `Line.events`), so
// the two panes stay in lockstep — the host serializes back to ChordPro text
// after every change. Unparseable symbols render in a warning colour rather than
// being rejected: annotations like "N.C." are legitimate, they just aren't chords.

import { useLayoutEffect, useRef, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { parseChordSymbol } from '@/lib/music';
import { newId } from '@/lib/id';
import type { ChordEvent, Line } from '@/types';

/** The viewport point a click happened at, for placing the popover. */
function pointOf(e: React.MouseEvent): { x: number; y: number } {
  return { x: e.clientX, y: e.clientY };
}

/** Chord suggestions offered inside the popover, in tap order. */
export type ChordSuggestion = { symbol: string; numeral?: string };

/**
 * An open chord popover. `at` is the VIEWPORT point it was opened from: the
 * popover is positioned `fixed` because the editor's chart pane scrolls, and an
 * absolutely-positioned popover inside it gets clipped (an `overflow-x: auto` box
 * computes `overflow-y` to `auto` too).
 */
type Editing = { at: { x: number; y: number } } &
  (
    | { kind: 'event'; eventId: string; charIndex: number; value: string }
    | { kind: 'new'; charIndex: number; value: string }
  );

export function ChordLineEditor({
  line,
  suggestions = [],
  onChange,
}: {
  line: Line;
  suggestions?: ChordSuggestion[];
  onChange: (next: Line) => void;
}) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [drag, setDrag] = useState<{ eventId: string; charIndex: number } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  // Width of one monospace character, measured from the rendered row so chord
  // chips land exactly over their letter at any font size.
  const [charW, setCharW] = useState(0);

  useLayoutEffect(() => {
    const el = rowRef.current?.querySelector<HTMLElement>('[data-ruler]');
    if (el) setCharW(el.getBoundingClientRect().width / 10);
  }, [line.lyric]);

  const anchored = line.events
    .filter((e) => e.charIndex !== undefined)
    .sort((a, b) => (a.charIndex ?? 0) - (b.charIndex ?? 0));
  const trailing = line.events.filter((e) => e.charIndex === undefined);

  // ── Model edits (all pure; the host owns persistence) ──
  function setEvents(events: ChordEvent[]) {
    onChange({ ...line, events });
  }
  function commit(target: Editing, raw: string) {
    const value = raw.trim();
    if (target.kind === 'event') {
      setEvents(
        value
          ? line.events.map((e) => (e.id === target.eventId ? { ...e, chord: value } : e))
          : line.events.filter((e) => e.id !== target.eventId),
      );
    } else if (value) {
      setEvents([...line.events, { id: newId(), chord: value, charIndex: target.charIndex }]);
    }
    setEditing(null);
  }
  function remove(eventId: string) {
    setEvents(line.events.filter((e) => e.id !== eventId));
    setEditing(null);
  }
  function moveAnchor(eventId: string, charIndex: number) {
    const clamped = Math.max(0, Math.min(line.lyric.length, charIndex));
    setEvents(line.events.map((e) => (e.id === eventId ? { ...e, charIndex: clamped } : e)));
  }

  /** Character index under a client x position, from the measured char width. */
  function charAt(clientX: number): number {
    const el = rowRef.current;
    if (!el || charW <= 0) return 0;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(line.lyric.length, Math.round((clientX - rect.left) / charW)));
  }

  function onChipDown(e: React.PointerEvent, ev: ChordEvent) {
    // Track the pointer; a move of more than half a character counts as a drag
    // to re-anchor, anything less falls through to the click handler (edit).
    const startX = e.clientX;
    const startIndex = ev.charIndex ?? 0;
    let moved = false;
    const move = (pe: PointerEvent) => {
      if (!moved && Math.abs(pe.clientX - startX) < Math.max(4, charW / 2)) return;
      moved = true;
      setDrag({ eventId: ev.id, charIndex: charAt(pe.clientX) });
    };
    const up = (pe: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      setDrag(null);
      if (moved) moveAnchor(ev.id, charAt(pe.clientX));
      else
        setEditing({
          kind: 'event',
          eventId: ev.id,
          charIndex: startIndex,
          value: ev.chord,
          at: { x: pe.clientX, y: pe.clientY },
        });
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // Chords show exactly as authored — an editor must never quietly respell what
  // was typed (that's the read view's job, via `preferFlats`).
  const lyric = line.lyric;

  return (
    <div className="relative select-none font-mono text-sm leading-tight">
      {/* Chord row — chips positioned by character column. */}
      <div ref={rowRef} className="relative h-5">
        {/* Invisible ruler: ten characters of the same font, to measure column width. */}
        <span data-ruler aria-hidden className="invisible absolute whitespace-pre">
          0123456789
        </span>
        {charW > 0 &&
          anchored.map((ev) => {
            const at = drag?.eventId === ev.id ? drag.charIndex : (ev.charIndex ?? 0);
            const unknown = ev.chord !== '' && !parseChordSymbol(ev.chord);
            return (
              <button
                key={ev.id}
                type="button"
                onPointerDown={(e) => onChipDown(e, ev)}
                style={{ left: at * charW }}
                title={unknown ? `“${ev.chord}” isn’t a chord symbol` : 'Tap to edit, drag to move'}
                className={[
                  'absolute -top-0.5 cursor-grab touch-none whitespace-nowrap rounded px-1 font-semibold leading-tight active:cursor-grabbing',
                  drag?.eventId === ev.id ? 'bg-accent text-accent-fg' : 'hover:bg-accent/15',
                  unknown ? 'text-amber-600 underline decoration-wavy dark:text-amber-400' : 'text-accent',
                ].join(' ')}
              >
                {ev.chord === '' ? '·' : ev.chord}
              </button>
            );
          })}
      </div>

      {/* Lyric row — every character is a placement target. */}
      <div className="whitespace-pre">
        {lyric.length === 0 ? (
          <button
            type="button"
            onClick={(e) =>
              setEditing({ kind: 'new', charIndex: 0, value: '', at: pointOf(e) })
            }
            className="rounded px-1 text-xs italic text-ink-400 hover:bg-accent/15"
          >
            chord-only line — tap to add a chord
          </button>
        ) : (
          Array.from(lyric).map((ch, i) => (
            <span
              key={i}
              onClick={(e) => setEditing({ kind: 'new', charIndex: i, value: '', at: pointOf(e) })}
              className="cursor-pointer hover:bg-accent/20"
            >
              {ch}
            </span>
          ))
        )}
      </div>

      {/* Chords with no lyric anchor (rhythm-only or trailing). */}
      {trailing.length > 0 && (
        <div className="mt-0.5 flex flex-wrap gap-1">
          {trailing.map((ev) => (
            <button
              key={ev.id}
              type="button"
              onClick={(e) =>
                setEditing({
                  kind: 'event',
                  eventId: ev.id,
                  charIndex: 0,
                  value: ev.chord,
                  at: pointOf(e),
                })
              }
              className="rounded bg-ink-100 px-1 text-xs font-semibold text-accent hover:bg-accent/20 dark:bg-ink-800"
              title="Unanchored chord — tap to edit"
            >
              {ev.chord === '' ? '·' : ev.chord}
            </button>
          ))}
        </div>
      )}

      {editing && (
        <ChordPopover
          initial={editing.value}
          at={editing.at}
          suggestions={suggestions}
          canRemove={editing.kind === 'event'}
          onCommit={(v) => commit(editing, v)}
          onRemove={() => editing.kind === 'event' && remove(editing.eventId)}
          onCancel={() => setEditing(null)}
        />
      )}
    </div>
  );
}

/**
 * The chord-entry popover: a text field plus one-tap suggestions. Enter or a
 * suggestion tap commits; an empty value on an existing chord removes it, which
 * makes "clear this chord" the same gesture as "clear this field".
 */
function ChordPopover({
  initial,
  at,
  suggestions,
  canRemove,
  onCommit,
  onRemove,
  onCancel,
}: {
  initial: string;
  /** Viewport point the popover opens from. */
  at: { x: number; y: number };
  suggestions: ChordSuggestion[];
  canRemove: boolean;
  onCommit: (value: string) => void;
  onRemove: () => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  // Keep it on screen: a chord near the right edge would otherwise open off it.
  const width = Math.min(320, window.innerWidth * 0.8);
  const left = Math.max(8, Math.min(at.x - 20, window.innerWidth - width - 8));
  return (
    <div
      className="fixed z-40 w-max rounded-xl border-2 border-accent bg-white p-2 shadow-lg dark:bg-ink-900"
      style={{ left, top: at.y + 14, maxWidth: width }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center gap-1">
        <input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
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
          placeholder="chord"
          className="w-24 rounded-lg bg-ink-100 px-2 py-1 text-sm font-semibold text-accent outline-none dark:bg-ink-800"
        />
        <button
          type="button"
          onClick={() => onCommit(value)}
          className="rounded-lg bg-accent px-2 py-1 text-xs font-semibold text-accent-fg"
        >
          Set
        </button>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="rounded-lg bg-ink-100 p-1.5 text-red-600 hover:bg-red-500 hover:text-white dark:bg-ink-800"
            aria-label="Remove this chord"
            title="Remove this chord"
          >
            <Trash2 size={13} />
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg px-2 py-1 text-xs text-ink-500 hover:bg-ink-100 dark:hover:bg-ink-800"
        >
          Cancel
        </button>
      </div>
      {suggestions.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {suggestions.map((s) => (
            <button
              key={s.symbol + (s.numeral ?? '')}
              type="button"
              onClick={() => onCommit(s.symbol)}
              className="rounded-lg bg-ink-100 px-2 py-1 text-xs font-semibold text-accent hover:bg-accent hover:text-accent-fg dark:bg-ink-800"
              title={s.numeral}
            >
              {s.symbol}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
