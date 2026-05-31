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
import type { Song } from '@/types';
import type { ChordClick } from '@/components/chords/ChordLine';

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
