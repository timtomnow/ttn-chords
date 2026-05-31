// The shared page shell used by BOTH the editor canvas and the print view, so
// geometry / margins / header-footer bands never drift between them.
//
// Layout model (see plan.md §Phase 8): the visible "paper" carries the page
// margin as padding on screen; in print the margin comes from the `@page` rule
// (which repeats on every physical sheet) and this padding is removed. The inner
// `.report-page` is the content box (printable area) — it has `min-height` and
// never clips, so a long flow column spills onto continuation sheets cleanly.
// Callers supply the already-rendered flow and floating nodes (the editor wraps
// them with dnd-kit / react-rnd; print uses plain renderers).

import type { ReactNode } from 'react';
import { pageGeometry, type PageGeometry } from '@/lib/report/geometry';
import { footerForPage, headerForPage, type TokenContext } from '@/lib/report/tokens';
import type { ReportTemplate } from '@/types';
import { BAND_HEIGHT, PageFooterBand, PageHeaderBand } from './PageBands';

const BAND_SPACE = BAND_HEIGHT + 10;

export function pageTokenContext(
  template: ReportTemplate,
  pageIndex: number,
  date: string,
): TokenContext {
  return { page: pageIndex + 1, pages: template.pages.length, title: template.name, date };
}

export function PageFrame({
  template,
  geo,
  pageIndex,
  date,
  flow,
  floating,
  contentRef,
}: {
  template: ReportTemplate;
  geo: PageGeometry;
  pageIndex: number;
  date: string;
  flow: ReactNode;
  floating?: ReactNode;
  /** Optional ref to the content box (the editor needs it for hit-testing). */
  contentRef?: React.Ref<HTMLDivElement>;
}) {
  const ctx = pageTokenContext(template, pageIndex, date);
  const header = headerForPage(template.chrome, pageIndex);
  const footer = footerForPage(template.chrome, pageIndex);

  return (
    <div
      className="report-paper bg-white text-ink-900"
      style={{ width: geo.widthPx, padding: geo.marginPx }}
    >
      <div
        ref={contentRef}
        className="report-page relative"
        style={{ width: geo.contentWidthPx, minHeight: geo.contentHeightPx }}
      >
        <PageHeaderBand band={header} ctx={ctx} />
        <PageFooterBand band={footer} ctx={ctx} />

        <div
          className="flex flex-col gap-3"
          style={{ paddingTop: header ? BAND_SPACE : 0, paddingBottom: footer ? BAND_SPACE : 0 }}
        >
          {flow}
        </div>

        {floating}
      </div>
    </div>
  );
}

export { pageGeometry };
