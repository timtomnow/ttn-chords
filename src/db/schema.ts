import Dexie, { type Table } from 'dexie';
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

/** Bumped whenever the on-disk shape changes. Written into JSON exports. */
export const SCHEMA_VERSION = 3;

export class TtnChordsDB extends Dexie {
  songs!: Table<Song, string>;
  setlists!: Table<Setlist, string>;
  rhythmPatterns!: Table<RhythmPattern, string>;
  rhythmSymbols!: Table<RhythmSymbol, string>;
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
    // v2: user-defined rhythm symbols (Phase 7B). Additive — no migration of
    // existing rows needed; the new table just starts empty.
    this.version(2).stores({
      rhythmSymbols: 'id, name, createdAt',
    });
    // v3: song difficulty variants. No index changes; wrap each song's flat
    // `sections` into a single default difficulty (level 3 = "standard"). The
    // beat-timing layer rides along inside those sections untouched.
    this.version(3)
      .stores({})
      .upgrade(async (tx) => {
        await tx
          .table('songs')
          .toCollection()
          .modify((song: Record<string, unknown>) => {
            if (Array.isArray(song.difficulties)) return;
            const id = newId();
            song.difficulties = [
              { id, level: 3, sections: (song.sections as unknown[]) ?? [] },
            ];
            song.defaultDifficultyId = id;
            delete song.sections;
          });
      });
  }
}

export const db = new TtnChordsDB();
