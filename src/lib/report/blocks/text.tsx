// Free-text block: headings, instructions, credits. Flow by default.

import { Type } from 'lucide-react';
import { registerBlock } from '../registry';
import type { BlockEditorProps, BlockRenderProps } from '../types';

type TextConfig = {
  text: string;
  align: 'left' | 'center' | 'right';
  scale: number; // multiplier on a 15px base
  bold: boolean;
};

function cfg(c: Record<string, unknown>): TextConfig {
  return {
    text: typeof c.text === 'string' ? c.text : '',
    align: c.align === 'center' || c.align === 'right' ? c.align : 'left',
    scale: typeof c.scale === 'number' ? c.scale : 1,
    bold: c.bold === true,
  };
}

function Render({ block, mode }: BlockRenderProps) {
  const c = cfg(block.config);
  if (!c.text.trim() && mode === 'print') return null;
  return (
    <div
      className="whitespace-pre-wrap break-words leading-snug"
      style={{ textAlign: c.align, fontSize: 15 * c.scale, fontWeight: c.bold ? 700 : 400 }}
    >
      {c.text.trim() || (mode === 'screen' ? 'Text…' : '')}
    </div>
  );
}

function Editor({ block, onChange }: BlockEditorProps) {
  const c = cfg(block.config);
  return (
    <div className="space-y-3">
      <textarea
        className="input min-h-[5rem] resize-y"
        value={c.text}
        placeholder="Type text…"
        onChange={(e) => onChange({ text: e.target.value })}
      />
      <div>
        <span className="label mb-1">Align</span>
        <div className="flex gap-1">
          {(['left', 'center', 'right'] as const).map((a) => (
            <button
              key={a}
              className={`chip ${c.align === a ? 'chip-active' : ''} capitalize`}
              onClick={() => onChange({ align: a })}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
      <label className="block">
        <span className="label mb-1">Size {c.scale.toFixed(2)}×</span>
        <input
          type="range"
          min={0.6}
          max={3}
          step={0.05}
          value={c.scale}
          onChange={(e) => onChange({ scale: Number(e.target.value) })}
          className="w-full accent-accent"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={c.bold}
          onChange={(e) => onChange({ bold: e.target.checked })}
        />
        Bold
      </label>
    </div>
  );
}

registerBlock({
  type: 'text',
  label: 'Text',
  icon: Type,
  defaultPlacement: { mode: 'flow' },
  defaultConfig: () => ({ text: '', align: 'left', scale: 1, bold: false }),
  Render,
  Editor,
});
