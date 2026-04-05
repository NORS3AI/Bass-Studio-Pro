# CLAUDE.md - Bass Studio Pro

## MANDATORY: Patch Notes Rule

**After EVERY update — no matter how small — add an entry to `PATCH_NOTES.md`.** This is non-negotiable. Every commit that changes app behavior, UI, features, or fixes a bug must have a corresponding patch note entry with version number, date, and bullet list of changes. Bump the patch version for fixes, minor version for features.

## Development Phases

See `PHASES.md` for the full 14-phase roadmap (151 tasks). Each phase has a version target and a checklist. Mark tasks complete in PHASES.md as you finish them. Follow the phases in order — each builds on the previous.

## Project Overview

Bass Studio Pro is an offline-first, browser-based music player. It runs entirely client-side with no server dependencies. Users load music from their local filesystem (desktop or iOS Files app) and get a full-featured playback experience with equalizer presets, beat-synced visualizers, and comprehensive playlist management.

**Live App**: https://nors3ai.github.io/Bass-Studio-Pro/

## Tech Stack

- **Frontend**: HTML5, CSS3, vanilla JavaScript (no build step, no frameworks)
- **Audio**: Web Audio API for playback, equalization, and frequency analysis
- **Visualization**: Canvas API for beat-reactive visualizers
- **File Access**: File System Access API (desktop) with `<input type="file">` fallback (iOS/mobile)
- **Persistence**: IndexedDB for playlists, settings, and app state
- **Offline**: Service Worker caches full app shell
- **PWA**: manifest.json for Add to Home Screen / standalone install
- **Hosting**: GitHub Pages (static site, no backend)

## Architecture

```
index.html              — App shell: top bar, main content panels, now-playing bar
css/
  styles.css            — Full layout, theming (dark/light), responsive, accessibility
js/
  app.js                — Initialization, UI wiring, keyboard shortcuts, panel routing
  player.js             — Web Audio API engine (source → gain → EQ → analyser → output)
  playlist.js           — Playlist CRUD, queue, shuffle (Fisher-Yates), repeat, favorites, search
  equalizer.js          — 10-band graphic EQ, 14 presets, custom preset save/load
  visualizer.js         — 6 visualizer modes (bars, waveform, circular, particles, spectrogram, blob)
  file-loader.js        — File ingestion: File System Access API, fallback input, drag-and-drop, metadata
  patch-notes.js        — Fetches PATCH_NOTES.md, renders in-app, manages "new" badge
  storage.js            — IndexedDB wrapper (playlists, settings, state stores)
sw.js                   — Service Worker for offline caching
manifest.json           — PWA manifest
FEATURES.md             — Complete feature specification
PATCH_NOTES.md          — Changelog (MUST be updated every commit — see rule above)
assets/
  icons/                — PWA and UI icons (icon-192.png, icon-512.png, favicon.ico)
```

## Audio Graph

```
AudioSource (MediaElementSource)
  → BiquadFilter × 10 (EQ bands: 31 Hz → 16 kHz)
    → GainNode (master volume + pre-amp)
      → AnalyserNode (shared: feeds visualizer + beat detection)
        → AudioContext.destination
```

## Key Design Decisions

- **No frameworks** — zero dependencies, fast on mobile, trivial to deploy.
- **Equalizer presets** are gain arrays applied to a chain of BiquadFilterNodes (peaking type).
- **Visualizer loop** uses `requestAnimationFrame` and reads from the shared AnalyserNode — no duplicate FFT.
- **Patch Notes in-app** — `patch-notes.js` fetches `PATCH_NOTES.md`, renders markdown to HTML, shows a badge when unseen notes exist.
- **Offline-first** — service worker caches the app shell; music files stay local and are never uploaded.

## Development Notes

- No build tools. Open `index.html` directly or serve with any static server.
- Local dev: `npx serve .` or `python3 -m http.server 8000`
- Linting: `npx eslint js/` (config in `.eslintrc.json` if added)
- The app must remain a static site deployable to GitHub Pages with zero server-side logic.

## Common Tasks

- **Add an EQ preset**: edit `js/equalizer.js` → `PRESETS` object. Add the name and 10-value gain array.
- **Add a visualizer**: add a mode to `MODES[]` in `js/visualizer.js`, write a `drawXyz(w, h)` renderer, add case to `draw()`.
- **Change theme / colors**: edit CSS custom properties in `css/styles.css` under `:root`.
- **Update patch notes**: edit `PATCH_NOTES.md` — add new version heading, date, and change list at the top.
- **Update service worker cache**: bump `CACHE_NAME` version in `sw.js` when files change.

## UI Layout

```
┌─────────────────────────────────────────────┐
│  Top Bar:  [Bass Studio Pro]   [Patch Notes ][Settings]  │
├─────────────────────────────────────────────┤
│  Main Content (scrollable):                             │
│    ┌─ Load Music ──────────────────────┐                │
│    │  [Open Files] [Open Folder]       │                │
│    │  ┌─ Drop Zone ──────────────┐     │                │
│    │  └──────────────────────────┘     │                │
│    └───────────────────────────────────┘                │
│    ┌─ Playlist ────────────────────────┐                │
│    │  [Search] [+New] [Export] [Import] │                │
│    │  1. Track Name           3:42  ☆  │                │
│    │  2. Track Name           4:18  ★  │                │
│    └───────────────────────────────────┘                │
│    ┌─ Equalizer (toggle) ──────────────┐                │
│    │  [Flat][Bass][Treble][Dance]...   │                │
│    │  ┃ ┃ ┃ ┃ ┃ ┃ ┃ ┃ ┃ ┃  (sliders) │                │
│    └───────────────────────────────────┘                │
│    ┌─ Settings / Patch Notes (toggle) ─┐                │
│    └───────────────────────────────────┘                │
├─────────────────────────────────────────────┤
│  Now Playing Bar:                                       │
│  [Art] Title / Artist  [⏮][⏯][⏭]  ──●── 2:30/4:18  EQ VIZ 1x 🔊━━  │
└─────────────────────────────────────────────┘
```
