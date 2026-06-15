// Starter-library "bundles": named collections of songs (and optional setlists)
// that ship as static data in code. A user opts in by *syncing* a bundle, which
// imports its songs into their library as real rows (see lib/library/import.ts
// + repo.importBundle). Bundles are versioned so new content can ship in a
// deploy; syncing is always explicit and never clobbers edited/added songs
// unless the user chooses to overwrite a title+artist match.

import type { Setlist, Song } from '@/types';

export type SongBundle = {
  /** Stable id for the bundle. */
  id: string;
  name: string;
  description?: string;
  /** Bumped when the bundle's shipped content changes. */
  version: number;
  /** Songs in the difficulty-aware (v3) shape. */
  songs: Song[];
  /** Optional setlists referencing the bundle's songs by id. */
  setlists?: Setlist[];
};
