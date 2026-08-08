# 🍺 Beer Counter

A mobile-first, **installable PWA** for tallying beers during a session with the fellas — and crowning the all-time legend. Works fully **offline** once loaded.

## Features

- **Persistent roster** — fella names are saved in `localStorage` and reused across sessions; tick who's in for each round.
- **Live round dashboard** — two-column tiles, tap anywhere on a tile for **+1 beer**, with `−`/`+` for corrections. Each fella also has a **shots** counter on the same tile, tallied separately from beers. The current beer leader gets a crown.
- **Sessions** — one active round at a time; finish & save it to archive it. Resume an in-progress round any time.
- **Hall of Fame** — all-time champion (best single round), a personal-best leaderboard with medals, and a browsable, deletable session history with dates.
- **Offline / installable** — service worker caches the app shell; add to home screen for a standalone app.
- **Beer-pub theme** — warm amber/gold on roasted-malt browns, real SVG icons (no emojis), haptics on supported devices.

## Run it

It's a static app — no build step. Serve the folder over HTTP (a service worker needs `http://localhost` or HTTPS, not `file://`):

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

## Data

Everything lives in the browser under the `beerCounter.v2` key in `localStorage`:

```
roster   – persistent fellas            [{ id, name }]
session  – current round (or null)      { id, startedAt, members:[{id,name,count,shots}] }
history  – archived rounds              [{ id, startedAt, endedAt, entries:[{name,count,shots}] }]
```

`count` is beers, `shots` is shots. Rounds saved before the shots feature have no `shots` field — it's read as `0`.

## Files

| File | Purpose |
|------|---------|
| `index.html` | Screens (setup · dashboard · Hall of Fame) + inline SVG icon sprite |
| `styles.css` | Mobile-first beer-pub theme |
| `app.js` | State, rendering, sessions, leaderboard, SW registration |
| `sw.js` | Offline service worker (stale-while-revalidate) |
| `manifest.webmanifest` | PWA manifest |
| `icon.svg` / `icon-maskable.svg` | App icons |
