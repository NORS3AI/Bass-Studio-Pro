/**
 * playlist.js — Playlist management, queue, shuffle, repeat
 */
const Playlist = (() => {
  let playlists = [];          // Array of { id, name, tracks[] }
  let activePlaylistId = null;
  let queue = [];              // Current ordered queue of track indices
  let currentIndex = -1;
  let shuffleOn = false;
  let repeatMode = 'off';     // 'off' | 'all' | 'one'
  let favorites = new Set();

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
    if (!pl) pl = createPlaylist('My Playlist');
    if (!activePlaylistId) activePlaylistId = pl.id;

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
    if (shuffleOn) shuffleArray(queue);
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

  function playIndex(index) {
    const pl = getActive();
    if (!pl || index < 0 || index >= pl.tracks.length) return;
    currentIndex = index;
    const track = pl.tracks[queue[currentIndex]];
    emit('playtrack', track);
  }

  function next() {
    const pl = getActive();
    if (!pl) return;
    if (repeatMode === 'one') { playIndex(currentIndex); return; }
    if (currentIndex < queue.length - 1) {
      playIndex(currentIndex + 1);
    } else if (repeatMode === 'all') {
      playIndex(0);
    }
  }

  function prev() {
    if (Player.getCurrentTime() > 3) { Player.seek(0); return; }
    if (currentIndex > 0) playIndex(currentIndex - 1);
  }

  function toggleFavorite(trackId) {
    favorites.has(trackId) ? favorites.delete(trackId) : favorites.add(trackId);
    emit('favoriteschanged', favorites);
  }

  function isFavorite(trackId) {
    return favorites.has(trackId);
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
    const data = JSON.stringify({ name: pl.name, tracks: pl.tracks.map(t => ({ title: t.title, artist: t.artist, album: t.album })) }, null, 2);
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
    playIndex, next, prev, search,
    toggleFavorite, isFavorite, exportPlaylist,
    get playlists() { return playlists; },
    get shuffleOn() { return shuffleOn; },
    get repeatMode() { return repeatMode; },
  };
})();
