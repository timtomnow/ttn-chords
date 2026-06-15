// Typed CRUD + reactive hooks. Components import from HERE, never call Dexie
// directly. Reads use useLiveQuery so the UI updates automatically on writes.

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './schema';
import { newId } from '@/lib/id';
import { makeDifficulty } from '@/lib/song';
import { matchKey, nextDuplicateTitle, type ConflictResolution } from '@/lib/library/import';
import type { SongBundle } from '@/lib/library/types';
import type {
  AppSettings,
  ChordDefinition,
  Instrument,
  Photo,
  ReportTemplate,
  RhythmPattern,
  RhythmSymbol,
  Section,
  Setlist,
  Song,
} from '@/types';

const now = () => Date.now();

// ───────── Songs ─────────

export function useSongs(): Song[] | undefined {
  return useLiveQuery(() => db.songs.orderBy('order').toArray());
}

// Returns undefined while the query is in flight, null when the id resolves to
// no row (so the editor can tell "loading" apart from "not found").
export function useSong(id: string | undefined): Song | null | undefined {
  return useLiveQuery(
    async () => (id ? ((await db.songs.get(id)) ?? null) : null),
    [id],
  );
}

/** Look up many songs by id, returned as a Map for O(1) access. */
export function useSongsByIds(ids: string[]): Map<string, Song> | undefined {
  const key = ids.join(',');
  return useLiveQuery(async () => {
    const rows = await db.songs.bulkGet(ids);
    const map = new Map<string, Song>();
    rows.forEach((r) => {
      if (r) map.set(r.id, r);
    });
    return map;
  }, [key]);
}

export async function createSong(
  // `sections` is a convenience for callers that build a single arrangement
  // (e.g. ChordPro import) — it's wrapped into one default difficulty variant.
  data: Partial<Song> & Pick<Song, 'title'> & { sections?: Section[] },
): Promise<string> {
  const id = newId();
  const max = await db.songs.orderBy('order').last();
  const difficulties = data.difficulties?.length
    ? data.difficulties
    : [makeDifficulty(3, data.sections ?? [])];
  const song: Song = {
    id,
    title: data.title,
    artist: data.artist,
    key: data.key,
    capo: data.capo,
    tempo: data.tempo,
    timeSignature: data.timeSignature,
    tags: data.tags ?? [],
    difficulties,
    defaultDifficultyId: data.defaultDifficultyId ?? difficulties[0].id,
    source: data.source,
    sourceUrl: data.sourceUrl,
    notes: data.notes,
    order: (max?.order ?? 0) + 1,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.songs.add(song);
  return id;
}

export async function updateSong(id: string, patch: Partial<Song>): Promise<void> {
  await db.songs.update(id, { ...patch, updatedAt: now() });
}

/**
 * Replace the sections of one difficulty variant (used by beat editing in the
 * Highway view + Tag beats). Falls back to the default/first variant when
 * `difficultyId` is omitted or no longer matches.
 */
export async function updateDifficultySections(
  songId: string,
  difficultyId: string | undefined,
  sections: Section[],
): Promise<void> {
  const song = await db.songs.get(songId);
  if (!song || !song.difficulties.length) return;
  const targetId =
    (difficultyId && song.difficulties.some((d) => d.id === difficultyId) && difficultyId) ||
    (song.defaultDifficultyId &&
      song.difficulties.some((d) => d.id === song.defaultDifficultyId) &&
      song.defaultDifficultyId) ||
    song.difficulties[0].id;
  const difficulties = song.difficulties.map((d) =>
    d.id === targetId ? { ...d, sections } : d,
  );
  await db.songs.update(songId, { difficulties, updatedAt: now() });
}

export async function deleteSong(id: string): Promise<void> {
  await db.songs.delete(id);
}

// ───────── Setlists ─────────

export function useSetlists(): Setlist[] | undefined {
  return useLiveQuery(() => db.setlists.orderBy('order').toArray());
}

export function useSetlist(id: string | undefined): Setlist | undefined {
  return useLiveQuery(() => (id ? db.setlists.get(id) : undefined), [id]);
}

export async function createSetlist(
  data: Partial<Setlist> & Pick<Setlist, 'name'>,
): Promise<string> {
  const id = newId();
  const max = await db.setlists.orderBy('order').last();
  const setlist: Setlist = {
    id,
    name: data.name,
    description: data.description,
    entries: data.entries ?? [],
    order: (max?.order ?? 0) + 1,
    createdAt: now(),
    updatedAt: now(),
  };
  await db.setlists.add(setlist);
  return id;
}

export async function updateSetlist(id: string, patch: Partial<Setlist>): Promise<void> {
  await db.setlists.update(id, { ...patch, updatedAt: now() });
}

export async function deleteSetlist(id: string): Promise<void> {
  await db.setlists.delete(id);
}

// ───────── Starter library bundles (opt-in sync) ─────────

export type BundleImportSummary = {
  added: number;
  overwritten: number;
  duplicated: number;
  setlists: number;
};

/**
 * Sync a bundle into the library. Songs matching an existing title+artist use
 * the per-song resolution (overwrite the existing row, or import as a `_N`
 * duplicate); unmatched songs import as new. Anything the user already has is
 * left untouched unless explicitly overwritten. Bundle setlists are imported
 * with their song references remapped to the resulting ids. Runs in one
 * transaction. A conflict with no explicit resolution defaults to a (safe)
 * duplicate.
 */
export async function importBundle(
  bundle: SongBundle,
  resolutions: Record<string, ConflictResolution>,
): Promise<BundleImportSummary> {
  const summary: BundleImportSummary = { added: 0, overwritten: 0, duplicated: 0, setlists: 0 };

  await db.transaction('rw', db.songs, db.setlists, async () => {
    const existing = await db.songs.toArray();
    const byKey = new Map<string, Song>();
    for (const s of existing) {
      const k = matchKey(s.title, s.artist);
      if (!byKey.has(k)) byKey.set(k, s);
    }
    const titles = new Set(existing.map((s) => s.title));
    let maxOrder = existing.reduce((m, s) => Math.max(m, s.order), 0);
    const idMap = new Map<string, string>();

    for (const bs of bundle.songs) {
      const match = byKey.get(matchKey(bs.title, bs.artist));
      if (match && resolutions[bs.id] === 'overwrite') {
        await db.songs.put({
          ...bs,
          id: match.id,
          order: match.order,
          createdAt: match.createdAt,
          updatedAt: now(),
        });
        idMap.set(bs.id, match.id);
        summary.overwritten += 1;
      } else {
        const id = newId();
        const isDuplicate = Boolean(match);
        const title = isDuplicate ? nextDuplicateTitle(bs.title, titles) : bs.title;
        titles.add(title);
        await db.songs.add({
          ...bs,
          id,
          title,
          order: ++maxOrder,
          createdAt: now(),
          updatedAt: now(),
        });
        idMap.set(bs.id, id);
        if (isDuplicate) summary.duplicated += 1;
        else summary.added += 1;
      }
    }

    if (bundle.setlists?.length) {
      let maxSlOrder = (await db.setlists.orderBy('order').last())?.order ?? 0;
      for (const sl of bundle.setlists) {
        const entries = sl.entries
          .map((e) => ({ ...e, songId: idMap.get(e.songId) ?? '' }))
          .filter((e) => e.songId);
        await db.setlists.add({
          ...sl,
          id: newId(),
          entries,
          order: ++maxSlOrder,
          createdAt: now(),
          updatedAt: now(),
        });
        summary.setlists += 1;
      }
    }
  });

  return summary;
}

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
