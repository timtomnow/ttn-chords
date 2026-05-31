// Uniformly scales a block's content (the per-block "size" knob). The inner box
// lays out at 100/scale % width and is then CSS-scaled back to 100%, so content
// reflows to its column while text/charts/images grow or shrink. The outer box
// is height-compensated (measured live) so flow blocks don't leave a gap or
// overlap their neighbours.

import { useEffect, useRef, useState, type ReactNode } from 'react';

export function ScaleBox({ scale, children }: { scale: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    setHeight(el.offsetHeight);
    return () => ro.disconnect();
  }, []);

  if (!scale || scale === 1) return <>{children}</>;

  return (
    <div style={{ height: height !== undefined ? height * scale : undefined }}>
      <div
        ref={ref}
        style={{ width: `${100 / scale}%`, transform: `scale(${scale})`, transformOrigin: 'top left' }}
      >
        {children}
      </div>
    </div>
  );
}
