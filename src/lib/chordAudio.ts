// Makes the chords audible. Two sound sources, one interface:
//
//   - `tone`      — a small computer-generated synth. Nothing is downloaded or
//                   stored: the chord symbol is spelled out (lib/music
//                   `chordSpelling`) and the notes are built from oscillators at
//                   play time, so every chord in every key already works.
//   - `recording` — the user's own audio for that exact chord (see the
//                   `chordSounds` table), falling back to the tone when a chord
//                   has no recording yet.
//
// The engine never owns a clock. It is handed the metronome's AudioContext and
// an absolute audio-clock time for every hit, so chords land on the beat with
// sample accuracy instead of whenever a frame happened to fire. What to play and
// when is decided in `lib/chordCues.ts`.

import { chordSpelling } from '@/lib/music';
import type { ChordSoundSettings, ChordSoundTimbre } from '@/types';

export const DEFAULT_CHORD_SOUNDS: ChordSoundSettings = {
  enabled: false,
  source: 'tone',
  timbre: 'pluck',
  voicing: 'full',
  mode: 'once',
  volume: 0.6,
};

export const CHORD_SOURCE_LABELS: Record<ChordSoundSettings['source'], string> = {
  tone: 'Built-in tone',
  recording: 'My recordings',
};

export const CHORD_TIMBRE_LABELS: Record<ChordSoundTimbre, string> = {
  pluck: 'Pluck',
  strings: 'Strings',
  organ: 'Organ',
};

export const CHORD_VOICING_LABELS: Record<ChordSoundSettings['voicing'], string> = {
  root: 'Root note',
  full: 'Full chord',
};

export const CHORD_MODE_LABELS: Record<ChordSoundSettings['mode'], string> = {
  once: 'On the beat',
  held: 'Held',
  repeat: 'Every beat',
};

/**
 * The key a recording is filed under. Chord symbols are typed by hand in a dozen
 * equivalent ways, so normalize before matching: trim, unify the unicode
 * accidentals with the ASCII ones, and capitalize the root letter. Quality is
 * left alone — "Am" and "AM" really are different chords.
 */
