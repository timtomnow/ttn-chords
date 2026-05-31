import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Songs } from '@/pages/Songs';
import { Setlists } from '@/pages/Setlists';
import { Reports } from '@/pages/Reports';
import { ReportPrint } from '@/pages/reports/ReportPrint';
import { Settings } from '@/pages/Settings';
import { ThemeProvider } from './theme';
import { installTtnBackupAdapter } from '@/lib/ttnBackup';
import { getSettings } from '@/db/repo';
import { applyAccent } from '@/lib/accent';

export function App() {
  useEffect(() => {
    installTtnBackupAdapter();
    // Apply the saved accent from the DB (source of truth for backups). The
    // inline script in index.html already applied the localStorage mirror, so
    // this only matters after a restore or on a fresh device.
    void getSettings().then((s) => applyAccent(s.accentColor));
  }, []);

  return (
    <ThemeProvider>
      <Routes>
        {/* Print view lives outside the shell (more specific than /reports/*,
            so it wins) — the printed page is just the report. */}
        <Route path="/reports/:id/print" element={<ReportPrint />} />
        <Route element={<AppShell />}>
          <Route index element={<Navigate to="/songs" replace />} />
          <Route path="/songs/*" element={<Songs />} />
          <Route path="/setlists/*" element={<Setlists />} />
          <Route path="/reports/*" element={<Reports />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/songs" replace />} />
        </Route>
      </Routes>
    </ThemeProvider>
  );
}
