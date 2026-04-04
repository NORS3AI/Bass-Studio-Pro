# Bass Studio Pro — Full Feature Spec

## Core Playback Engine

### Offline Audio Playback
- Fully client-side — zero server calls, zero uploads, zero streaming
- Decodes and plays MP3, AAC, WAV, FLAC, OGG, WEBM, M4A, AIFF
- Web Audio API pipeline: Source → Gain → EQ Filters → Analyser → Destination
- Gapless playback between tracks (pre-buffering next track)
- Crossfade support (configurable 0–12 seconds)
- Playback speed control (0.5x – 2.0x) with pitch correction
- Pitch shift independent of speed (semitone increments, -12 to +12)
- A-B loop: set two markers on the timeline and loop that section endlessly
- Audio normalization / volume leveling across tracks (ReplayGain-style)
- Resume playback from last position on app reload

### File Loading
- **Desktop (Chrome/Edge)**: File System Access API — open individual files or full folders recursively
- **Desktop (Firefox/Safari)**: `<input type="file" multiple webkitdirectory>` fallback
- **iOS Safari**: Files app integration via standard file picker
- **Android Chrome**: File picker with directory support
- Drag-and-drop files/folders onto the app window
- Reads ID3v2 / Vorbis Comment / MP4 metadata (title, artist, album, year, genre, track number)
- Extracts embedded album art and displays it in the player

---

## Playlist Management

### Playlist CRUD
- Create unlimited named playlists
- Rename and delete playlists
- Add tracks via file picker, folder import, or drag-and-drop
- Remove individual tracks or clear entire playlist
- Duplicate a playlist

### Playback Queue
- Drag-and-drop reordering within a playlist
- "Play Next" — insert a track immediately after the current one
- "Add to Queue" — append a track to the end of the queue
- Shuffle mode (Fisher-Yates) with un-shuffle to restore original order
- Repeat modes: Off / Repeat All / Repeat One
- Auto-advance to next track on completion

### Persistence
- All playlists stored in IndexedDB — survives reload, tab close, browser restart
- Export playlists as JSON files
- Import playlists from JSON files
- Last active playlist and playback position restored on launch

### Search & Filter
- Real-time search across track name, artist, album
- Filter by genre, artist, or album from metadata
- Sort by title, artist, album, duration, date added

### Favorites
- Star/unstar any track
- Dedicated "Favorites" auto-playlist
- Favorites persist across sessions

---

## Equalizer

### Preset Library
| Preset | Character |
|--------|-----------|
| **Flat** | Zero modification — pure source |
| **Bass Boost** | +8 dB at 60 Hz, +6 dB at 170 Hz — deep low-end |
| **Treble Boost** | +6 dB at 6 kHz, +8 dB at 14 kHz — airy highs |
| **Dance** | Boosted sub-bass and highs, scooped mids — club feel |
| **Rock** | Punchy lows, forward upper mids — guitars and drums |
| **Pop** | Gentle V-curve — vocals forward, balanced rhythm |
| **Jazz** | Warm mids, rolled-off highs — smooth and natural |
| **Classical** | Nearly flat with gentle presence boost — concert hall |
| **Hip-Hop** | Heavy sub-bass, crisp snare region, bright hi-hats |
| **R&B / Soul** | Warm bass, rich mids, silky highs |
| **Electronic** | Sub-bass emphasis, sharp highs, wide stereo feel |
| **Acoustic** | Natural mid-range, subtle low-end warmth |
| **Vocal** | Focused 1–4 kHz range for spoken word and podcasts |
| **Late Night** | Reduced bass, softened highs — quiet listening |

### Manual EQ
- 10-band graphic EQ (31 Hz, 62 Hz, 125 Hz, 250 Hz, 500 Hz, 1 kHz, 2 kHz, 4 kHz, 8 kHz, 16 kHz)
- Each band: -12 dB to +12 dB range
- Visual frequency response curve drawn in real time
- Save custom presets with user-defined names
- Delete or rename custom presets

### Technical Implementation
- Chain of `BiquadFilterNode` (peaking type) per band
- Preset values are `{ frequency, gain, Q }` tuples
- Changes applied instantly — no audio interruption
- Pre-amp / master gain slider to prevent clipping when boosting

