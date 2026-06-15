// JSON export/import for TTN Chords. This is also the contract the ttn-backup
// adapter uses (see src/lib/ttnBackup.ts). The whole DB serializes to a single
// JSON object; Blobs (photos/logos) are base64-encoded since JSON can't hold
// binary. Import runs in one Dexie transaction so a mid-flight failure leaves
// the DB untouched.

import { db, SCHEMA_VERSION } from './schema';
import { newId } from '@/lib/id';
import type {
  AppSettings,
  ChordDefinition,
  Instrument,
  Photo,
  ReportTemplate,
  RhythmPattern,
  RhythmSymbol,
  Setlist,
  Song,
} from '@/types';

/** Tables that hold plain JSON rows with a string `id`. Photos are separate. */
const ROW_TABLES = [
  'songs',
  'setlists',
  'rhythmPatterns',
  'rhythmSymbols',
  'instruments',
  'chordDefinitions',
  'reportTemplates',
  'settings',
] as const;
type RowTable = (typeof ROW_TABLES)[number];

/** Photos travel as base64 strings in JSON; decoded back to Blob on import. */
type PhotoExport = {
  id: string;
  mime: string;
  dataBase64: string;
  createdAt: number;
};

export type ExportPayload = {
  version: number;
  exportedAt: number;
  photos: PhotoExport[];
  songs: Song[];
  setlists: Setlist[];
  rhythmPatterns: RhythmPattern[];
  rhythmSymbols: RhythmSymbol[];
  instruments: Instrument[];
  chordDefinitions: ChordDefinition[];
  reportTemplates: ReportTemplate[];
  settings: AppSettings[];
};

export type ImportMode = 'merge' | 'replace';

export type ImportSummary = {
  mode: ImportMode;
  added: Record<string, number>;
  skipped: Record<string, number>;
};

// ───────── Base64 <-> Blob ─────────

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  const CHUNK = 0x8000;
  let bin = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(bin);
}

function base64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

// ───────── Export ─────────

export async function exportData(): Promise<ExportPayload> {
  const rawPhotos = await db.photos.toArray();
  const photos: PhotoExport[] = await Promise.all(
    rawPhotos.map(async (p) => ({
      id: p.id,
      mime: p.mime,
      dataBase64: await blobToBase64(p.blob),
      createdAt: p.createdAt,
    })),
  );

  const rows = Object.fromEntries(
    await Promise.all(
      ROW_TABLES.map(async (t) => [t, await db.table(t).toArray()] as const),
    ),
  ) as Record<RowTable, unknown[]>;

  return {
    version: SCHEMA_VERSION,
    exportedAt: Date.now(),
    photos,
    songs: rows.songs as Song[],
    setlists: rows.setlists as Setlist[],
    rhythmPatterns: rows.rhythmPatterns as RhythmPattern[],
    rhythmSymbols: rows.rhythmSymbols as RhythmSymbol[],
    instruments: rows.instruments as Instrument[],
    chordDefinitions: rows.chordDefinitions as ChordDefinition[],
    reportTemplates: rows.reportTemplates as ReportTemplate[],
    settings: rows.settings as AppSettings[],
  };
}

export function exportFilename(now: Date = new Date()): string {
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `ttn-chords-export-${yyyy}-${mm}-${dd}.json`;
}

export function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// ───────── Parse / validate ─────────

export function parseExportPayload(value: unknown): ExportPayload {
  if (!value || typeof value !== 'object') {
    throw new Error('File is empty or not a JSON object.');
  }
  const v = value as Record<string, unknown>;
  if (typeof v.version !== 'number') throw new Error('Missing "version" field.');
  if (v.version > SCHEMA_VERSION) {
    throw new Error(
      `File was exported by a newer version (${v.version}). This app supports up to v${SCHEMA_VERSION}.`,
    );
  }
  if (!Array.isArray(v.photos)) throw new Error('Missing or non-array field "photos".');
  for (const t of ROW_TABLES) {
    // Tolerate older backups that predate a table: treat missing as empty.
    if (v[t] !== undefined && !Array.isArray(v[t])) {
      throw new Error(`Field "${t}" must be an array.`);
    }
  }

  const photos = (v.photos as unknown[]).map((p, i) => requirePhoto(p, i));
  const rows = (t: RowTable) => (Array.isArray(v[t]) ? (v[t] as unknown[]) : []);

  return {
    version: v.version,
    exportedAt: typeof v.exportedAt === 'number' ? v.exportedAt : Date.now(),
    photos,
    songs: rows('songs').map(normalizeSong),
    setlists: rows('setlists') as Setlist[],
    rhythmPatterns: rows('rhythmPatterns') as RhythmPattern[],
    rhythmSymbols: rows('rhythmSymbols') as RhythmSymbol[],
    instruments: rows('instruments') as Instrument[],
    chordDefinitions: rows('chordDefinitions') as ChordDefinition[],
    reportTemplates: rows('reportTemplates') as ReportTemplate[],
    settings: rows('settings') as AppSettings[],
  };
}

