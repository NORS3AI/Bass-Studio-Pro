# Bass Studio Pro — Development Phases

Each phase builds on the previous one. Complete all tasks in a phase before moving to the next. After completing each phase, update `PATCH_NOTES.md` with a version bump.

---

## Phase 1 — Core Playback Engine (v0.2.0)
> **Goal**: Load files and play audio. Nothing else matters until this works.

- [x] **1.1** Wire up `FileLoader.openFiles()` to the Open Files button — verify files are received
- [x] **1.2** Wire up `FileLoader.openFolder()` to the Open Folder button — recursively collect audio files
- [x] **1.3** Implement drag-and-drop on the drop zone — handle both files and folders
- [x] **1.4** Build the Web Audio API graph in `player.js`: MediaElementSource → GainNode → AnalyserNode → destination
- [x] **1.5** Play/Pause toggle — clicking a track in the list starts playback, Play button toggles
- [x] **1.6** Progress bar seek — click or drag to scrub through the track
- [x] **1.7** Time display — show elapsed / total in `mm:ss` format, update in real time
- [x] **1.8** Volume slider — connect to GainNode, persist last volume in IndexedDB
- [x] **1.9** Mute/unmute button
- [x] **1.10** Previous / Next buttons — Previous restarts if >3s in, otherwise goes back one track
- [x] **1.11** Auto-advance to next track when current track ends

**Definition of done**: You can open a folder of MP3s, see them listed, click to play, scrub, adjust volume, and skip between tracks.

---

## Phase 2 — Playlist Management (v0.3.0)
> **Goal**: Full playlist CRUD, persistence, and queue control.

- [x] **2.1** Create named playlists — "New Playlist" button opens a name prompt
- [x] **2.2** Playlist selector — dropdown or sidebar to switch between playlists
- [x] **2.3** Rename and delete playlists
- [x] **2.4** Duplicate a playlist
- [x] **2.5** Remove individual tracks from a playlist (swipe or delete button)
- [x] **2.6** Clear entire playlist
- [x] **2.7** Drag-and-drop reordering within the track list
- [x] **2.8** "Play Next" context action — insert track after the currently playing one
- [x] **2.9** "Add to Queue" context action — append track to end of queue
- [x] **2.10** Shuffle mode (Fisher-Yates) with un-shuffle to restore original order
- [x] **2.11** Repeat modes: Off → Repeat All → Repeat One (cycle on button click)
- [x] **2.12** Persist all playlists in IndexedDB — survive reload, tab close, browser restart
- [x] **2.13** Restore last active playlist and track position on app launch
- [x] **2.14** Export playlist as JSON file (download)
- [x] **2.15** Import playlist from JSON file

**Definition of done**: You can create multiple playlists, reorder tracks, shuffle, repeat, close the browser, reopen, and everything is exactly as you left it.

---

## Phase 3 — Metadata & Album Art (v0.4.0)
> **Goal**: Read ID3 tags and display rich track info.

- [x] **3.1** Integrate a lightweight ID3 parser (jsmediatags or custom) — extract title, artist, album, year, genre, track number
- [x] **3.2** Use parsed metadata as track display name instead of filename
- [x] **3.3** Extract embedded album art (APIC frame) and display as thumbnail in the track list
- [x] **3.4** Show album art in the Now Playing bar
- [x] **3.5** Fallback placeholder art when no embedded art exists
- [x] **3.6** Display track metadata in a detail tooltip or expandable row
- [x] **3.7** Media Session API — show title + album art on lock screen / OS notification area
- [x] **3.8** Filter tracks by genre from metadata
- [x] **3.9** Filter tracks by artist
- [x] **3.10** Filter tracks by album
- [x] **3.11** Sort by: title, artist, album, duration, date added

**Definition of done**: Loaded tracks show real titles/artists/album art. Lock screen shows current track info. You can filter and sort by any metadata field.

---

## Phase 4 — Search & Favorites (v0.5.0)
> **Goal**: Find tracks fast and mark the ones you love.

- [x] **4.1** Real-time search input — filters track list as you type (title, artist, album)
- [x] **4.2** Search highlights matching text in results
- [x] **4.3** `/` keyboard shortcut focuses the search bar
- [x] **4.4** Star/unstar any track (toggle heart/star icon)
- [x] **4.5** Dedicated "Favorites" auto-playlist — always available, auto-populated
- [x] **4.6** Persist favorites in IndexedDB across sessions
- [x] **4.7** "Recently Played" auto-playlist — last 50 tracks played
- [x] **4.8** "Most Played" auto-playlist — sorted by play count