---

## Visualizers

### Modes
| Visualizer | Description |
|------------|-------------|
| **Frequency Bars** | Classic vertical bars — one per frequency bin, color-mapped by intensity |
| **Waveform** | Oscilloscope-style time-domain wave |
| **Circular Spectrum** | Radial bars emanating from a center ring — pulses with bass |
| **Particle Field** | Floating particles whose speed, size, and color react to frequency bands |
| **Spectrogram** | Scrolling heatmap of frequency vs. time |
| **Blob** | Organic shape that morphs with bass and treble energy |

### Behavior
- Full-screen takeover: dims UI chrome, fills the viewport with the visual
- Real-time data from shared `AnalyserNode` — no duplicate FFT
- Beat detection drives pulse/flash effects on kicks and snares
- Color themes: Neon, Sunset, Ocean, Monochrome, Custom (user picks accent colors)
- FPS-aware: degrades gracefully on low-power devices
- Click/tap to cycle through visualizer modes
- ESC or swipe down to exit visualizer and return to player UI

---

## Player UI

### Now Playing Bar
- Album art thumbnail (extracted from metadata or generic placeholder)
- Track title, artist, album
- Progress bar with scrub/seek (click or drag)
- Elapsed time / total duration
- Play / Pause, Previous, Next, Shuffle, Repeat buttons

### Mini Player
- Collapsed single-line bar at bottom of screen
- Expands to full player view on tap/click
- Picture-in-Picture style floating mini player (where supported)

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `Space` | Play / Pause |
| `←` / `→` | Seek backward / forward 5 seconds |
| `Shift + ←` / `→` | Previous / Next track |
| `↑` / `↓` | Volume up / down |
| `M` | Mute / Unmute |
| `S` | Toggle shuffle |
| `R` | Cycle repeat mode |
| `F` | Toggle full-screen visualizer |
| `E` | Open / close equalizer |
| `L` | Toggle lyrics panel |
| `1–6` | Switch visualizer mode |
| `/` | Focus search bar |

### Media Session API
- Lock-screen controls on mobile (play, pause, next, previous)
- Displays track title and album art in OS notification area

---

## Settings

### General
- Theme: Dark / Light / System
- Accent color picker
- Language (i18n-ready structure)
- Reset all settings to defaults

### Playback
- Crossfade duration (0–12 s)
- Gapless playback toggle
- Playback speed default
- Audio normalization on/off
- Remember playback position on/off

### Sleep Timer
- Preset durations: 15 min, 30 min, 45 min, 1 hr, 2 hr
- Custom duration input
- Fade-out over last 30 seconds before stopping
- Countdown visible in the UI

### Storage
- View IndexedDB usage
- Clear all stored data
- Export all settings as JSON
- Import settings from JSON

---

## Patch Notes

- Accessible from the top-right menu, next to Settings (gear icon)
- Displays a scrollable changelog organized by version
- Each entry shows: version number, date, list of changes
- Badge indicator when new patch notes are available since last viewed
- Stored in `PATCH_NOTES.md` and rendered in-app

---

## PWA / Offline

- Full Progressive Web App with `manifest.json`
- Service worker caches the entire app shell on first load
- Works offline after initial visit — no internet required to play music
- "Add to Home Screen" prompt on mobile
- App icon and splash screen for installed PWA

---

## Accessibility

- Full keyboard navigation
- ARIA labels on all interactive elements
- Screen reader announcements for track changes
- High contrast mode support
- Reduced motion support (disables visualizer animations)
- Focus indicators on all controls

---

## Future Roadmap

- [ ] Lyrics panel (paste lyrics or load `.lrc` synced lyrics files)
- [ ] Crossfade preview in settings
- [ ] Stereo balance / pan control
- [ ] Audio effects (reverb, delay, compressor)
- [ ] Folder watch (auto-refresh when files change on desktop)
- [ ] Chromecast / AirPlay output
- [ ] Collaborative playlists via shared JSON links
- [ ] Waveform overview bar (like SoundCloud)
- [ ] Tag editor (edit ID3 metadata in-browser)
- [ ] Scrobble to Last.fm
