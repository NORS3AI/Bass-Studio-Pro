# Patch Notes — Bass Studio Pro

---

## v0.12.2 — 2026-04-06

### Phase 9 complete: PiP + Tablet layout
- **Picture-in-Picture (9.3)**: PiP button appears in the now-playing bar on browsers that support Document PiP (Chrome 116+). Opens a floating window with album art, title/artist, and play/prev/next controls. Stays synced with player state. On iOS, Media Session API (already implemented) provides lock screen and notification center controls
- **Tablet layout (9.5)**: Screens 769–1199px now use a two-column CSS grid: playlist on the left, EQ panel on the right. Drop zone and smart playlists span both columns

---

## v0.12.1 — 2026-04-06

### Critical fix: iOS audio completely broken
- **Removed `connectGraph()` from visibility handler** — on iOS/WebKit, disconnecting and reconnecting nodes downstream of a MediaElementSource permanently kills audio output. This was added in v0.12.0 and broke all iOS playback
- **Removed silent-WAV unlock trick** — playing silence on a MediaElementSource-connected element and then pausing/removing its src left the element in a dead state on iOS. Now just calls `ctx.resume()` on first user gesture
- **Handle `'interrupted'` AudioContext state everywhere** — iOS uses the "interrupted" state (not just "suspended") when the context is blocked. All `ctx.state` checks now cover both states
- **Added `playsinline` + `preload="auto"` attributes** to audio elements for iOS compatibility
- **Removed `crossOrigin = 'anonymous'`** — blob: URLs are same-origin; setting crossOrigin on them can cause iOS WebKit to treat them as cross-origin and output silence through MediaElementSource
- Replaced graph rebuild with non-destructive gain re-assertion on visibility return

---

## v0.12.0 — 2026-04-05

### New themes
- Rebranded the default theme as **Original**
- **WoW Alliance** — deep navy with gold accents
- **WoW Horde** — crimson and char
- **Dungeons & Dragons** — parchment dark with blood-red accents
- **VW GTI Dark Mode** — carbon racetrack with selectable accents: Tornado Red (classic), Pure White, Reflex Silver, Honey Yellow (checkered), Rising Blue, Clark Tartan
- Theme + GTI accent choice persist across sessions
- Existing saved "dark" preference auto-migrates to Original

### New visualizers + rebuilt Blob
- **Liquid Blob** (rewritten) — four nested iridescent layers with phase-offset wobble, multi-octave organic motion, color-shifting radial gradients, and specular highlights on beats
- **Aurora Ribbons** — flowing color bands sweeping the canvas with per-ribbon glow and bass-driven amplitude
- **Nebula** — drifting cosmic clouds in additive blend, plus a treble-reactive starfield
- **Warp Tunnel** — concentric wobbling rings pulsing outward on bass, neon glow

### Fix: EQ/quality degradation after tab switch
- On return to foreground the audio graph is now fully rebuilt via `connectGraph()` — iOS could leave the MediaElementSource bypassing the EQ chain after visibility changes, causing the "EQ changed and sound got flatter" symptom

---

## v0.11.7 — 2026-04-05

### Restore background playback (iOS) — with foreground-safe guards
- Background playback is back: when the tab hides, a bare `<audio>` element takes over so music keeps playing on iOS
- Foreground fix: on return, the AudioContext is now force-resumed and master gain re-asserted (works around iOS MediaElementSource routing getting stuck)
- Foreground fix: in `stopBackupAudio()`, `play()` is now called BEFORE setting `currentTime` — seeking before play was the thing that broke WebKit's audio routing last time
- Visibility changes are debounced 250ms, so spurious iOS events (URL bar collapse, etc.) don't rapidly pause/resume the main element

---

## v0.11.6 — 2026-04-05

### Visualizer: auto-hiding controls
- Visualizer control bar now fades out after 3 seconds of inactivity for a distraction-free view
- Tap the screen (iOS/mobile) or move the mouse (desktop) to bring the controls back
- Hovering the control bar itself keeps it visible
- Cursor also auto-hides on desktop when controls are hidden

---

## v0.11.5 — 2026-04-05

### Critical fix: Music only played when tab was hidden
- Removed the background-playback backup-audio hack that was pausing the main element on every visibility change
- On iOS/WebKit (incl. Orion), pausing + re-seeking + replaying the main element broke the MediaElementSource routing so nothing came out of the speakers while the tab was visible, while the bare backup `<audio>` element kept playing when hidden
- Visibility handler now only resumes the AudioContext and reasserts the master gain when returning to foreground
- Trade-off: iOS will pause audio when the tab is backgrounded (standard iOS Safari behavior). Background playback can be revisited later via Media Session API or a different strategy

