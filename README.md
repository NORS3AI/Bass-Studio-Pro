# Bass Studio Pro

**Live App: [https://nors3ai.github.io/Bass-Studio-Pro/](https://nors3ai.github.io/Bass-Studio-Pro/)**

Bass Studio Pro is a fully offline, browser-based music player. Load tracks from your desktop or iOS Files app, build playlists, shape your sound with a built-in equalizer, and watch beat-synced visualizers — all without an internet connection.

---

## Features

### Offline Music Playback
- Runs entirely in the browser — no server, no uploads, no streaming.
- Load folders or individual tracks from your local filesystem.
- On iOS, pick files straight from the Files app.
- Supports MP3, AAC, WAV, FLAC, OGG, and any format your browser can decode.

### Playlist Management
- Drag-and-drop reordering.
- Shuffle, repeat, and queue-next controls.
- Playlists persist in IndexedDB so they survive page reloads.

### Equalizer
Customise your sound with built-in presets or go fully manual:

| Preset | Description |
|--------|-------------|
| **Bass Boost** | Deep low-end emphasis for hip-hop and EDM |
| **Treble Boost** | Crisp highs for vocal and acoustic tracks |
| **Dance** | Scooped mids with punchy lows and bright highs |
| **Rock** | Boosted lows and upper mids for guitars and drums |
| **Pop** | Balanced lift across vocals and rhythm |
| **Jazz** | Warm mids with smooth high-end roll-off |
| **Classical** | Flat response with gentle high-frequency presence |
| **Flat** | Zero modification — pure source audio |

Each preset drives a chain of Web Audio API BiquadFilter nodes so EQ changes are instant and glitch-free.

### Beat-Synced Visualizers
- Toggle visualizer mode to dim the UI and fill the screen with reactive graphics.
- Visuals respond in real time to frequency and amplitude data from the audio engine.
- Multiple styles: waveform, frequency bars, circular spectrum, and particle field.
- Perfect for ambient listening — just hit play, go full-screen, and enjoy the show.

---

## Getting Started

### Use the hosted app
Visit **[https://nors3ai.github.io/Bass-Studio-Pro/](https://nors3ai.github.io/Bass-Studio-Pro/)** in any modern browser. The service worker will cache the app for offline use after the first load.

### Run locally
```bash
git clone https://github.com/nors3ai/Bass-Studio-Pro.git
cd Bass-Studio-Pro
npx serve .
# or
python3 -m http.server 8000
```
Open `http://localhost:8000` (or the port shown) in your browser.

---

## Platform Support

| Platform | File Access Method |
|----------|-------------------|
| Desktop (Chrome, Edge) | File System Access API — open files or entire folders |
| Desktop (Firefox, Safari) | Standard file picker (`<input type="file">`) |
| iOS Safari | Files app integration via file picker |
| Android Chrome | File picker with folder support |

---

## Tech Stack

- **HTML5 / CSS3 / JavaScript** — zero dependencies, no build step
- **Web Audio API** — playback, equalization, and real-time frequency analysis
- **Canvas API** — beat-reactive visualizations
- **IndexedDB** — persistent playlists and settings
- **Service Worker** — offline caching for the full app shell

---

## Contributing

1. Fork the repo
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Commit your changes
4. Push to your branch and open a pull request

---

## License

MIT
