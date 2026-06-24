// Admin: list all bundles (active + inactive) and create new ones.

import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Package, Plus } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { EmptyState } from '@/components/ui/EmptyState';
import { Modal } from '@/components/ui/Modal';
import { createBundle, useAdminBundles } from '@/db/repo';
import { formatPrice } from '@/lib/money';

export function AdminBundles() {
  const bundles = useAdminBundles();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [priceDollars, setPriceDollars] = useState('');
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!title.trim()) return;
    setBusy(true);
    try {
      const cents = Math.max(0, Math.round(parseFloat(priceDollars || '0') * 100)) || 0;
      const id = await createBundle({ title: title.trim(), price_cents: cents });
      setOpen(false);
      setTitle('');
      setPriceDollars('');
      navigate(`bundles/${id}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Admin · Bundles"
        subtitle="Create and manage paid song bundles"
        actions={
          <button className="btn-primary" onClick={() => setOpen(true)}>
            <Plus size={16} /> New bundle
          </button>
        }
      />

      {bundles === undefined ? (
        <p className="text-sm text-ink-500">Loading…</p>
      ) : bundles.length === 0 ? (
        <EmptyState
          icon={Package}
          title="No bundles yet"
          description="Create a bundle, add songs to it, then generate codes or grant access."
          action={
            <button className="btn-primary" onClick={() => setOpen(true)}>
              <Plus size={16} /> New bundle
            </button>
          }
        />
      ) : (
        <div className="card divide-y divide-ink-200 dark:divide-ink-800">
          {bundles.map((b) => (
            <Link
              key={b.id}
              to={`bundles/${b.id}`}
              className="flex items-center justify-between gap-3 px-4 py-3 transition hover:bg-ink-50 dark:hover:bg-ink-900/40"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">{b.title}</span>
                  {!b.is_active && (
                    <span className="rounded bg-ink-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-500 dark:bg-ink-700 dark:text-ink-300">
                      Inactive
                    </span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                  {formatPrice(b.price_cents)}
                </p>
              </div>
              <ChevronRight size={16} className="shrink-0 text-ink-400" />
            </Link>
          ))}
        </div>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="New bundle"
        footer={
          <>
            <button className="btn-ghost" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button className="btn-primary" onClick={() => void create()} disabled={busy || !title.trim()}>
              Create
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="space-y-1">
            <label className="label" htmlFor="nb-title">Title</label>
            <input
              id="nb-title"
              className="input"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Beginner Worship Pack"
            />
          </div>
          <div className="space-y-1">
            <label className="label" htmlFor="nb-price">Price (USD)</label>
            <input
              id="nb-price"
              className="input"
              inputMode="decimal"
              value={priceDollars}
              onChange={(e) => setPriceDollars(e.target.value)}
              placeholder="0.00 (free)"
            />
          </div>
        </div>
      </Modal>
    </div>
  );
}
