// The performance-view registry. Views self-register at import time; the shell
// reads from here. Order = display order in the view switcher. The first
// registered view is the default fallback.

import type { PerformanceViewDef } from './types';

const registry: PerformanceViewDef[] = [];

export function registerView(def: PerformanceViewDef): void {
  if (registry.some((v) => v.id === def.id)) {
    // Re-registration (e.g. HMR) replaces the existing entry in place.
    const i = registry.findIndex((v) => v.id === def.id);
    registry[i] = def;
    return;
  }
  registry.push(def);
}

export function listViews(): PerformanceViewDef[] {
  return registry.slice();
}

export function getView(id: string | undefined): PerformanceViewDef | undefined {
  if (!id) return registry[0];
  return registry.find((v) => v.id === id) ?? registry[0];
}

export const DEFAULT_VIEW_ID = 'scroll';
