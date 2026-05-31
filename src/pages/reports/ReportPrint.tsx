// Print / Save-as-PDF view. Rendered OUTSIDE the app shell (top-level route) so
// the printed output is just the pages. The browser's print dialog ("Save as
// PDF") is our zero-dependency PDF engine; an injected @page rule sets the sheet
// size/orientation, and the print stylesheet (index.css) handles page breaks.

import { useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import { useReportTemplate } from '@/db/repo';
import { MARGIN_IN, pageSizeCss } from '@/lib/report/geometry';
import { ReportPageSurface } from '@/components/report/ReportPageSurface';
import '@/lib/report/blocks'; // register built-in blocks

export function ReportPrint() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const template = useReportTemplate(id);
  const date = useMemo(() => new Date().toLocaleDateString(), []);

  if (template === undefined) {
    return <p className="p-8 text-sm text-ink-500">Loading…</p>;
  }
  if (template === null) {
    return (
      <div className="p-8">
        <button className="btn-ghost" onClick={() => navigate('/reports')}>
          <ArrowLeft size={16} /> Back
        </button>
        <p className="mt-4 text-sm text-ink-500">Report not found.</p>
      </div>
    );
  }

  return (
    <div className="report-print min-h-screen bg-ink-200 dark:bg-ink-950">
      {/* @page is dynamic per template (lives here, not in CSS). The margin
          repeats on every physical sheet, so spilled songs stay clean. */}
      <style>{`@page { size: ${pageSizeCss(template.pageSize, template.orientation)}; margin: ${MARGIN_IN}in; }`}</style>

      <div className="no-print sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-ink-300 bg-white px-4 py-3 dark:border-ink-700 dark:bg-ink-900">
        <button className="btn-ghost" onClick={() => navigate(`/reports/${template.id}`)}>
          <ArrowLeft size={16} /> Back to editor
        </button>
        <span className="truncate text-sm font-medium">{template.name}</span>
        <button className="btn-primary" onClick={() => window.print()}>
          <Printer size={15} /> Print / Save as PDF
        </button>
      </div>

      <div className="flex flex-col items-center gap-6 py-6 print:gap-0 print:py-0">
        {template.pages.map((page, i) => (
          <div key={page.id} className="shadow-lg print:shadow-none">
            <ReportPageSurface template={template} page={page} pageIndex={i} date={date} />
          </div>
        ))}
      </div>
    </div>
  );
}
