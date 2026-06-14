// Visual metronome flash. Driven by the `pulse` from useMetronome: each new
// pulse re-triggers a quick fade so the screen blinks in time. Three shapes —
// a centered circle, a screen-edge border, or a full-screen wash. Accent beats
// (beat 1) use a distinct color from the other beats.

import { useEffect, useState } from 'react';
import type { MetronomePulse } from './useMetronome';
import type { MetronomeFlashShape } from '@/types';

export function MetronomeFlash({
  pulse,
  shape,
  accentColor,
  beatColor,
  fixed = true,
}: {
  pulse: MetronomePulse | null;
  shape: MetronomeFlashShape;
  accentColor: string;
  beatColor: string;
  /** Fixed = cover the viewport (standalone). Otherwise absolute within parent. */
  fixed?: boolean;
}) {
  const [on, setOn] = useState(false);

  // Subdivisions don't flash — only actual beats — to keep it readable.
  const isBeat = pulse?.level !== 'sub';
  const color = pulse?.level === 'accent' ? accentColor : beatColor;

  useEffect(() => {
    if (!pulse || !isBeat) return;
    setOn(true);
    const t = setTimeout(() => setOn(false), 90);
    return () => clearTimeout(t);
    // Re-run on every pulse via its monotonically increasing counter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulse?.n]);

  const position = fixed ? 'fixed' : 'absolute';

  if (shape === 'fullscreen') {
    return (
      <div
        aria-hidden
        className={`pointer-events-none inset-0 z-[5] transition-opacity duration-100 ${position}`}
        style={{ backgroundColor: color, opacity: on ? 0.55 : 0 }}
      />
    );
  }

  if (shape === 'border') {
    return (
      <div
        aria-hidden
        className={`pointer-events-none inset-0 z-[5] transition-opacity duration-100 ${position}`}
        style={{
          boxShadow: `inset 0 0 0 14px ${color}`,
          opacity: on ? 0.85 : 0,
        }}
      />
    );
  }

  // circle
  return (
    <div
      aria-hidden
      className={`pointer-events-none inset-0 z-[5] flex items-center justify-center ${position}`}
    >
      <div
        className="rounded-full transition-all duration-100 ease-out"
        style={{
          width: '40vmin',
          height: '40vmin',
          backgroundColor: color,
          opacity: on ? 0.9 : 0.12,
          transform: on ? 'scale(1)' : 'scale(0.85)',
        }}
      />
    </div>
  );
}
