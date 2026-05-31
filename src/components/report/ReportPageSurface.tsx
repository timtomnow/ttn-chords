// Read-only render of one page for the PRINT view. Builds the flow + floating
// nodes and hands them to the shared PageFrame, so layout matches the editor.

import { useMemo } from 'react';
import { floatingStyle, pageGeometry } from '@/lib/report/geometry';
import type { ReportPage, ReportTemplate } from '@/types';
import { PageFrame } from './PageFrame';
import { RenderBlock } from './RenderBlock';
import { ScaleBox } from './ScaleBox';

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

  const flow = page.blocks.filter((b) => b.placement.mode === 'flow');
  const floating = page.blocks.filter((b) => b.placement.mode === 'floating');

  return (
    <PageFrame
      template={template}
      geo={geo}
      pageIndex={pageIndex}
      date={date}
      flow={flow.map((b) => (
        <div key={b.id} className="break-inside-avoid">
          <ScaleBox scale={b.scale ?? 1}>
            <RenderBlock block={b} mode="print" />
          </ScaleBox>
        </div>
      ))}
      floating={floating.map((b) =>
        b.placement.mode === 'floating' ? (
          <div key={b.id} style={floatingStyle(geo, b.placement)} className="overflow-hidden">
            <RenderBlock block={b} mode="print" />
          </div>
        ) : null,
      )}
    />
  );
}
