# TTN Chords — Product Spec & Build Plan

A local-first PWA for a music teacher running **group song-playing**: author
songs with lyrics, chords, and rhythms; show clickable chord charts for the
player's chosen instrument; group songs into setlists; and generate printable
multi-page PDF songbooks/handouts.

Sibling to [ttn-list](https://github.com/timtomnow/ttn-list); it deliberately
reuses that app's stack, conventions, and **ttn-backup** integration so both
live under the same domain and back up the same way.

---

## 1. Product pillars

1. **Songs first.** Fast CRUD, fast bulk entry, clean reading view.
2. **Accurate music.** ChordPro-compatible model with **beat-accurate timing**
   (down to 1/16 and finer) as a first-class, optional layer.
3. **Playable.** Clickable chord names → chord charts for the user's instrument
   (guitar, ukulele, bass, piano to start; user-extensible).
4. **Printable.** A report generator that lays out songs, charts, logos/images,
   and rhythm patterns across **multiple pages**, exported to PDF.
5. **Yours, offline, portable.** No backend; IndexedDB; JSON export/import; full
   ttn-backup compatibility.

---

## 2. Stack & key decisions

| Concern        | Choice                                  | Notes |
| -------------- | --------------------------------------- | ----- |
| Build/UI       | Vite + React 18 + TypeScript (strict)   | Mirrors ttn-list. |
| Styling        | Tailwind, mobile-first, `darkMode:class`| One responsive layout; light/dark from day one. |
| Theming        | CSS-variable **accent** token           | User-selectable accent (Settings); `accent` + `accent.fg` re-theme the app. See `src/lib/accent.ts`. |
| Routing        | react-router-dom v6                      | `BASE_URL` basename for GitHub Pages. |
| Persistence    | Dexie (IndexedDB)                        | Reactive reads via `dexie-react-hooks`. |
| Reorder/DnD    | @dnd-kit                                 | Sections, setlist entries, report blocks. |
| PWA            | vite-plugin-pwa (`autoUpdate`)          | Installable, offline. |
| Backup         | ttn-backup adapter + JSON export/import | `appId: 'ttn-chords'`. |
| Icons          | lucide-react                            | |
| ChordPro       | Custom parser/serializer (our model)    | No heavyweight dep; we need the beat-timing extension. Revisit if a lib proves better. |
| Chord charts   | Custom SVG renderer + bundled library   | Tuning-driven so new instruments need no code. |
| PDF engine     | **OPEN DECISION** (Phase 8)             | Must support multi-page. Candidates: browser print-to-PDF (zero-dep, recommended) vs. pdf-lib/jsPDF/react-pdf. Decide at Phase 8. |

> **No new top-level deps** without updating this table and noting the tradeoff.
> **Bump the Dexie version** in `schema.ts` + add a migration on any stored-shape
> change.

---

## 3. Data model

Source of truth: [`src/types.ts`](src/types.ts). Tables: [`src/db/schema.ts`](src/db/schema.ts).

```
Song ── sections[] ── lines[] ── events[] (ChordEvent: chord + charIndex + optional beat)
Setlist ── entries[] (SetlistEntry: songId + per-performance transpose/capo/notes)
RhythmPattern (reusable strum grid; attached to sections)
Instrument (user-defined; bundled instruments are static data)
ChordDefinition (user-defined/overridden charts; bundled charts are static data)
ReportTemplate ── pages[] ── blocks[]
Photo (Blob; logos/images; base64 only on export)
AppSettings (singleton: accent, myInstrument, defaults)
```

### Timing model (the important bit)

- A `ChordEvent` carries an optional **`beat: { n, d }`** — an *exact rational*
  number of quarter-note beats from the start of its section. Rational, not
  float, so 1/16s, triplets, and dotted values are exact and round-trip.
- This is **forward-compatible with full notation**: a position-only event
  becomes a full note later by adding an optional `duration: Beats` (+ rests,
  ties). Nothing stored has to change meaning — additive only. Strum/rhythm
  notation already has its own `RhythmPattern` grid that can grow to per-string
  notation the same way. **This door is intentionally left open.**

### Bundled vs. user data

- Common chord charts and the default instruments (guitar/ukulele/bass/piano)
  ship as **static data** in `src/lib/chords/` — versioned in code, not in the
  DB, so backups stay small. The `instruments` / `chordDefinitions` tables hold
  only **user-created or user-overridden** entries.

---

## 4. Phases

Each phase is intentionally independent and ends in a buildable, lintable state.
Run `npm run check` before declaring a phase done. **Claude makes no git commits
this project** — at the end of a task, output a commit title + description for
review.

### Phase 0 — Scaffold & infrastructure ✅ (this session)
Vite/React/TS/Tailwind/Dexie/PWA wiring; responsive AppShell (sidebar + bottom
nav); light/dark theme; accent-color system; ttn-backup adapter; JSON
export/import; full `types.ts` data model; Dexie schema v1; minimal live Songs
CRUD; Settings (theme, accent, backup). Placeholder pages for Setlists/Reports.

### Phase 1 — Chord & music foundation ✅
- `src/lib/music.ts`: pitch-class utilities, **transpose** (key-aware
  enharmonics), capo math, chord-symbol parsing (root/quality/slash-bass),
  chord-tone spelling.
- `src/lib/chords/`: bundled guitar + ukulele shapes; computed bass root-note &
  piano diagrams; builtin instruments; `resolveChord()` (user → bundled →
  computed → null). User instruments/charts via `db/repo.ts`.
- Tests: `music.test.ts`, `chords/chords.test.ts`.

### Phase 2 — ChordPro engine ✅
- `src/lib/chordpro.ts`: parse ChordPro → `Section[]`/`Line[]`/`ChordEvent[]`
  and serialize back. Metadata + section directives + inline `[Chord]` anchors.
- **Beat-timing extension implemented** — see "ChordPro beat syntax" below.
- Round-trip tests in `chordpro.test.ts` (parse → serialize → parse stable).

### Phase 3 — Song editor ✅
- Metadata form (title, artist, key, capo, tempo, time signature, tags) with
  debounced autosave + "Saved" indicator.
- Section editor: add/remove/reorder (dnd-kit), kind/label per section.
- Per-section ChordPro body editing with a **live chords-over-lyrics preview**
  (`ChordLine`, shared with the future read view/reports). One responsive
  layout (stacked on mobile, side-by-side on desktop).
- ChordPro import/paste → new draft song (`SongList` import modal).
- **Deferred to later polish:** tap-to-place visual chord insertion and a
  per-event beat-assignment UI (the data + text syntax already support both;
  this is an editor affordance, see Phase 11 / parking lot).

### Phase 4 — Chord charts ✅
- SVG renderers: `FretboardChart` (tuning-driven; nut/position/barres/open/mute
  + finger numbers) and `KeyboardChart` (root in accent color). `ChordChart`
  switch wrapper.
- `SongView` read page: metadata, transpose +/−, a chord-chart strip of every
  chord used, and clickable chord names that open `ChordPopover` (portal,
  viewport-clamped). Songs now route `/songs/:id` (read) + `/songs/:id/edit`.
- `useChartResolver` bridges DB (my-instrument + user instruments + user defs)
  to `resolveChord`. "My instrument" setting drives charts everywhere.
- `InstrumentSettings`: pick my instrument, add custom instruments
  (tuning-driven), and add/override/delete chord charts via `CustomChordEditor`
  (per-string fret editor with live preview; keyboard derives from the symbol).
- `lib/song.ts` `uniqueChords()` helper + tests.

### Phase 5 — Song reading / performance view ✅
- **Pluggable performance-view architecture** (`src/lib/performance/`): a
  registry of self-registering view modules + a `PerformShell` that owns all
  chrome (top bar, view switcher, transpose/zoom/play+speed, wake lock,
  optional setlist prev/next) and renders whichever view is selected. Adding a
  new reading view = write a component implementing `PerformanceViewProps` and
  call `registerView()` — **zero shell changes**. Each view declares
  `ViewCapabilities` so the shell only shows relevant controls.
- Built-in views: **Scroll** (full chords+lyrics, zoom, tempo-based auto-scroll
  fine-tuned by a speed control) and **Lyrics** (big centered lyrics only) — the
  second one exists to prove the plug-in path.
- Screen Wake Lock during performance (`useWakeLock`, mirrored from ttn-list);
  preferred view id persisted in settings.
- Future view ideas (ticker/cross-screen scroll, fixed-line teleprompter,
  two-column) slot straight into the registry — see parking lot.

### Phase 6 — Setlists ✅
- `SetlistList` + `SetlistEditor`: create, rename/describe, add songs (multi-
  select modal), reorder (dnd-kit), and per-entry **transpose / capo / notes**
  overrides (non-destructive to the song).
- `SetlistRun`: walks entries through the shared `PerformShell` with a
  `SetlistNav` (prev/next + per-entry transpose); gracefully handles a
  deleted-song slot with a skip option.
- `useSongsByIds` repo hook for batch song lookup.

### Phase 7 — Rhythm patterns ✅
- **Custom model** — strum direction (down/up/mute/accent) has no standard in
  ChordPro or other lightweight formats (ChordPro's `{sog}` grid carries
  bars/beats/chords but no strum direction). So this is built from scratch on
  the `RhythmPattern` grid type, kept a strict subset of future per-string
  notation. (A ChordPro grid import bridge is parked for later — see §6.)
- `lib/rhythm.ts`: grid helpers (`makeSteps`, `resizeSteps`, `cycleStroke`,
  stroke metadata) + tests (`rhythm.test.ts`).
- `RhythmPatternEditor`: tap-to-cycle grid editor with adjustable meter +
  subdivision (quarter/eighth/triplet/sixteenth) and a live preview.
- `RhythmChart`: compact, self-contained **placeable box** (stroke glyphs over a
  beat ruler, bar/beat lines, label) — the reusable unit for the read view,
  performance views, and (Phase 8) drag-drop onto reports.
- Library managed in Settings (`RhythmSettings`). Patterns attach to song
  sections (select in the editor header, with inline "+ New pattern…"). Shown
  per section in `SongView` and the Scroll performance view.
- `useRhythmPatterns` / `useRhythmPattern` / `useRhythmPatternsByIds` + CRUD in
  `db/repo.ts`.

### Phase 8 — Report generator (PDF) — multi-page required
- Page-oriented editor: pages → blocks (song, chordChart, image, logo, rhythm,
  text, spacer); drag to arrange; page size/orientation.
- Logos/images from the `photos` table.
- **Decide the PDF engine here** (print-to-PDF vs. library) — must support
  multi-page layout and page breaks cleanly. Record the decision in §2.

### Phase 9 — Import from a song URL (e.g. Ultimate Guitar)
- Given a URL, pull lyrics/chords into an editable **draft** song.
- **Constraint:** direct client-side fetch of third-party sites is blocked by
  CORS. Plan the path: (a) paste-the-page fallback that parses common formats;
  (b) optional user-provided/self-hosted CORS proxy; (c) site-specific
  extractors behind a normalizer that always outputs our ChordPro model. Treat
  imports as drafts to be cleaned up; never trust source formatting.

### Phase 10 — Bulk song entry
- Paste many songs at once (ChordPro multi-song or a delimited batch) → preview
  → bulk create. Batch JSON import of a song pack.

### Phase 11 — Branding & polish
- Real branded icons (replace placeholder SVGs; generate the PNG sizes the
  manifest references). Empty states, keyboard shortcuts, a11y pass, perf.

---

## 5. Conventions (see CLAUDE.md for the full list)
- Never call Dexie from a component — go through `src/db/repo.ts`.
- Reactive reads via `useLiveQuery`. IDs via `newId()` in the repo. Dates are
  unix-ms; format at the view layer. Photos are Blobs; base64 only on export.
- Tailwind classes only (dynamic positioning is the rare `style={{}}` exception).
- One responsive layout for mobile + desktop; never two parallel UIs.

## ChordPro beat syntax (finalized in Phase 2)

Our one extension to ChordPro is an optional `@beat` suffix inside a chord
bracket, giving an exact metric onset measured in **quarter-note beats from the
start of the section**:

- `[G@2]` — chord G at beat 2 (integer).
- `[C@1.5]` — decimal; snapped to an exact rational (1/16 + triplet denominators
  supported), so it round-trips losslessly.
- `[Am@3/2]` — explicit fraction.
- `[@2]` — empty chord = a rhythm-only onset (a strum/hit, no chord change).

The display anchor (`charIndex`, where the chord sits above the lyric) and the
metric onset (`beat`) are independent. Standard ChordPro without `@` parses
exactly as before. This maps to `ChordEvent.beat: { n, d }` and is a strict
subset of a future full-notation model (add `duration` later — additive only).

## 6. Open questions / parking lot
- PDF engine (Phase 8).
- Editor affordances: tap-to-place chords and a visual per-event beat picker
  (syntax + storage already done in Phases 2–3; this is UI sugar).
- More performance views (registry already supports them — Phase 5): ticker /
  cross-screen scroll, fixed-line teleprompter (N lines at a time, alignment
  options), two-column, auto-scroll that follows the beat-timing layer instead
  of a flat px/sec rate.
- ChordPro grid (`{start_of_grid}`/`{sog}`) import bridge → map bars/beats/
  chords onto the beat-timing layer (independent of strum patterns, Phase 7).
- Audio playback / click track off the timing layer? (future)
- Chord-chart auto-generation from a chord symbol when no diagram exists
  (already done for bass/piano via computed shapes; consider for guitar/uke).
