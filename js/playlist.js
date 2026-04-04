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

  // Smart playlist data (4.7, 4.8)
  let recentlyPlayed = [];     // Array of { trackId, playlistId, timestamp }
  let playCounts = {};          // { trackId: count }
  const MAX_RECENT = 50;

  const listeners = {};
  function on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); }
  function emit(event, data) { (listeners[event] || []).forEach(fn => fn(data)); }

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /**
   * Revoke blob URLs held by a track to prevent memory leaks.
   */
  function revokeTrackURLs(track) {
    if (track.url) { try { URL.revokeObjectURL(track.url); } catch (_) {} track.url = null; }
    if (track.artUrl) { try { URL.revokeObjectURL(track.artUrl); } catch (_) {} track.artUrl = null; }
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
    const toDelete = playlists.find(p => p.id === id);
    if (toDelete) {
      toDelete.tracks.forEach(t => {
        revokeTrackURLs(t);
        try { Storage.deleteAudioFile(t.id); } catch (_) {}
      });
    }
    playlists = playlists.filter(p => p.id !== id);
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
    pl.tracks.forEach(t => {
      revokeTrackURLs(t);
      try { Storage.deleteAudioFile(t.id); } catch (_) {}
    });
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

        // Try to re-link a restored track that has no URL (after page refresh)
        const existing = pl.tracks.find(t =>
          !t.url && t.title === meta.title && t.artist === meta.artist
        );

        const trackId = existing ? existing.id : uid();

        if (existing) {
          existing.file = meta.file;
          existing.url = meta.url;
          existing.artUrl = meta.artUrl;
          existing.duration = meta.duration || existing.duration;
          if (meta.genre) existing.genre = meta.genre;
          if (meta.year) existing.year = meta.year;
          if (meta.trackNumber) existing.trackNumber = meta.trackNumber;
        } else {
          const track = { id: trackId, ...meta };
          pl.tracks.push(track);
        }

        // Persist audio file data to IndexedDB so it survives refresh
        persistAudioFile(trackId, meta.file, meta.artUrl);
      }
      buildQueue();
      emit('trackschanged', pl);
      scheduleSave();
    } finally {
      loading = false;
    }
  }

  /**
   * Store audio file blob and album art blob in IndexedDB.
   * Runs in the background — doesn't block track loading.
   */
  function persistAudioFile(trackId, file, artUrl) {
    if (!file) return;
    // Read the file as a blob (File is already a Blob subclass)
    const audioBlob = new Blob([file], { type: file.type || 'audio/mpeg' });

    const onSaveError = (err) => {
      if (err && (err.name === 'QuotaExceededError' || /quota/i.test(err.message || ''))) {
        emit('storagefull', { trackId });
        console.warn('Storage quota exceeded — audio not persisted for track', trackId);
      } else if (err) {
        console.warn('Audio persistence failed:', err);
      }
    };

    // If there's art, fetch the blob URL to get the art blob
    if (artUrl) {
      fetch(artUrl).then(res => res.blob()).then(artBlob => {
        Storage.saveAudioFile(trackId, audioBlob, artBlob).catch(onSaveError);
      }).catch(() => {
        Storage.saveAudioFile(trackId, audioBlob, null).catch(onSaveError);
      });
    } else {
      Storage.saveAudioFile(trackId, audioBlob, null).catch(onSaveError);
    }
  }

  function removeTrack(trackId) {
    const pl = getActive();
    if (!pl) return;
    const track = pl.tracks.find(t => t.id === trackId);
    if (track) revokeTrackURLs(track);
    pl.tracks = pl.tracks.filter(t => t.id !== trackId);
    try { Storage.deleteAudioFile(trackId); } catch (_) {}
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

    const track = pl.tracks[trackIndex];
    if (!track.url) {
      emit('trackerror', { track, message: 'No audio loaded — re-add files to play' });
      return;
    }

    const queuePos = queue.indexOf(trackIndex);
    if (queuePos >= 0) currentQueuePos = queuePos;

    currentTrackId = track.id;
    recordPlay(track.id, pl.id);
    emit('playtrack', { track, index: trackIndex });
  }

  function playTrackById(trackId) {
    const pl = getActive();
    if (!pl) return;
    const index = pl.tracks.findIndex(t => t.id === trackId);
    if (index >= 0) playIndex(index);
  }

  /**
   * Play the first playable track in the queue (for spacebar with nothing playing).
   */
  function playFirst() {
    const pl = getActive();
    if (!pl || queue.length === 0) return;
    for (let i = 0; i < queue.length; i++) {
      const track = pl.tracks[queue[i]];
      if (track && track.url) {
        playIndex(queue[i]);
        return;
      }
    }
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

    // Try to find the next playable track (has a URL)
    const startPos = currentQueuePos;
    let attempts = 0;
    while (attempts < queue.length) {
      if (currentQueuePos < queue.length - 1) {
        currentQueuePos++;
      } else if (repeatMode === 'all') {
        currentQueuePos = 0;
      } else {
        return;
      }

      const trackIndex = queue[currentQueuePos];
      const track = pl.tracks[trackIndex];
      if (track && track.url) {
        currentTrackId = track.id;
        recordPlay(track.id, pl.id);
        emit('playtrack', { track, index: trackIndex });
        return;
      }
      attempts++;
      // Prevent infinite loop if we've wrapped around
      if (currentQueuePos === startPos) return;
    }
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
  // SMART PLAYLISTS (4.5, 4.7, 4.8)
  // ============================================

  /**
   * Record that a track was played. Updates recently played + play counts.
   */
  function recordPlay(trackId, playlistId) {
    // Recently played (4.7)
    recentlyPlayed = recentlyPlayed.filter(r => r.trackId !== trackId);
    recentlyPlayed.unshift({ trackId, playlistId, timestamp: Date.now() });
    if (recentlyPlayed.length > MAX_RECENT) recentlyPlayed.length = MAX_RECENT;

    // Play counts (4.8)
    playCounts[trackId] = (playCounts[trackId] || 0) + 1;

    scheduleSmartSave();
  }

  /**
   * Find a track object by ID across all playlists.
   */
  function findTrackById(trackId) {
    for (const pl of playlists) {
      const t = pl.tracks.find(tr => tr.id === trackId);
      if (t) return t;
    }
    return null;
  }

  /**
   * Get all favorited tracks across all playlists (4.5).
   */
  function getFavorites() {
    const result = [];
    for (const pl of playlists) {
      for (const t of pl.tracks) {
        if (favorites.has(t.id)) result.push(t);
      }
    }
    return result;
  }

  /**
   * Get recently played tracks (4.7). Returns track objects (most recent first).
   */
  function getRecentlyPlayed() {
    const result = [];
    for (const entry of recentlyPlayed) {
      const track = findTrackById(entry.trackId);
      if (track) result.push(track);
    }
    return result;
  }

  /**
   * Get most played tracks (4.8). Returns track objects sorted by play count desc.
   */
  function getMostPlayed() {
    const entries = Object.entries(playCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, MAX_RECENT);
    const result = [];
    for (const [trackId] of entries) {
      const track = findTrackById(trackId);
      if (track) result.push(track);
    }
    return result;
  }

  function getPlayCount(trackId) {
    return playCounts[trackId] || 0;
  }

  let smartSaveTimer = null;
  function scheduleSmartSave() {
    if (smartSaveTimer) clearTimeout(smartSaveTimer);
    smartSaveTimer = setTimeout(persistSmartData, 500);
  }

  async function persistSmartData() {
    try {
      await Storage.saveState('recentlyPlayed', recentlyPlayed);
      await Storage.saveState('playCounts', playCounts);
    } catch (_) {}
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
      (t.album || '').toLowerCase().includes(q) ||
      (t.genre || '').toLowerCase().includes(q)
    );
  }

  // ============================================
  // FILTER & SORT (3.8–3.11)
  // ============================================

  /**
   * Filter active playlist by a metadata field value.
   * @param {'genre'|'artist'|'album'} field
   * @param {string} value — exact match (case-insensitive)
   */
  function filterBy(field, value) {
    const pl = getActive();
    if (!pl) return [];
    const v = value.toLowerCase();
    return pl.tracks.filter(t => (t[field] || '').toLowerCase() === v);
  }

  /**
   * Get unique values for a metadata field in the active playlist.
   * Useful for populating filter dropdowns.
   */
  function getUniqueValues(field) {
    const pl = getActive();
    if (!pl) return [];
    const values = new Set();
    pl.tracks.forEach(t => {
      const val = t[field];
      if (val && val !== 'Unknown Artist' && val !== 'Unknown Album') {
        values.add(val);
      }
    });
    return [...values].sort((a, b) => a.localeCompare(b));
  }

  /**
   * Sort a tracks array by the given key.
   * Returns a new sorted array (does not mutate the playlist).
   * @param {Array} tracks — array of track objects
   * @param {'title'|'artist'|'album'|'duration'|'addedAt'} key
   * @param {boolean} ascending
   */
  function sortTracks(tracks, key, ascending) {
    if (ascending === undefined) ascending = true;
    return [...tracks].sort((a, b) => {
      let va = a[key], vb = b[key];
      if (typeof va === 'string') va = va.toLowerCase();
      if (typeof vb === 'string') vb = vb.toLowerCase();
      if (va == null) va = '';
      if (vb == null) vb = '';
      let cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return ascending ? cmp : -cmp;
    });
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
        title: t.title, artist: t.artist, album: t.album,
        year: t.year, genre: t.genre, trackNumber: t.trackNumber,
        duration: t.duration,
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
          year: t.year || null,
          genre: t.genre || null,
          trackNumber: t.trackNumber || null,
          duration: t.duration || 0,
          artUrl: null,
          file: null,
          url: null,
          addedAt: Date.now(),
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
            year: t.year || null,
            genre: t.genre || null,
            trackNumber: t.trackNumber || null,
            duration: t.duration,
            addedAt: t.addedAt || null,
            // file, url, artUrl are session-only — cannot persist blob URLs
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
   * Recreates blob URLs from stored audio/art blobs so tracks are playable immediately.
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
            artUrl: null,
          })),
        }));

        // Restore audio blobs → blob URLs for all tracks
        for (const pl of playlists) {
          for (const track of pl.tracks) {
            try {
              const stored = await Storage.getAudioFile(track.id);
              if (stored) {
                if (stored.audioBlob) {
                  track.url = URL.createObjectURL(stored.audioBlob);
                }
                if (stored.artBlob) {
                  track.artUrl = URL.createObjectURL(stored.artBlob);
                }
              }
            } catch (_) {}
          }
        }

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

        // Restore smart playlist data (4.7, 4.8)
        const savedRecent = await Storage.getState('recentlyPlayed');
        if (Array.isArray(savedRecent)) recentlyPlayed = savedRecent;
        const savedCounts = await Storage.getState('playCounts');
        if (savedCounts && typeof savedCounts === 'object') playCounts = savedCounts;

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
    playIndex, playTrackById, playFirst, next, prev,
    search, filterBy, getUniqueValues, sortTracks, getCurrentTrackId,
    toggleFavorite, isFavorite,
    getFavorites, getRecentlyPlayed, getMostPlayed, getPlayCount, findTrackById,
    exportPlaylist, importPlaylist,
    restore,
    get playlists() { return playlists; },
    get shuffleOn() { return shuffleOn; },
    get repeatMode() { return repeatMode; },
  };
})();
