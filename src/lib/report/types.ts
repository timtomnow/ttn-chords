// Report block plug-in contract.
//
// A "report block" is one placeable unit on a printed page: a song, a chord-
// chart strip, an image, a rhythm box, free text, a spacer. Each block type is
// a self-contained module that registers a descriptor; the editor and the print
// view both render blocks purely through this contract (block→component
// registry). Adding a block type = write a module + call `registerBlock` —
// nothing in the editor or print pipeline changes.
//
// This mirrors the Phase-5 performance-view registry on purpose, and is kept
// report-scoped for now; the same descriptor shape could later feed customizable
// on-screen layouts without rework.

import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { BlockPlacement, ReportBlock, ReportBlockType } from '@/types';

/** Where a block is being drawn. Renderers may differ slightly (e.g. screen
 *  shows a faint placeholder for an unset reference; print shows nothing). */
export type BlockRenderMode = 'screen' | 'print';

export type BlockRenderProps = {
  block: ReportBlock;
  mode: BlockRenderMode;
};

export type BlockEditorProps = {
  block: ReportBlock;
  /** Merge a patch into this block's config. */
  onChange: (patch: Record<string, unknown>) => void;
};

export type ReportBlockDef = {
  type: ReportBlockType;
  /** Display name in the block palette. */
  label: string;
  icon: LucideIcon;
  /** Placement a freshly-added block gets. */
  defaultPlacement: BlockPlacement;
  /** Initial config for a freshly-added block. */
  defaultConfig: () => Record<string, unknown>;
  /** Renders the block on a page (screen canvas + print). */
  Render: ComponentType<BlockRenderProps>;
  /** Side-panel inspector for the block's config. Optional (e.g. spacer). */
  Editor?: ComponentType<BlockEditorProps>;
};
