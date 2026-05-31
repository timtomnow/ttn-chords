// The header and footer bands for one page. Anchored to the top and bottom of
// the content box; {token}s expanded per page. Shared by the editor canvas and
// the print view so they always match.

import type { ReportBand } from '@/types';
import { bandHasContent, expandTokens, type TokenContext } from '@/lib/report/tokens';

/** Reserved band height in px (used to pad the flow column away from a band). */
export const BAND_HEIGHT = 22;

function Band({ band, ctx }: { band: ReportBand; ctx: TokenContext }) {
  return (
    <div
      className="flex items-baseline justify-between gap-4 text-[11px] text-ink-500 dark:text-ink-400"
      style={{ height: BAND_HEIGHT }}
    >
      <span className="flex-1 truncate text-left">{expandTokens(band.left, ctx)}</span>
      <span className="flex-1 truncate text-center">{expandTokens(band.center, ctx)}</span>
      <span className="flex-1 truncate text-right">{expandTokens(band.right, ctx)}</span>
    </div>
  );
}

export function PageHeaderBand({
  band,
  ctx,
}: {
  band: ReportBand | undefined;
  ctx: TokenContext;
}) {
  if (!bandHasContent(band)) return null;
  return (
    <div className="absolute inset-x-0 top-0">
      <Band band={band!} ctx={ctx} />
      <div className="mt-0.5 border-b border-ink-200 dark:border-ink-800" />
    </div>
  );
}

export function PageFooterBand({
  band,
  ctx,
}: {
  band: ReportBand | undefined;
  ctx: TokenContext;
}) {
  if (!bandHasContent(band)) return null;
  return (
    <div className="absolute inset-x-0 bottom-0">
      <div className="mb-0.5 border-t border-ink-200 dark:border-ink-800" />
      <Band band={band!} ctx={ctx} />
    </div>
  );
}
