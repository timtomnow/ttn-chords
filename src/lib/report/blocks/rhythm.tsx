// Rhythm-pattern block: drops a RhythmChart box onto the page. Live reference
// to a pattern in the library (config holds only the id).

import { Music2 } from 'lucide-react';
import { useRhythmPattern, useRhythmPatterns, useRhythmSymbolMap } from '@/db/repo';
import { RhythmChart } from '@/components/rhythm/RhythmChart';
import { registerBlock } from '../registry';
import type { BlockEditorProps, BlockRenderProps } from '../types';

function patternId(c: Record<string, unknown>): string | undefined {
  return typeof c.patternId === 'string' && c.patternId ? c.patternId : undefined;
}
function size(c: Record<string, unknown>): 'sm' | 'md' | 'lg' {
  return c.size === 'sm' || c.size === 'lg' ? c.size : 'md';
}

function Render({ block, mode }: BlockRenderProps) {
  const pattern = useRhythmPattern(patternId(block.config));
  const symbols = useRhythmSymbolMap();
  if (!pattern) {
    if (mode === 'print') return null;
    return (
      <div className="rounded-lg border border-dashed border-ink-300 px-3 py-4 text-center text-xs text-ink-400 dark:border-ink-700">
        Pick a rhythm pattern
      </div>
    );
  }
  return <RhythmChart pattern={pattern} symbols={symbols} size={size(block.config)} />;
}

function Editor({ block, onChange }: BlockEditorProps) {
  const patterns = useRhythmPatterns();
  return (
    <div className="space-y-3">
      <label className="block">
        <span className="label mb-1">Pattern</span>
        <select
          className="input"
          value={patternId(block.config) ?? ''}
          onChange={(e) => onChange({ patternId: e.target.value })}
        >
          <option value="">— none —</option>
          {patterns?.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        <span className="label mb-1">Size</span>
        <select
          className="input"
          value={size(block.config)}
          onChange={(e) => onChange({ size: e.target.value })}
        >
          <option value="sm">Small</option>
          <option value="md">Medium</option>
          <option value="lg">Large</option>
        </select>
      </label>
    </div>
  );
}

registerBlock({
  type: 'rhythm',
  label: 'Rhythm',
  icon: Music2,
  defaultPlacement: { mode: 'flow' },
  defaultConfig: () => ({ patternId: '', size: 'md' }),
  Render,
  Editor,
});
