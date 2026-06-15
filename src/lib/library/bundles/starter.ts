// The built-in "Starter Songs" bundle: a few public-domain songs so a fresh
// install isn't empty. Bodies are authored in ChordPro and parsed to our model
// at module load. "Amazing Grace" ships two difficulty variants to demonstrate
// the feature (a simple 3-chord version and a richer one).

import { parseChordPro } from '@/lib/chordpro';
import type { Song, SongDifficulty } from '@/types';
import type { SongBundle } from '../types';

function diff(id: string, level: number, body: string, label?: string): SongDifficulty {
  return { id, level, label, sections: parseChordPro(body).sections };
}

function song(
  id: string,
  meta: { title: string; artist?: string; key?: string; tempo?: number; tags?: string[] },
  difficulties: SongDifficulty[],
): Song {
  return {
    id,
    title: meta.title,
    artist: meta.artist,
    key: meta.key,
    tempo: meta.tempo,
    tags: meta.tags ?? [],
    difficulties,
    defaultDifficultyId: difficulties[0].id,
    order: 0,
    createdAt: 0,
    updatedAt: 0,
  };
}

const amazingGraceSimple = `{start_of_verse}
[G]Amazing grace how [C]sweet the [G]sound
That saved a [D]wretch like [G]me
{end_of_verse}`;

const amazingGraceRich = `{start_of_verse}
[G]Amazing [G7]grace how [C]sweet the [G]sound
That [G]saved a [Em]wretch like [D]me[D7]
{end_of_verse}`;

const twinkle = `{start_of_verse}
[C]Twinkle twinkle [F]little [C]star
[F]How I [C]wonder [G]what you [C]are
{end_of_verse}`;

const rowYourBoat = `{start_of_verse}
[C]Row, row, row your boat
Gently down the [G]stream
[G]Merrily merrily merrily merrily
[C]Life is but a dream
{end_of_verse}`;

export const starterBundle: SongBundle = {
  id: 'starter',
  name: 'Starter Songs',
  description: 'A handful of public-domain songs to get going.',
  version: 1,
  songs: [
    song(
      'bundle-amazing-grace',
      { title: 'Amazing Grace', artist: 'Traditional', key: 'G', tempo: 80, tags: ['hymn'] },
      [
        diff('ag-l1', 1, amazingGraceSimple, 'Simple'),
        diff('ag-l3', 3, amazingGraceRich, 'Standard'),
      ],
    ),
    song(
      'bundle-twinkle',
      { title: 'Twinkle Twinkle Little Star', artist: 'Traditional', key: 'C', tempo: 90, tags: ['kids'] },
      [diff('tw-l1', 1, twinkle)],
    ),
    song(
      'bundle-row-your-boat',
      { title: 'Row Row Row Your Boat', artist: 'Traditional', key: 'C', tempo: 100, tags: ['kids'] },
      [diff('rb-l1', 1, rowYourBoat)],
    ),
  ],
};
