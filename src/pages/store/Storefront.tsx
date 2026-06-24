// Storefront: lists active bundles for everyone (including logged-out visitors).
// Shows price, song count, and an "Owned" badge for bundles the user is
// entitled to. Bundle bodies stay gated — this is just the catalogue.

import { Link } from 'react-router-dom';
import { Check, ChevronRight, Store } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { useEntitledBundleIds, useStorefront } from '@/db/repo';
import { formatPrice } from '@/lib/money';
import { RedeemCode } from './RedeemCode';

export function Storefront() {
  const bundles = useStorefront();
  const owned = useEntitledBundleIds();

  return (
    <div>
      <PageHeader title="Store" subtitle="Song bundles" />

      <RedeemCode />

      {bundles === undefined ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : bundles.length === 0 ? (
        <EmptyState
          icon={Store}
          title="No bundles yet"
          description="Song bundles will appear here once they're published."
        />
      ) : (
        <div className="card divide-y divide-ink-200 dark:divide-ink-800">
          {bundles.map((b) => {
            const isOwned = owned?.has(b.id) ?? false;
            return (
              <Link
                key={b.id}
                to={`/store/${b.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-ink-50 dark:hover:bg-ink-900/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <span className="truncate">{b.title}</span>
                    {isOwned && (
                      <span className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-fg">
                        <Check size={11} /> Owned
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate text-xs text-ink-500 dark:text-ink-400">
                    {[
                      b.description,
                      `${b.song_count} song${b.song_count === 1 ? '' : 's'}`,
                      isOwned ? null : formatPrice(b.price_cents),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-ink-400" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
