// Registry of built-in song bundles. Add a bundle = author a module under
// bundles/ and list it here; the Bundles settings screen renders them all.

import { starterBundle } from './bundles/starter';
import { countingCrowsBundle } from './bundles/counting-crows';
import { johnDenverBundle } from './bundles/john-denver';
import type { SongBundle } from './types';

const BUNDLES: SongBundle[] = [starterBundle, countingCrowsBundle, johnDenverBundle];

export function listBundles(): SongBundle[] {
  return BUNDLES;
}

export function getBundle(id: string): SongBundle | undefined {
  return BUNDLES.find((b) => b.id === id);
}

export type { SongBundle } from './types';
