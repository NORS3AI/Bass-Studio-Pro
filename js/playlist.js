/**
 * playlist.js — Playlist management, queue, shuffle, repeat, persistence
 */
const Playlist = (() => {
  let playlists = [];          // Array of { id, name, tracks[] }
  let activePlaylistId = null;
  let queue = [];              // Indices into the active playlist's tracks[]
  let currentQueuePos = -1;    // Position within the queue
  let shuffleOn = false;
  let repeatMode = 'off';     // 'off' | 'all' | 'one'
  let favorites = new Set();
  let currentTrackId = null;   // id of the currently playing track
  let loading = false;         // Lock to prevent concurrent addFiles
  let originalOrder = null;    // Saved pre-shuffle order for un-shuffle

  const listeners = {};
  function on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); }
  function emit(event, data) { (listeners[event] || []).forEach(fn => fn(data)); }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  // ============================================
  // PLAYLIST CRUD (2.1, 2.2, 2.3, 2.4, 2.6)
  // ============================================

  function getActive() {
    return playlists.find(p => p.id === activePlaylistId) || null;
  }

  function getAll() {
    return playlists;
  }

  function createPlaylist(name) {
    const pl = { id: uid(), name, tracks: [] };
    playlists.push(pl);
    emit('playlistschanged', playlists);
    scheduleSave();
    return pl;
  }

  function renamePlaylist(id, newName) {
    const pl = playlists.find(p => p.id === id);
    if (pl) {
      pl.name = newName;
      emit('playlistschanged', playlists);
      scheduleSave();
    }
  }

  function deletePlaylist(id) {
    playlists = playlists.filter(p => p.id !== id);
    // Remove from IndexedDB immediately (scheduleSave only saves existing playlists)
    try { Storage.deletePlaylist(id); } catch (_) {}
    if (activePlaylistId === id) {
      activePlaylistId = playlists[0]?.id || null;
      buildQueue();
      emit('activechanged', getActive());
    }
    emit('playlistschanged', playlists);
    scheduleSave();
  }

  function duplicatePlaylist(id) {
    const src = playlists.find(p => p.id === id);
    if (!src) return null;
    const pl = {
      id: uid(),
      name: src.name + ' (Copy)',
      tracks: src.tracks.map(t => ({ ...t, id: uid() })),
    };
    playlists.push(pl);
    emit('playlistschanged', playlists);
    scheduleSave();
    return pl;
  }

  function clearPlaylist(id) {
    const pl = playlists.find(p => p.id === (id || activePlaylistId));
    if (!pl) return;
    pl.tracks = [];
    if (pl.id === activePlaylistId) {
      buildQueue();
    }
    emit('trackschanged', pl);
    scheduleSave();
  }

  function setActive(id) {
    activePlaylistId = id;
    buildQueue();
    emit('activechanged', getActive());
    try { Storage.saveState('activePlaylistId', id); } catch (_) {}
  }

  // ============================================
  // TRACK MANAGEMENT (2.5, add files)
  // ============================================

  async function addFiles(files) {
    if (loading) return;
    loading = true;

    try {
      let pl = getActive();
      if (!pl) {
        pl = createPlaylist('My Playlist');
        activePlaylistId = pl.id;
      }

      for (const file of files) {
        const meta = await FileLoader.extractMetadata(file);
        const track = { id: uid(), ...meta };
        pl.tracks.push(track);
      }
      buildQueue();
      emit('trackschanged', pl);
      scheduleSave();
    } finally {
      loading = false;
    }
  }

  function removeTrack(trackId) {
    const pl = getActive();
    if (!pl) return;
    pl.tracks = pl.tracks.filter(t => t.id !== trackId);
    buildQueue();
    emit('trackschanged', pl);
    scheduleSave();
  }

  /**
   * Move a track from one index to another (drag-and-drop reorder).
   */
  function moveTrack(fromIndex, toIndex) {
    const pl = getActive();
    if (!pl) return;
    if (fromIndex < 0 || fromIndex >= pl.tracks.length) return;
    if (toIndex < 0 || toIndex >= pl.tracks.length) return;
    if (fromIndex === toIndex) return;

    const [moved] = pl.tracks.splice(fromIndex, 1);
    pl.tracks.splice(toIndex, 0, moved);
    buildQueue();
    emit('trackschanged', pl);
    scheduleSave();
  }

  // ============================================
  // QUEUE & PLAYBACK (2.7, 2.8, 2.9, 2.10, 2.11)
  // ============================================

  function buildQueue() {
    const pl = getActive();
    if (!pl) { queue = []; currentQueuePos = -1; return; }

    queue = pl.tracks.map((_, i) => i);

    if (shuffleOn) {
      // Invalidate originalOrder since track list may have changed
      originalOrder = null;
      shuffleArray(queue);
      if (currentTrackId) {
        const playingIdx = pl.tracks.findIndex(t => t.id === currentTrackId);
        if (playingIdx >= 0) {
          const pos = queue.indexOf(playingIdx);
          if (pos > 0) {
            [queue[0], queue[pos]] = [queue[pos], queue[0]];
          }
        }
      }
    }

    // Recalculate queue position
    if (currentTrackId) {
      const playingIdx = pl.tracks.findIndex(t => t.id === currentTrackId);
      currentQueuePos = queue.indexOf(playingIdx);
    }
  }

  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function toggleShuffle() {
    if (!shuffleOn) {
      // Save original order before shuffling
      originalOrder = queue.slice();
    }
    shuffleOn = !shuffleOn;
    if (!shuffleOn) {
      if (originalOrder) {
        // Un-shuffle: restore original order
        queue = originalOrder;
      } else {
        // originalOrder was invalidated (tracks changed during shuffle) — rebuild sequential
        const pl = getActive();
        queue = pl ? pl.tracks.map((_, i) => i) : [];
      }
      originalOrder = null;
      if (currentTrackId) {
        const pl = getActive();
        if (pl) {
          const playingIdx = pl.tracks.findIndex(t => t.id === currentTrackId);
          currentQueuePos = queue.indexOf(playingIdx);
        }
      }
    } else {
      buildQueue();
    }
    emit('shufflechanged', shuffleOn);
  }

  function cycleRepeat() {
    const modes = ['off', 'all', 'one'];
    repeatMode = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
    emit('repeatchanged', repeatMode);
  }

  /**
   * Insert a track to play immediately after the current one.
   */
  function playNext(trackId) {
    const pl = getActive();
    if (!pl) return;
    const trackIdx = pl.tracks.findIndex(t => t.id === trackId);
    if (trackIdx < 0) return;

    // Remove from current position in queue if present
    const existingPos = queue.indexOf(trackIdx);
    if (existingPos >= 0) queue.splice(existingPos, 1);

    // Insert right after current position
    const insertPos = currentQueuePos + 1;
    queue.splice(insertPos, 0, trackIdx);

    // Fix currentQueuePos if it shifted
    if (currentTrackId) {
      const playingIdx = pl.tracks.findIndex(t => t.id === currentTrackId);
      currentQueuePos = queue.indexOf(playingIdx);
    }
  }

  /**
   * Append a track to the end of the queue.
   * Allows duplicates — the track will play again at the end.
   */
  function addToQueue(trackId) {
    const pl = getActive();
    if (!pl) return;
    const trackIdx = pl.tracks.findIndex(t => t.id === trackId);
    if (trackIdx < 0) return;

    queue.push(trackIdx);
  }

  // ============================================
  // PLAYBACK CONTROL
  // ============================================

  function playIndex(trackIndex) {
    const pl = getActive();
    if (!pl || trackIndex < 0 || trackIndex >= pl.tracks.length) return;

    const queuePos = queue.indexOf(trackIndex);
    if (queuePos >= 0) currentQueuePos = queuePos;

    const track = pl.tracks[trackIndex];
    currentTrackId = track.id;
    emit('playtrack', { track, index: trackIndex });
  }

  function playTrackById(trackId) {
    const pl = getActive();
    if (!pl) return;
    const index = pl.tracks.findIndex(t => t.id === trackId);
    if (index >= 0) playIndex(index);
  }

  function next() {
    const pl = getActive();
    if (!pl || queue.length === 0) return;

    if (repeatMode === 'one') {
      // Seek to start instead of re-loading the track
      Player.seek(0);
      Player.play();
      return;
    }

    if (currentQueuePos < queue.length - 1) {
      currentQueuePos++;
    } else if (repeatMode === 'all') {
      currentQueuePos = 0;
    } else {
      return;
    }

    const trackIndex = queue[currentQueuePos];
    const track = pl.tracks[trackIndex];
    currentTrackId = track.id;
    emit('playtrack', { track, index: trackIndex });
  }

  function prev() {
    const pl = getActive();
    if (!pl || queue.length === 0) return;

    if (Player.getCurrentTime() > 3) {
      Player.seek(0);
      return;
    }

    if (currentQueuePos > 0) {
      currentQueuePos--;
      const trackIndex = queue[currentQueuePos];
      const track = pl.tracks[trackIndex];
      currentTrackId = track.id;
      emit('playtrack', { track, index: trackIndex });
    }
  }

  // ============================================
  // FAVORITES
  // ============================================

  function toggleFavorite(trackId) {
    favorites.has(trackId) ? favorites.delete(trackId) : favorites.add(trackId);
    emit('favoriteschanged', favorites);
    try { Storage.saveState('favorites', [...favorites]); } catch (_) {}
  }

  function isFavorite(trackId) {
    return favorites.has(trackId);
  }

  function getCurrentTrackId() {
    return currentTrackId;
  }

  // ============================================
  // SEARCH
  // ============================================

  function search(query) {
    const pl = getActive();
    if (!pl) return [];
    const q = query.toLowerCase();
    return pl.tracks.filter(t =>
      (t.title || '').toLowerCase().includes(q) ||
      (t.artist || '').toLowerCase().includes(q) ||
      (t.album || '').toLowerCase().includes(q)
    );
  }

  // ============================================
  // EXPORT / IMPORT (2.14, 2.15)
  // ============================================

  function exportPlaylist() {
    const pl = getActive();
    if (!pl) return;
    const data = JSON.stringify({
      name: pl.name,
      tracks: pl.tracks.map(t => ({
        title: t.title, artist: t.artist, album: t.album, duration: t.duration,
      })),
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pl.name}.json`;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  /**
   * Import a playlist from a JSON file.
   * Creates a new playlist with the imported tracks (metadata only, no audio data).
   */
  function importPlaylist(jsonString) {
    try {
      const data = JSON.parse(jsonString);
      if (!data.name || !Array.isArray(data.tracks)) return null;

      const pl = {
        id: uid(),
        name: data.name,
        tracks: data.tracks.map(t => ({
          id: uid(),
          title: t.title || 'Unknown',
          artist: t.artist || 'Unknown Artist',
          album: t.album || 'Unknown Album',
          duration: t.duration || 0,
          file: null,
          url: null,
        })),
      };
      playlists.push(pl);
      emit('playlistschanged', playlists);
      scheduleSave();
      return pl;
    } catch (e) {
      return null;
    }
  }

  // ============================================
  // PERSISTENCE (2.12, 2.13)
  // ============================================

  let saveTimer = null;

  /**
   * Debounced save — prevents rapid IndexedDB writes during bulk operations.
   */
  function scheduleSave() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(persistAll, 300);
  }

  async function persistAll() {
    try {
      // Save each playlist (without File objects or blob URLs)
      for (const pl of playlists) {
        await Storage.savePlaylist({
          id: pl.id,
          name: pl.name,
          tracks: pl.tracks.map(t => ({
            id: t.id,
            title: t.title,
            artist: t.artist,
            album: t.album,
            duration: t.duration,
            // file and url are session-only — cannot persist blob URLs
          })),
        });
      }
      // Save active playlist ID
      await Storage.saveState('activePlaylistId', activePlaylistId);
      // Save favorites
      await Storage.saveState('favorites', [...favorites]);
    } catch (_) {}
  }

  /**
   * Restore playlists from IndexedDB on launch.
   * Tracks will have metadata but no audio data — user must re-add files to play.
   */
  async function restore() {
    try {
      const saved = await Storage.getAllPlaylists();
      if (saved && saved.length > 0) {
        playlists = saved.map(pl => ({
          ...pl,
          tracks: (pl.tracks || []).map(t => ({
            ...t,
            file: null,
            url: null,
          })),
        }));

        const savedActive = await Storage.getState('activePlaylistId');
        if (savedActive && playlists.find(p => p.id === savedActive)) {
          activePlaylistId = savedActive;
        } else {
          activePlaylistId = playlists[0]?.id || null;
        }

        const savedFavs = await Storage.getState('favorites');
        if (Array.isArray(savedFavs)) {
          favorites = new Set(savedFavs);
        }

        buildQueue();
        emit('playlistschanged', playlists);
        emit('activechanged', getActive());
      }
    } catch (_) {}
  }

  return {
    on, getAll, getActive, setActive,
    createPlaylist, renamePlaylist, deletePlaylist, duplicatePlaylist, clearPlaylist,
    addFiles, removeTrack, moveTrack,
    toggleShuffle, cycleRepeat, playNext, addToQueue,
    playIndex, playTrackById, next, prev,
    search, getCurrentTrackId,
    toggleFavorite, isFavorite,
    exportPlaylist, importPlaylist,
    restore,
    get playlists() { return playlists; },
    get shuffleOn() { return shuffleOn; },
    get repeatMode() { return repeatMode; },
  };
})();