**Definition of done**: You can instantly search across hundreds of tracks, star your favorites, and access smart auto-playlists.

---

## Phase 5 — Equalizer (v0.6.0)
> **Goal**: Full 10-band EQ with all 14 presets and custom curves.

- [x] **5.1** Create 10 BiquadFilterNodes (peaking type) and insert into the audio graph
- [x] **5.2** Render 10 vertical sliders (-12 to +12 dB), one per band
- [x] **5.3** Real-time slider interaction — moving a slider instantly changes the filter gain
- [x] **5.4** Render the 14 preset buttons (Flat, Bass Boost, Treble Boost, Dance, Rock, Pop, Jazz, Classical, Hip-Hop, R&B/Soul, Electronic, Acoustic, Vocal, Late Night)
- [x] **5.5** Clicking a preset applies its gain values to all 10 sliders
- [x] **5.6** Pre-amp / master gain slider to prevent clipping when boosting
- [x] **5.7** Draw the frequency response curve on the `<canvas>` in real time
- [x] **5.8** Save custom preset — name prompt, stores gain array
- [x] **5.9** Delete and rename custom presets
- [x] **5.10** Persist active preset and custom presets in IndexedDB
- [x] **5.11** `E` keyboard shortcut toggles the EQ panel
- [x] **5.12** EQ bypass toggle — quickly A/B compare with and without EQ

**Definition of done**: All 14 presets sound correct. Custom presets save and load. Frequency curve draws live. EQ persists across sessions.

---

## Phase 6 — Visualizers (v0.7.0)
> **Goal**: 6 full-screen beat-synced visualizers.

- [x] **6.1** Frequency Bars — 64 vertical bars, color-mapped by intensity, smooth animation
- [x] **6.2** Waveform — oscilloscope-style time-domain wave with accent color
- [x] **6.3** Circular Spectrum — 128 radial bars from a center ring, pulses with bass
- [x] **6.4** Particle Field — 60+ particles reacting to bass energy (size, speed, opacity)
- [x] **6.5** Spectrogram — scrolling heatmap, frequency on Y-axis, time on X-axis
- [x] **6.6** Blob — organic shape morphing with bass/treble energy, radial gradient fill
- [x] **6.7** Full-screen overlay — dims UI, fills viewport, canvas auto-resizes
- [x] **6.8** Beat detection — detect kicks/snares, trigger pulse/flash effects across all modes
- [x] **6.9** Visualizer controls overlay (fade in on hover): prev/next mode, mode label, close
- [x] **6.10** `F` shortcut opens visualizer, `ESC` closes, `1-6` switches mode directly
- [x] **6.11** Click/tap to cycle through modes
- [x] **6.12** Color themes: Neon, Sunset, Ocean, Monochrome
- [x] **6.13** Custom color theme — user picks accent colors via color picker
- [x] **6.14** FPS-aware rendering — detect low frame rate, reduce particle count / bar count
- [x] **6.15** Swipe down to exit on mobile

**Definition of done**: All 6 visualizers render smoothly at 60fps on desktop, degrade gracefully on mobile. Beat detection triggers visible pulses. Color themes work.

---

## Phase 7 — Advanced Playback Features (v0.8.0)
> **Goal**: Crossfade, gapless, speed, pitch, A-B loop, normalization.

- [ ] **7.1** Crossfade engine — pre-load next track, fade out current + fade in next simultaneously
- [ ] **7.2** Crossfade duration setting (0–12s slider in Settings)
- [ ] **7.3** Gapless playback — pre-buffer the next track and switch with zero gap
- [ ] **7.4** Playback speed control (0.5x–2.0x) — button cycles through, or setting sets default
- [ ] **7.5** Pitch shift independent of speed — semitone slider (-12 to +12)
- [ ] **7.6** A-B loop — click to set point A, click again to set point B, loop that section
- [ ] **7.7** A-B loop visual markers on the progress bar
- [ ] **7.8** Clear A-B loop button
- [ ] **7.9** Audio normalization — analyze peak/RMS of each track, apply gain correction
- [ ] **7.10** Resume from last position — save current time to IndexedDB on pause/unload, restore on next launch

