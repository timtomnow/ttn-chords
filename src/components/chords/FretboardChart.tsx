// SVG fretted-instrument chord diagram. Tuning-driven: the number of strings
// comes from the shape's `frets` array, so guitar (6), ukulele/bass (4), or any
// user instrument render with the same component. `frets` is low→high:
// -1 = muted (x), 0 = open (o), n = fret n.

import type { FrettedShape } from '@/types';

const DOT = 'currentColor';

export function FretboardChart({
  shape,
  size = 'md',
}: {
  shape: FrettedShape;
  /** Number of fret rows to show. Min 4; grows for high-position shapes. */
  fretCount?: number;
  size?: 'sm' | 'md' | 'lg';
}) {
  const strings = shape.frets.length;
  const played = shape.frets.filter((f) => f > 0);
  const maxFret = played.length ? Math.max(...played) : 0;
  const baseFret = shape.baseFret ?? 1;
  const span = Math.max(4, maxFret - baseFret + 1);

  const cell = size === 'sm' ? 12 : size === 'lg' ? 26 : 18;
  const padX = cell;
  const padTop = cell * 1.4; // room for the o/x markers
  const padBottom = baseFret > 1 ? 0 : 0;
  const w = padX * 2 + cell * (strings - 1);
  const h = padTop + cell * span + cell * 0.6 + padBottom;

  const x = (s: number) => padX + s * cell;
  const y = (fret: number) => padTop + fret * cell;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      className="text-ink-900 dark:text-ink-100"
      role="img"
    >
      {/* Nut (thick) when at the top of the neck, else a thin line. */}
      {baseFret === 1 ? (
        <rect x={x(0)} y={padTop - 3} width={x(strings - 1) - x(0)} height={3} fill={DOT} />
      ) : (
        <line
          x1={x(0)}
          y1={padTop}
          x2={x(strings - 1)}
          y2={padTop}
          stroke={DOT}
          strokeWidth={1}
          opacity={0.5}
        />
      )}

      {/* Fret position label (e.g. "5fr") for shapes up the neck. */}
      {baseFret > 1 && (
        <text
          x={x(strings - 1) + cell * 0.5}
          y={y(0.6)}
          fontSize={cell * 0.55}
          fill={DOT}
          opacity={0.7}
        >
          {baseFret}fr
        </text>
      )}

      {/* Horizontal frets */}
      {Array.from({ length: span + 1 }).map((_, i) => (
        <line
          key={`f${i}`}
          x1={x(0)}
          y1={y(i)}
          x2={x(strings - 1)}
          y2={y(i)}
          stroke={DOT}
          strokeWidth={1}
          opacity={0.4}
        />
      ))}

      {/* Vertical strings */}
      {Array.from({ length: strings }).map((_, s) => (
        <line
          key={`s${s}`}
          x1={x(s)}
          y1={y(0)}
          x2={x(s)}
          y2={y(span)}
          stroke={DOT}
          strokeWidth={1}
          opacity={0.4}
        />
      ))}

      {/* Barres */}
      {shape.barres?.map((b, i) => {
        const rel = b.fret - baseFret + 1;
        return (
          <rect
            key={`b${i}`}
            x={x(b.fromString) - cell * 0.25}
            y={y(rel) - cell * 0.55 - cell * 0.25 + cell * 0.05}
            width={x(b.toString) - x(b.fromString) + cell * 0.5}
            height={cell * 0.5}
            rx={cell * 0.25}
            fill={DOT}
          />
        );
      })}

      {/* Per-string markers: dots, open (o), muted (x) */}
      {shape.frets.map((f, s) => {
        if (f === -1) {
          return (
            <text
              key={`m${s}`}
              x={x(s)}
              y={padTop - cell * 0.45}
              fontSize={cell * 0.7}
              textAnchor="middle"
              fill={DOT}
              opacity={0.8}
            >
              ✕
            </text>
          );
        }
        if (f === 0) {
          return (
            <circle
              key={`m${s}`}
              cx={x(s)}
              cy={padTop - cell * 0.6}
              r={cell * 0.26}
              fill="none"
              stroke={DOT}
              strokeWidth={1.5}
              opacity={0.8}
            />
          );
        }
        const rel = f - baseFret + 1;
        const finger = shape.fingers?.[s];
        return (
          <g key={`m${s}`}>
            <circle cx={x(s)} cy={y(rel) - cell * 0.5} r={cell * 0.34} fill={DOT} />
            {finger ? (
              <text
                x={x(s)}
                y={y(rel) - cell * 0.5 + cell * 0.2}
                fontSize={cell * 0.5}
                textAnchor="middle"
                className="fill-white dark:fill-ink-900"
              >
                {finger}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}
