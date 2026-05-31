// Renders a ResolvedChart (fretted or keyboard) with its name. The thin switch
// that picks the right SVG renderer; used by the popover, the editor's chart
// strip, and reports.

import type { ResolvedChart } from '@/lib/chords';
import { FretboardChart } from './FretboardChart';
import { KeyboardChart } from './KeyboardChart';

export function ChordChart({
  chart,
  size = 'md',
  showName = true,
}: {
  chart: ResolvedChart;
  size?: 'sm' | 'md' | 'lg';
  showName?: boolean;
}) {
  return (
    <figure className="inline-flex flex-col items-center gap-1">
      {chart.kind === 'fretted' ? (
        <FretboardChart shape={chart.fretted} size={size} />
      ) : (
        <KeyboardChart shape={chart.keyboard} size={size} />
      )}
      {showName && (
        <figcaption className="text-xs font-semibold text-ink-700 dark:text-ink-300">
          {chart.name}
        </figcaption>
      )}
    </figure>
  );
}
