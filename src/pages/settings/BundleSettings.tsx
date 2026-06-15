// Starter-library "bundles" UI. Lists the built-in bundles and lets the user
// sync one into their library. When a sync would collide with songs they
// already have (same title + artist), a modal lets them choose per song —
// overwrite the existing one or import as a `_N` duplicate — with an
// apply-to-all shortcut. Sync is available to every user (not admin-gated).

import { useState } from 'react';
import { Library, Download } from 'lucide-react';
import { Modal } from '@/components/ui/Modal';
import { importBundle, useSongs, type BundleImportSummary } from '@/db/repo';
import { listBundles, type SongBundle } from '@/lib/library';
import { planBundleImport, type ConflictResolution, type ImportPlanItem } from '@/lib/library/import';

export function BundleSettings() {
  const bundles = listBundles();
  const songs = useSongs();

  const [active, setActive] = useState<SongBundle | null>(null);
  const [plan, setPlan] = useState<ImportPlanItem[]>([]);
  const [resolutions, setResolutions] = useState<Record<string, ConflictResolution>>({});
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ name: string; summary: BundleImportSummary } | null>(null);

  const existingRefs = (songs ?? []).map((s) => ({ id: s.id, title: s.title, artist: s.artist }));

  async function runImport(bundle: SongBundle, res: Record<string, ConflictResolution>) {
    setBusy(true);
    try {
      const summary = await importBundle(bundle, res);
      setResult({ name: bundle.name, summary });
    } finally {
      setBusy(false);
      setActive(null);
    }
  }

  function startSync(bundle: SongBundle) {
    const p = planBundleImport(bundle, existingRefs);
    const conflicts = p.filter((i) => i.status === 'conflict');
    if (conflicts.length === 0) {
      void runImport(bundle, {});
      return;
    }
    const initial: Record<string, ConflictResolution> = {};
    conflicts.forEach((i) => (initial[i.song.id] = 'duplicate'));
    setPlan(p);
    setResolutions(initial);
    setActive(bundle);
  }

  function applyToAll(res: ConflictResolution) {
    setResolutions((prev) => {
      const next = { ...prev };
      for (const k of Object.keys(next)) next[k] = res;
      return next;
    });
  }

  const conflicts = plan.filter((i) => i.status === 'conflict');
  const newCount = plan.filter((i) => i.status === 'new').length;

  return (
    <section className="space-y-3">
      <h2 className="label">Starter library</h2>
      <div className="card divide-y divide-ink-200 dark:divide-ink-800">
        {bundles.map((b) => (
          <div key={b.id} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Library size={15} className="text-ink-400" />
                {b.name}
                <span className="text-xs font-normal text-ink-400">v{b.version}</span>
              </div>
              <p className="mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                {[b.description, `${b.songs.length} song${b.songs.length === 1 ? '' : 's'}`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            </div>
            <button className="btn-secondary shrink-0" onClick={() => startSync(b)} disabled={busy}>
              <Download size={15} /> Sync
            </button>
          </div>
        ))}
      </div>

      {result && (
        <p className="text-xs text-ink-500 dark:text-ink-400">
          Synced <strong>{result.name}</strong>: {result.summary.added} added,{' '}
          {result.summary.duplicated} duplicated, {result.summary.overwritten} overwritten
          {result.summary.setlists > 0 ? `, ${result.summary.setlists} setlist(s)` : ''}.
        </p>
      )}

      <Modal
        open={Boolean(active)}
        onClose={() => setActive(null)}
        title={active ? `Sync “${active.name}”` : 'Sync'}
        footer={
          <>
            <button className="btn-ghost" onClick={() => setActive(null)}>
              Cancel
            </button>
            <button
              className="btn-primary"
              disabled={busy}
              onClick={() => active && void runImport(active, resolutions)}
            >
              Import
            </button>
          </>
        }
      >
        <p className="mb-3 text-sm text-ink-600 dark:text-ink-300">
          {newCount > 0 && (
            <>
              <strong>{newCount}</strong> new song{newCount === 1 ? '' : 's'} will be added.{' '}
            </>
          )}
          <strong>{conflicts.length}</strong> already exist{conflicts.length === 1 ? 's' : ''} with
          the same title &amp; artist. Choose what to do with each:
        </p>

        <div className="mb-3 flex items-center gap-2 text-xs">
          <span className="text-ink-500">Apply to all:</span>
          <button className="chip" onClick={() => applyToAll('overwrite')}>
            Overwrite
          </button>
          <button className="chip" onClick={() => applyToAll('duplicate')}>
            Duplicate
          </button>
        </div>

        <ul className="space-y-2">
          {conflicts.map((i) => (
            <li
              key={i.song.id}
              className="flex items-center justify-between gap-3 rounded-lg border border-ink-200 px-3 py-2 dark:border-ink-800"
            >
              <span className="min-w-0 truncate text-sm">
                {i.song.title}
                {i.song.artist ? <span className="text-ink-400"> · {i.song.artist}</span> : null}
              </span>
              <select
                className="input h-8 w-auto py-0 text-sm"
                value={resolutions[i.song.id] ?? 'duplicate'}
                onChange={(e) =>
                  setResolutions((prev) => ({
                    ...prev,
                    [i.song.id]: e.target.value as ConflictResolution,
                  }))
                }
              >
                <option value="duplicate">Import as duplicate</option>
                <option value="overwrite">Overwrite existing</option>
              </select>
            </li>
          ))}
        </ul>
      </Modal>
    </section>
  );
}
