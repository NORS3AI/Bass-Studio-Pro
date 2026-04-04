# CLAUDE.md - Bass Studio Pro

## Project Overview

Bass Studio Pro is an offline-first, browser-based music player. It runs entirely client-side with no server dependencies. Users load music from their local filesystem (desktop or iOS Files app) and get a full-featured playback experience with equalizer presets and beat-synced visualizers.

## Tech Stack

- **Frontend**: HTML5, CSS3, vanilla JavaScript (no build step)
- **Audio**: Web Audio API for playback, equalization, and frequency analysis
- **Visualization**: Canvas API / WebGL for beat-reactive visualizers
- **File Access**: File System Access API (desktop) with `<input type="file">` fallback (iOS/mobile)
- **Hosting**: GitHub Pages (static site, no backend)

## Architecture

```
index.html          — Entry point and app shell
css/
  styles.css        — Core layout, theming, dark mode
js/
  app.js            — App initialization, routing between views
  player.js         — Audio playback engine (Web Audio API)
  playlist.js       — Playlist management (add, remove, reorder, queue)
  equalizer.js      — EQ engine with preset curves (Bass, Treble, Dance, Rock, Pop, Jazz, Classical, Flat)
  visualizer.js     — Canvas-based visualizers (waveform, bars, circular, particle) synced to frequency data
  file-loader.js    — File ingestion from desktop and iOS Files via File System Access API / fallback input
  storage.js        — IndexedDB persistence for playlists and settings
assets/
  icons/            — PWA and UI icons
```

## Key Design Decisions

- **No frameworks** — keeps the bundle zero-dependency and fast on mobile.
- **Web Audio API graph**: source → gain → BiquadFilters (EQ bands) → AnalyserNode (visualizer data) → destination.
- **Equalizer presets** are arrays of `{ frequency, gain, Q }` applied to a chain of BiquadFilterNodes.
- **Visualizer loop** uses `requestAnimationFrame` and reads from the shared AnalyserNode so there is no duplicate FFT work.
- **Offline-first**: once loaded via GitHub Pages, the service worker caches the app shell for full offline use.

## Development Notes

- No build tools required. Open `index.html` directly or serve with any static server.
- To test locally: `npx serve .` or `python3 -m http.server 8000`
- Linting: `npx eslint js/` (config in `.eslintrc.json` if added)
- The app must remain a static site deployable to GitHub Pages with zero server-side logic.

## Common Tasks

- **Add an EQ preset**: edit `js/equalizer.js` → `PRESETS` object. Each preset is an array of band configs.
- **Add a visualizer**: create a new renderer function in `js/visualizer.js` that reads from the shared `AnalyserNode`.
- **Change theme / colors**: edit CSS custom properties in `css/styles.css` under `:root`.
