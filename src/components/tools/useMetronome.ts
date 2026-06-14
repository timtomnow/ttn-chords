// React binding for MetronomeEngine. Owns the engine instance for a component's
// lifetime, pushes config changes down, and surfaces a `pulse` that re-triggers
// on every audible tick so the flash overlay can animate in lockstep.

import { useCallback, useEffect, useRef, useState } from 'react';
import { MetronomeEngine, type MetronomeConfig, type Tick } from '@/lib/metronome';

export type MetronomePulse = Tick & { n: number };

export function useMetronome(config: MetronomeConfig) {
  const engineRef = useRef<MetronomeEngine | null>(null);
  if (!engineRef.current) engineRef.current = new MetronomeEngine();

  const [playing, setPlaying] = useState(false);
  const [pulse, setPulse] = useState<MetronomePulse | null>(null);

  useEffect(() => {
    const engine = engineRef.current!;
    engine.onTick = (tick) => setPulse((p) => ({ ...tick, n: (p?.n ?? 0) + 1 }));
    return () => engine.dispose();
  }, []);

  // Keep the engine's audio config in sync. Serialized deps so an inline config
  // object doesn't thrash the effect.
  useEffect(() => {
    engineRef.current!.setConfig(config);
    // Depend on the individual fields, not the (often inline) config object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config.tempo,
    config.beatsPerMeasure,
    config.subdivision,
    config.soundEnabled,
    config.sound,
    config.accentDownbeat,
    config.volume,
  ]);

  const start = useCallback(() => {
    engineRef.current!.start();
    setPlaying(true);
  }, []);

  const stop = useCallback(() => {
    engineRef.current!.stop();
    setPlaying(false);
    setPulse(null);
  }, []);

  // Continuous beat position read straight off the audio clock. Stable identity
  // so callers can poll it from a rAF loop without re-rendering on every tick.
  const getPosition = useCallback(() => engineRef.current!.getPositionBeats(), []);

  const toggle = useCallback(() => {
    if (engineRef.current!.running) {
      engineRef.current!.stop();
      setPlaying(false);
      setPulse(null);
    } else {
      engineRef.current!.start();
      setPlaying(true);
    }
  }, []);

  return { playing, pulse, start, stop, toggle, getPosition };
}
