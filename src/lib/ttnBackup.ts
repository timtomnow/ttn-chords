// ttn-backup integration. See https://timtomnow.github.io/ttn-backup/
//
// Exposes `window.TTNBackupAdapter` so the ttn-backup utility can snapshot /
// restore TTN Chords from a hidden same-origin iframe. Also exposes a thin
// wrapper that opens the cross-app Restore picker. Mirrors the contract used
// by the sibling ttn-list app.

import {
  exportData,
  importData,
  parseExportPayload,
  type ExportPayload,
} from '@/db/exportImport';

type TTNBackupAdapter = {
  appId: string;
  appName: string;
  version: number;
  exportData: () => Promise<ExportPayload>;
  importData: (data: unknown) => Promise<void>;
};

declare global {
  interface Window {
    TTNBackupAdapter?: TTNBackupAdapter;
    TTNBackup?: {
      openImport: (appId: string) => Promise<void>;
      listBundlesFor: (appId: string) => Promise<unknown[]>;
      __loaded?: boolean;
    };
  }
}

export function installTtnBackupAdapter(): void {
  window.TTNBackupAdapter = {
    appId: 'ttn-chords',
    appName: 'TTN Chords',
    version: 1,
    exportData,
    importData: async (data) => {
      const payload = parseExportPayload(data);
      await importData(payload, 'replace');
      // Force a reload after a wholesale data swap so derived UI state resets.
      setTimeout(() => location.reload(), 100);
    },
  };
}

export function openTtnBackupRestore(): void {
  if (window.TTNBackup?.openImport) {
    void window.TTNBackup.openImport('ttn-chords');
  } else {
    throw new Error(
      'ttn-backup client not loaded. Check that /ttn-backup/client.js is reachable.',
    );
  }
}
