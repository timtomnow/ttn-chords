// Default performance view: the whole song as chords-over-lyrics, large and
// zoomable, with smooth auto-scroll whose base rate follows the song tempo and
// is fine-tuned by the shell's speed control. Registers itself with the
// performance-view registry.

import { useEffect, useRef } from 'react';
import { ScrollText } from 'lucide-react';
import { ChordLine } from '@/components/chords/ChordLine';
import { defaultLabelForKind } from '@/lib/chordpro';
import { registerView } from '@/lib/performance/registry';
import type { PerformanceViewProps } from '@/lib/performance/types';

function ScrollView({
  song,
  transpose,
  preferFlats,
  fontScale,
  playback,
  onReachEnd,
  onChordClick,
}: PerformanceViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number | null>(null);
  const accRef = useRef(0); // sub-pixel scroll accumulator
  const lastTsRef = useRef<number | null>(null);

  // Base auto-scroll rate: derive a gentle px/sec from tempo (faster songs
  // scroll a bit faster), then scale by the shell speed control. Tempo-less
  // songs get a sane default.
  const basePxPerSec = ((song.tempo ?? 100) / 100) * 24;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    if (!playback.playing) {
      lastTsRef.current = null;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
      return;
    }

    const step = (ts: number) => {
      const last = lastTsRef.current;
      lastTsRef.current = ts;
      if (last != null) {
        const dt = (ts - last) / 1000;
        accRef.current += basePxPerSec * playback.speed * dt;
        const whole = Math.floor(accRef.current);
        if (whole > 0) {
          accRef.current -= whole;
          el.scrollTop += whole;
          if (el.scrollTop + el.clientHeight >= el.scrollHeight - 1) {
            onReachEnd?.();
            return; // stop the loop at the end
          }
        }
      }
      rafRef.current = requestAnimationFrame(step);
    };

    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [playback.playing, playback.speed, basePxPerSec, onReachEnd]);

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto px-4 py-8 md:px-10"
      style={{ fontSize: `${fontScale}rem` }}
    >
      <div className="mx-auto max-w-3xl space-y-8 pb-[60vh]">
        {song.sections.map((section) => (
          <section key={section.id}>
            <h3 className="mb-2 text-[0.7em] font-semibold uppercase tracking-wide text-accent">
              {section.label || defaultLabelForKind(section.kind)}
            </h3>
            <div className="space-y-2">
              {section.lines.map((line) => (
                <ChordLine
                  key={line.id}
                  line={line}
                  transpose={transpose}
                  preferFlats={preferFlats}
                  onChordClick={onChordClick}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

registerView({
  id: 'scroll',
  name: 'Scroll',
  description: 'Full lyrics & chords with zoom and tempo-based auto-scroll.',
  icon: ScrollText,
  capabilities: { autoScroll: true, zoom: true, transpose: true },
  component: ScrollView,
});
