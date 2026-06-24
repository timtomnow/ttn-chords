// A tiny reactive cache for a Supabase-backed collection, exposed through
// useSyncExternalStore so components get the same "undefined while loading, then
// an array" ergonomics the old Dexie useLiveQuery hooks had — but the cloud is
// the source of truth. Each mutation calls refresh() to re-pull authoritative
// state (no optimistic local writes, no two-way sync).

import { useSyncExternalStore } from 'react';

type Listener = () => void;

export class CloudList<T> {
  private snapshot: T[] | undefined = undefined;
  private listeners = new Set<Listener>();
  private fetching = false;

  constructor(private readonly fetcher: () => Promise<T[]>) {}

  subscribe = (listener: Listener): (() => void) => {
    this.listeners.add(listener);
    // Lazy first load when the first component mounts.
    if (this.snapshot === undefined && !this.fetching) void this.refresh();
    return () => {
      this.listeners.delete(listener);
    };
  };

  getSnapshot = (): T[] | undefined => this.snapshot;

  private emit(): void {
    for (const l of this.listeners) l();
  }

  /** Re-pull from Supabase and notify subscribers. */
  async refresh(): Promise<void> {
    this.fetching = true;
    try {
      this.snapshot = await this.fetcher();
    } catch (err) {
      console.error('[cloud] fetch failed', err);
      // Surface as empty rather than spinning forever; a later refresh recovers.
      this.snapshot = [];
    } finally {
      this.fetching = false;
      this.emit();
    }
  }

  /** Drop cached data (e.g. on sign-out) so the next read refetches. */
  reset(): void {
    this.snapshot = undefined;
    this.emit();
  }
}

export function useCloudList<T>(list: CloudList<T>): T[] | undefined {
  return useSyncExternalStore(list.subscribe, list.getSnapshot, list.getSnapshot);
}
