// Supabase-backed data layer for user-authored content. The repo (src/db/repo)
// re-exports these so components keep importing from '@/db/repo'.

export {
  useSongs,
  useSong,
  useSongsByIds,
  upsertSong,
  createSong,
  updateSong,
  updateDifficultySections,
  deleteSong,
} from './songs';
export {
  useSetlists,
  useSetlist,
  upsertSetlist,
  createSetlist,
  updateSetlist,
  deleteSetlist,
} from './setlists';
export { useIsOwnedSong } from './songs';
export {
  useStorefront,
  useEntitledBundleIds,
  useBundle,
  useBundleSongTitles,
} from './bundles';
export { useSongNotes, saveMyNote, deleteNote, type SongNote } from './notes';
export {
  importBundle,
  importLocalData,
  type BundleImportSummary,
  type LocalImportSummary,
} from './importLocal';
export { initCloudSync } from './init';