---

## v0.11.4 — 2026-04-05

### Fix: In-app patch notes viewer always fetches fresh
- `patch-notes.js` now appends a cache-bust query param and sends `cache: 'no-store'` so the viewer always shows the latest release notes
- Defense-in-depth alongside the v0.11.3 service-worker network-first rule

---

## v0.11.3 — 2026-04-05

### Fix: Patch notes showing stale cached version
- Service worker now uses network-first strategy for `PATCH_NOTES.md` — falls back to cache only when offline
- App shell (JS/CSS/HTML) still cache-first for instant load and offline use
- Fixes the issue where the in-app patch notes viewer lagged several releases behind after updates

---

## v0.11.2 — 2026-04-05

### Mini player readability on mobile
- Album art in the mini player bumped from 48px to 56px (visible, not tiny)
- Track title now scrolls marquee-style when it overflows — seamless loop with duplicated text
- Font sizes nudged up (title 14px, artist 12px) for mobile legibility
- Title info row now takes full width on mobile so there's room to read
- Marquee pauses under `prefers-reduced-motion`

---

## v0.11.1 — 2026-04-05

### Fix: EQ/VIZ unreachable on iPhone mini player
- EQ, VIZ, and A-B buttons now remain visible in the collapsed mini player (core features shouldn't be buried behind an expand tap)
- Speed and volume controls still tuck into the expanded sheet
- Opening the EQ panel now auto-collapses the expanded player and scrolls the panel into view, so the sliders are actually visible on mobile
- Same flow applies to any panel toggled via `togglePanel()`

---

## v0.11.0 — 2026-04-04

### Phase 9: Mini Player & Responsive UI

**Mini player (mobile):**
- Now-playing bar collapses to a compact mini player on screens ≤ 768px — album art, title/artist, play/prev/next only
- New expand button (▲) reveals the full control set (shuffle, repeat, favorite, progress bar, secondary controls) in an expanded sheet
- Swipe-down gesture on the expanded player collapses it back to the mini view
- Expand button rotates 180° when expanded and updates its aria-label for screen readers

**Responsive layout (9.4):**
- Overhauled mobile breakpoint (≤ 768px): stacked panels, reflowed playlist controls, compact filters
- All icon buttons enforce 44×44px minimum touch targets per Apple/Material guidelines
- Toast container reflows above the mini player on mobile

**Loading states (9.8):**
- New full-screen loading overlay with spinner shown during file/folder ingestion
- `showLoading(msg)` / `hideLoading()` helpers available app-wide
- Spinner respects `prefers-reduced-motion`

**Toasts & error states (9.9, 9.10):**
- New toast notification system (`toast(message, type, duration)`) with success/error/info variants
- File-load completion shows a success toast with track count
- Player error events surface as error toasts instead of silent failures
- Storage-full events (from Phase 8) now surface as error toasts
- Toasts auto-dismiss with slide-out animation; multiple toasts stack

**Accessibility:**
- All new interactive elements have aria-labels
- Loading overlay uses `role="status"` with `aria-live="polite"`
- Toast container uses `aria-live="polite"` for non-intrusive announcements

**Deferred:** 9.3 Picture-in-Picture and 9.5 dedicated tablet layout remain on the roadmap.

---

## v0.10.0 — 2026-04-04

### Phase 7 completion: Crossfade engine + gapless playback

**Dual-slot audio engine:**
- Rewrote the player around two `<audio>` elements feeding two `GainNode`s that sum into the EQ chain
- Only the "active" slot emits timeupdate/ended/play/pause events; the inactive slot is used for pre-roll/pre-buffer
- Crossfade and gapless swap flip the active slot instantly without reloading or reconnecting the graph

**Crossfade (7.1):**
- When the Settings crossfade slider is > 0 seconds, the next track is pre-loaded on the inactive slot when the current track becomes active
- At `(duration - crossfadeSec)` into the current track, both slots ramp gains simultaneously (current 1→0, next 0→1) over the configured duration
- Uses `linearRampToValueAtTime` on each slot's `GainNode` — sample-accurate timing, no JS polling
- Active slot flips on crossfade completion; the outgoing element is stopped and cleared

**Gapless (7.3):**
- When "Gapless playback" is enabled, the next track is pre-buffered on the inactive slot while the current track plays
- On the current track's `ended` event, the secondary slot plays instantly at full gain and becomes the new active slot — no perceptible gap

**Interop:**
- A-B loop is honored — crossfade is suppressed while an A-B loop is active (the loop naturally prevents ever reaching end-of-track)
- User-initiated `loadTrack` (clicking a track, next/prev buttons) cancels any in-progress crossfade cleanly
- Manual pause/play during a crossfade pauses/resumes both slots together
- Normalization, EQ, sleep fade, and visualizer all work transparently because they operate downstream of the slot-gain mixer

**Playlist additions:**
- New `Playlist.peekNext()` — returns the upcoming track without advancing the queue, honoring shuffle/repeat
- New `Playlist.advanceQueue()` — moves queue position without emitting `playtrack`, used when the player has already swapped to the preloaded secondary

---

## v0.9.0 — 2026-04-04

### Phase 8: Settings & Sleep Timer (finishing touches)

**Sleep timer (8.11):**
- Audio now fades out smoothly over the last 30 seconds before the timer stops playback
- Volume is restored automatically when the timer fires or is cancelled — the next play session starts at your normal level
- Countdown display ticks more smoothly (updates 4×/sec instead of 1×/sec)

**Storage usage (8.15):**
- Settings panel now shows IndexedDB + Cache storage usage and total quota
- Displays as "Storage: 14.2 MB / 2.1 GB (0.7%)" — refreshes whenever the Settings modal is opened
- Uses `navigator.storage.estimate()`; gracefully falls back to "API not supported" on older browsers

**Reset settings (8.17):**
- New "Reset Settings" button in the Data section wipes all settings (theme, accent, EQ preset, viz mode, etc.) but **keeps your playlists and stored audio**
- Asks for confirmation; reloads the page afterward to apply defaults

**Audit fixes (Phase 8 × prior phases):**
- **CRITICAL** — Sleep timer race fixed: the 250ms countdown interval could fire at remaining=0 *before* the setTimeout, which would cancel the timeout without ever pausing playback. `fireSleepTimer()` is now idempotent and runs from whichever fires first.
- **HIGH** — Volume slider now syncs with programmatic volume changes (sleep fade, etc.) via a new `volumechange` listener — you can *see* the fade as well as hear it
- **MEDIUM** — Reset Settings now actually wipes the settings store via a new `Storage.clearSettings()` helper (was setting keys to `null`, some non-existent). Also resets EQ state via `deleteState('eq')` since EQ lives in the state store, not settings.

---

## v0.8.0 — 2026-04-04

### Phase 7: Advanced Playback Features (partial)

**A-B Loop (7.6-7.8):**
- New A-B button in the playback progress row — click once to set point A, again to set point B, a third time to clear
- Visual markers on the progress bar: green tick for A, red tick for B
- Playback automatically seeks back to A when it reaches B, creating a loop
- Loop auto-clears when changing tracks
- Keyboard shortcut: press **L** to cycle A → B → clear

**Pitch Shift (7.5):**
- New pitch slider in Settings: -12 to +12 semitones
- Setting persists across sessions
- Note: Pitch shift uses `preservesPitch=false` — changing pitch also changes playback speed (true independent pitch shift requires a phase vocoder, deferred)

**Volume Normalization (7.9):**
- When "Volume normalization" is enabled in Settings, each track's peak amplitude is analyzed via an OfflineAudioContext sample of the first 60 seconds
- A per-track normalization gain is applied so peaks land near -0.5 dBFS, evening out quiet vs loud tracks
- Results are cached in-memory for the session, so repeated plays are instant
- Toggling the checkbox off immediately resets normalization to unity gain
- Graph now includes a dedicated `normGainNode` between EQ and master volume

**Audio Graph:**
- Added `normGainNode` to the player audio graph: source → EQ → **normGain** → masterGain → analyser → destination
- New `Player.setNormalizationGain()` API

**Audit fixes (Phase 7 × Phases 1-6):**
- Normalization now reuses the Player's existing AudioContext for decoding (avoids hitting the browser's per-origin AudioContext limit after many tracks)
- Settings export now includes the new `pitch` value so it survives backup/restore
- A-B marker repositioning simplified — markers now reliably update whenever duration is known and A or B is set (was a convoluted triple-equals chain)

