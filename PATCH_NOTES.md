# Patch Notes — Bass Studio Pro

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
