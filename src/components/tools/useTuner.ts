// Microphone → frequency. Opens an input stream, runs the autocorrelation
// detector each animation frame, and exposes a lightly-smoothed fundamental
// frequency (Hz). The caller maps Hz to notes so the reference pitch can change
// without restarting the mic.

import { useCallback, useEffect, useRef, useState } from 'react';
import { autoCorrelate } from '@/lib/tuner';

export function useTuner() {
  const [active, setActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [freq, setFreq] = useState<number | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef(0);
  const bufRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const smoothRef = useRef<number | null>(null);
  const missRef = useRef(0);

  const loop = useCallback(() => {
    const analyser = analyserRef.current;
    const buf = bufRef.current;
    if (!analyser || !buf) return;
    analyser.getFloatTimeDomainData(buf);
    const detected = autoCorrelate(buf, ctxRef.current!.sampleRate);

    if (detected > 0) {
      missRef.current = 0;
      // Exponential smoothing, but snap if the jump is large (a new string).
      const prev = smoothRef.current;
      const next =
        prev == null || Math.abs(Math.log2(detected / prev)) > 0.03
          ? detected
          : prev * 0.8 + detected * 0.2;
      smoothRef.current = next;
      setFreq(next);
    } else {
      // Hold the last reading briefly, then clear so the UI goes idle.
      missRef.current += 1;
      if (missRef.current > 12) {
        smoothRef.current = null;
        setFreq(null);
      }
    }
    rafRef.current = requestAnimationFrame(loop);
  }, []);

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current);
    rafRef.current = 0;
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    void ctxRef.current?.close();
    ctxRef.current = null;
    analyserRef.current = null;
    bufRef.current = null;
    smoothRef.current = null;
    setFreq(null);
    setActive(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
      streamRef.current = stream;
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor();
      await ctx.resume();
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 2048;
      ctx.createMediaStreamSource(stream).connect(analyser);
      ctxRef.current = ctx;
      analyserRef.current = analyser;
      bufRef.current = new Float32Array(analyser.fftSize);
      setActive(true);
      rafRef.current = requestAnimationFrame(loop);
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === 'NotAllowedError'
          ? 'Microphone permission was denied.'
          : 'Could not access the microphone.',
      );
      stop();
    }
  }, [loop, stop]);

  // Clean up on unmount.
  useEffect(() => () => stop(), [stop]);

  return { active, error, freq, start, stop };
}
