// The report-block registry. Blocks self-register at import time (see
// ./blocks/index.ts); the editor palette and the renderer read from here.
// Registration order = palette order. Mirrors the performance-view registry.

import type { ReportBlockType } from '@/types';
import type { ReportBlockDef } from './types';

const registry: ReportBlockDef[] = [];

export function registerBlock(def: ReportBlockDef): void {
  const i = registry.findIndex((b) => b.type === def.type);
  if (i >= 0) {
    // Re-registration (e.g. HMR) replaces in place.
    registry[i] = def;
    return;
  }
  registry.push(def);
}

export function listBlocks(): ReportBlockDef[] {
  return registry.slice();
}

export function getBlock(type: ReportBlockType): ReportBlockDef | undefined {
  return registry.find((b) => b.type === type);
}