---

## v0.7.2 — 2026-04-04

### Audit Fixes — Settings, File Loading, Visualizers, EQ

**Visualizer:**
- **CRITICAL** — Null analyser guard added: visualizer no longer crashes when opened before audio context is initialized
- **CRITICAL** — Spectrogram DPR bug fixed: scrolling heatmap no longer drifts on high-DPI displays (Retina, mobile)
- **HIGH** — Touch race condition fixed: swipe-down to close no longer triggers the tap-to-toggle-controls gesture on the same motion
- **HIGH** — Click-to-cycle vs touch conflict resolved: tapping the canvas on mobile toggles controls, single-tap on desktop cycles modes
- **MEDIUM** — `hexToRgb()` now validates input and returns safe default (white) for malformed hex strings instead of `NaN` colors
- **LOW** — Beat detection history now clears on mode/track switch for accurate beat detection per song

**Equalizer:**
- **CRITICAL** — Preamp now shown in the frequency response curve: the displayed curve finally matches what you hear
- **CRITICAL** — Dragging a slider now correctly highlights the "Custom" preset button (previously still showed the old preset as active)
- **CRITICAL** — Custom preset names that conflict with built-in presets are now rejected with a warning, preventing hidden/lost custom presets
- **HIGH** — Band gain and preamp values clamped to -12..+12 dB on every set, protecting speakers from malformed input
- **HIGH** — Overwriting an existing custom preset now prompts for confirmation
- **MEDIUM** — Active preset button is kept in sync via the `presetchanged` event (changing sliders, bypass, or loading presets)
- **LOW** — EQ curve redraws on window resize so it stays sharp

