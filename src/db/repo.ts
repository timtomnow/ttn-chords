// Typed CRUD + reactive hooks. Components import from HERE, never call Dexie
// directly. Reads use useLiveQuery so the UI updates automatically on writes.

import { useLiveQuery } from 'dexie-react-hooks';
import { db } from './schema';
import { newId } from '@/lib/id';
import type {
  AppSettings,
  ChordDefinition,
  Instrument,
  Setlist,
  Song,
} from '@/types';

const now = () => Date.now();

// ───────── Songs ─────────

export function useSongs(): Song[] | undefined {
  return useLiveQuery(() => db.songs.orderBy('order').toArray());
}

export function useSong(id: string | undefined): Song | undefined {
  return useLiveQuery(() => (id ? db.songs.get(id) : undefined), [id]);
}

export async function createSong(
  data: Partial<Song> & Pick<Song, 'title'>,
): Promise<string> {
  const id = newId();
  const max = await db.songs.orderBy('order').last();
  const song: Song = {
    id,
    title: data.title,
    artist: data.artist,
    key: data.key,
    capo: data.capo,
    tempo: data.tempo,
    timeSignature: data.timeSignature,
    tags: data.tags ?? [],
    sections: data.sections ?? [],
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

export async function getSettings(): Promise<AppSettings> {
  return (await db.settings.get('app')) ?? DEFAULT_SETTINGS;
}

export async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
  const current = await getSettings();
  await db.settings.put({ ...current, ...patch, id: 'app', updatedAt: now() });
}
