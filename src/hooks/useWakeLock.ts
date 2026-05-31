import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Best-effort Screen Wake Lock. Re-acquires on visibility change (browsers
 * drop the lock when the tab is hidden). No-ops where unsupported.
 */
export function useWakeLock(active: boolean): { supported: boolean; held: boolean } {
  const [supported] = useState(
    () => typeof navigator !== 'undefined' && 'wakeLock' in navigator,
  );
  const [held, setHeld] = useState(false);
  const sentinelRef = useRef<WakeLockSentinel | null>(null);

  const release = useCallback(async () => {
    const s = sentinelRef.current;
    sentinelRef.current = null;
    if (s) {
      try {
        await s.release();
      } catch {
        /* ignore */
      }
    }
    setHeld(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function acquire() {
      if (!supported || !active) return;
      try {
        const s = await navigator.wakeLock.request('screen');
        if (cancelled) {
          await s.release();
          return;
        }
        sentinelRef.current = s;
        setHeld(true);
        s.addEventListener('release', () => setHeld(false));
      } catch {
        /* user gesture required or unsupported — ignore */
      }
    }

    function onVisibility() {
      if (document.visibilityState === 'visible' && active) void acquire();
    }

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void release();
    };
  }, [active, supported, release]);

  return { supported, held };
}
