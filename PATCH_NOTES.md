# Patch Notes — Bass Studio Pro

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
