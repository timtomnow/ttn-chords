import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { BottomNav } from './BottomNav';

// One responsive shell for both form factors: a left sidebar on md+ screens,
// a bottom tab bar on phones. The content column is identical either way.
export function AppShell() {
  return (
    <div className="flex h-full bg-ink-50 text-ink-900 dark:bg-ink-950 dark:text-ink-50">
      <Sidebar />
      <main
        className="flex-1 overflow-y-auto overscroll-y-none pb-[calc(72px+var(--safe-bottom))] md:pb-0"
        style={{ paddingTop: 'var(--safe-top)' }}
      >
        <div className="mx-auto w-full max-w-4xl px-4 py-6 md:px-8 md:py-10">
          <Outlet />
        </div>
      </main>
      <BottomNav />
    </div>
  );
}
