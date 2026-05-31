import Dexie, { type Table } from 'dexie';
import type {
  AppSettings,
  ChordDefinition,
  Instrument,
  Photo,
  ReportTemplate,
  RhythmPattern,
  Setlist,
  Song,
} from '@/types';

/** Bumped whenever the on-disk shape changes. Written into JSON exports. */
export const SCHEMA_VERSION = 1;

export class TtnChordsDB extends Dexie {
  songs!: Table<Song, string>;
  setlists!: Table<Setlist, string>;
  rhythmPatterns!: Table<RhythmPattern, string>;
  instruments!: Table<Instrument, string>;
  chordDefinitions!: Table<ChordDefinition, string>;
  reportTemplates!: Table<ReportTemplate, string>;
  photos!: Table<Photo, string>;
  settings!: Table<AppSettings, string>;

  constructor() {
    super('ttn-chords');
    // Index only what we query: primary key + the fields we sort/search/filter
    // by. Nested arrays (sections, entries, steps) are non-indexed — we read
    // the parent row and walk it in memory.
    this.version(1).stores({
      songs: 'id, title, artist, order, createdAt, updatedAt',
      setlists: 'id, name, order, createdAt, updatedAt',
      rhythmPatterns: 'id, name, createdAt',
      instruments: 'id, name, createdAt',
      chordDefinitions: 'id, instrumentId, name, createdAt',
      reportTemplates: 'id, name, createdAt, updatedAt',
      photos: 'id, createdAt',
      settings: 'id',
    });
  }
}

export const db = new TtnChordsDB();
