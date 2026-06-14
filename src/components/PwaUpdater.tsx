// Surfaces a new deploy while the app is open. With `registerType: 'prompt'`
// the freshly-built service worker installs but waits; this shows a small
// "update available" pill so the user can refresh to the new version on demand
// (instead of the change only appearing after a future cold reopen). It also
// re-checks for a new build periodically and when the tab regains focus, so a
// long-lived session still notices deploys.

import { RefreshCw } from 'lucide-react';
import { useRegisterSW } from 'virtual:pwa-register/react';

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // 30 min

export function PwaUpdater() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      const check = () => void registration.update();
      const timer = setInterval(check, CHECK_INTERVAL_MS);
      window.addEventListener('focus', check);
      // Best-effort cleanup; the registration outlives the page anyway.
      window.addEventListener('beforeunload', () => {
        clearInterval(timer);
        window.removeEventListener('focus', check);
      });
    },
  });

  if (!needRefresh) return null;

  return (
    <div
      className="fixed left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-2xl border border-ink-200 bg-white px-4 py-2.5 text-sm shadow-lg dark:border-ink-700 dark:bg-ink-900"
      style={{ bottom: 'calc(var(--safe-bottom, 0px) + 4.5rem)' }}
      role="status"
    >
      <span className="font-medium">A new version is available.</span>
      <button className="btn-primary px-3 py-1" onClick={() => updateServiceWorker(true)}>
        <RefreshCw size={14} /> Refresh
      </button>
      <button className="btn-ghost px-2 py-1 text-ink-500" onClick={() => setNeedRefresh(false)}>
        Later
      </button>
    </div>
  );
}
