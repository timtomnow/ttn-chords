// SVG keyboard chord diagram. Renders a one-octave (or wider) piano span and
// highlights the chord tones; the root is shown in the accent color. `notes`
// are pitch classes (0–11) or MIDI numbers — both are reduced mod 12 so a
// single octave view always works.

import type { KeyboardShape } from '@/types';

const WHITE_PCS = [0, 2, 4, 5, 7, 9, 11]; // C D E F G A B
// Black keys sit between specific white keys; map pc -> the white index it
// follows, plus a horizontal nudge.
const BLACK = [
  { pc: 1, after: 0 },
  { pc: 3, after: 1 },
  { pc: 6, after: 3 },
  { pc: 8, after: 4 },
  { pc: 10, after: 5 },
];

const mod12 = (n: number) => ((n % 12) + 12) % 12;

export function KeyboardChart({
  shape,
  size = 'md',
}: {
  shape: KeyboardShape;
  size?: 'sm' | 'md' | 'lg';
}) {
  const pcs = new Set(shape.notes.map(mod12));
  const rootPc = shape.rootPc !== undefined ? mod12(shape.rootPc) : undefined;

  const ww = size === 'sm' ? 12 : size === 'lg' ? 24 : 18; // white key width
  const wh = ww * 4; // white key height
  const bw = ww * 0.62;
  const bh = wh * 0.62;
  const w = ww * 7;
  const h = wh;

  const isOn = (pc: number) => pcs.has(pc);
  const fill = (pc: number, base: string) =>
    isOn(pc) ? (pc === rootPc ? 'rgb(var(--accent-rgb))' : 'currentColor') : base;

  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      className="text-ink-400 dark:text-ink-500"
      role="img"
    >
      {/* White keys */}
      {WHITE_PCS.map((pc, i) => (
        <rect
          key={`w${pc}`}
          x={i * ww}
          y={0}
          width={ww}
          height={wh}
          rx={2}
          fill={fill(pc, 'white')}
          stroke="rgb(113 113 122)"
          strokeWidth={1}
          opacity={isOn(pc) ? 1 : 1}
        />
      ))}
      {/* White-key fill needs dark-mode awareness: overlay via CSS class on off keys */}
      {WHITE_PCS.map((pc, i) =>
        isOn(pc) ? null : (
          <rect
            key={`wd${pc}`}
            x={i * ww}
            y={0}
            width={ww}
            height={wh}
            rx={2}
            className="fill-white dark:fill-ink-800"
            stroke="rgb(113 113 122)"
            strokeWidth={1}
          />
        ),
      )}
      {/* Black keys (drawn on top) */}
      {BLACK.map(({ pc, after }) => {
        const cx = (after + 1) * ww - bw / 2;
        return (
          <rect
            key={`b${pc}`}
            x={cx}
            y={0}
            width={bw}
            height={bh}
            rx={2}
            fill={fill(pc, '#18181b')}
            stroke="rgb(63 63 70)"
            strokeWidth={1}
          />
        );
      })}
    </svg>
  );
}
