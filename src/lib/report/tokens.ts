// Header/footer token expansion. A band slot like "Page {page} of {pages}" is
// expanded against the per-render context. Page numbers refer to EXPLICIT pages
// in the template (1-based) — see the spill caveat in plan.md §Phase 8.

import type { ReportBand, ReportChrome } from '@/types';

export type TokenContext = {
  /** 1-based explicit page number. */
  page: number;
  /** Total explicit page count. */
  pages: number;
  /** Report title. */
  title: string;
  /** Render date, preformatted for display. */
  date: string;
};

export function expandTokens(text: string | undefined, ctx: TokenContext): string {
  if (!text) return '';
  return text
    .replace(/\{page\}/g, String(ctx.page))
    .replace(/\{pages\}/g, String(ctx.pages))
    .replace(/\{title\}/g, ctx.title)
    .replace(/\{date\}/g, ctx.date);
}

/** The header band that applies to a given page index (0-based), honoring
 *  first-page-different. Returns undefined when no band should render. */
export function headerForPage(
  chrome: ReportChrome | undefined,
  pageIndex: number,
): ReportBand | undefined {
  if (!chrome) return undefined;
  if (pageIndex === 0 && chrome.firstPageDifferent) return chrome.firstHeader;
  return chrome.header;
}

export function footerForPage(
  chrome: ReportChrome | undefined,
  pageIndex: number,
): ReportBand | undefined {
  if (!chrome) return undefined;
  if (pageIndex === 0 && chrome.firstPageDifferent) return chrome.firstFooter;
  return chrome.footer;
}

/** Whether a band has any non-empty slot (so we only reserve space when used). */
export function bandHasContent(band: ReportBand | undefined): boolean {
  if (!band) return false;
  return Boolean(band.left?.trim() || band.center?.trim() || band.right?.trim());
}
