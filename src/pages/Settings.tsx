import { Link } from 'react-router-dom';
import { BookOpen, Check, ChevronRight, CloudUpload } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { useAuth } from '@/auth/AuthProvider';
import { useTheme, type ThemePref } from '@/app/theme';
import { saveSettings, useSettings, importLocalData } from '@/db/repo';
import { ACCENT_PRESETS, applyAccent } from '@/lib/accent';
import { useState } from 'react';
import { InstrumentSettings } from './settings/InstrumentSettings';
import { RhythmSettings } from './settings/RhythmSettings';
import { RhythmSymbolSettings } from './settings/RhythmSymbolSettings';
import { BundleSettings } from './settings/BundleSettings';

const THEME_OPTIONS: { value: ThemePref; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function Settings() {
  const { pref, setPref } = useTheme();
  const { user, profile, isAdmin, signOut } = useAuth();
  const settings = useSettings();
  const adminMode = settings?.adminMode ?? false;

  async function chooseAccent(hex: string) {
    applyAccent(hex);
    await saveSettings({ accentColor: hex });
  }

  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  async function doImportLocal() {
    setImporting(true);
    setImportMsg(null);
    try {
      const r = await importLocalData();
      setImportMsg(
        r.songs === 0 && r.setlists === 0
          ? `Nothing new to import${r.skipped ? ` (${r.skipped} already in the cloud)` : ''}.`
          : `Imported ${r.songs} song(s) and ${r.setlists} setlist(s)` +
              (r.skipped ? `, skipped ${r.skipped} already present.` : '.'),
      );
    } catch (err) {
      setImportMsg(`Import failed: ${String(err)}`);
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Settings" />

      {/* Account */}
      <section className="space-y-3">
        <h2 className="label">Account</h2>
        <div className="card flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span className="truncate">
                {profile?.display_name || user?.email || 'Signed in'}
              </span>
              {isAdmin && (
                <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-accent-fg">
                  Admin
                </span>
              )}
            </div>
            {profile?.display_name && user?.email && (
              <p className="mt-0.5 truncate text-xs text-ink-500 dark:text-ink-400">
                {user.email}
              </p>
            )}
          </div>
          <button className="btn-secondary shrink-0" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </section>

      {/* Appearance */}
      <section className="space-y-3">
        <h2 className="label">Appearance</h2>
        <div className="card divide-y divide-ink-200 dark:divide-ink-800">
          <div className="flex items-center justify-between px-4 py-3">
            <span className="text-sm font-medium">Theme</span>
            <div className="flex gap-1">
              {THEME_OPTIONS.map((o) => (
                <button
                  key={o.value}
                  onClick={() => setPref(o.value)}
                  className={pref === o.value ? 'chip chip-active' : 'chip'}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="px-4 py-3">
            <span className="text-sm font-medium">Accent color</span>
            <div className="mt-3 flex flex-wrap gap-2">
              {ACCENT_PRESETS.map((p) => {
                const active = settings?.accentColor.toLowerCase() === p.hex.toLowerCase();
                return (
                  <button
                    key={p.hex}
                    title={p.name}
                    onClick={() => chooseAccent(p.hex)}
                    className={[
                      'flex h-8 w-8 items-center justify-center rounded-full transition',
                      active
                        ? 'ring-2 ring-offset-2 ring-ink-900 ring-offset-white dark:ring-ink-50 dark:ring-offset-ink-900'
                        : '',
                    ].join(' ')}
                    style={{ backgroundColor: p.hex }}
                  >
                    {active && <Check size={14} className="text-white" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* Authoring / role */}
      <section className="space-y-3">
        <h2 className="label">Authoring</h2>
        <div className="card divide-y divide-ink-200 dark:divide-ink-800">
          <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
            <span>
              <span className="text-sm font-medium">Admin / authoring mode</span>
              <span className="mt-0.5 block text-xs text-ink-500 dark:text-ink-400">
                Reveals tools to create, edit, tag, and manage the library. Turn off for a
                read &amp; perform experience.
              </span>
            </span>
            <input
              type="checkbox"
              checked={adminMode}
              onChange={(e) => void saveSettings({ adminMode: e.target.checked })}
              className="h-5 w-5 shrink-0 accent-accent"
            />
          </label>
        </div>
      </section>

      {/* Help & guides */}
      <section className="space-y-3">
        <h2 className="label">Help</h2>
        <Link
          to="/help"
          className="card flex items-center justify-between gap-3 px-4 py-3 transition hover:border-accent"
        >
          <span className="flex items-center gap-3">
            <BookOpen size={18} className="text-ink-400" />
            <span>
              <span className="block text-sm font-medium">Help &amp; Guides</span>
              <span className="block text-xs text-ink-500 dark:text-ink-400">
                How to perform, build setlists, tag beats, and more.
              </span>
            </span>
          </span>
          <ChevronRight size={16} className="text-ink-400" />
        </Link>
      </section>

      {/* Starter library (available to everyone) */}
      <BundleSettings />

      {/* Instrument & chords */}
      <InstrumentSettings />

      {/* Authoring-only library managers */}
      {adminMode && (
        <>
          <RhythmSymbolSettings />
          <RhythmSettings />
        </>
      )}

      {/* Cloud — one-time migration of pre-cloud local data */}
      <section className="space-y-3">
        <h2 className="label">Cloud data</h2>
        <div className="card space-y-3 p-4">
          <p className="text-xs text-ink-500 dark:text-ink-400">
            Your songs and setlists now live in your account in the cloud. If you used this
            app before signing in, import that older local data into your account. It's safe
            to run more than once — anything already in the cloud is skipped.
          </p>
          <button className="btn-secondary" onClick={doImportLocal} disabled={importing}>
            <CloudUpload size={16} /> {importing ? 'Importing…' : 'Import my local data'}
          </button>
          {importMsg && (
            <p className="text-xs text-ink-600 dark:text-ink-300">{importMsg}</p>
          )}
        </div>
      </section>
    </div>
  );
}
