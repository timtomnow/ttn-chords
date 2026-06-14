// The metronome audio engine — framework-agnostic so it can drive both the
// standalone tool and an in-performance widget. Timing uses the classic Web
// Audio "lookahead scheduler" (a setInterval that schedules clicks slightly
// ahead on the rock-steady AudioContext clock), so tempo never drifts even when
// the main thread is busy. Visual flashes are kept in lockstep by handing the
// audio-clock time of each tick to a requestAnimationFrame drain loop.

import type { MetronomeSettings, MetronomeSound } from '@/types';

/** Loudness/role of a single tick — drives both pitch and flash color. */
export type TickLevel = 'accent' | 'beat' | 'sub';

export type Tick = {
  /** 0-based beat within the measure. */
  beat: number;
  /** 0-based subdivision within the beat (0 = the beat itself). */
  sub: number;
  level: TickLevel;
};

/** Audio-relevant config. Flash styling is handled in the view, not here. */
export type MetronomeConfig = Pick<
  MetronomeSettings,
  'tempo' | 'beatsPerMeasure' | 'subdivision' | 'soundEnabled' | 'sound' | 'accentDownbeat' | 'volume'
>;

export const DEFAULT_METRONOME: MetronomeSettings = {
  tempo: 100,
  beatsPerMeasure: 4,
  subdivision: 1,
  soundEnabled: true,
  sound: 'beep',
  accentDownbeat: true,
  volume: 0.7,
  flashEnabled: true,
  flashShape: 'circle',
  flashAccentColor: '#22c55e',
  flashBeatColor: '#64748b',
};

export const TEMPO_MIN = 30;
export const TEMPO_MAX = 300;
export const clampTempo = (bpm: number) =>
  Math.min(TEMPO_MAX, Math.max(TEMPO_MIN, Math.round(bpm)));

export const SOUND_LABELS: Record<MetronomeSound, string> = {
  beep: 'Beep',
  click: 'Click',
  woodblock: 'Woodblock',
  cowbell: 'Cowbell',
};

// Base oscillator frequency (Hz) per voice; the accent/beat/sub variations are
// derived from this so each voice keeps a consistent character.
const SOUND_BASE_HZ: Record<MetronomeSound, number> = {
  beep: 880,
  click: 2000,
  woodblock: 1200,
  cowbell: 540,
};

const SOUND_WAVE: Record<MetronomeSound, OscillatorType> = {
  beep: 'sine',
  click: 'square',
  woodblock: 'triangle',
  cowbell: 'square',
};

const LOOKAHEAD_MS = 25; // how often the scheduler wakes
const SCHEDULE_AHEAD_S = 0.12; // how far ahead clicks are queued

export class MetronomeEngine {
  private ctx: AudioContext | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private raf = 0;
  private nextTickTime = 0;
  private beat = 0;
  private sub = 0;
  private queue: { time: number; tick: Tick }[] = [];
  private cfg: MetronomeConfig = { ...DEFAULT_METRONOME };

  // Continuous-position tracking (quarter-note beats from the first tick). Kept
  // tempo-change-aware: each tempo change banks the beats elapsed so far so the
  // running position stays smooth when the user nudges the tempo live.
  private posBeatsBanked = 0;
  private posSinceTime = 0;

  running = false;
  /** Fired (on the rAF loop, ~at audio time) for each tick — drive visuals here. */
  onTick: ((tick: Tick) => void) | null = null;

  setConfig(cfg: Partial<MetronomeConfig>): void {
    const tempoChanged = cfg.tempo !== undefined && cfg.tempo !== this.cfg.tempo;
    if (tempoChanged && this.running && this.ctx) {
      // Bank beats elapsed at the OLD tempo before switching.
      this.posBeatsBanked = this.getPositionBeats();
      this.posSinceTime = this.ctx.currentTime;
    }
    this.cfg = { ...this.cfg, ...cfg };
  }

  /**
   * Continuous playback position in quarter-note beats since `start()` (0 at the
   * first audible tick). Read from the rock-steady audio clock so visuals stay
   * locked to the click. Returns 0 while stopped.
   */
  getPositionBeats(): number {
    if (!this.running || !this.ctx) return 0;
    const elapsed = Math.max(0, this.ctx.currentTime - this.posSinceTime);
    return this.posBeatsBanked + (elapsed * clampTempo(this.cfg.tempo)) / 60;
  }

  start(): void {
    if (this.running) return;
    if (!this.ctx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctor();
    }
    void this.ctx.resume();
    this.running = true;
    this.beat = 0;
    this.sub = 0;
    this.queue = [];
    this.nextTickTime = this.ctx.currentTime + 0.06;
    // Position zero == the first audible tick.
    this.posBeatsBanked = 0;
    this.posSinceTime = this.nextTickTime;
    this.timer = setInterval(() => this.scheduler(), LOOKAHEAD_MS);
    this.raf = requestAnimationFrame(this.drain);
  }

  stop(): void {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.queue = [];
  }

  dispose(): void {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
  }

  private secondsPerTick(): number {
    const sub = Math.max(1, this.cfg.subdivision);
    return 60 / clampTempo(this.cfg.tempo) / sub;
  }

  private levelFor(beat: number, sub: number): TickLevel {
    if (sub !== 0) return 'sub';
    if (beat === 0 && this.cfg.accentDownbeat && this.cfg.beatsPerMeasure > 1) return 'accent';
    return 'beat';
  }

  private scheduler = (): void => {
    if (!this.ctx) return;
    const sub = Math.max(1, this.cfg.subdivision);
    const beats = Math.max(1, this.cfg.beatsPerMeasure);
    while (this.nextTickTime < this.ctx.currentTime + SCHEDULE_AHEAD_S) {
      const tick: Tick = {
        beat: this.beat,
        sub: this.sub,
        level: this.levelFor(this.beat, this.sub),
      };
      if (this.cfg.soundEnabled) this.playClick(this.nextTickTime, tick.level);
      this.queue.push({ time: this.nextTickTime, tick });

      this.nextTickTime += this.secondsPerTick();
      this.sub += 1;
      if (this.sub >= sub) {
        this.sub = 0;
        this.beat = (this.beat + 1) % beats;
      }
    }
  };

  // Fire onTick when the audio clock reaches each queued tick, so the flash and
  // the click land together.
  private drain = (): void => {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    while (this.queue.length && this.queue[0].time <= now) {
      const { tick } = this.queue.shift()!;
      this.onTick?.(tick);
    }
    if (this.running) this.raf = requestAnimationFrame(this.drain);
  };

  private playClick(time: number, level: TickLevel): void {
    if (!this.ctx) return;
    const base = SOUND_BASE_HZ[this.cfg.sound];
    // Accent rings higher/louder; subdivisions sit lower and quieter.
    const freq = level === 'accent' ? base * 1.5 : level === 'beat' ? base : base * 0.8;
    const gainPeak =
      this.cfg.volume * (level === 'accent' ? 1 : level === 'beat' ? 0.8 : 0.4);
    const decay = this.cfg.sound === 'beep' ? 0.06 : 0.035;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = SOUND_WAVE[this.cfg.sound];
    osc.frequency.setValueAtTime(freq, time);
    // Cowbell gets a quick downward pitch blip for character.
    if (this.cfg.sound === 'cowbell') {
      osc.frequency.exponentialRampToValueAtTime(freq * 0.66, time + decay);
    }
    gain.gain.setValueAtTime(0.0001, time);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, gainPeak), time + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, time + decay);
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(time);
    osc.stop(time + decay + 0.02);
  }
}