export function normalizeChordKey(symbol: string): string {
  const s = symbol.trim().replace(/♯/g, '#').replace(/♭/g, 'b');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Lowest note of a voiced chord, as a MIDI number — C3, comfortably audible
 *  on a tablet or phone speaker without being muddy. */
const ROOT_MIDI = 48;
/** A slash bass sits an octave below the chord. */
const BASS_MIDI = 36;
/** Fade applied when a sound is cut off by the next chord or a stop. */
const RELEASE_S = 0.06;
/** Output headroom — see setContext. */
const MASTER_GAIN = 0.7;

const midiToHz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

type Timbre = {
  wave: OscillatorType;
  /** Extra oscillator an octave up, at this gain (0 = none). */
  octave: number;
  attack: number;
  /** Level held after the initial decay, as a fraction of peak. 0 = plucked. */
  sustain: number;
  decay: number;
  /** Length of a non-sustaining (one-shot) note. */
  ring: number;
  /** Lowpass cutoff in Hz. */
  cutoff: number;
};

const TIMBRES: Record<ChordSoundTimbre, Timbre> = {
  pluck: { wave: 'triangle', octave: 0.18, attack: 0.005, sustain: 0.28, decay: 0.45, ring: 1.4, cutoff: 3200 },
  strings: { wave: 'sawtooth', octave: 0, attack: 0.09, sustain: 0.75, decay: 0.5, ring: 1.8, cutoff: 1800 },
  organ: { wave: 'sine', octave: 0.6, attack: 0.012, sustain: 0.9, decay: 0.12, ring: 1.1, cutoff: 5000 },
};

/** A sounding voice, whatever made it. */
type Voice = {
  /** Begin its release at `time`; the nodes tear themselves down after. */
  release: (time: number) => void;
  sustaining: boolean;
};

export class ChordAudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private cfg: ChordSoundSettings = { ...DEFAULT_CHORD_SOUNDS };
  private samples = new Map<string, AudioBuffer>();
  // Recordings as stored, kept raw until there's a context to decode them on.
  // There isn't one until the transport starts (see MetronomeEngine.audioContext),
  // so decoding is driven by the context arriving, not by the set being handed in.
  private pending: { chord: string; blob: Blob }[] = [];
  private decodeToken = 0;
  private voices: Voice[] = [];

  /**
   * Adopt the transport's AudioContext. Cheap to call every frame — only a
   * genuine change rebuilds the master gain.
   */
  setContext(ctx: AudioContext | null): void {
    if (ctx === this.ctx) return;
    this.voices = [];
    this.master?.disconnect();
    this.ctx = ctx;
    this.master = null;
    if (ctx) {
      void this.decode();
      this.master = ctx.createGain();
      // Headroom. A full seventh chord with octave partials sums well past unity
      // otherwise, and clipping sounds like a fault rather than a loud chord.
      this.master.gain.value = MASTER_GAIN;
      this.master.connect(ctx.destination);
    }
  }

  get context(): AudioContext | null {
    return this.ctx;
  }

  setConfig(cfg: ChordSoundSettings): void {
    this.cfg = cfg;
  }

  /**
   * The recordings to play. Held raw and decoded as soon as a context exists —
   * which may be now (mid-song) or not until the first tap on Play.
   */
  setSounds(sounds: { chord: string; blob: Blob }[]): void {
    this.pending = sounds;
    void this.decode();
  }

  /**
   * Decode the pending recordings into playable buffers. Built into a fresh map
   * and swapped in at the end, so a reload never leaves the engine with a
   * half-populated set mid-song, and a superseded decode drops its result rather
   * than clobbering a newer one. Undecodable blobs are skipped, not fatal.
   */
  private async decode(): Promise<void> {
    const ctx = this.ctx;
    if (!ctx) return;
    const token = ++this.decodeToken;
    // Deleting the last recording must actually go quiet, not keep playing a
    // buffer that no longer exists in the library.
    if (!this.pending.length) {
      this.samples.clear();
      return;
    }
    const next = new Map<string, AudioBuffer>();
    for (const s of this.pending) {
      try {
        next.set(normalizeChordKey(s.chord), await ctx.decodeAudioData(await s.blob.arrayBuffer()));
      } catch {
        // A recording we can't decode just falls back to the built-in tone.
      }
    }
    if (token === this.decodeToken) this.samples = next;
  }

  hasSample(chord: string): boolean {
    return this.samples.has(normalizeChordKey(chord));
  }

  /**
   * Sound one hit at an absolute audio-clock `time`. A null symbol is a stop: it
   * silences everything without starting anything, which is what makes a break
   * in the middle of a song possible. Anything still sustaining is released
   * first, so chords never pile up on each other.
   */
  play(symbol: string | null, time: number, sustain: boolean): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    // A context can be suspended out from under us (tab backgrounded, a mobile
    // interruption). Nudge it rather than scheduling into silence.
    if (ctx.state === 'suspended') void ctx.resume();
    const at = Math.max(time, ctx.currentTime);

    if (symbol === null) {
      this.releaseAll(at);
      return;
    }
    this.releaseSustaining(at);

    const gain = Math.max(0, Math.min(1, this.cfg.volume));
    if (gain <= 0) return;

    const sample =
      this.cfg.source === 'recording' ? this.samples.get(normalizeChordKey(symbol)) : undefined;
    const voice = sample
      ? this.playSample(sample, at, gain, sustain)
      : this.playTone(symbol, at, gain, sustain);
    if (voice) this.voices.push(voice);
    // Voices are short-lived; keep the list from growing across a long song.
    if (this.voices.length > 24) this.voices.splice(0, this.voices.length - 24);
  }

  /** Silence everything immediately (transport stopped, view unmounted). */
  stopAll(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    this.releaseAll(ctx.currentTime);
  }

  dispose(): void {
    this.stopAll();
    this.voices = [];
    this.pending = [];
    this.samples.clear();
    this.master?.disconnect();
    this.master = null;
    this.ctx = null;
  }

  private releaseAll(time: number): void {
    for (const v of this.voices) v.release(time);
    this.voices = [];
  }

  private releaseSustaining(time: number): void {
    const keep: Voice[] = [];
    for (const v of this.voices) {
      if (v.sustaining) v.release(time);
      else keep.push(v);
    }
    this.voices = keep;
  }

  // ── The built-in synth ──

  private playTone(symbol: string, time: number, gain: number, sustain: boolean): Voice | null {
    const ctx = this.ctx!;
    const spelling = chordSpelling(symbol);
    // An unparseable symbol isn't a chord (a cue, an annotation) — stay silent
    // rather than inventing a note for it.
    if (!spelling) return null;

    const midis: number[] = [];
    if (this.cfg.voicing === 'root') {
      // The one note a bass player would take: the slash bass if written, else
      // the root.
      midis.push(ROOT_MIDI + (spelling.bassPc ?? spelling.rootPc));
    } else {
      if (spelling.bassPc !== undefined && spelling.bassPc !== spelling.rootPc) {
        midis.push(BASS_MIDI + spelling.bassPc);
      }
      for (const interval of spelling.intervals) midis.push(ROOT_MIDI + spelling.rootPc + interval);
    }

    const t = TIMBRES[this.cfg.timbre] ?? TIMBRES.pluck;
    // Keep a six-note chord from being six times as loud as a single root. The
    // octave partial counts towards the total, or the timbres that have one
    // (organ especially) come out hot.
    const peak = (gain * 0.5) / Math.sqrt(midis.length * (1 + t.octave));

    const bus = ctx.createGain();
    bus.gain.value = 1;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = t.cutoff;
    bus.connect(filter).connect(this.master!);

    const stops: OscillatorNode[] = [];
    midis.forEach((midi, i) => {
      const hz = midiToHz(midi);
      // A strum isn't simultaneous; a few ms between notes makes it sound played
      // rather than typed.
      const start = time + (this.cfg.voicing === 'full' ? i * 0.012 : 0);
      stops.push(this.oscillator(bus, t.wave, hz, start, peak, t, sustain));
      if (t.octave > 0) {
        stops.push(this.oscillator(bus, t.wave, hz * 2, start, peak * t.octave, t, sustain));
      }
    });

    const end = sustain ? Infinity : time + t.ring + RELEASE_S;
    if (Number.isFinite(end)) {
      for (const osc of stops) osc.stop(end);
      setTimeout(() => {
        bus.disconnect();
        filter.disconnect();
      }, Math.max(0, (end - ctx.currentTime) * 1000) + 200);
    }

    return {
      sustaining: sustain,
      release: (at: number) => {
        const from = Math.max(at, ctx.currentTime);
        bus.gain.cancelScheduledValues(from);
        bus.gain.setValueAtTime(Math.max(0.0001, bus.gain.value), from);
        bus.gain.exponentialRampToValueAtTime(0.0001, from + RELEASE_S);
        for (const osc of stops) {
          try {
            osc.stop(from + RELEASE_S + 0.01);
          } catch {
            // Already stopped — harmless.
          }
        }
      },
    };
  }

  private oscillator(
    dest: AudioNode,
    wave: OscillatorType,
    hz: number,
    time: number,
    peak: number,
    t: Timbre,
    sustain: boolean,
  ): OscillatorNode {
    const ctx = this.ctx!;
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    osc.type = wave;
    osc.frequency.setValueAtTime(hz, time);

    const floor = 0.0001;
    const top = Math.max(floor * 2, peak);
    env.gain.setValueAtTime(floor, time);
    env.gain.exponentialRampToValueAtTime(top, time + t.attack);
    const held = Math.max(floor * 2, top * t.sustain);
    env.gain.exponentialRampToValueAtTime(held, time + t.attack + t.decay);
    if (!sustain) {
      // A one-shot dies away on its own; a sustaining note waits to be released.
      env.gain.exponentialRampToValueAtTime(floor, time + t.ring);
    }

    osc.connect(env).connect(dest);
    osc.start(time);
    return osc;
  }

  // ── Recorded chords ──

  private playSample(buffer: AudioBuffer, time: number, gain: number, sustain: boolean): Voice {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const env = ctx.createGain();
    env.gain.value = gain;
    src.connect(env).connect(this.master!);
    src.start(time);

    return {
      // A recording rings for as long as it was recorded; "held" only changes
      // whether the NEXT chord is allowed to cut it off, which `releaseSustaining`
      // handles.
      sustaining: sustain,
      release: (at: number) => {
        const from = Math.max(at, ctx.currentTime);
        env.gain.cancelScheduledValues(from);
        env.gain.setValueAtTime(Math.max(0.0001, env.gain.value), from);
        env.gain.exponentialRampToValueAtTime(0.0001, from + RELEASE_S);
        try {
          src.stop(from + RELEASE_S + 0.01);
        } catch {
          // Already finished.
        }
      },
    };
  }
}