**Definition of done**: Crossfade smoothly blends between tracks. Gapless plays albums seamlessly. Speed/pitch adjustments work independently. A-B loop markers are visible and clearable. Volume stays consistent across loud and quiet tracks.

---

## Phase 8 — Settings & Sleep Timer (v0.9.0)
> **Goal**: Complete settings panel with all options wired up.

- [x] **8.1** Theme selector: Dark / Light / System — applies immediately, persists
- [x] **8.2** Accent color picker — updates CSS `--accent` custom property, persists
- [x] **8.3** Crossfade duration control (wired to Phase 7 engine)
- [x] **8.4** Gapless playback toggle
- [x] **8.5** Volume normalization toggle
- [x] **8.6** Remember playback position toggle
- [x] **8.7** Default playback speed selector
- [x] **8.8** Sleep timer — preset buttons (15m, 30m, 45m, 1hr, 2hr)
- [x] **8.9** Sleep timer — custom duration input
- [x] **8.10** Sleep timer — countdown display visible in UI
- [x] **8.11** Sleep timer — fade-out over last 30 seconds before stopping
- [x] **8.12** Sleep timer — cancel button
- [x] **8.13** Export all settings as JSON
- [x] **8.14** Import settings from JSON
- [x] **8.15** View IndexedDB storage usage
- [x] **8.16** Clear all data button with confirmation dialog
- [x] **8.17** Reset settings to defaults

**Definition of done**: Every setting persists across sessions. Sleep timer counts down visibly and fades out audio before stopping. Export/import round-trips perfectly.

---

## Phase 9 — Mini Player & Responsive UI (v0.10.0)
> **Goal**: Polish the UI for all screen sizes and add the mini player.

- [ ] **9.1** Mini player — collapsed single-line bar showing art + title + play/pause
- [ ] **9.2** Tap/click mini player to expand to full Now Playing view
- [ ] **9.3** Picture-in-Picture floating mini player (where browser supports it)
- [ ] **9.4** Mobile layout — stack controls vertically, hide secondary controls behind a menu
- [ ] **9.5** Tablet layout — two-column: playlist on left, player/EQ on right
- [ ] **9.6** Touch-friendly: larger tap targets, swipe gestures (swipe to delete track, swipe down to close viz)
- [ ] **9.7** Smooth transitions/animations between panel states
- [ ] **9.8** Loading states — spinner when importing large folders
- [ ] **9.9** Empty states — helpful messages when no tracks are loaded, no playlists exist
- [ ] **9.10** Error states — graceful handling of unsupported file formats, decode failures

**Definition of done**: App looks and feels native on iPhone, Android, iPad, and desktop. Mini player works. No broken layouts at any screen size.

---

## Phase 10 — PWA & Offline (v0.11.0)
> **Goal**: Installable PWA that works fully offline.

- [ ] **10.1** Create PWA icons (icon-192.png, icon-512.png, favicon.ico)
- [ ] **10.2** Finalize manifest.json — name, colors, icons, start_url, display
- [ ] **10.3** Service worker — cache all app shell assets on install
- [ ] **10.4** Service worker — serve from cache first, fall back to network
- [ ] **10.5** Service worker — update strategy: detect new version, prompt user to refresh
- [ ] **10.6** "Add to Home Screen" — install prompt for mobile browsers
- [ ] **10.7** Splash screen for installed PWA
- [ ] **10.8** Test full offline flow: install, close browser, airplane mode, reopen, play music

**Definition of done**: App installs to home screen on iOS and Android. Works with zero network after first load. Updates cleanly when new versions are deployed.

---

## Phase 11 — Accessibility & Keyboard (v0.12.0)
> **Goal**: Fully accessible to all users.

- [ ] **11.1** Audit all ARIA labels — every button, slider, and region has a descriptive label
- [ ] **11.2** Screen reader announcements for track changes (aria-live region)
- [ ] **11.3** Full keyboard navigation — tab order makes logical sense through all panels
- [ ] **11.4** Focus indicators on all interactive controls (visible ring)
- [ ] **11.5** High contrast mode — detect `prefers-contrast: more` and boost borders/text
- [ ] **11.6** Reduced motion — detect `prefers-reduced-motion` and disable all animations/visualizers
- [ ] **11.7** All keyboard shortcuts documented in a help overlay (`?` to toggle)
- [ ] **11.8** Screen reader testing with VoiceOver (iOS/Mac) and NVDA (Windows)