**Settings:**
- **MEDIUM** — Accent color now fully propagates: added `--accent-rgb` CSS variable so drop zone, search highlights, and patch notes "Latest" card all follow the chosen accent color
- **MEDIUM** — Crossfade slider now styled with accent color
- **MEDIUM** — Sleep timer and position-save intervals cleaned up on page unload and on Clear All Data
- **LOW** — Accent color hex validated before applying (prevents malformed input from breaking the theme)
- **LOW** — Checkbox settings (gapless, normalize, remember position) now correctly restore `false` values that were explicitly saved
- **LOW** — Import settings validates JSON structure and shows success message before reload
- **LOW** — EQ curve redraws when accent color changes

**File Loading / Import:**
- **HIGH** — Drop zone reliably hides even when file handling throws an error (try/finally wrapping)
- **HIGH** — Drag counter clamped to zero — drop zone no longer stuck visible if dragenter/leave get out of sync with nested children
- **HIGH** — IndexedDB quota errors surface to the user: "Storage full" alert when audio can't be persisted, so you know to clear old data
- **MEDIUM** — FileReader now has `onerror` and `onabort` handlers — failed playlist imports show a clear error instead of silently hanging
- **MEDIUM** — Import file input is reset *before* parsing so selecting the same file twice in a row now works
- **LOW** — Open files/folder buttons catch errors so denied permissions or cancelled pickers no longer throw uncaught exceptions

---

## v0.7.1 — 2026-04-04

### Settings Fully Wired

- **Accent color picker works**: Changing the accent color in Settings now updates the entire UI theme in real-time. Custom accent persists across sessions
- **Crossfade slider shows value**: Slider now updates the seconds display as you drag and saves your preference (crossfade engine coming in Phase 7)
- **Default speed setting**: Dropdown in Settings now sets the playback speed and persists it — applied on app launch
- **Sleep timer functional**: All quick-select buttons (15/30/45/60/120 min) and custom minutes input work. Shows live countdown. Pauses music when timer expires
- **Remember playback position**: When enabled, saves your position every 5 seconds and resumes from that point when you reload and play the same track
- **Gapless and normalization checkboxes**: State persists (engine implementation in Phase 7)
- **Clear All Data**: Prompts for confirmation, then wipes all playlists, settings, stored audio, and reloads
- **Export Settings**: Downloads all settings as a JSON file
- **Import Settings**: Loads a settings JSON file and applies all values on reload

---

## v0.7.0 — 2026-04-04

### Phase 6 Complete — Visualizers

