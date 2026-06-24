import { useEffect } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from '@/components/layout/AppShell';
import { Songs } from '@/pages/Songs';
import { Setlists } from '@/pages/Setlists';
import { Reports } from '@/pages/Reports';
import { ReportPrint } from '@/pages/reports/ReportPrint';
import { Tools } from '@/pages/Tools';
import { Settings } from '@/pages/Settings';
import { GuidePage, HelpAll, HelpIndex, HelpSectionPage } from '@/pages/Help';
import { Auth } from '@/pages/Auth';
import { Admin } from '@/pages/Admin';
import { StoreLayout } from '@/pages/store/StoreLayout';
import { Storefront } from '@/pages/store/Storefront';
import { BundleDetail } from '@/pages/store/BundleDetail';
import { ThemeProvider } from './theme';
import { AuthProvider } from '@/auth/AuthProvider';
import { RequireAuth } from '@/auth/RequireAuth';
import { SupabaseConfigGate } from '@/auth/SupabaseConfigGate';
import { PwaUpdater } from '@/components/PwaUpdater';
import { installTtnBackupAdapter } from '@/lib/ttnBackup';
import { getSettings } from '@/db/repo';
import { initCloudSync } from '@/db/cloud';
import { applyAccent } from '@/lib/accent';

export function App() {
  useEffect(() => {
    installTtnBackupAdapter();
    // Keep the cloud caches in sync with the signed-in user (login/logout).
    initCloudSync();
    // Apply the saved accent from the DB (source of truth for backups). The
    // inline script in index.html already applied the localStorage mirror, so
    // this only matters after a restore or on a fresh device.
    void getSettings().then((s) => applyAccent(s.accentColor));
  }, []);

  return (
    <ThemeProvider>
      <SupabaseConfigGate>
        <AuthProvider>
          <PwaUpdater />
          <Routes>
            {/* Public auth screen — no shell, no session required. */}
            <Route path="/auth" element={<Auth />} />
            {/* Public storefront — logged-out visitors can browse active bundles
                (and nothing else). Song bodies stay gated by entitlement. */}
            <Route element={<StoreLayout />}>
              <Route path="/store" element={<Storefront />} />
              <Route path="/store/:id" element={<BundleDetail />} />
            </Route>
            {/* Everything else requires a session. */}
            <Route element={<RequireAuth />}>
              {/* Print view lives outside the shell (more specific than
                  /reports/*, so it wins) — the printed page is just the report. */}
              <Route path="/reports/:id/print" element={<ReportPrint />} />
              <Route element={<AppShell />}>
                <Route index element={<Navigate to="/songs" replace />} />
                <Route path="/songs/*" element={<Songs />} />
                <Route path="/setlists/*" element={<Setlists />} />
                <Route path="/reports/*" element={<Reports />} />
                <Route path="/tools/*" element={<Tools />} />
                {/* Admin area — RequireAdmin guard lives inside Admin's routes. */}
                <Route path="/admin/*" element={<Admin />} />
                <Route path="/settings" element={<Settings />} />
                {/* Help — static paths before the catch-all :slug so they rank first. */}
                <Route path="/help" element={<HelpIndex />} />
                <Route path="/help/all" element={<HelpAll />} />
                <Route path="/help/section/:section" element={<HelpSectionPage />} />
                <Route path="/help/:slug" element={<GuidePage />} />
                <Route path="*" element={<Navigate to="/songs" replace />} />
              </Route>
            </Route>
          </Routes>
        </AuthProvider>
      </SupabaseConfigGate>
    </ThemeProvider>
  );
}