**Definition of done**: App scores 100 on Lighthouse accessibility. All features usable via keyboard alone. Screen readers can navigate and control playback.

---

## Phase 12 — Lyrics Panel (v0.13.0)
> **Goal**: Display lyrics alongside playback.

- [ ] **12.1** Lyrics panel UI — toggleable side panel or overlay
- [ ] **12.2** Paste plaintext lyrics manually for a track
- [ ] **12.3** Load `.lrc` synced lyrics files — parse timestamps
- [ ] **12.4** Synced lyrics — auto-scroll and highlight the current line during playback
- [ ] **12.5** `L` keyboard shortcut toggles the lyrics panel
- [ ] **12.6** Persist lyrics per track in IndexedDB
- [ ] **12.7** Edit lyrics — inline editing for corrections

**Definition of done**: You can paste or load lyrics, they scroll in sync with the music, and they persist.

---

## Phase 13 — Audio Effects (v0.14.0)
> **Goal**: Reverb, delay, compressor, and stereo controls.

- [ ] **13.1** Stereo balance / pan control — slider from full-left to full-right
- [ ] **13.2** Reverb effect — ConvolverNode with impulse response buffers (small room, hall, cathedral)
- [ ] **13.3** Delay effect — DelayNode with feedback and dry/wet mix
- [ ] **13.4** Compressor — DynamicsCompressorNode with threshold, ratio, attack, release controls
- [ ] **13.5** Effects bypass toggle — quickly A/B with effects on/off
- [ ] **13.6** Effects chain order control
- [ ] **13.7** Save effects presets

**Definition of done**: Each effect is audibly working, adjustable, and can be toggled on/off without glitches.

---

## Phase 14 — Advanced Features (v1.0.0)
> **Goal**: Polish, power-user features, and the final stretch to v1.0.

- [ ] **14.1** Waveform overview bar — SoundCloud-style waveform rendered from audio data
- [ ] **14.2** Tag editor — edit ID3 metadata (title, artist, album) in-browser, write back to file
- [ ] **14.3** Crossfade preview in settings — short audio demo of the crossfade curve
- [ ] **14.4** Folder watch — detect file changes on desktop (File System Access API) and auto-refresh
- [ ] **14.5** Collaborative playlists — export as shareable JSON link
- [ ] **14.6** Scrobble to Last.fm — optional API integration for listening history
- [ ] **14.7** Chromecast / AirPlay output — Remote Playback API where supported
- [ ] **14.8** i18n — language system with at least English + Spanish
- [ ] **14.9** Onboarding tutorial — first-launch walkthrough explaining key features
- [ ] **14.10** Performance audit — Lighthouse score 95+, <2s first paint, smooth 60fps visualizers
- [ ] **14.11** Final QA — cross-browser testing (Chrome, Firefox, Safari, Edge, iOS Safari, Android Chrome)
- [ ] **14.12** Write final README and deploy v1.0.0 to GitHub Pages

**Definition of done**: Bass Studio Pro v1.0.0 is production-ready, polished, accessible, and performant across all platforms.

---

## Phase Summary

| Phase | Version | Focus | Tasks |
|-------|---------|-------|-------|
| 1 | v0.2.0 | Core Playback Engine | 11 |
| 2 | v0.3.0 | Playlist Management | 15 |
| 3 | v0.4.0 | Metadata & Album Art | 11 |
| 4 | v0.5.0 | Search & Favorites | 8 |
| 5 | v0.6.0 | Equalizer | 12 |
| 6 | v0.7.0 | Visualizers | 15 |
| 7 | v0.8.0 | Advanced Playback | 10 |
| 8 | v0.9.0 | Settings & Sleep Timer | 17 |
| 9 | v0.10.0 | Mini Player & Responsive UI | 10 |
| 10 | v0.11.0 | PWA & Offline | 8 |
| 11 | v0.12.0 | Accessibility & Keyboard | 8 |
| 12 | v0.13.0 | Lyrics Panel | 7 |
| 13 | v0.14.0 | Audio Effects | 7 |
| 14 | v1.0.0 | Advanced Features & Polish | 12 |
| **Total** | | | **151 tasks** |
