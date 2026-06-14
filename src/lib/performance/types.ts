// Performance-view plug-in contract.
//
// A "performance view" is one way to read a song while playing/teaching: the
// default full-lyrics scroll view today; ticker-scroll, fixed-line
// teleprompter, two-column, etc. tomorrow. Each view is a self-contained
// module that registers itself; the Perform shell owns the chrome (top bar,
// transpose/zoom/play controls, wake lock, prev/next) and just renders whichever
// view is selected. Adding a view = write a component + call `registerView`.
// Nothing in the shell needs to change.

import type { ComponentType } from 'react';
import type { LucideIcon } from 'lucide-react';
import type { Song, TimeSignature } from '@/types';
import type { ChordClick } from '@/components/chords/ChordLine';

/**
 * The shared musical clock the shell owns (built on the metronome engine). A
 * `beatClock` view drives its motion from `getPosition()` — quarter-note beats
 * since play started — so the visual scroll is locked to the audible click. The
 * metronome control in the shell footer is this transport's play/tempo UI.
 */
export type Transport = {
  playing: boolean;
  tempo: number;
  timeSignature: TimeSignature;
  /** Continuous position in quarter-note beats since play started; 0 when stopped. */
  getPosition: () => number;
  toggle: () => void;
  setTempo: (bpm: number) => void;
};

/** Shared playback clock the shell owns and views react to. */
export type PlaybackState = {
  /** Whether auto-advance (e.g. scrolling) should run. */
  playing: boolean;
  /**
   * Speed control, 0.25–4. A neutral multiplier the view maps to its own
   * motion (px/sec, lines/min, …). Views that derive from the song tempo can
   * read `song.tempo` and treat this as a fine-tune factor.
   */
  speed: number;
};

/** Everything a view needs to render. The shell supplies all of it. */
export type PerformanceViewProps = {
  song: Song;
  /** Semitone transpose applied to chords (and key display). */
  transpose: number;
  /** Enharmonic preference for chord spelling. */
  preferFlats: boolean;
  /** Font size multiplier from the shell's zoom control (0.5–3). */
  fontScale: number;
  /** Shared play/speed clock. Views implement motion from this. */
  playback: PlaybackState;
  /** Beat-accurate transport (metronome clock). Used by `beatClock` views. */
  transport: Transport;
  /** Called when auto-motion reaches the end, so the shell can stop/advance. */
  onReachEnd?: () => void;
  /** Chord taps (open the chart popover). Optional per view. */
  onChordClick?: ChordClick;
};

/** Which shell controls a view wants shown. Keeps the chrome relevant. */
export type ViewCapabilities = {
  /** Show the play/pause + speed control (view animates from `playback`). */
  autoScroll?: boolean;
  /** Show the font-size zoom control. */
  zoom?: boolean;
  /** Show the transpose +/- control. */
  transpose?: boolean;
  /**
   * View drives its motion from the shared beat `transport` (the metronome
   * clock) rather than the shell's px/sec auto-scroll. The shell hides its
   * auto-scroll play/speed controls; the metronome button is the play control.
   */
  beatClock?: boolean;
};

export type PerformanceViewDef = {
  /** Stable id persisted in settings as the user's preferred view. */
  id: string;
  name: string;
  description: string;
  icon: LucideIcon;
  capabilities: ViewCapabilities;
  component: ComponentType<PerformanceViewProps>;
};