**6 Beat-Synced Visualizer Modes (6.1–6.6):**
- **Frequency Bars**: 64 vertical bars with per-bar gradients, rounded tops, and glow on beat hits. Bar count scales with FPS
- **Waveform**: Oscilloscope-style wave with glow line, mirror reflection, and beat-reactive fill area
- **Circular Spectrum**: 128 radial bars from a center ring with bass pulse ring, inner glow, and beat-reactive radius
- **Particle Field**: 80+ persistent particles with physics simulation, bass-reactive size/speed, line connections between nearby particles, and beat impulse explosions
- **Spectrogram**: Scrolling frequency heatmap colored by the active theme palette instead of hardcoded RGB
- **Blob**: Organic morphing shape driven by bass, treble, and mid frequencies with outer glow halo, radial gradient fill, and inner flash on beats

**Beat Detection (6.8):**
- Real-time bass energy analysis across the low 16 frequency bins
- Dynamic threshold based on rolling 30-frame energy history
- Beat triggers flash overlays, pulse effects, and impulse forces across all 6 modes

**Color Themes (6.12–6.13):**
- 4 built-in themes: Neon (magenta/cyan), Sunset (warm oranges/reds), Ocean (cool blues), Monochrome (white/grey)
- Theme selector buttons in the visualizer controls bar with active state indicator
- Custom color theme via two color pickers (accent + secondary) — overrides built-in themes
- All renderers use theme-aware color interpolation for smooth gradients

**Controls & Navigation (6.7, 6.9–6.11, 6.15):**
- Full-screen dark overlay with auto-resizing canvas
- Controls bar: fades in on hover (desktop) or tap (mobile), with backdrop blur
- Click/tap canvas to cycle through modes
- Swipe down to exit on mobile (100px threshold)
- `F` opens/closes, `ESC` closes, `1-6` switches modes directly
- Prev/Next mode buttons with mode label

**FPS-Aware Rendering (6.14):**
- Real-time FPS tracking with 1-second sample window
- Below 30 FPS: aggressively reduces particle count and bar count (down to 40% quality)
- Below 45 FPS: moderately reduces quality
- Above 55 FPS: gradually restores full quality
- Smooth quality transitions prevent visual jitter

---

## v0.6.7 — 2026-04-04

### Improvements

- **Audio persists across page refresh**: Audio files and album art are now stored in IndexedDB as blobs. After refreshing the page, all tracks are immediately playable — no need to re-add files
- Stored audio is cleaned up when tracks or playlists are deleted/cleared
- "Clear All Data" in Settings also clears stored audio files

---

## v0.6.6 — 2026-04-04

### UI Improvements

- **Settings is now a modal popup**: Opens as a centered overlay with backdrop blur, slide-up animation, and close via X / backdrop click / Escape — same style as Patch Notes
- **Load music moved to top bar**: Open Files and Open Folder buttons are now icon buttons in the top bar (left of Patch Notes), freeing up the main content area for playlists
- **File loader panel removed**: No more Load Music section taking up screen space. Drag-and-drop still works — drag files onto the playlist area and a drop zone appears
- **Cleaner layout**: Main content goes straight to the playlist, making better use of limited screen space on mobile

---

## v0.6.5 — 2026-04-04

### Bug Fixes

- **iPhone playback fixed**: Restructured audio initialization to work with iPhone Safari's strict autoplay policy. Play is now called synchronously within the user gesture chain instead of after an async `canplay` wait
- **Audio element warm-up**: First tap anywhere on the page now plays a silent audio frame to unlock the audio element on iOS, preventing "play() was interrupted" errors
- **Immediate playback**: `loadTrack` now starts playback instantly when setting the source instead of waiting — the browser buffers in the background

---

## v0.6.4 — 2026-04-04

### Improvements

- **Background playback on iPad/iOS**: Music now keeps playing when you switch tabs, apps, or lock the screen. Uses a backup audio element that bypasses Web Audio API when the page goes to background, then seamlessly syncs back when you return (EQ kicks back in automatically)
- **No more auto-resume**: Music no longer auto-starts when returning to the tab. If you paused before leaving, it stays paused. If it was playing, it continues from the exact position
- **Background controls**: Play/pause, skip, and seek all work from the lock screen and Control Center while the app is backgrounded
- Track-end auto-advance works even while backgrounded — the next song starts automatically

---

## v0.6.3 — 2026-04-04

### Improvements

- **Patch Notes redesigned**: Completely rebuilt as a modern modal popup with backdrop blur, slide-up animation, and collapsible version cards
- Each version entry has a clickable header showing version tag, date, and "Latest" badge for the newest release
- Older versions collapse by default — tap to expand any version
- Section headings (Bug Fixes, Improvements, etc.) styled with accent-colored labels
- Bullet items use clean dot markers with bold feature names
- Closes via X button, clicking the backdrop, or pressing Escape

