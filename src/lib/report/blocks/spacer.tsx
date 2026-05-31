// Vertical spacer for flow layouts — push later blocks down the page.

import { MoveVertical } from 'lucide-react';
import { registerBlock } from '../registry';
import type { BlockEditorProps, BlockRenderProps } from '../types';

function height(c: Record<string, unknown>): number {
  return typeof c.height === 'number' ? c.height : 24;
}

function Render({ block, mode }: BlockRenderProps) {
  const h = height(block.config);
  return (
    <div
      style={{ height: h }}
      className={mode === 'screen' ? 'rounded border border-dashed border-ink-200 dark:border-ink-800' : ''}
    />
  );
}

function Editor({ block, onChange }: BlockEditorProps) {
  const h = height(block.config);
  return (
    <label className="block">
      <span className="label mb-1">Height {h}px</span>
      <input
        type="range"
        min={8}
        max={400}
        step={4}
        value={h}
        onChange={(e) => onChange({ height: Number(e.target.value) })}
        className="w-full accent-accent"
      />
    </label>
  );
}

registerBlock({
  type: 'spacer',
  label: 'Spacer',
  icon: MoveVertical,
  defaultPlacement: { mode: 'flow' },
  defaultConfig: () => ({ height: 24 }),
  Render,
  Editor,
});
