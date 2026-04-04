/**
 * playlist.js — Playlist management, queue, shuffle, repeat
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

  const listeners = {};
  function on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); }
  function emit(event, data) { (listeners[event] || []).forEach(fn => fn(data)); }

  function getActive() {
    return playlists.find(p => p.id === activePlaylistId) || null;
  }

  function createPlaylist(name) {
    const pl = { id: Date.now().toString(36), name, tracks: [] };
    playlists.push(pl);
    emit('playlistschanged', playlists);
    return pl;
  }

  function deletePlaylist(id) {
    playlists = playlists.filter(p => p.id !== id);
    if (activePlaylistId === id) activePlaylistId = playlists[0]?.id || null;
    emit('playlistschanged', playlists);
  }

  function setActive(id) {
    activePlaylistId = id;
    buildQueue();
    emit('activechanged', getActive());
  }

  async function addFiles(files) {
    let pl = getActive();
    if (!pl) {
      pl = createPlaylist('My Playlist');
      activePlaylistId = pl.id;
    }

    for (const file of files) {
      const meta = await FileLoader.extractMetadata(file);
      const track = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        ...meta,
      };
      pl.tracks.push(track);
    }
    buildQueue();
    emit('trackschanged', pl);
  }

  function removeTrack(trackId) {
    const pl = getActive();
    if (!pl) return;
    pl.tracks = pl.tracks.filter(t => t.id !== trackId);
    buildQueue();
    emit('trackschanged', pl);
  }

  function buildQueue() {
    const pl = getActive();
    if (!pl) { queue = []; return; }
    queue = pl.tracks.map((_, i) => i);
    if (shuffleOn) {
      // Keep currently playing track at position 0 if there is one
      const playingIdx = pl.tracks.findIndex(t => t.id === currentTrackId);
      shuffleArray(queue);
      if (playingIdx >= 0) {
        const pos = queue.indexOf(playingIdx);
        if (pos > 0) {
          [queue[0], queue[pos]] = [queue[pos], queue[0]];
        }
        currentQueuePos = 0;
      }
    }
  }

  function shuffleArray(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
  }

  function toggleShuffle() {
    shuffleOn = !shuffleOn;
    buildQueue();
    emit('shufflechanged', shuffleOn);
  }

  function cycleRepeat() {
    const modes = ['off', 'all', 'one'];
    repeatMode = modes[(modes.indexOf(repeatMode) + 1) % modes.length];
    emit('repeatchanged', repeatMode);
  }

  /**
   * Play a track by its index in the visible track list.
   * This maps directly to playlist.tracks[index].
   */
  function playIndex(trackIndex) {
    const pl = getActive();
    if (!pl || trackIndex < 0 || trackIndex >= pl.tracks.length) return;

    // Find this track's position in the queue
    const queuePos = queue.indexOf(trackIndex);
    if (queuePos >= 0) currentQueuePos = queuePos;

    const track = pl.tracks[trackIndex];
    currentTrackId = track.id;
    emit('playtrack', { track, index: trackIndex });
  }

  function next() {
    const pl = getActive();
    if (!pl || queue.length === 0) return;

    if (repeatMode === 'one') {
      // Replay current
      const trackIndex = queue[currentQueuePos];
      const track = pl.tracks[trackIndex];
      emit('playtrack', { track, index: trackIndex });
      return;
    }

    if (currentQueuePos < queue.length - 1) {
      currentQueuePos++;
    } else if (repeatMode === 'all') {
      currentQueuePos = 0;
    } else {
      return; // End of playlist, no repeat
    }

    const trackIndex = queue[currentQueuePos];
    const track = pl.tracks[trackIndex];
    currentTrackId = track.id;
    emit('playtrack', { track, index: trackIndex });
  }

  function prev() {
    const pl = getActive();
    if (!pl || queue.length === 0) return;

    // If more than 3 seconds in, restart current track
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

  function toggleFavorite(trackId) {
    favorites.has(trackId) ? favorites.delete(trackId) : favorites.add(trackId);
    emit('favoriteschanged', favorites);
  }

  function isFavorite(trackId) {
    return favorites.has(trackId);
  }

  function getCurrentTrackId() {
    return currentTrackId;
  }

  function search(query) {
    const pl = getActive();
    if (!pl) return [];
    const q = query.toLowerCase();
    return pl.tracks.filter(t =>
      t.title.toLowerCase().includes(q) ||
      t.artist.toLowerCase().includes(q) ||
      t.album.toLowerCase().includes(q)
    );
  }

  function exportPlaylist() {
    const pl = getActive();
    if (!pl) return;
    const data = JSON.stringify({
      name: pl.name,
      tracks: pl.tracks.map(t => ({ title: t.title, artist: t.artist, album: t.album })),
    }, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${pl.name}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return {
    on, createPlaylist, deletePlaylist, setActive, getActive,
    addFiles, removeTrack, toggleShuffle, cycleRepeat,
    playIndex, next, prev, search, getCurrentTrackId,
    toggleFavorite, isFavorite, exportPlaylist,
    get playlists() { return playlists; },
    get shuffleOn() { return shuffleOn; },
    get repeatMode() { return repeatMode; },
  };
})();