---

## v0.6.2 — 2026-04-04

### Bug Fixes

- **Playlist survives refresh**: Re-adding files after a page refresh now re-links them to existing tracks by matching title and artist, instead of creating duplicates. Your playlist order, favorites, and play counts are preserved
- **Auto-advance fixed**: Next track plays correctly when a song ends. Unplayable tracks (no audio loaded) are automatically skipped
- **Shuffle/Repeat visibility**: Active shuffle and repeat buttons now show a solid accent-colored background so it's immediately obvious when they're on or off
- **Spacebar starts playback**: Pressing spacebar (or tapping Play) when no track is loaded now starts playing the first available track in the playlist
- **Unplayable track feedback**: Clicking a restored track that hasn't been re-linked shows "No audio loaded — re-add files to play" instead of silently failing

---

## v0.6.1 — 2026-04-04

### Bug Fixes

- **Background playback on iPad/iOS**: AudioContext now auto-resumes when returning from a background tab or app switch. Music continues playing when you switch apps, use other tabs, or lock the screen
- **iOS interruption handling**: AudioContext recovers from OS interruptions (phone calls, Siri, notifications)
- **Lock screen / Control Center**: Added seek forward/backward, seek-to, and position state reporting so the full scrubber and controls work from the lock screen and Control Center on iPad/iOS
- **Media Session**: Added `stop` action handler for system media controls

---

## v0.6.0 — 2026-04-04

### Phase 5 Complete — Equalizer

- **Frequency response curve (5.7)**: Live canvas rendering showing the combined EQ curve with smooth interpolation, band dots, and grid lines. Updates instantly as you drag sliders or switch presets
- **Save custom presets (5.8)**: "Save Custom" button prompts for a name and saves the current 10-band gain array as a reusable preset
- **Delete & rename custom presets (5.9)**: Custom presets section appears when you have saved presets, with Rename and Delete buttons for each
- **EQ persistence (5.10)**: Active preset, gain values, pre-amp, bypass state, and all custom presets are saved to IndexedDB and restored on app launch
- **EQ bypass toggle (5.12)**: "Bypass" button instantly flattens all EQ bands and pre-amp for quick A/B comparison. Curve greys out when bypassed. State persists across sessions
- Pre-amp slider now shows its current dB value

---

## v0.5.2 — 2026-04-04

### Bug Fixes

- **No audio on iOS/Safari**: AudioContext was created before any user gesture, leaving it permanently suspended. Added global touch/click unlock handler and synchronous `ctx.resume()` call to ensure Web Audio API output reaches speakers

---

## v0.5.1 — 2026-04-04

### Bug Fixes

- **iOS file picker**: Added explicit MIME types and file extensions to the file input accept attribute so iOS Safari recognizes .mp3 and other audio files (no more greyed-out Open button)
- **Scroll overlap**: Switched to `100dvh` (dynamic viewport height) for main content area so it accounts for iOS Safari's address bar; content now scrolls fully to the bottom
- **Duplicate heading**: Patch Notes panel no longer shows a redundant "Patch Notes — Bass Studio Pro" line above the version entries

---

## v0.5.0 — 2026-04-04

### Phase 4 Complete — Search & Favorites

**Search Highlighting (4.2):**
- Matching text in track titles, artists, and albums is highlighted with accent-colored `<mark>` tags as you type
- Highlights are visible on both normal and active (playing) tracks
- Regex special characters in search queries are safely escaped

**Smart Playlists (4.5, 4.7, 4.8):**
- New "Smart Playlists" section with tabbed interface: Favorites, Recently Played, Most Played
- **Favorites** tab shows all starred tracks collected across all playlists
- **Recently Played** tab shows the last 50 tracks you played (most recent first), persisted in IndexedDB
- **Most Played** tab shows tracks ranked by play count with count badges
- Smart playlists update in real time as you play tracks and toggle favorites
- Click any smart playlist track to play it; star icon toggles favorites inline
- Smart playlist data (recently played list, play counts) persists across sessions

**Previously Completed (from earlier phases):**
- 4.1: Real-time search filtering (done in Phase 3)
- 4.3: `/` keyboard shortcut to focus search bar (done in Phase 1)
- 4.4: Star/unstar tracks with toggle icon (done in Phase 2)
- 4.6: Favorites persist in IndexedDB (done in Phase 2)

