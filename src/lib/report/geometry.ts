// Page geometry for the report generator. All sizes resolve to CSS pixels at
// 96dpi, which is the unit the print stylesheet's @page rules and the editor
// canvas both use, so what you arrange on screen matches the printed sheet.
//
// Floating blocks store x/y/w/h as PERCENTAGES of the content box; convert with
// `floatingStyle()` so the same math drives the editor and the print view.

import type { CSSProperties } from 'react';
import type { Orientation, PageSize } from '@/types';

export const DPI = 96;

/** Portrait dimensions in inches [width, height]. */
const PAGE_INCHES: Record<PageSize, [number, number]> = {
  letter: [8.5, 11],
  a4: [8.27, 11.69],
  legal: [8.5, 14],
};

/** Default printable margin on every side, in inches. */
export const MARGIN_IN = 0.5;

export type PageGeometry = {
  /** Full sheet, in px. */
  widthPx: number;
  heightPx: number;
  marginPx: number;
  /** Content box (sheet minus margins), in px — the box %s are measured against. */
  contentWidthPx: number;
  contentHeightPx: number;
};

export function pageGeometry(size: PageSize, orientation: Orientation): PageGeometry {
  let [w, h] = PAGE_INCHES[size];
  if (orientation === 'landscape') [w, h] = [h, w];
  const marginPx = MARGIN_IN * DPI;
  return {
    widthPx: w * DPI,
    heightPx: h * DPI,
    marginPx,
    contentWidthPx: (w - 2 * MARGIN_IN) * DPI,
    contentHeightPx: (h - 2 * MARGIN_IN) * DPI,
  };
}

/** The CSS `@page { size: … }` value for a template. */
export function pageSizeCss(size: PageSize, orientation: Orientation): string {
  return `${size === 'a4' ? 'A4' : size} ${orientation}`;
}

/**
 * Absolute style for a floating block. x/y/w/h are percentages of the content
 * box; we resolve them against the NOMINAL content dimensions (constant) so a
 * float stays put even when sibling flow content spills the page taller.
 */
export function floatingStyle(
  geo: PageGeometry,
  pos: { x: number; y: number; w: number; h?: number },
): CSSProperties {
  return {
    position: 'absolute',
    left: `${(pos.x / 100) * geo.contentWidthPx}px`,
    top: `${(pos.y / 100) * geo.contentHeightPx}px`,
    width: `${(pos.w / 100) * geo.contentWidthPx}px`,
    height: pos.h !== undefined ? `${(pos.h / 100) * geo.contentHeightPx}px` : undefined,
  };
}
