// Admin: manage one bundle — its fields, the songs in it (copied from the
// admin's personal songs), redeemable access codes, and direct grants.

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Check, Copy, Plus, Trash2 } from 'lucide-react';
import {
  addSongToBundle,
  createAccessCodes,
  deleteBundle,
  grantBundleByEmail,
  removeBundleSong,
  updateBundle,
  useAccessCodes,
  useAdminBundleSongs,
  useAdminBundles,
  useSongs,
} from '@/db/repo';

export function AdminBundleEditor() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const bundles = useAdminBundles();
  const bundle = useMemo(() => bundles?.find((b) => b.id === id), [bundles, id]);

  const { songs: bundleSongs, reload: reloadSongs } = useAdminBundleSongs(id);
  const { codes, reload: reloadCodes } = useAccessCodes(id);
  const mySongs = useSongs();

  // Editable fields, seeded from the bundle once it loads.
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priceDollars, setPriceDollars] = useState('');
  const [squareUrl, setSquareUrl] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (!bundle) return;
    setTitle(bundle.title);
    setDescription(bundle.description ?? '');
    setPriceDollars((bundle.price_cents / 100).toFixed(2));
    setSquareUrl(bundle.square_link_url ?? '');
    setIsActive(bundle.is_active);
  }, [bundle?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const [addSongId, setAddSongId] = useState('');
  const [codeCount, setCodeCount] = useState('5');
  const [codeError, setCodeError] = useState<string | null>(null);
  const [grantEmail, setGrantEmail] = useState('');
  const [grantMsg, setGrantMsg] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  if (bundles === undefined) return <p className="text-sm text-ink-500">Loading…</p>;
  if (!bundle) {
    return (
      <div>
        <button className="btn-ghost mb-4" onClick={() => navigate('/admin')}>
          <ArrowLeft size={16} /> Bundles
        </button>
        <p className="text-sm text-ink-500">Bundle not found.</p>
      </div>
    );
  }

  async function save() {
    const cents = Math.max(0, Math.round(parseFloat(priceDollars || '0') * 100)) || 0;
    await updateBundle(bundle!.id, {
      title: title.trim() || 'Untitled bundle',
      description: description.trim() || null,
      price_cents: cents,
      square_link_url: squareUrl.trim() || null,
      is_active: isActive,
    });
    setSavedAt(Date.now());
  }

  async function removeBundle() {
    if (!confirm(`Delete “${bundle!.title}” and all its songs/codes? This cannot be undone.`)) return;
    await deleteBundle(bundle!.id);
    navigate('/admin');
  }

  async function addSong() {
    const song = mySongs?.find((s) => s.id === addSongId);
    if (!song) return;
    await addSongToBundle(bundle!.id, song);
    setAddSongId('');
    await reloadSongs();
  }

  async function genCodes() {
    setCodeError(null);
    const n = Math.min(100, Math.max(1, parseInt(codeCount, 10) || 0));
    try {
      await createAccessCodes(bundle!.id, n);
      await reloadCodes();
    } catch (err) {
      setCodeError(err instanceof Error ? err.message : String(err));
    }
  }

  async function grant() {
    setGrantMsg(null);
    try {
      await grantBundleByEmail(grantEmail, bundle!.id);
      setGrantMsg(`Granted to ${grantEmail.trim()}.`);
      setGrantEmail('');
    } catch (err) {
      setGrantMsg(String(err instanceof Error ? err.message : err));
    }
  }

  function copy(code: string) {
    void navigator.clipboard.writeText(code);
    setCopied(code);
    setTimeout(() => setCopied((c) => (c === code ? null : c)), 1500);
  }

  const availableSongs = (mySongs ?? []).filter(
    (s) => !(bundleSongs ?? []).some((bs) => bs.title === s.title),
  );

  return (
    <div className="space-y-8">
      <div>
        <button className="btn-ghost -ml-2 mb-3" onClick={() => navigate('/admin')}>
          <ArrowLeft size={16} /> Bundles
        </button>
        <h1 className="text-2xl font-semibold tracking-tight">{bundle.title}</h1>
      </div>

      {/* Fields */}
      <section className="space-y-3">
        <h2 className="label">Details</h2>
        <div className="card space-y-3 p-4">
          <div className="space-y-1">
            <label className="label" htmlFor="b-title">Title</label>
            <input id="b-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-1">
            <label className="label" htmlFor="b-desc">Description</label>
            <textarea
              id="b-desc"
              className="input min-h-[3.5rem] resize-y"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="space-y-1">
              <label className="label" htmlFor="b-price">Price (USD)</label>
              <input
                id="b-price"
                className="input"
                inputMode="decimal"
                value={priceDollars}
                onChange={(e) => setPriceDollars(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <label className="label" htmlFor="b-square">Square payment link (Phase 5)</label>
              <input
                id="b-square"
                className="input"
                value={squareUrl}
                onChange={(e) => setSquareUrl(e.target.value)}
                placeholder="https://square.link/…"
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="accent-accent"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            Active (visible in the storefront)
          </label>
          <div className="flex items-center gap-3">
            <button className="btn-primary" onClick={() => void save()}>Save</button>
            {savedAt && <span className="text-xs text-emerald-600 dark:text-emerald-400">Saved</span>}
            <button className="btn-danger ml-auto" onClick={() => void removeBundle()}>
              <Trash2 size={15} /> Delete bundle
            </button>
          </div>
        </div>
      </section>

      {/* Songs */}
      <section className="space-y-3">
        <h2 className="label">Songs in this bundle</h2>
        <div className="card divide-y divide-ink-200 dark:divide-ink-800">
          {bundleSongs === undefined ? (
            <p className="px-4 py-3 text-sm text-ink-500">Loading…</p>
          ) : bundleSongs.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-500">No songs yet.</p>
          ) : (
            bundleSongs.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="truncate">
                  {s.title}
                  {s.artist ? <span className="text-ink-400"> · {s.artist}</span> : null}
                </span>
                <button
                  className="btn-ghost shrink-0"
                  onClick={() => void removeBundleSong(s.id).then(reloadSongs)}
                >
                  <Trash2 size={14} /> Remove
                </button>
              </div>
            ))
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="input h-9 w-auto py-0 text-sm"
            value={addSongId}
            onChange={(e) => setAddSongId(e.target.value)}
          >
            <option value="">Add from my songs…</option>
            {availableSongs.map((s) => (
              <option key={s.id} value={s.id}>
                {s.title}{s.artist ? ` · ${s.artist}` : ''}
              </option>
            ))}
          </select>
          <button className="btn-secondary" onClick={() => void addSong()} disabled={!addSongId}>
            <Plus size={15} /> Add to bundle
          </button>
        </div>
        <p className="text-xs text-ink-500 dark:text-ink-400">
          Songs are copied in from your personal library, so later edits to the original don't
          change the published bundle.
        </p>
      </section>

      {/* Access codes */}
      <section className="space-y-3">
        <h2 className="label">Access codes</h2>
        <div className="flex flex-wrap items-center gap-2">
          <input
            className="input h-9 w-20 py-0 text-sm"
            inputMode="numeric"
            value={codeCount}
            onChange={(e) => setCodeCount(e.target.value)}
          />
          <button className="btn-secondary" onClick={() => void genCodes()}>
            <Plus size={15} /> Generate codes
          </button>
        </div>
        {codeError && <p className="text-sm text-rose-600 dark:text-rose-400">{codeError}</p>}
        <div className="card divide-y divide-ink-200 dark:divide-ink-800">
          {codes === undefined ? (
            <p className="px-4 py-3 text-sm text-ink-500">Loading…</p>
          ) : codes.length === 0 ? (
            <p className="px-4 py-3 text-sm text-ink-500">No codes yet.</p>
          ) : (
            codes.map((c) => (
              <div key={c.code} className="flex items-center justify-between gap-3 px-4 py-2 text-sm">
                <span className="font-mono tracking-wider">{c.code}</span>
                <span className="ml-auto flex items-center gap-3">
                  {c.redeemed_by ? (
                    <span className="text-xs text-ink-400">redeemed</span>
                  ) : (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">available</span>
                  )}
                  <button className="btn-ghost px-2 py-1" onClick={() => copy(c.code)} title="Copy">
                    {copied === c.code ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      </section>

      {/* Direct grant */}
      <section className="space-y-3">
        <h2 className="label">Grant access directly</h2>
        <div className="card space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <input
              className="input flex-1"
              type="email"
              placeholder="user@example.com"
              value={grantEmail}
              onChange={(e) => setGrantEmail(e.target.value)}
            />
            <button className="btn-secondary" onClick={() => void grant()} disabled={!grantEmail.trim()}>
              Grant
            </button>
          </div>
          {grantMsg && <p className="text-xs text-ink-600 dark:text-ink-300">{grantMsg}</p>}
          <p className="text-xs text-ink-500 dark:text-ink-400">
            The user must have signed up already (so a profile exists). This creates a free
            entitlement immediately.
          </p>
        </div>
      </section>
    </div>
  );
}
