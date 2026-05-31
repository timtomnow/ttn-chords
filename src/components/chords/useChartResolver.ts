// Bridges the DB (user instruments + chord definitions + the "my instrument"
// setting) to the pure resolveChord() function. Returns a stable resolver plus
// the active instrument so components don't each re-query Dexie.

import { useCallback, useMemo } from 'react';
import {
  useChordDefinitions,
  useSettings,
  useUserInstruments,
} from '@/db/repo';
import {
  BUILTIN_GUITAR,
  allInstruments,
  getInstrumentInfo,
  resolveChord,
  type InstrumentInfo,
  type ResolvedChart,
} from '@/lib/chords';

export function useChartResolver(instrumentIdOverride?: string) {
  const settings = useSettings();
  const userInstruments = useUserInstruments();
  const userDefs = useChordDefinitions();

  const instrumentId =
    instrumentIdOverride || settings?.myInstrumentId || BUILTIN_GUITAR;

  const instruments = useMemo(
    () => allInstruments(userInstruments ?? []),
    [userInstruments],
  );

  const instrument: InstrumentInfo | undefined = useMemo(
    () => getInstrumentInfo(instrumentId, userInstruments ?? []),
    [instrumentId, userInstruments],
  );

  const resolve = useCallback(
    (chord: string): ResolvedChart | null =>
      resolveChord(instrumentId, chord, {
        userDefs: userDefs ?? [],
        instrument,
      }),
    [instrumentId, userDefs, instrument],
  );

  return { resolve, instrument, instrumentId, instruments, ready: settings !== undefined };
}