/**
 * Bring a song row up to the v3 shape: a pre-v3 backup carries a flat
 * `sections` array, which we wrap into one default difficulty (level 3). Already-
 * migrated rows pass through untouched.
 */
function normalizeSong(row: unknown): Song {
  const s = (row ?? {}) as Record<string, unknown> & Partial<Song>;
  if (Array.isArray(s.difficulties) && s.difficulties.length) return s as Song;
  const id = newId();
  const sections = Array.isArray((s as { sections?: unknown }).sections)
    ? ((s as { sections: Song['difficulties'][number]['sections'] }).sections)
    : [];
  const { sections: _drop, ...rest } = s as Record<string, unknown>;
  void _drop;
  return {
    ...(rest as unknown as Song),
    difficulties: [{ id, level: 3, sections }],
    defaultDifficultyId: id,
  };
}

function requirePhoto(p: unknown, idx: number): PhotoExport {
  if (!p || typeof p !== 'object') throw new Error(`photos[${idx}] is not an object.`);
  const o = p as Record<string, unknown>;
  if (typeof o.id !== 'string' || !o.id) throw new Error(`photos[${idx}].id missing.`);
  if (typeof o.mime !== 'string' || !o.mime) throw new Error(`photos[${idx}].mime missing.`);
  if (typeof o.dataBase64 !== 'string') throw new Error(`photos[${idx}].dataBase64 missing.`);
  if (typeof o.createdAt !== 'number') throw new Error(`photos[${idx}].createdAt missing.`);
  return { id: o.id, mime: o.mime, dataBase64: o.dataBase64, createdAt: o.createdAt };
}

// ───────── Import ─────────

export async function importData(
  payload: ExportPayload,
  mode: ImportMode,
): Promise<ImportSummary> {
  const summary: ImportSummary = { mode, added: {}, skipped: {} };

  // Decode photos outside the transaction (base64 → Blob can be slow).
  const photos: Photo[] = payload.photos.map((p) => ({
    id: p.id,
    blob: base64ToBlob(p.dataBase64, p.mime),
    mime: p.mime,
    createdAt: p.createdAt,
  }));

  const allTables = [db.photos, ...ROW_TABLES.map((t) => db.table(t))];

  await db.transaction('rw', allTables, async () => {
    if (mode === 'replace') {
      await Promise.all(allTables.map((t) => t.clear()));
      await db.photos.bulkAdd(photos);
      summary.added.photos = photos.length;
      await Promise.all(
        ROW_TABLES.map(async (t) => {
          const rows = payload[t] as { id: string }[];
          if (rows.length) await db.table(t).bulkAdd(rows);
          summary.added[t] = rows.length;
        }),
      );
      return;
    }

    // Merge: skip rows whose id already exists.
    const existingPhotoIds = new Set(
      (await db.photos.toCollection().primaryKeys()) as string[],
    );
    const newPhotos = photos.filter((p) => !existingPhotoIds.has(p.id));
    if (newPhotos.length) await db.photos.bulkAdd(newPhotos);
    summary.added.photos = newPhotos.length;
    summary.skipped.photos = photos.length - newPhotos.length;

    await Promise.all(
      ROW_TABLES.map(async (t) => {
        const rows = payload[t] as { id: string }[];
        const existing = new Set((await db.table(t).toCollection().primaryKeys()) as string[]);
        const fresh = rows.filter((r) => !existing.has(r.id));
        if (fresh.length) await db.table(t).bulkAdd(fresh);
        summary.added[t] = fresh.length;
        summary.skipped[t] = rows.length - fresh.length;
      }),
    );
  });

  return summary;
}
