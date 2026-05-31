// One physical sheet: the "paper" (carrying the page margin as padding on
// screen; in print the margin comes from `@page` and this padding is removed)
// wrapping the content box, with header/footer bands and the flow + floating
// slots. Callers (editor + print) paginate an explicit page into a stack of
// these, so geometry/margins/bands never drift between the two.

import type { ReactNode, Ref } from 'react';
import { pageGeometry, type PageGeometry } from '@/lib/report/geometry';
import type { TokenContext } from '@/lib/report/tokens';
import type { ReportBand } from '@/types';
import { BAND_HEIGHT, PageFooterBand, PageHeaderBand } from './PageBands';

const BAND_SPACE = BAND_HEIGHT + 10;

/** Flow height available on a sheet after reserving header/footer band space. */
export function usableContentHeight(
  geo: PageGeometry,
  hasHeader: boolean,
  hasFooter: boolean,
): number {
  return geo.contentHeightPx - (hasHeader ? BAND_SPACE : 0) - (hasFooter ? BAND_SPACE : 0);
}

export function PageFrame({
  geo,
  header,
  footer,
  ctx,
  flow,
  floating,
  contentRef,
}: {
  geo: PageGeometry;
  header?: ReportBand;
  footer?: ReportBand;
  ctx: TokenContext;
  flow: ReactNode;
  floating?: ReactNode;
  /** Optional ref to the content box (the editor needs it for hit-testing). */
  contentRef?: Ref<HTMLDivElement>;
}) {
  return (
    <div
      className="report-paper bg-white text-ink-900 shadow-lg print:shadow-none"
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
