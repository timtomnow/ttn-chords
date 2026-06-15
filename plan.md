# TTN Chords — Product Spec & Build Plan

A local-first PWA for a music teacher running **group song-playing**: author
songs with lyrics, chords, and rhythms; show clickable chord charts for the
player's chosen instrument; group songs into setlists; and generate printable
multi-page PDF songbooks/handouts.

Sibling to [ttn-list](https://github.com/timtomnow/ttn-list); it deliberately
reuses that app's stack, conventions and **ttn-backup** integration so both
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
| PDF engine     | **Browser print-to-PDF** (CSS `@page`)  | Decided in Phase 8. Zero new deps; renders our React SVG chord/rhythm charts faithfully (a PDF library would mean redrawing every chart). The print view injects a per-template `@page` size+**margin** rule so margins repeat on every physical sheet; long flow content spills cleanly. Caveat: no CSS margin-box page counters in browsers, so `{page}`/`{pages}` resolve to **explicit-page** numbers, not physical sheets (see Phase 8 notes). |
| Report drag/resize | **react-rnd** (floating blocks)     | Added in the Phase-8 editor rework. Purpose-built draggable+resizable boxes with a `scale` prop that fixes the cursor/zoom mismatch and gives real resize handles. Replaced hand-rolled pointer dragging (which selected text and lagged the cursor). Flow-block reordering still uses @dnd-kit. |
| In-app help    | **react-markdown** + **remark-gfm** + **@tailwindcss/typography** | Phase 14. Renders the Markdown user guides (`src/content/help/*.md`) for the in-app Help section, inlined at build via `import.meta.glob` (no runtime fetch); typography plugin styles them (`prose`). Tradeoff: 3 deps vs. hand-rolling a Markdown renderer — chosen for GFM correctness (tables/links) and consistency with other TTN apps' help. |

> **No new top-level deps** without updating this table and noting the tradeoff.
> **Bump the Dexie version** in `schema.ts` + add a migration on any stored-shape
> change.

---

## 3. Data model

Source of truth: [`src/types.ts`](src/types.ts). Tables: [`src/db/schema.ts`](src/db/schema.ts).

```
Song ── difficulties[] (SongDifficulty: level 1–5 + sections[]) ── lines[] ── events[]
        (ChordEvent: chord + charIndex + optional beat)
Setlist ── entries[] (SetlistEntry: songId + difficultyId? + per-performance transpose/capo/notes)
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
- **Starter library bundles** (`src/lib/library/`) ship songs/setlists as static
  data too, but they are **opt-in**: the user *syncs* a bundle (Settings →
  Starter library) and its songs are imported into the `songs` table as real
  rows. Conflicts (same title+artist) prompt overwrite vs. `_N` duplicate; nothing
  the user already has is touched unless they choose to overwrite.

### Difficulty variants

- A **Song** holds `difficulties: SongDifficulty[]` (always ≥1), each a level-1–5
  variant with its **own** `sections` (chords + beat timing). Resolve with
  `lib/song.ts` `sectionsOf()` / `getDifficulty()`; the Perform view + read view
  toggle between variants; each is tagged for beats independently. Pre-v3 songs
  migrate their flat `sections` into one level-3 default variant (Dexie v3).

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
- `RhythmPatternEditor`: brush-palette grid editor (pick a brush, tap cells to
  paint; tap again to clear) with adjustable meter + subdivision
  (quarter/eighth/triplet/sixteenth) and a live preview.
- `RhythmChart`: compact, self-contained **placeable box** (stroke glyphs over a
  beat ruler, bar/beat lines, label) — the reusable unit for the read view,
  performance views, and (Phase 8) drag-drop onto reports.
- Library managed in Settings (`RhythmSettings`). Patterns attach to song
  sections (select in the editor header, with inline "+ New pattern…"). Shown
  per section in `SongView` and the Scroll performance view.
- `useRhythmPatterns` / `useRhythmPattern` / `useRhythmPatternsByIds` + CRUD in
  `db/repo.ts`.

### Phase 7B — User-defined rhythm symbols ✅
- New `RhythmSymbol` entity + `rhythmSymbols` table (Dexie **v2**, additive
  migration; added to JSON export/import + ttn-backup payload).
- A `StrumStep` may now carry a `customId` referencing a user symbol; built-in
  strokes stay hardcoded and valid. `resolveCell()` renders either, with a
  placeholder fallback if a symbol was deleted (+ tests).
- Admin section in Settings (`RhythmSymbolSettings`): add/edit/delete symbols
  (e.g. continue `/`, quick stop `!`); built-ins listed read-only for reference.
- Custom symbols appear as **brushes** in the pattern editor and render in
  `RhythmChart` everywhere (read view, performance, settings) via the symbol map.

### Phase 8 — Report generator (PDF) — multi-page required ✅
Decisions locked with the teacher up front (all "recommended" options):
explicit pages with spill; two-tier flow + floating blocks; browser
print-to-PDF; live song references; template-level header/footer with tokens +
first-page-different; a report-scoped block registry mirroring the Phase-5
performance-view pattern.

- **Block registry** (`src/lib/report/`): each block type self-registers a
  descriptor (`type`, label, icon, `defaultPlacement`, `defaultConfig`,
  `Render`, optional `Editor`) via `registerBlock()` — mirrors the performance-
  view registry. Adding a block = one module in `blocks/` + an entry in
  `blocks/index.ts`; the editor palette, canvas and print view need no changes.
  Built reuse-aware (the descriptor could later feed on-screen layouts) but kept
  report-scoped. Built-in blocks: **song, text, chordChart, rhythm, image,
  spacer**.
- **Two-tier placement** (`BlockPlacement`): `flow` blocks stack in the page's
  column (dnd-kit reorder, drag handle) and reflow; `floating` blocks are
  free-dragged (pointer math via the content-box rect, so it's scale-safe) with
  a width handle. Floating x/y/w are **percentages of the content box**, resolved
  against the nominal sheet so floats stay anchored even when flow content spills.
- **Pages + spill**: explicit pages you add/remove; `ReportPageSurface` uses
  `min-height` (never clips), so a long flow column grows the page and the print
  stylesheet paginates it onto a continuation sheet. `break-after: page` between
  explicit pages; `break-inside: avoid` on song sections.
- **Geometry** (`lib/report/geometry.ts`): Letter/A4/Legal × portrait/landscape
  at 96dpi; the editor surface equals the printed sheet 1:1.
- **Header/footer** (`ReportChrome` + `lib/report/tokens.ts`): per-template
  bands (left/center/right) with `{page} {pages} {title} {date}` tokens and a
  first-page-different toggle. Rendered as in-flow bands (browsers don't support
  CSS margin-box page counters), so `{page}` = explicit-page index. Caveat: a
  spilled page repeats its header/footer only at the start/end of its content,
  not per physical sheet — acceptable for the one-song-per-page common case.
- **Live song references**: a song block stores `songId` + view options
  (transpose, which sections, show charts/rhythm/chords-over-lyrics); edits flow
  in, a deleted song degrades to a gentle placeholder (like `SetlistRun`).
- **Images**: `image` block stores a `photoId`; photos live in the `photos`
  table (Blob, base64 only on export). Upload + a small library picker in the
  block inspector (`createPhoto`/`deletePhoto`/`usePhotoUrl`).
- **Print view** (`/reports/:id/print`): a top-level route **outside the app
  shell** (more specific than `/reports/*`, so it wins) that renders the pages,
  injects the `@page` rule, and calls `window.print()`. Print CSS in `index.css`.
- **Create flows**: blank, **from a song** (one page), or **from a setlist**
  (one page per entry, with a `{title} … Page {page} of {pages}` footer).
- Data: `ReportTemplate`/`ReportPage`/`ReportBlock`/`BlockPlacement`/
  `ReportChrome` fleshed out in `types.ts`. `reportTemplates` already existed in
  Dexie **v2** and only gained non-indexed fields, so **no version bump** was
  needed; it's already in JSON export/import + the ttn-backup payload.

**Phase 8 editor rework (UX/robustness pass).** The first editor pass was riddled
with interaction bugs; the interaction layer was rebuilt (data model, registry,
blocks and print engine kept):
- **Floating blocks now use `react-rnd`** (drag + 8-handle resize, `scale`-aware
  so it tracks the cursor under the canvas zoom). Replaced hand-rolled pointer
  dragging that selected text and lagged.
- **One size mechanism per placement:** floating = resize the box (drag handles +
  W/H fields); flow = a "Size" scale slider (`ReportBlock.scale` via `ScaleBox`).
  No more competing controls.
- **Shared `PageFrame`** renders the page shell for both the editor and print, so
  geometry/margins/bands can't drift. The page model is now a "paper" wrapper
  (visual margin) around a content-box `.report-page`.
- **Discrete measured sheets (pagination engine):** the editor AND the `/print`
  preview render each explicit page as a stack of real physical **sheets**, each
  with correct margins and repeating header/footer bands. `useBlockHeights`
  measures flow blocks in a hidden, content-width measure layer; the pure
  `paginate()` (`src/lib/report/paginate.ts`, unit-tested) packs whole blocks onto
  sheets, never splitting a block across a sheet (matches print's
  `break-inside: avoid`). This is what makes the preview margin-accurate and the
  break positions exact — superseding the earlier continuous-spill guides.
- **Sever:** a block taller than one sheet shows a "✂ Sever to new page" button.
  Severing splits it onto a NEW explicit page so the remainder can be laid out
  independently: a **song** splits at the last section that fits (reusing
  `sectionIds`), anything else moves whole. Print still uses `@page { margin }`
  as the safety net for any un-severed overflow.
- **Input/sizing fixes:** the chord-chart field stores raw text (typing commas
  works); image blocks carry an explicit floating height; print container
  hardened (no more `position:absolute` clipping).
- New dep **react-rnd** (recorded in §2). Canvas has zoom (−/+/Fit) + a
  collapsible inspector to cope with the shell's width.

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

### Phase 12 — Highway (side-scrolling) view + play-along beat tagging ✅
A beat-synced, horizontally scrolling reading view plus an easy way to put the
beat-timing layer onto a song. No new deps, no Dexie bump (built entirely on the
existing `ChordEvent.beat` layer, `Song.tempo`/`timeSignature`, the metronome
engine, and the performance-view registry).

- **`src/lib/timeline.ts`** (pure, unit-tested): `buildTimeline(song, defaults)`
  flattens the per-section beats into one absolute, quarter-note-beat timeline —
  resolves each section's effective tempo/time-signature (section → song →
  defaults), rounds each section to whole bars, lays sections end-to-end
  (honouring `section.repeat`), and returns timed `items`, the `bars` grid, and
  `sections` spans. `quarterBeatsPerBar` (4/4=4, 6/8=3…) and `hasAnyBeats` too.
- **Shared transport:** `MetronomeEngine` gained a continuous, tempo-change-aware
  `getPositionBeats()` (read off the audio clock) surfaced through `useMetronome`
  as `getPosition()`. `PerformShell` now owns a single metronome instance and
  passes a `Transport` (`getPosition`, tempo, time signature, toggle, setTempo)
  to views via `PerformanceViewProps`; `PerformMetronome` became the
  presentational control bound to it. A new `beatClock` view capability marks
  views that derive motion from the transport (the shell hides its px/sec
  auto-scroll controls for them).
- **`HorizontalView`** (`components/performance/views/HorizontalView.tsx`,
  registered id `horizontal` / "Highway"): chords on a beat grid with lyrics
  lane-packed beneath (up to 3 rows so close words never overlap), a fixed
  playhead, and a scroll position derived each rAF frame from a view-owned play
  origin + `transport.getPosition()` so it scrolls locked to the click. The view
  owns the transport (play/pause in its toolbar) and adds: **free scrolling when
  stopped** (native horizontal scroll) with a **click-the-ruler-to-set-start**
  affordance and a green start marker; a **Jump to…** section dropdown; a
  **Loop** toggle (loops the section containing the start point); a **0/4/8-beat
  count-in** that runs each time play starts (persisted in
  `AppSettings.horizontalCountIn`); and an **Edit** mode that drag/nudge/clears
  chord onsets on a 1/4·1/8·1/16 grid and writes straight back via `updateSong`
  (the same beat editing as the tag-beats fine-tune step). A 4/8-bar window
  control (`AppSettings.horizontalBars`); transpose + chord popover via the
  shell. Untimed songs show a "Tag beats" prompt.
- **`TagBeats`** (`pages/songs/TagBeats.tsx`, route `/songs/:id/tag`, button in
  `SongView`): single-tap play-along tagging — one-bar count-in, then tap a big
  button (or Space) on the beat per chord; onsets read from the transport,
  converted per section to section-relative beats snapped to a 1/16 grid
  (reusing `parseBeat`). A fine-tune editor then lets you drag each chord on the
  grid (1/4 · 1/8 · 1/16 snap), nudge, or clear before saving. This also
  delivers the long-parked "visual per-event beat picker".

### Phase 13 — Starter library, difficulty variants, perform-view polish ✅
Distribute the app pre-loaded and broaden who can use it. Dexie **v3** (one
migration: wrap each song's flat `sections` into a default difficulty).

- **Editable tempo** (`src/components/inputs/TempoInput.tsx`): click the BPM
  number to type a new value (string-backed so it can go blank; reverts on
  blank/invalid), keeping −/+ buttons. Used in the Perform metronome, the
  standalone Metronome tool, and Tag beats.
- **In-perform metronome settings**: `MetronomeSettingsFields` factored out of
  `MetronomePanel`; a gear button in `PerformShell` opens a sheet to change
  flash/colors/sound/voice/volume live (persists to `AppSettings.metronome`).
- **Admin / authoring mode** (`AppSettings.adminMode`, `useAdminMode()`):
  Settings toggle (default off). Light users get a read+perform UI (bundle sync
  still allowed); admins get create/edit/tag/delete + library managers. A
  stepping stone to future teacher/student roles.
- **Song difficulty variants** (`Song.difficulties[]`, `SongDifficulty`): per-song
  level-1–5 arrangements, each with its own sections + beat timing. Switcher in
  the Perform shell + read view; `SongEditor` difficulty manager (add / duplicate
  / level / label / default / delete); `TagBeats` tags a chosen variant
  (`?d=<id>`). Helpers in `lib/song.ts` (`sectionsOf`, `getDifficulty`,
  `sortedDifficulties`, `makeDifficulty`); `buildTimeline`/`hasAnyBeats` take an
  optional `difficultyId`; report song block + setlist entries can pin a variant.
  Beat writes go through `repo.updateDifficultySections`.
- **Starter library bundles** (`src/lib/library/`): static `SongBundle`s
  (`listBundles()`); opt-in **Sync** in Settings imports a bundle's songs as real
  rows. Pure planner (`planBundleImport`, `nextDuplicateTitle`, unit-tested) +
  `repo.importBundle` (one transaction, title+artist conflict → overwrite vs.
  `_N` duplicate, apply-to-all or per-song; setlist song refs remapped). Legacy
  JSON/backup imports normalize old flat-`sections` songs to the v3 shape.

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
- ~~PDF engine (Phase 8)~~ — decided: browser print-to-PDF (see §2 + Phase 8).
- **Report polish (post-Phase 8):** per-physical-sheet headers/footers would
  need a paged-media polyfill (e.g. paged.js) — deferred to keep the zero-dep
  print path. Editor zoom / fit-to-width (canvas currently scrolls at 1:1).
  Floating-block resize is width-only today. Manual page breaks inside a flow.
- **Reuse the block registry for on-screen layouts:** the report block
  descriptor (`src/lib/report/types.ts`) was built reuse-aware; a future
  customizable per-song screen view could share it with the Phase-5 performance-
  view registry. Intentionally NOT coupled in Phase 8.
- Editor affordances: tap-to-place chords (a visual per-event beat picker is now
  done — see Phase 12's TagBeats fine-tune editor).
- More performance views (registry already supports them — Phase 5): ~~ticker /
  cross-screen scroll~~ (done, Phase 12 Highway) / fixed-line teleprompter (N
  lines at a time, alignment options) / two-column. ~~auto-scroll that follows
  the beat-timing layer~~ (the Highway does, via the shared transport).
- ChordPro grid (`{start_of_grid}`/`{sog}`) import bridge → map bars/beats/
  chords onto the beat-timing layer (independent of strum patterns, Phase 7).
- Audio playback / click track off the timing layer? (future)
- Chord-chart auto-generation from a chord symbol when no diagram exists
  (already done for bass/piano via computed shapes; consider for guitar/uke).
