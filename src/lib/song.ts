// Song-level helpers that operate on the structured model (sections/lines/
// events). Pure; shared by the editor, read view, and reports.

import type { Section } from '@/types';
import { transposeChordSymbol } from '@/lib/music';

/**
 * Distinct chord symbols used across a song's sections, in first-appearance
 * order, optionally transposed. Rhythm-only events (empty chord) are skipped.
 */
export function uniqueChords(
  sections: Section[],
  transpose = 0,
  preferFlats = false,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const section of sections) {
    for (const line of section.lines) {
      for (const ev of line.events) {
        if (!ev.chord) continue;
        const sym = transpose
          ? transposeChordSymbol(ev.chord, transpose, preferFlats)
          : ev.chord;
        if (!seen.has(sym)) {
          seen.add(sym);
          out.push(sym);
        }
      }
    }
  }
  return out;
}
