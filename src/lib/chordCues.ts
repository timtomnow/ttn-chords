// Turns the Highway's absolute beat timeline into a list of "what should be
// sounding when" — and then into individual, precisely-positioned hits the audio
// engine can schedule. Pure + unit-tested (chordCues.test.ts): no Web Audio, no
// React, no DB. The engine that actually makes noise is `lib/chordAudio.ts`.
//
// Two coordinate systems meet here and must not be confused:
//   - SONG beats   — absolute quarter-note beats from the start of the song, the
//                    same numbers `lib/timeline.ts` produces.
//   - PLAYBACK position — quarter-note beats since the transport started, which
//                    is what the metronome clock reports. It differs from song
//                    beats by the count-in, by where playback started, and (when
//                    looping) by which pass around the loop we're on.
// `chordHits` is the map between them.

import { transposeChordSymbol } from '@/lib/music';
import type { Timeline } from '@/lib/timeline';
import type { ChordSoundMode } from '@/types';

const EPS = 1e-6;

/** One span of the song during which a single chord (or silence) is in force. */
export type ChordCue = {
  /** The sounding chord symbol, or null for a stop (a break — "N.C."). */
  symbol: string | null;
  /** Song beat the cue takes over on. */
  startBeat: number;
  /** Song beat it gives way to the next cue (or the end of the song). */
  endBeat: number;
};

/** One scheduled sounding, positioned on the transport clock. */
export type ChordHit = {
  /** The chord to sound, or null to silence whatever is ringing. */
  symbol: string | null;
  /** Playback position (transport beats) the hit lands on. */
  posBeat: number;
  /** Hold the sound until something stops it, rather than letting it decay. */
  sustain: boolean;
};

/**
 * How playback maps song beats onto transport positions. Built by the Highway
 * from its own play origin / count-in / loop state.
 */
export type PlayMap = {
  /** Transport beats of count-in before the song's first sounding beat. */
  countIn: number;
  /** Song beat playback starts from. */
  from: number;
  /** Total song length in beats — where a non-looping pass ends. */
  totalBeats: number;
  /** The looped span, when a section is on repeat. */
  loop?: { startBeat: number; lengthBeats: number };
};

/**
 * Symbols that mean "stop playing" rather than naming a chord: the standard
 * `N.C.` (no chord) plus the shorthands a teacher is likely to type on a phone.
 * Authoring one of these on a beat is how you put a break in the play-along.
 */
export function isStopChord(symbol: string): boolean {
  return /^(n\.?\s*c\.?|nc|stop|silence|rest|tacet|x|-|—|–)$/i.test(symbol.trim());
}

/**
 * A bare timing marker rather than a harmony: the Highway writes these as a
 * chord-less event or a lone ".". They keep the beat grid honest but must NOT
 * interrupt the sound — a held chord rings straight through them.
 */
export function isTimingDot(symbol: string | undefined): boolean {
  const s = (symbol ?? '').trim();
  return s === '' || s === '.';
}

/**
 * The chord cues of a timeline, in play order. Only events that change the
 * harmony produce a cue: timing dots are skipped, a stop chord produces a
 * silence cue, and simultaneous events collapse to the first one. Each cue runs
 * until the next one starts (the last until the end of the song), which is what
 * makes "held" and "repeat" modes possible.
 *
 * `transpose` is the shell's global transpose; each item's own per-occurrence
 * transpose is added on top, so the cue names the chord you can actually hear.
 */
export function buildChordCues(
  timeline: Timeline,
  transpose = 0,
  preferFlats = false,
): ChordCue[] {
  const cues: ChordCue[] = [];
  for (const item of timeline.items) {
    const raw = item.event.chord;
    if (isTimingDot(raw)) continue;
    const shift = transpose + item.transpose;
    const symbol = isStopChord(raw!)
      ? null
      : shift
        ? transposeChordSymbol(raw!, shift, preferFlats)
        : raw!;
    const prev = cues[cues.length - 1];
    // Two events on the same beat (different lines, a repeat boundary): the
    // first one wins — you can't strum two chords at once.
    if (prev && Math.abs(prev.startBeat - item.absBeat) < EPS) continue;
    cues.push({ symbol, startBeat: item.absBeat, endBeat: timeline.totalBeats });
    if (prev) prev.endBeat = item.absBeat;
  }
  return cues;
}

/**
 * The hits that fall in the playback window `(fromPos, toPos]`, ready to be
 * scheduled. Called every frame with a short lookahead window, so a tempo change
 * mid-song only affects notes that hadn't been queued yet.
 *
 * Mode decides what a cue contributes:
 *   - `once`   — one decaying hit on the cue's beat
 *   - `held`   — one sustaining hit, silenced by whatever comes next
 *   - `repeat` — a hit on the cue's beat and on every whole beat until the next
 * A stop cue always contributes a single silencing hit, in every mode. So does
 * the end of a non-looping song, so nothing rings on past the last bar.
 */
export function chordHits(
  cues: ChordCue[],
  map: PlayMap,
  mode: ChordSoundMode,
  fromPos: number,
  toPos: number,
): ChordHit[] {
  const out: ChordHit[] = [];
  if (toPos <= fromPos || !cues.length) return out;

  const collect = (spanStart: number, spanEnd: number, posOffset: number) => {
    // pos = posOffset + (songBeat - spanStart)
    const posAt = (b: number) => posOffset + (b - spanStart);
    const push = (posBeat: number, symbol: string | null, sustain: boolean) => {
      if (posBeat > fromPos + EPS && posBeat <= toPos + EPS) out.push({ symbol, posBeat, sustain });
    };

    for (const cue of cues) {
      if (cue.endBeat <= spanStart + EPS || cue.startBeat >= spanEnd - EPS) continue;
      // A cue already in force when the span begins still sounds — starting
      // mid-chord should play that chord, not wait for the next one.
      const onset = Math.max(cue.startBeat, spanStart);
      const until = Math.min(cue.endBeat, spanEnd);
      push(posAt(onset), cue.symbol, mode === 'held' && cue.symbol !== null);
      if (mode === 'repeat' && cue.symbol !== null) {
        for (let b = Math.floor(onset) + 1; b < until - EPS; b += 1) {
          if (b > onset + EPS) push(posAt(b), cue.symbol, false);
        }
      }
    }
    // Nothing rings past the end of the run.
    push(posAt(spanEnd), null, false);
  };

  if (map.loop && map.loop.lengthBeats > EPS) {
    const { startBeat, lengthBeats } = map.loop;
    const first = Math.max(0, Math.floor((fromPos - map.countIn) / lengthBeats));
    const last = Math.max(first, Math.floor((toPos - map.countIn) / lengthBeats));
    for (let pass = first; pass <= last; pass++) {
      collect(startBeat, startBeat + lengthBeats, map.countIn + pass * lengthBeats);
    }
  } else {
    collect(map.from, map.totalBeats, map.countIn);
  }

  out.sort((a, b) => a.posBeat - b.posBeat);
  return out;
}
