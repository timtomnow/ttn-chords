// Tuner DSP + note math. Pitch is found with autocorrelation (robust for the
// near-periodic tone of a plucked string), then mapped to the nearest equal-
// temperament note relative to a configurable A4. No app state lives here.

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

export type NoteReading = {
  /** Frequency that was analyzed. */
  freq: number;
  /** Nearest MIDI note number. */
  midi: number;
  /** Note name without octave, e.g. "A". */
  name: string;
  /** Full name with octave, e.g. "A4". */
  label: string;
  /** Octave number (scientific pitch notation). */
  octave: number;
  /** Signed cents from the nearest note (−50…+50; negative = flat). */
  cents: number;
};

/** Frequency (Hz) of a MIDI note for a given A4 reference. */
export function midiToFreq(midi: number, a4 = 440): number {
  return a4 * 2 ** ((midi - 69) / 12);
}

/** Fractional MIDI number of a frequency (69 + 12·log2(f/A4)). */
export function freqToMidiFloat(freq: number, a4 = 440): number {
  return 69 + 12 * Math.log2(freq / a4);
}

export function midiToLabel(midi: number): string {
  const name = NOTE_NAMES[((midi % 12) + 12) % 12];
  const octave = Math.floor(midi / 12) - 1;
  return `${name}${octave}`;
}

/** Pitch class (0–11) of a note name; accepts sharps and flats. */
export function pitchClass(name: string): number {
  const m = name.trim().match(/^([A-Ga-g])([#b♯♭]?)/);
  if (!m) return 0;
  const base: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  let pc = base[m[1].toUpperCase()];
  if (m[2] === '#' || m[2] === '♯') pc += 1;
  if (m[2] === 'b' || m[2] === '♭') pc -= 1;
  return ((pc % 12) + 12) % 12;
}

/** Resolve a frequency to its nearest note + how many cents sharp/flat it is. */
export function readNote(freq: number, a4 = 440): NoteReading {
  const midiFloat = freqToMidiFloat(freq, a4);
  const midi = Math.round(midiFloat);
  const cents = Math.round((midiFloat - midi) * 100);
  return {
    freq,
    midi,
    name: NOTE_NAMES[((midi % 12) + 12) % 12],
    label: midiToLabel(midi),
    octave: Math.floor(midi / 12) - 1,
    cents,
  };
}

export type StringTarget = { label: string; midi: number; freq: number };

/**
 * Turn a tuning (note names low→high, e.g. ["E","A","D","G","B","E"]) into
 * concrete pitches. Tunings are stored without octaves, so each string is
 * placed at the lowest octave that keeps the sequence ascending — which
 * reproduces standard guitar/bass/ukulele tunings for the common cases.
 */
export function stringTargets(tuning: string[], a4 = 440, startOctave = 2): StringTarget[] {
  const targets: StringTarget[] = [];
  let prevMidi = -Infinity;
  for (const note of tuning) {
    const pc = pitchClass(note);
    // First string: lowest octave at or above startOctave. Then keep ascending.
    let midi = (startOctave + 1) * 12 + pc;
    while (midi <= prevMidi) midi += 12;
    prevMidi = midi;
    targets.push({ label: midiToLabel(midi), midi, freq: midiToFreq(midi, a4) });
  }
  return targets;
}

/** Pick the target whose frequency is closest (log scale) to the detected one. */
export function nearestTarget(freq: number, targets: StringTarget[]): StringTarget | null {
  if (!targets.length) return null;
  let best = targets[0];
  let bestDist = Infinity;
  for (const t of targets) {
    const dist = Math.abs(Math.log2(freq / t.freq));
    if (dist < bestDist) {
      bestDist = dist;
      best = t;
    }
  }
  return best;
}

/**
 * Autocorrelation pitch detection. Returns the fundamental frequency in Hz, or
 * -1 when the signal is too quiet/noisy to be confident. Adapted from the
 * well-known PitchDetect approach (Chris Wilson), with RMS gating and parabolic
 * interpolation for sub-sample accuracy.
 */
export function autoCorrelate(buf: Float32Array<ArrayBufferLike>, sampleRate: number): number {
  const SIZE = buf.length;

  // Gate on loudness so silence doesn't read as a (random) pitch.
  let rms = 0;
  for (let i = 0; i < SIZE; i++) rms += buf[i] * buf[i];
  rms = Math.sqrt(rms / SIZE);
  if (rms < 0.01) return -1;

  // Trim leading/trailing samples below a small threshold to tighten the window.
  let start = 0;
  let end = SIZE - 1;
  const thres = 0.2;
  for (let i = 0; i < SIZE / 2; i++) if (Math.abs(buf[i]) < thres) start = i;
  for (let i = 1; i < SIZE / 2; i++) if (Math.abs(buf[SIZE - i]) < thres) end = SIZE - i;
  const trimmed = buf.subarray(start, end);
  const n = trimmed.length;

  const c = new Float32Array(n);
  for (let lag = 0; lag < n; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) sum += trimmed[i] * trimmed[i + lag];
    c[lag] = sum;
  }

  // Skip the zero-lag peak, then find the first dip and the next maximum.
  let d = 0;
  while (d < n - 1 && c[d] > c[d + 1]) d++;
  let maxPos = -1;
  let maxVal = -1;
  for (let i = d; i < n; i++) {
    if (c[i] > maxVal) {
      maxVal = c[i];
      maxPos = i;
    }
  }
  if (maxPos <= 0) return -1;

  // Parabolic interpolation around the peak for a finer period estimate.
  const x1 = c[maxPos - 1];
  const x2 = c[maxPos];
  const x3 = c[maxPos + 1] ?? c[maxPos];
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  const period = a ? maxPos - b / (2 * a) : maxPos;

  const freq = sampleRate / period;
  if (freq < 30 || freq > 5000) return -1;
  return freq;
}
