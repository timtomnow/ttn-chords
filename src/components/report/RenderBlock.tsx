// Renders one report block by dispatching to its registered module. Used by
// both the editor canvas (mode="screen") and the print view (mode="print").

import { getBlock } from '@/lib/report/registry';
import type { BlockRenderMode } from '@/lib/report/types';
import type { ReportBlock } from '@/types';

export function RenderBlock({ block, mode }: { block: ReportBlock; mode: BlockRenderMode }) {
  const def = getBlock(block.type);
  if (!def) {
    if (mode === 'print') return null;
    return <div className="text-xs text-ink-400">Unknown block: {block.type}</div>;
  }
  const C = def.Render;
  return <C block={block} mode={mode} />;
}