---

## v0.4.1 — 2026-04-04

### Phase 3 Audit — Bug Fixes

- **HIGH**: ID3 parser now reads up to actual tag size instead of hardcoded 512KB — fixes truncated album art for large embedded images
- **HIGH**: Fixed ID3v2.3 extended header offset (was off by 4 bytes due to missing size field accounting)
- **HIGH**: Switching playlists now respects active filters and sort (was bypassing `refreshTrackView`)
- **MEDIUM**: Blob URLs for audio and album art are now revoked when tracks are removed or playlists cleared/deleted — prevents memory leaks
- **MEDIUM**: Filter dropdowns now reset when switching playlists — prevents stale filters showing no results

---

## v0.4.0 — 2026-04-04

### Phase 3 Complete — Metadata & Album Art

**ID3 Tag Parsing (3.1–3.2):**
- Custom zero-dependency ID3v1 + ID3v2.3/2.4 parser (`js/id3-parser.js`)
- Extracts title, artist, album, year, genre, track number from MP3 files
- Parsed metadata displayed as track name instead of filename
- ID3v1 fallback for older files missing ID3v2 tags

**Album Art (3.3–3.5):**
- Embedded APIC frame extracted and displayed as thumbnail in track list
- Album art shown in the Now Playing bar
- SVG placeholder art (vinyl record icon) when no embedded art exists
- Art blob URLs created per-track, session-only

