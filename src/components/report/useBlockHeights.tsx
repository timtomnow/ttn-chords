// Measures the rendered height of each flow block so `paginate` can pack them
// into physical sheets. Renders a hidden, off-screen "measure layer" at the
// exact content width, using the SAME wrapper a real sheet uses (break-avoid +
// ScaleBox), so the measured height matches what prints. Heights don't depend
// on which sheet a block lands on (width is constant), so the editor and print
// preview paginate identically.
//
// Measurement queries `[data-measure-id]` children after layout (guarded so it
// only sets state when a height actually changed — no render loop) plus a
// ResizeObserver to catch async changes (image/font/SVG load).

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { BlockRenderMode } from '@/lib/report/types';
import type { ReportBlock } from '@/types';
import { RenderBlock } from './RenderBlock';
import { ScaleBox } from './ScaleBox';

export function useBlockHeights(
  blocks: ReportBlock[],
  mode: BlockRenderMode,
  contentWidth: number,
): { measureLayer: ReactNode; heights: Record<string, number> } {
  const containerRef = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState<Record<string, number>>({});

  const measure = useCallback(() => {
    const c = containerRef.current;
    if (!c) return;
    const next: Record<string, number> = {};
    c.querySelectorAll<HTMLElement>('[data-measure-id]').forEach((el) => {
      next[el.dataset.measureId as string] = el.offsetHeight;
    });
    setHeights((prev) => {
      const keys = Object.keys(next);
      if (keys.length === Object.keys(prev).length && keys.every((k) => prev[k] === next[k])) {
        return prev; // unchanged → bail out, no re-render
      }
      return next;
    });
  }, []);

  // After every render, reconcile heights (the guard above stops the loop).
  useLayoutEffect(() => {
    measure();
  });

  // Catch async height changes (images, fonts, chord SVGs).
  useEffect(() => {
    const c = containerRef.current;
    if (!c) return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(c);
    c.querySelectorAll('[data-measure-id]').forEach((el) => ro.observe(el));
    return () => ro.disconnect();
  }, [measure, blocks]);

  // 0×0 clipped wrapper: the inner column lays out at the real content width
  // (so offsetHeight is accurate) but paints nothing and never adds scroll.
  const measureLayer = (
    <div aria-hidden style={{ position: 'relative', width: 0, height: 0, overflow: 'hidden' }}>
      <div
        ref={containerRef}
        className="pointer-events-none flex flex-col gap-3"
        style={{ position: 'absolute', top: 0, left: 0, width: contentWidth, visibility: 'hidden' }}
      >
        {blocks.map((b) => (
          <div key={b.id} data-measure-id={b.id} className="break-inside-avoid">
            <ScaleBox scale={b.scale ?? 1}>
              <RenderBlock block={b} mode={mode} />
            </ScaleBox>
          </div>
        ))}
      </div>
    </div>
  );

  return { measureLayer, heights };
}
