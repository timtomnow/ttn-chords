// A lightweight popover that shows a chord's chart when its name is clicked in
// a song. Resolves against the user's current instrument. If no diagram is
// available, it says so (and links to add one — wired by the caller via the
// "Add chart" affordance in Settings/instrument editor in a later pass).
//
// Positioning is anchored to the click point and clamped to the viewport;
// dismiss on outside-click or Escape.

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ChordChart } from './ChordChart';
import { useChartResolver } from './useChartResolver';

type Anchor = { x: number; y: number };

export function ChordPopover({
  chord,
  anchor,
  onClose,
}: {
  chord: string;
  anchor: Anchor;
  onClose: () => void;
}) {
  const { resolve, instrument } = useChartResolver();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<Anchor>(anchor);

  const chart = resolve(chord);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const pad = 8;
    let x = anchor.x - rect.width / 2;
    let y = anchor.y + 12;
    x = Math.max(pad, Math.min(x, window.innerWidth - rect.width - pad));
    if (y + rect.height + pad > window.innerHeight) y = anchor.y - rect.height - 12;
    setPos({ x, y });
  }, [anchor, chord]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKey);
    // Defer so the opening click doesn't immediately close it.
    const t = setTimeout(() => window.addEventListener('mousedown', onDown), 0);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onDown);
      clearTimeout(t);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={ref}
      className="card fixed z-50 p-3 shadow-xl"
      style={{ left: pos.x, top: pos.y }}
      role="dialog"
    >
      <button
        onClick={onClose}
        className="absolute right-1.5 top-1.5 rounded-full p-1 text-ink-400 hover:bg-ink-100 dark:hover:bg-ink-800"
        aria-label="Close"
      >
        <X size={14} />
      </button>
      <div className="flex flex-col items-center gap-1 px-2">
        <div className="text-[10px] uppercase tracking-wide text-ink-400">
          {instrument?.name ?? 'Chord'}
        </div>
        {chart ? (
          <ChordChart chart={chart} size="md" />
        ) : (
          <div className="py-4 text-center">
            <div className="text-lg font-semibold text-accent">{chord}</div>
            <p className="mt-1 max-w-[10rem] text-xs text-ink-400">
              No diagram for this chord on {instrument?.name ?? 'your instrument'} yet.
            </p>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
