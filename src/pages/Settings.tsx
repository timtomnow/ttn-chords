import { Check, Download, Upload, RotateCcw } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';
import { useTheme, type ThemePref } from '@/app/theme';
import { saveSettings, useSettings } from '@/db/repo';
import { ACCENT_PRESETS, applyAccent } from '@/lib/accent';
import {
  downloadJson,
  exportData,
  exportFilename,
  importData,
  parseExportPayload,
} from '@/db/exportImport';
import { openTtnBackupRestore } from '@/lib/ttnBackup';
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
  const settings = useSettings();
  const adminMode = settings?.adminMode ?? false;

  async function chooseAccent(hex: string) {
    applyAccent(hex);
    await saveSettings({ accentColor: hex });
  }

  async function doExport() {
    const data = await exportData();
    downloadJson(exportFilename(), data);
  }

  async function doImport(file: File) {
    const text = await file.text();
    const payload = parseExportPayload(JSON.parse(text));
    await importData(payload, 'replace');
    location.reload();
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Settings" />

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

      {/* Backup */}
      <section className="space-y-3">
        <h2 className="label">Backup & data</h2>
        <div className="card space-y-3 p-4">
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={doExport}>
              <Download size={16} /> Export JSON
            </button>
            <label className="btn-secondary cursor-pointer">
              <Upload size={16} /> Import JSON (replace)
              <input
                type="file"
                accept="application/json"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void doImport(f);
                }}
              />
            </label>
          </div>
          <button
            className="btn-ghost"
            onClick={() => {
              try {
                openTtnBackupRestore();
              } catch (err) {
                alert(String(err));
              }
            }}
          >
            <RotateCcw size={16} /> Restore from ttn-backup
          </button>
          <p className="text-xs text-ink-500 dark:text-ink-400">
            ttn-chords is compatible with the cross-app ttn-backup utility. Import replaces all
            local data.
          </p>
        </div>
      </section>
    </div>
  );
}
