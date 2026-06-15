---
title: Author and export a song bundle (dev only)
category: Managing the library (admin)
order: 10
summary: Build a starter-library bundle from your songs and export it to commit into the app.
---

Bundles are the ready-made song collections people sync from **Settings → Starter
library**. They ship inside the app's code, so authoring one is a developer task:
you pick songs and export a bundle module to add to the project. This tool can't
change the live, hosted app — only a new build can.

## Before you start

- Turn on [authoring (admin) mode](/help/turn-on-admin-mode).
- This tool only appears when running the app in a **development** build.
- Add the songs you want in the bundle to your library first.

## Steps

1. Open **Settings** and find **Author a bundle (dev)**.
2. Enter a **Bundle name** and an optional description.
3. Tick the songs to include.
4. Tap **Download bundle module** — a `.ts` file downloads.
5. Hand the file to a developer (or, if that's you, save it under the project's
   `src/lib/library/bundles/` folder and register it in `index.ts`).

## What you'll see

A bundle module file downloads, ready to commit. After it's added and the app is
rebuilt and deployed, the bundle appears under **Starter library** for everyone to
sync.

## Related guides

- [Add songs from the starter library](/help/add-songs-from-library)
- [Create or import a song](/help/create-a-song)
