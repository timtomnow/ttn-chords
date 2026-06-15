import { describe, expect, it } from 'vitest';
import { matchKey, nextDuplicateTitle, planBundleImport } from './import';
import type { SongBundle } from './types';
import type { Song } from '@/types';

function song(id: string, title: string, artist?: string): Song {
  return {
    id,
    title,
    artist,
    tags: [],
    difficulties: [{ id: `${id}-d`, level: 3, sections: [] }],
    order: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

const bundle: SongBundle = {
  id: 'b',
  name: 'B',
  version: 1,
  songs: [song('s1', 'Amazing Grace', 'Trad'), song('s2', 'New Song')],
};

describe('matchKey', () => {
  it('is case- and whitespace-insensitive across title + artist', () => {
    expect(matchKey('  Amazing Grace ', 'Trad')).toBe(matchKey('amazing grace', 'TRAD'));
    expect(matchKey('Song')).not.toBe(matchKey('Song', 'Artist'));
  });
});

describe('planBundleImport', () => {
  it('flags title+artist matches as conflicts and the rest as new', () => {
    const plan = planBundleImport(bundle, [
      { id: 'x', title: 'amazing grace', artist: 'trad' },
    ]);
    expect(plan[0]).toMatchObject({ status: 'conflict', existingId: 'x' });
    expect(plan[1]).toMatchObject({ status: 'new' });
  });
});

describe('nextDuplicateTitle', () => {
  it('returns the base when free, else the next free _N suffix', () => {
    expect(nextDuplicateTitle('Song', [])).toBe('Song');
    expect(nextDuplicateTitle('Song', ['Song'])).toBe('Song_1');
    expect(nextDuplicateTitle('Song', ['Song', 'song_1'])).toBe('Song_2');
  });
});
