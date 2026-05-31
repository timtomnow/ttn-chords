// Read-only render of one explicit page for the PRINT view, paginated into real
// physical sheets (each with correct margins) via measurement — so the on-screen
// preview matches the printed PDF. Returns a fragment of `.report-paper` sheets
// (+ a hidden measure layer) so ReportPrint can stack them as siblings.

import { Fragment, useMemo } from 'react';
import { floatingStyle, pageGeometry } from '@/lib/report/geometry';
import { paginate } from '@/lib/report/paginate';
import {
  bandHasContent,
  footerForPage,
  headerForPage,
  type TokenContext,
} from '@/lib/report/tokens';
import type { ReportPage, ReportTemplate } from '@/types';
import { PageFrame, usableContentHeight } from './PageFrame';
import { RenderBlock } from './RenderBlock';
import { ScaleBox } from './ScaleBox';
import { useBlockHeights } from './useBlockHeights';

const GAP = 12; // matches the flow column's gap-3

export function ReportPageSurface({
  template,
  page,
  pageIndex,
  date,
}: {
  template: ReportTemplate;
  page: ReportPage;
  pageIndex: number;
  date: string;
}) {
  const geo = useMemo(
    () => pageGeometry(template.pageSize, template.orientation),
    [template.pageSize, template.orientation],
  );

  const headerBand = headerForPage(template.chrome, pageIndex);
  const footerBand = footerForPage(template.chrome, pageIndex);
  const header = bandHasContent(headerBand) ? headerBand : undefined;
  const footer = bandHasContent(footerBand) ? footerBand : undefined;
  const usable = usableContentHeight(geo, !!header, !!footer);
  const ctx: TokenContext = {
    page: pageIndex + 1,
    pages: template.pages.length,
    title: template.name,
    date,
  };

  const flowBlocks = page.blocks.filter((b) => b.placement.mode === 'flow');
  const floatingBlocks = page.blocks.filter((b) => b.placement.mode === 'floating');
  const byId = useMemo(() => new Map(flowBlocks.map((b) => [b.id, b])), [flowBlocks]);

  const { measureLayer, heights } = useBlockHeights(flowBlocks, 'print', geo.contentWidthPx);
  const sheets = useMemo(
    () => paginate(flowBlocks.map((b) => ({ id: b.id, height: heights[b.id] ?? 0 })), usable, GAP),
    [flowBlocks, heights, usable],
  );

  return (
    <>
      {/* hidden measure layer (kept first so the last DOM child is a sheet) */}
      {measureLayer}
      {sheets.map((sheet, si) => (
        <Fragment key={si}>
          <PageFrame
            geo={geo}
            header={header}
            footer={footer}
            ctx={ctx}
            flow={sheet.ids.map((id) => {
              const b = byId.get(id);
              return b ? (
                <div key={id} className="break-inside-avoid">
                  <ScaleBox scale={b.scale ?? 1}>
                    <RenderBlock block={b} mode="print" />
                  </ScaleBox>
                </div>
              ) : null;
            })}
            floating={
              si === 0
                ? floatingBlocks.map((b) =>
                    b.placement.mode === 'floating' ? (
                      <div key={b.id} style={floatingStyle(geo, b.placement)} className="overflow-hidden">
                        <RenderBlock block={b} mode="print" />
                      </div>
                    ) : null,
                  )
                : null
            }
          />
        </Fragment>
      ))}
    </>
  );
}
