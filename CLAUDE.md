# CLAUDE.md

Notes for future Claude (or human) sessions working on this project.

## What this is
**TTN Chords** — a local-first PWA for a music teacher running **group
song-playing**. Author songs (lyrics + chords + rhythms), show clickable chord
charts for the player's instrument, group songs into setlists, and generate
printable multi-page PDF songbooks. Sibling to **ttn-list**; same stack,
conventions, and **ttn-backup** integration. See [plan.md](plan.md) for the
full spec and the phased build plan — **read it first**; it says which phases
are done and what each remaining phase is.

## Session rule that matters
- **Claude makes no git commits on this project.** When a task is done, write a
  proposed commit title + description for review instead of committing.

## Quick start
```bash
npm install
npm run dev          # http://localhost:5174
npm run build        # production build (also generates the service worker)
npm run preview      # serve the production build to test PWA install
npm run typecheck
npm run check        # lint + typecheck + test + build
```

## Stack
- **Vite + React 18 + TypeScript** (strict)
- **Tailwind CSS** — mobile-first, `darkMode: 'class'`, light/dark from day one
- **Accent theming** via CSS variables (`--accent-rgb` / `--accent-fg-rgb`) so a
  single Tailwind `accent` token re-themes everything; user picks it in Settings
- **react-router-dom v6** (basename = `import.meta.env.BASE_URL`)
- **Dexie** (IndexedDB) + **dexie-react-hooks** `useLiveQuery` — no backend
- **@dnd-kit** for reordering
- **vite-plugin-pwa** (`autoUpdate`)

## Code map
```
src/
  app/             App (routes), theme provider
  components/
    layout/        AppShell, Sidebar, BottomNav, Logo, nav (shared nav list)
    ui/            PageHeader, EmptyState (more per phase)
    chords/        chord-chart renderers (Phase 4)
    inputs/        shared inputs (per phase)
  db/
    schema.ts      Dexie database (versioned, all tables)
    repo.ts        typed CRUD + useLiveQuery hooks — components import from here
    exportImport.ts table-driven JSON export/import (base64 photos)
  lib/
    id.ts          newId()
    accent.ts      accent palette + applyAccent()
    tags.ts        tag normalize/add/remove
    ttnBackup.ts   window.TTNBackupAdapter install + restore opener
    chords/        bundled chord library + instrument defaults (Phase 1)
    music.ts       transpose / chord parsing (Phase 1)
    chordpro.ts    ChordPro parse/serialize (Phase 2)
  pages/           Songs, Setlists, Reports, Settings (sub-routes per phase)
  types.ts         All entity types — one source of truth
```

## Data model (summary)
Full detail in `src/types.ts` and plan.md §3.
- **Song** → `sections[]` → `lines[]` → `events[]`. A `ChordEvent` has a chord
  symbol, an optional `charIndex` (ChordPro display anchor) and an optional
  **`beat: {n,d}`** — an exact rational number of quarter-note beats from the
  section start. That timing layer is forward-compatible with full notation
  (add `duration` later; additive only) — **do not break that invariant.**
- **Setlist** → `entries[]` with per-performance `transpose`/`capo`/`notes`.
- **RhythmPattern** — reusable strum grid, attachable to sections.
- **Instrument** / **ChordDefinition** — these tables hold **user-defined**
  entries only; the common chords + default instruments ship as static data in
  `src/lib/chords/` (versioned in code, kept out of backups).
- **ReportTemplate** → `pages[]` → `blocks[]` (Phase 8; multi-page is required).
- **Photo** (Blob), **AppSettings** (singleton `id:'app'`).

## Conventions
- **Never call Dexie directly from a component.** Go through `src/db/repo.ts`.
- **Reactive reads** use `useLiveQuery`.
- **IDs** are `crypto.randomUUID()` via `newId()` — generated in the repo.
- **Dates** are unix-ms numbers in the DB; format only at the view layer.
- **Photos** are `Blob` in IndexedDB; base64 only on JSON export/import.
- **Tailwind classes only**; `style={{}}` only for genuinely dynamic values.
- **One responsive layout** for mobile + desktop — never two parallel UIs.
- **No new top-level deps** without updating plan.md §2 and explaining the
  tradeoff.
- **Bump the Dexie version** in `schema.ts` + add a migration on any stored-shape
  change. Non-indexed fields can be added freely; new indexes/renames need a bump.

## ttn-backup
`src/lib/ttnBackup.ts` installs `window.TTNBackupAdapter` (`appId: 'ttn-chords'`)
so the cross-app **ttn-backup** utility can snapshot/restore via a hidden
same-origin iframe. `App.tsx` calls `installTtnBackupAdapter()` on mount;
Settings has a "Restore from ttn-backup" button (`openTtnBackupRestore()`). The
adapter's `importData` reuses `parseExportPayload` + `importData(payload,
'replace')` and reloads. `index.html` loads `/ttn-backup/client.js`.
**Keep the JSON export shape and the adapter contract stable** — they are the
backup format.

## PWA notes
- Manifest lives in `vite.config.ts`. `base` = `/ttn-chords/` (GitHub Pages).
- Icons in `public/` are **placeholders** (SVG only). Real branded icons + the
  PNG sizes the manifest lists land in Phase 11.
- Inline `<script>` in `index.html` applies theme + accent before React mounts
  to avoid a flash — mirror any change there in `src/app/theme.tsx` /
  `src/lib/accent.ts`.
