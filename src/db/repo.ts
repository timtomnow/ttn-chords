// Typed CRUD + reactive hooks. Components import from HERE.
//
// LOCAL (Dexie) data — instruments, chord defs, rhythms, report templates,
// photos, settings — lives below and uses useLiveQuery.
//
// USER CONTENT — songs, setlists, song notes, and starter-library/local import —
// moved to the Supabase-backed cloud layer (src/db/cloud) as part of the cloud
// refactor. They're re-exported here so existing imports from '@/db/repo' keep
// working unchanged.

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './schema';
import { newId } from '@/lib/id';
import type {
  AppSettings,
  ChordDefinition,
  Instrument,
  Photo,
  ReportTemplate,
  RhythmPattern,
  RhythmSymbol,
} from '@/types';

const now = () => Date.now();

// ───────── Songs / setlists / notes / import (Supabase-backed) ─────────
export {
  useSongs,
  useSong,
  useSongsByIds,
  createSong,
  updateSong,
  updateDifficultySections,
  deleteSong,
  useSetlists,
  useSetlist,
  createSetlist,
  updateSetlist,
  deleteSetlist,
  useSongNotes,
  saveMyNote,
  deleteNote,
  useNotifications,
  useUnreadNotificationCount,
  markNotificationRead,
  markAllNotificationsRead,
  deleteNotification,
  useIsOwnedSong,
  useStorefront,
  useEntitledBundleIds,
  useBundle,
  useBundleSongTitles,
  redeemCode,
  startCheckout,
  useAdminBundles,
  createBundle,
  updateBundle,
  deleteBundle,
  useAdminBundleSongs,
  addSongToBundle,
  removeBundleSong,
  useAccessCodes,
  createAccessCodes,
  grantBundleByEmail,
  importBundle,
  importLocalData,
} from './cloud';
export type {
  BundleImportSummary,
  LocalImportSummary,
  SongNote,
  AppNotification,
  BundleInput,
} from './cloud';

// ───────── Instruments (user-defined; builtins live in src/lib/chords) ─────────

export function useUserInstruments(): Instrument[] | undefined {
  return useLiveQuery(() => db.instruments.orderBy('name').toArray());
}

