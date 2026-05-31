// Compact, self-contained strum-pattern box. This is the REUSABLE unit that
// shows up wherever a rhythm is displayed: the song read view, the performance
// views, and (Phase 8) draggable onto a PDF report. It renders one bar of the
// pattern's grid: stroke glyphs over a beat ruler, with bar/beat lines and an
// optional label.
//
// Cells may be built-in strokes or user-defined symbols (Phase 7B). Pass the
// symbol map (useRhythmSymbolMap) so customs render; without it, custom cells
// fall back to a neutral placeholder. Pure presentation.

import type { RhythmPattern, RhythmSymbol } from '@/types';
import { resolveCell } from '@/lib/rhythm';

const SIZES = {
  sm: { cell: 16, gap: 1, font: 11 },
  md: { cell: 22, gap: 2, font: 14 },
  lg: { cell: 30, gap: 2, font: 18 },
} as const;

export function RhythmChart({
  pattern,
  symbols,
  size = 'md',
  showLabel = true,
}: {
  pattern: RhythmPattern;
  symbols?: Map<string, RhythmSymbol>;
  size?: keyof typeof SIZES;
  showLabel?: boolean;
}) {
  const s = SIZES[size];
  const { stepsPerBeat, steps, timeSignature } = pattern;

  return (
    <figure className="inline-block rounded-xl border border-ink-200 bg-white p-2 dark:border-ink-800 dark:bg-ink-900">
      {showLabel && (
        <figcaption className="mb-1 flex items-baseline justify-between gap-3 px-0.5">
          <span className="text-xs font-semibold">{pattern.name}</span>
          <span className="text-[10px] text-ink-400">
            {timeSignature.beats}/{timeSignature.unit}
          </span>
        </figcaption>
      )}

      {/* Stroke row */}
      <div className="flex" style={{ gap: s.gap }}>
        {steps.map((step, i) => {
          const beatStart = i % stepsPerBeat === 0;
          const cell = resolveCell(step, symbols);
          return (
            <div
              key={i}
              className={[
                'flex items-center justify-center',
                beatStart ? 'border-l border-ink-300 dark:border-ink-700' : '',
              ].join(' ')}
              style={{ width: s.cell, height: s.cell, paddingLeft: beatStart ? 2 : 0 }}
            >
              <span
                className={[
                  cell.isUp
                    ? 'text-ink-500 dark:text-ink-400'
                    : 'text-ink-900 dark:text-ink-100',
                  cell.accent ? 'font-black' : 'font-medium',
                ].join(' ')}
                style={{ fontSize: cell.accent ? s.font + 2 : s.font, lineHeight: 1 }}
                title={cell.label}
              >
                {cell.accent ? `>${cell.symbol}` : cell.symbol}
              </span>
            </div>
          );
        })}
      </div>

      {/* Beat ruler */}
      <div className="mt-0.5 flex" style={{ gap: s.gap }}>
        {steps.map((_, i) => {
          const beatStart = i % stepsPerBeat === 0;
          const beatNum = Math.floor(i / stepsPerBeat) + 1;
          return (
            <div
              key={i}
              className="flex items-center justify-center text-ink-400"
              style={{ width: s.cell, fontSize: s.font - 3, lineHeight: 1 }}
            >
              {beatStart ? beatNum : ''}
            </div>
          );
        })}
      </div>
    </figure>
  );
}
