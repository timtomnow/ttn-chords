# TTN Chords

A local-first PWA for **group song-playing**. Author songs with lyrics, chords,
and rhythms; show clickable chord charts for your instrument; group songs into
setlists; and generate printable multi-page PDF songbooks. No backend — your
data lives in your browser and is portable via JSON / [ttn-backup](https://timtomnow.github.io/ttn-backup/).

Sibling project to [ttn-list](https://github.com/timtomnow/ttn-list); it shares
that app's stack, conventions, and backup format.

## Status
Early scaffold (Phase 0). The data model, app shell, theming, and backup wiring
are in place; features are built phase by phase — see **[plan.md](plan.md)**.

## Develop
```bash
npm install
npm run dev        # http://localhost:5174
npm run check      # lint + typecheck + test + build
```

## Tech
Vite · React 18 · TypeScript (strict) · Tailwind (light/dark + user accent) ·
react-router v6 · Dexie/IndexedDB · @dnd-kit · vite-plugin-pwa.

## Docs
- [plan.md](plan.md) — product spec + phased build plan
- [CLAUDE.md](CLAUDE.md) — conventions & code map for contributors

## License
TBD.
