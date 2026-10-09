// React binding for ChordAudioEngine. Owns one engine for the component's
// lifetime and keeps its config and recordings in sync.
//
// It deliberately does NOT reach for an AudioContext: there isn't one until the
// transport has been started from a tap (building one earlier is what silences
// audio on iOS). The view hands the context down from its animation loop the
// moment the transport makes one, and the engine decodes the recordings then.
//
// The engine is returned as-is rather than wrapped: the Highway schedules from
// inside its own rAF loop (where the playback position lives), and a React state
// round-trip per chord would defeat the point of sample-accurate timing.

import { useEffect, useRef } from 'react';
import { ChordAudioEngine } from '@/lib/chordAudio';
import type { ChordSound, ChordSoundSettings } from '@/types';

export function useChordAudio(
  cfg: ChordSoundSettings,
  sounds: ChordSound[] | undefined,
): ChordAudioEngine {
  const ref = useRef<ChordAudioEngine | null>(null);
  if (!ref.current) ref.current = new ChordAudioEngine();
  const engine = ref.current;

  useEffect(() => () => engine.dispose(), [engine]);

  useEffect(() => {
    engine.setConfig(cfg);
    // Individual fields, not the (often inline) config object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine, cfg.enabled, cfg.source, cfg.timbre, cfg.voicing, cfg.mode, cfg.volume]);

  // `sounds` is undefined only until the first read lands; an empty array is a
  // real answer (you deleted them all) and must reach the engine so it forgets
  // what it decoded.
  useEffect(() => {
    if (!cfg.enabled || cfg.source !== 'recording' || !sounds) return;
    engine.setSounds(sounds.map((s) => ({ chord: s.chord, blob: s.blob })));
  }, [engine, cfg.enabled, cfg.source, sounds]);

  return engine;
}