export async function createInstrument(
  data: Omit<Instrument, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<string> {
  const id = newId();
  await db.instruments.add({ ...data, id, createdAt: now(), updatedAt: now() });
  return id;
}

export async function updateInstrument(
  id: string,
  patch: Partial<Instrument>,
): Promise<void> {
  await db.instruments.update(id, { ...patch, updatedAt: now() });
}

export async function deleteInstrument(id: string): Promise<void> {
  await db.instruments.delete(id);
}

// ───────── Chord definitions (user custom / overrides of bundled charts) ─────────

export function useChordDefinitions(): ChordDefinition[] | undefined {
  return useLiveQuery(() => db.chordDefinitions.toArray());
}

export function useChordDefinitionsFor(
  instrumentId: string | undefined,
): ChordDefinition[] | undefined {
  return useLiveQuery(
    () => (instrumentId ? db.chordDefinitions.where('instrumentId').equals(instrumentId).toArray() : []),
    [instrumentId],
  );
}

export async function saveChordDefinition(
  data: Omit<ChordDefinition, 'id' | 'createdAt' | 'updatedAt'> & { id?: string },
): Promise<string> {
  const id = data.id ?? newId();
  const existing = data.id ? await db.chordDefinitions.get(data.id) : undefined;
  await db.chordDefinitions.put({
    ...data,
    id,
    createdAt: existing?.createdAt ?? now(),
    updatedAt: now(),
  });
  return id;
}

export async function deleteChordDefinition(id: string): Promise<void> {
  await db.chordDefinitions.delete(id);
}

// ───────── Rhythm patterns (reusable strum grids) ─────────

export function useRhythmPatterns(): RhythmPattern[] | undefined {
  return useLiveQuery(() => db.rhythmPatterns.orderBy('name').toArray());
}

export function useRhythmPattern(id: string | undefined): RhythmPattern | null | undefined {
  return useLiveQuery(
    async () => (id ? ((await db.rhythmPatterns.get(id)) ?? null) : null),
    [id],
  );
}

/** Look up many patterns by id, returned as a Map for O(1) access. */
export function useRhythmPatternsByIds(
  ids: string[],
): Map<string, RhythmPattern> | undefined {
  const key = ids.join(',');
  return useLiveQuery(async () => {
    const rows = await db.rhythmPatterns.bulkGet(ids);
    const map = new Map<string, RhythmPattern>();
    rows.forEach((r) => {
      if (r) map.set(r.id, r);
    });
    return map;
  }, [key]);
}

export async function createRhythmPattern(
  data: Omit<RhythmPattern, 'createdAt' | 'updatedAt'>,
): Promise<string> {
  await db.rhythmPatterns.add({ ...data, createdAt: now(), updatedAt: now() });
  return data.id;
}

export async function updateRhythmPattern(
  id: string,
  patch: Partial<RhythmPattern>,
): Promise<void> {
  await db.rhythmPatterns.update(id, { ...patch, updatedAt: now() });
}

export async function deleteRhythmPattern(id: string): Promise<void> {
  await db.rhythmPatterns.delete(id);
}

// ───────── Rhythm symbols (user-defined glyphs; Phase 7B) ─────────

export function useRhythmSymbols(): RhythmSymbol[] | undefined {
  return useLiveQuery(() => db.rhythmSymbols.orderBy('name').toArray());
}

/** Symbols as a Map for O(1) lookup by id when rendering. */
export function useRhythmSymbolMap(): Map<string, RhythmSymbol> | undefined {
  return useLiveQuery(async () => {
    const rows = await db.rhythmSymbols.toArray();
    return new Map(rows.map((r) => [r.id, r]));
  });
}

export async function createRhythmSymbol(name: string, symbol: string): Promise<string> {
  const id = newId();
  await db.rhythmSymbols.add({
    id,
    name: name.trim(),
    symbol: symbol.trim(),
    createdAt: now(),
    updatedAt: now(),
  });
  return id;
}

export async function updateRhythmSymbol(
  id: string,
  patch: Partial<RhythmSymbol>,
): Promise<void> {
  await db.rhythmSymbols.update(id, { ...patch, updatedAt: now() });
}

export async function deleteRhythmSymbol(id: string): Promise<void> {
  await db.rhythmSymbols.delete(id);
}

// ───────── Report templates (Phase 8 — PDF generator) ─────────

export function useReportTemplates(): ReportTemplate[] | undefined {
  return useLiveQuery(() => db.reportTemplates.orderBy('updatedAt').reverse().toArray());
}

export function useReportTemplate(
  id: string | undefined,
): ReportTemplate | null | undefined {
  return useLiveQuery(
    async () => (id ? ((await db.reportTemplates.get(id)) ?? null) : null),
    [id],
  );
}

export async function createReportTemplate(
  data: Partial<ReportTemplate> & Pick<ReportTemplate, 'name'>,
): Promise<string> {
  const id = newId();
  const template: ReportTemplate = {
    id,
    name: data.name,
    pageSize: data.pageSize ?? 'letter',
    orientation: data.orientation ?? 'portrait',
    chrome: data.chrome,
    // Always start with at least one page so the editor has a surface.
    pages: data.pages?.length ? data.pages : [{ id: newId(), blocks: [] }],
    createdAt: now(),
    updatedAt: now(),
  };
  await db.reportTemplates.add(template);
  return id;
}

export async function updateReportTemplate(
  id: string,
  patch: Partial<ReportTemplate>,
): Promise<void> {
  await db.reportTemplates.update(id, { ...patch, updatedAt: now() });
}

export async function deleteReportTemplate(id: string): Promise<void> {
  await db.reportTemplates.delete(id);
}

// ───────── Photos (logos/images; Blobs, base64 only on export) ─────────

export function usePhotos(): Photo[] | undefined {
  return useLiveQuery(() => db.photos.orderBy('createdAt').reverse().toArray());
}

/** The raw Blob for one photo, for building an object URL at the view layer. */
export function usePhotoBlob(id: string | undefined): Blob | null | undefined {
  return useLiveQuery(
    async () => (id ? ((await db.photos.get(id))?.blob ?? null) : null),
    [id],
  );
}

export async function createPhoto(blob: Blob, mime: string): Promise<string> {
  const id = newId();
  await db.photos.add({ id, blob, mime, createdAt: now() });
  return id;
}

export async function deletePhoto(id: string): Promise<void> {
  await db.photos.delete(id);
}

// ───────── Settings (singleton) ─────────

export const DEFAULT_SETTINGS: AppSettings = {
  id: 'app',
  accentColor: '#4f46e5',
  myInstrumentId: '',
  updatedAt: 0,
};

export function useSettings(): AppSettings | undefined {
  return useLiveQuery(async () => (await db.settings.get('app')) ?? DEFAULT_SETTINGS);
}

/**
 * Whether authoring (admin) mode is on. Defaults to false until settings load,
 * so light users never briefly see edit affordances flash in.
 */
export function useAdminMode(): boolean {
  return useSettings()?.adminMode ?? false;
}

export async function getSettings(): Promise<AppSettings> {
  return (await db.settings.get('app')) ?? DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  await db.settings.put({ ...current, ...patch, id: 'app', updatedAt: now() });
}
