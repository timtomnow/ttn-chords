// Read-only render of one page: header/footer bands, the flow column, and the
// floating layer. This is what the PRINT view draws (and what the editor's
// interactive page mirrors). Sizing is in px at 96dpi so the on-screen surface
// equals the printed sheet.
//
// Spill: the content box uses `min-height` (not a fixed height) and never
// clips, so a long flow column grows the page taller than one sheet and the
// browser paginates it onto a continuation sheet at print time. Floating blocks
// are positioned against the NOMINAL content size, so they stay anchored.

import { useMemo } from 'react';
import { floatingStyle, pageGeometry } from '@/lib/report/geometry';
import { footerForPage, headerForPage, type TokenContext } from '@/lib/report/tokens';
import type { ReportPage, ReportTemplate } from '@/types';
import { RenderBlock } from './RenderBlock';
import {
  BAND_HEIGHT,
  PageFooterBand,
  PageHeaderBand,
} from './PageBands';

const BAND_SPACE = BAND_HEIGHT + 10;

export function ReportPageSurface({
  template,
  page,
  pageIndex,
  date,
}: {
  template: ReportTemplate;
  page: ReportPage;
  pageIndex: number;
  /** Preformatted render date for {date}. */
  date: string;
}) {
  const geo = useMemo(
    () => pageGeometry(template.pageSize, template.orientation),
    [template.pageSize, template.orientation],
  );

  const ctx: TokenContext = {
    page: pageIndex + 1,
    pages: template.pages.length,
    title: template.name,
    date,
  };
  const header = headerForPage(template.chrome, pageIndex);
  const footer = footerForPage(template.chrome, pageIndex);

  const flow = page.blocks.filter((b) => b.placement.mode === 'flow');
  const floating = page.blocks.filter((b) => b.placement.mode === 'floating');

  return (
    <div
      className="report-page relative bg-white text-ink-900"
      style={{ width: geo.widthPx, minHeight: geo.heightPx, padding: geo.marginPx }}
    >
      <div className="relative" style={{ minHeight: geo.contentHeightPx }}>
        <PageHeaderBand band={header} ctx={ctx} />
        <PageFooterBand band={footer} ctx={ctx} />

        {/* Flow column */}
        <div
          className="flex flex-col gap-3"
          style={{
            paddingTop: header ? BAND_SPACE : 0,
            paddingBottom: footer ? BAND_SPACE : 0,
          }}
        >
          {flow.map((b) => (
            <RenderBlock key={b.id} block={b} mode="print" />
          ))}
        </div>

        {/* Floating layer (anchored to the nominal content box) */}
        {floating.map((b) =>
          b.placement.mode === 'floating' ? (
            <div key={b.id} style={floatingStyle(geo, b.placement)}>
              <RenderBlock block={b} mode="print" />
            </div>
          ) : null,
        )}
      </div>
    </div>
  );
}
