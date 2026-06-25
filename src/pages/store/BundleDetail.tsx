// One bundle's page. Song titles are shown to everyone (teaser); the full song
// opens only if the user is entitled. A locked bundle offers a Square checkout
// (per-user payment link) or an access code; logged-out visitors are sent to
// sign in first.

import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Lock, Music } from 'lucide-react';
import {
  useBundle,
  useBundleSongTitles,
  useEntitledBundleIds,
  startCheckout,
} from '@/db/repo';
import { useAuth } from '@/auth/AuthProvider';
import { formatPrice } from '@/lib/money';

export function BundleDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { session } = useAuth();
  const bundle = useBundle(id);
  const titles = useBundleSongTitles(id);
  const owned = useEntitledBundleIds();
  const isOwned = Boolean(id && owned?.has(id));
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);

  async function buy() {
    if (!id) return;
    setBuying(true);
    setBuyError(null);
    try {
      // Square sends the buyer back here after paying; the webhook grants access.
      await startCheckout(id, `${window.location.origin}${import.meta.env.BASE_URL}store/${id}`);
    } catch (err) {
      setBuyError(err instanceof Error ? err.message : 'Could not start checkout');
      setBuying(false);
    }
  }

  if (bundle === undefined) return <p className="text-sm text-ink-500">Loading…</p>;
  if (bundle === null) {
    return (
      <div>
        <button className="btn-ghost mb-4" onClick={() => navigate('/store')}>
          <ArrowLeft size={16} /> Store
        </button>
        <p className="text-sm text-ink-500">Bundle not found.</p>
      </div>
    );
  }

  return (
    <div>
      <button className="btn-ghost -ml-2 mb-4" onClick={() => navigate('/store')}>
        <ArrowLeft size={16} /> Store
      </button>

      <header className="mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">{bundle.title}</h1>
          {isOwned && (
            <span className="inline-flex items-center gap-1 rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-fg">
              <Check size={11} /> Owned
            </span>
          )}
        </div>
        {bundle.description && (
          <p className="mt-1 text-sm text-ink-500 dark:text-ink-400">{bundle.description}</p>
        )}
      </header>

      {!isOwned && (
        <div className="card mb-6 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">{formatPrice(bundle.price_cents)}</div>
              <p className="text-xs text-ink-500 dark:text-ink-400">
                {!session
                  ? 'Sign in to purchase or redeem an access code.'
                  : bundle.price_cents > 0
                    ? 'Secure checkout with Square. You can also unlock with an access code.'
                    : 'Unlock this bundle with an access code.'}
              </p>
            </div>
            {!session ? (
              <Link className="btn-primary" to="/auth">
                Sign in
              </Link>
            ) : bundle.price_cents > 0 ? (
              <button className="btn-primary" onClick={() => void buy()} disabled={buying}>
                {buying ? 'Starting…' : `Buy for ${formatPrice(bundle.price_cents)}`}
              </button>
            ) : null}
          </div>
          {buyError && (
            <p className="mt-2 text-xs text-red-600 dark:text-red-400">{buyError}</p>
          )}
        </div>
      )}

      <h2 className="label mb-2">Songs</h2>
      {titles === undefined ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : titles.length === 0 ? (
        <p className="text-sm text-ink-500">This bundle has no songs yet.</p>
      ) : (
        <ul className="card divide-y divide-ink-200 dark:divide-ink-800">
          {titles.map((t) =>
            isOwned ? (
              <li key={t.id}>
                <Link
                  to={`/songs/${t.id}`}
                  className="flex items-center gap-3 px-4 py-3 text-sm transition hover:bg-ink-50 dark:hover:bg-ink-900/40"
                >
                  <Music size={15} className="text-ink-400" />
                  <span className="truncate">{t.title}</span>
                </Link>
              </li>
            ) : (
              <li
                key={t.id}
                className="flex items-center gap-3 px-4 py-3 text-sm text-ink-500 dark:text-ink-400"
              >
                <Lock size={14} className="text-ink-400" />
                <span className="truncate">{t.title}</span>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  );
}