**Track Detail Tooltip (3.6):**
- Hover over track thumbnail to see full metadata (title, artist, album, year, genre, track #, duration)
- Tooltip auto-positions to stay within viewport

**Media Session (3.7):**
- Lock screen / OS notification area now shows album art alongside title and artist

**Metadata Filters (3.8–3.10):**
- Filter by genre, artist, or album via dropdown selects
- Dropdowns auto-populate with unique values from the active playlist
- Filters combine with search for compound queries

**Sort (3.11):**
- Sort by title, artist, album, duration, or date added
- Toggle ascending/descending with sort direction button
- Sort applies on top of search and filters

---

## v0.3.1 — 2026-04-04

### Phase 2 Audit — Bug Fixes

- **CRITICAL**: Fixed deleted playlists reappearing after reload (were not removed from IndexedDB)
- **CRITICAL**: Fixed "Add to Queue" being a no-op (all track indices already present in queue)
- **HIGH**: Fixed `originalOrder` becoming stale when tracks added/removed during shuffle mode
- **HIGH**: Fixed context menu overflowing off-screen near viewport edges
- **HIGH**: Bumped service worker cache version to v0.3.1 (was stuck at v0.1.0)
- **MEDIUM**: Fixed repeat-one mode reloading entire track instead of seeking to start

---

## v0.3.0 — 2026-04-04

### Phase 2 Complete — Playlist Management

**Playlist CRUD:**
- Create named playlists via "New Playlist" button with name prompt
- Playlist selector dropdown to switch between playlists (shows track count)
- Rename playlists via prompt dialog
- Duplicate playlists (creates copy with new track IDs)
- Delete playlists with confirmation dialog
- Clear all tracks from a playlist with confirmation

**Track Management:**
- Remove individual tracks via ✕ button (visible on hover)
- Drag-and-drop reordering within the track list
- Right-click context menu with "Play Next", "Add to Queue", and "Remove" actions

**Queue & Playback:**
- Shuffle mode uses Fisher-Yates algorithm; un-shuffle restores original order
- Repeat modes cycle: Off → Repeat All → Repeat One
- "Play Next" inserts track immediately after the current one in queue
- "Add to Queue" appends track to end of queue

**Persistence:**
- All playlists persist in IndexedDB — survive reload, tab close, browser restart
- Debounced saves (300ms) prevent rapid writes during bulk operations
- Last active playlist restored on app launch
- Favorites persist across sessions

**Import / Export:**
- Export current playlist as downloadable JSON file
- Import playlist from JSON file (creates new playlist with metadata)

---

## v0.2.1 — 2026-04-04

### Phase 1 Audit — 42 Issues Found, All Critical/High/Medium Fixed

**CRITICAL fixes (4):**
- `audioElement.play()` now awaits and catches Promise rejections (autoplay policy, AbortError)
- `loadTrack()` pauses current playback before changing src, waits for `canplay` event before playing — eliminates race condition
- Visualizer `resize()` now uses `setTransform()` instead of cumulative `scale()` — was corrupting all rendering after any resize
- Panel toggle logic fixed: clicking EQ/Settings/Patch Notes again now properly closes the panel

**HIGH fixes (8):**
- File picker fallback (`pickViaInput`) now listens for `cancel` event — no longer hangs forever on Firefox/Safari when user cancels
- `readEntry` for directories now loops `readEntries()` until empty — was silently dropping files from folders with >100 entries
- Search results now use `playTrackById()` instead of array index — clicking a search result no longer plays the wrong track
- `search()` uses `(t.title || '')` defensive access — won't crash on undefined metadata
- Object URL memory leak fixed: temp Audio elements in `extractMetadata` are now cleaned up after reading duration
- Equalizer `setPreamp()` now calls `Player.setPreampGain()` — preamp slider actually adjusts audio
- Preamp slider in HTML wired to `Equalizer.setPreamp()` in app.js
- Favorite button in now-playing bar wired up — toggles star on current track

**MEDIUM fixes (6):**
- Album art `<img>` no longer has empty `src=""` (removed attribute, hidden by default) — prevents spurious HTTP request
- `F` key now toggles visualizer on/off (was only opening). VIZ button also toggles
- Drag-and-drop uses enter/leave counter to prevent class flicker on child elements
- `dropEffect = 'copy'` set on dragover for correct cursor icon
- `exportPlaylist` appends anchor to DOM before click — fixes Firefox download
- Patch notes markdown renderer now escapes HTML before transforms — prevents XSS injection

**LOW fixes (5):**
- Visualizer mode selection by number key uses `setMode(idx)` instead of infinite while loop
- `Storage.init()` wrapped in try-catch — app degrades gracefully if IndexedDB unavailable
- All `Storage.saveSetting` calls wrapped in try-catch
- System theme option now uses `matchMedia` to detect `prefers-color-scheme`
- `Player.off()` method added for future event listener cleanup
- Recursive directory traversal capped at depth 10 to prevent stack overflow
- File entry read errors now have error callbacks to prevent hung Promises
- Playlist IDs now include random suffix to prevent millisecond collisions
- Concurrent `addFiles` calls locked to prevent playlist corruption

---

## v0.2.0 — 2026-04-04

### Phase 1 Complete — Core Playback Engine
- Fixed critical bug: `createMediaElementSource` now called once in `init()` instead of per-track (was crashing on 2nd track)
- Removed `crossOrigin = 'anonymous'` from audio element — was blocking blob URL playback
- File loading: Open Files, Open Folder, and drag-and-drop all wired and functional
- Web Audio API graph: Source → EQ Filters → Gain → Analyser → Destination
- Play/Pause toggle with icon update (play ▶ / pause ⏸)
- Progress bar scrub/seek — doesn't fight the user while dragging
- Real-time time display (elapsed / total) in mm:ss format
- Volume slider connected to GainNode, persisted in IndexedDB across sessions
- Mute/unmute button with icon swap (speaker / muted)
- Previous button: restarts track if >3s in, otherwise goes back one
- Next button: advances to next track in queue
- Auto-advance to next track when current track ends
- Active track highlighted in playlist with accent color
- Empty state message when no tracks are loaded
- HTML-escaped track titles to prevent XSS from filenames
- Playlist event system refactored: `playtrack` now emits `{ track, index }` for proper highlighting
- Keyboard shortcuts: arrow keys now `preventDefault` to avoid page scroll

---

## v0.1.1 — 2026-04-04

### Development Roadmap
- Added PHASES.md with 14-phase development plan (151 total tasks)
- Phases cover: Core Playback, Playlists, Metadata, Search, EQ, Visualizers, Advanced Playback, Settings, Mini Player, PWA, Accessibility, Lyrics, Audio Effects, and Final Polish
- Each phase has a version target, task checklist, and definition of done

---

## v0.1.0 — 2026-04-04

### Initial Project Skeleton
- Created project structure and architecture outline
- Added CLAUDE.md development guide
- Added README.md with GitHub Pages link and feature overview
- Added FEATURES.md with full feature specification
- Added PATCH_NOTES.md changelog system
- Defined core modules: player, playlist, equalizer, visualizer, file-loader, storage
- Defined app skeleton: index.html, CSS, JS modules, service worker, PWA manifest
- Established 14 EQ presets, 6 visualizer modes, and full keyboard shortcut map
