// A second, deliberately minimal view to exercise the registry: lyrics only,
// extra-large and centered, chords hidden — handy for singers/song-leaders who
// don't read chords. Shares the same auto-scroll/zoom contract. This exists
// mainly to prove that adding a view is "write a component + registerView" with
// zero shell changes.

import { useEffect, useRef } from 'react';
import { Type } from 'lucide-react';
import { defaultLabelForKind } from '@/lib/chordpro';
import { registerView } from '@/lib/performance/registry';
import type { PerformanceViewProps } from '@/lib/performance/types';

function LyricsView({ song, sections, fontScale, playback, onReachEnd }: PerformanceViewProps) {
  const ref = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const accRef = useRef(0);
  const lastRef = useRef<number | null>(null);
  const base = ((song.tempo ?? 100) / 100) * 24;

  useEffect(() => {
    const el = ref.current;
    if (!el || !playback.playing) {
      lastRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    const step = (ts: number) => {
      const last = lastRef.current;
      lastRef.current = ts;
      if (last != null) {
        accRef.current += base * playback.speed * ((ts - last) / 1000);
        const whole = Math.floor(accRef.current);
        if (whole > 0) {
          accRef.current -= whole;
          el.scrollTop += whole;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
            onReachEnd?.();
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [playback.playing, playback.speed, base, onReachEnd]);

  return (
    <div
      ref={ref}
      className="h-full overflow-y-auto px-4 py-8 text-center"
      style={{ fontSize: `${fontScale * 1.3}rem` }}
    >
      <div className="mx-auto max-w-2xl space-y-8 pb-[60vh]">
        {sections.map((section) => (
          <section key={section.id}>
            <h3 className="mb-2 text-[0.6em] font-semibold uppercase tracking-wide text-accent">
              {section.label || defaultLabelForKind(section.kind)}
            </h3>
            <div className="space-y-1 leading-snug">
              {section.lines.map((line) => (
                <p key={line.id}>{line.lyric || ' '}</p>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

registerView({
  id: 'lyrics',
  name: 'Lyrics',
  description: 'Big centered lyrics only — no chords.',
  icon: Type,
  capabilities: { autoScroll: true, zoom: true, transpose: false },
  component: LyricsView,
});
