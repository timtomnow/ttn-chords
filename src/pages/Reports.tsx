import { FileText } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';

// Scaffold placeholder for the PDF report generator (Phase 8). The generator
// arranges songs, chord charts, logos/images, and rhythm patterns across one
// or more pages. Multi-page layout is a hard requirement; the PDF engine
// (print-to-PDF vs. a PDF library) is an open decision recorded in plan.md.
export function Reports() {
  return (
    <div>
      <PageHeader title="Reports" subtitle="Printable songbooks & handouts" />
      <EmptyState
        icon={FileText}
        title="Report generator coming in Phase 8"
        description="Arrange songs, chord charts, logos, and rhythms across multiple pages, then export to PDF."
      />
    </div>
  );
}
