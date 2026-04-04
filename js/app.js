/**
 * app.js — Application initialization and UI wiring
 */
(async function () {
  'use strict';

  // --- Init core modules ---
  try {
    await Storage.init();
  } catch (e) {
    console.warn('IndexedDB unavailable, running without persistence:', e);
  }

  Player.init();
  Equalizer.init();
  Visualizer.init();
  await PatchNotes.load();

  // --- Restore persisted data ---
  try {
    const savedVolume = await Storage.getSetting('volume');
    if (savedVolume !== null) Player.setVolume(savedVolume);
  } catch (_) {}

  // Restore playlists from IndexedDB (Phase 2: task 2.13)
  await Playlist.restore();

  // --- DOM refs ---
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);
  const btnOpenFiles   = $('#btn-open-files');
  const btnOpenFolder  = $('#btn-open-folder');
  const dropZone       = $('#drop-zone');
  const trackList      = $('#track-list');
  const searchInput    = $('#search-input');
  const playlistSelector = $('#playlist-selector');
  const btnPlay        = $('#btn-play');
  const btnPrev        = $('#btn-prev');
  const btnNext        = $('#btn-next');
  const btnShuffle     = $('#btn-shuffle');
  const btnRepeat      = $('#btn-repeat');
  const btnMute        = $('#btn-mute');
  const btnFavorite    = $('#btn-favorite');
  const btnEqToggle    = $('#btn-eq-toggle');
  const btnVizToggle   = $('#btn-viz-toggle');
  const btnSpeed       = $('#btn-speed');
  const btnSettings    = $('#btn-settings');
  const btnPatchNotes  = $('#btn-patch-notes');
  const progressBar    = $('#progress-bar');
  const volumeSlider   = $('#volume-slider');
  const timeElapsed    = $('#time-elapsed');
  const timeTotal      = $('#time-total');
  const trackTitle     = $('#track-title');
  const trackArtist    = $('#track-artist');
  const albumArt       = $('#album-art');
  const eqSection      = $('#eq-section');
  const settingsSection = $('#settings-section');
  const patchSection   = $('#patch-notes-section');
  const vizOverlay     = $('#visualizer-overlay');
  const vizModeLabel   = $('#viz-mode-label');
  const contextMenu    = $('#track-context-menu');

  albumArt.style.display = 'none';
  albumArt.removeAttribute('src');
  volumeSlider.value = Player.getVolume() * 100;

  // ============================================
  // FILE LOADING
  // ============================================

  btnOpenFiles.addEventListener('click', async () => {
    const files = await FileLoader.openFiles();
    if (files.length) await Playlist.addFiles(files);
  });

  btnOpenFolder.addEventListener('click', async () => {
    const files = await FileLoader.openFolder();
    if (files.length) await Playlist.addFiles(files);
  });

  let dragCounter = 0;
  dropZone.addEventListener('dragenter', (e) => { e.preventDefault(); dragCounter++; dropZone.classList.add('dragover'); });
  dropZone.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  dropZone.addEventListener('dragleave', () => { dragCounter--; if (dragCounter === 0) dropZone.classList.remove('dragover'); });
  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault(); dragCounter = 0; dropZone.classList.remove('dragover');
    const files = await FileLoader.handleDrop(e.dataTransfer);
    if (files.length) await Playlist.addFiles(files);
  });

  // ============================================
  // PLAYLIST SELECTOR (2.2)
  // ============================================

  function renderPlaylistSelector() {
    playlistSelector.innerHTML = '';
    const all = Playlist.getAll();
    const active = Playlist.getActive();

    if (all.length === 0) {
      const opt = document.createElement('option');
      opt.textContent = 'No playlists';
      opt.disabled = true;
      playlistSelector.appendChild(opt);
      return;
    }

    all.forEach(pl => {
      const opt = document.createElement('option');
      opt.value = pl.id;
      opt.textContent = `${pl.name} (${pl.tracks.length})`;
      if (active && pl.id === active.id) opt.selected = true;
      playlistSelector.appendChild(opt);
    });
  }

  playlistSelector.addEventListener('change', () => {
    Playlist.setActive(playlistSelector.value);
  });

  Playlist.on('playlistschanged', () => renderPlaylistSelector());
  Playlist.on('activechanged', (pl) => {
    renderPlaylistSelector();
    resetFilters();
    populateFilters();
    refreshTrackView();
  });
  Playlist.on('trackschanged', (pl) => {
    renderPlaylistSelector();
    populateFilters();
    refreshTrackView();
  });

  // ============================================
  // PLAYLIST CRUD BUTTONS (2.1, 2.3, 2.4, 2.6)
  // ============================================

  // 2.1 — New Playlist
  $('#btn-new-playlist').addEventListener('click', () => {
    const name = prompt('Playlist name:');
    if (name && name.trim()) {
      const pl = Playlist.createPlaylist(name.trim());
      Playlist.setActive(pl.id);
    }
  });

  // 2.3 — Rename
  $('#btn-rename-playlist').addEventListener('click', () => {
    const pl = Playlist.getActive();
    if (!pl) return;
    const name = prompt('Rename playlist:', pl.name);
    if (name && name.trim()) {
      Playlist.renamePlaylist(pl.id, name.trim());
    }
  });

  // 2.3 — Delete
  $('#btn-del-playlist').addEventListener('click', () => {
    const pl = Playlist.getActive();
    if (!pl) return;
    if (confirm(`Delete "${pl.name}"?`)) {
      Playlist.deletePlaylist(pl.id);
    }
  });

  // 2.4 — Duplicate
  $('#btn-dup-playlist').addEventListener('click', () => {
    const pl = Playlist.getActive();
    if (!pl) return;
    const dup = Playlist.duplicatePlaylist(pl.id);
    if (dup) Playlist.setActive(dup.id);
  });

  // 2.6 — Clear
  $('#btn-clear-playlist').addEventListener('click', () => {
    const pl = Playlist.getActive();
    if (!pl) return;
    if (confirm(`Clear all tracks from "${pl.name}"?`)) {
      Playlist.clearPlaylist();
    }
  });

  // 2.14 — Export
  $('#btn-export-playlist').addEventListener('click', () => Playlist.exportPlaylist());

  // 2.15 — Import
  const importInput = $('#import-playlist-input');
  $('#btn-import-playlist').addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', () => {
    const file = importInput.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const pl = Playlist.importPlaylist(reader.result);
      if (pl) {
        Playlist.setActive(pl.id);
      } else {
        alert('Invalid playlist file.');
      }
    };
    reader.readAsText(file);
    importInput.value = '';
  });

  // ============================================
  // TRACK LIST RENDERING (with drag + context menu)
  // ============================================

  let contextTrackId = null; // Track ID for context menu actions
  const trackTooltip = $('#track-detail-tooltip');
  let tooltipTimeout = null;

  // Placeholder SVG data URL for tracks with no album art
  const PLACEHOLDER_ART = 'data:image/svg+xml,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" fill="none">' +
    '<rect width="48" height="48" rx="4" fill="%231a1a2e"/>' +
    '<circle cx="24" cy="24" r="10" stroke="%236c5ce7" stroke-width="2" fill="none"/>' +
    '<circle cx="24" cy="24" r="3" fill="%236c5ce7"/>' +
    '</svg>'
  );

  function highlightText(text, query) {
    if (!query) return escapeHTML(text);
    const escaped = escapeHTML(text);
    const q = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`(${q})`, 'gi');
    return escaped.replace(re, '<mark class="search-highlight">$1</mark>');
  }

  function renderTracks(tracks) {
    trackList.innerHTML = '';

    if (tracks.length === 0) {
      trackList.innerHTML = '<li class="empty-state">No tracks \u2014 use the buttons above to add music</li>';
      return;
    }

    const currentId = Playlist.getCurrentTrackId();
    const pl = Playlist.getActive();
    const fullTracks = pl ? pl.tracks : [];
    const query = searchInput.value.trim();

    tracks.forEach((track) => {
      const realIndex = fullTracks.indexOf(track);
      const displayNum = realIndex >= 0 ? realIndex + 1 : '?';
      const artSrc = track.artUrl || PLACEHOLDER_ART;

      const li = document.createElement('li');
      li.dataset.id = track.id;
      li.dataset.index = realIndex;
      li.draggable = true;
      if (track.id === currentId) li.classList.add('active');

      const titleHTML = highlightText(track.title, query);
      const artistHTML = highlightText(track.artist, query);
      const albumHTML = track.album && track.album !== 'Unknown Album' ? highlightText(track.album, query) : '';

      li.innerHTML = `
        <span class="track-number" title="Drag to reorder">${displayNum}</span>
        <img class="track-art-thumb" src="${escapeAttr(artSrc)}" alt="" loading="lazy">
        <div class="track-info">
          <span class="track-name">${titleHTML}</span>
          <span class="track-artist-line">${artistHTML}${albumHTML ? ' \u2022 ' + albumHTML : ''}</span>
        </div>
        <span class="track-duration">${formatTime(track.duration)}</span>
        <span class="track-fav">${Playlist.isFavorite(track.id) ? '\u2605' : '\u2606'}</span>
        <span class="track-remove" title="Remove">\u2715</span>
      `;

      // Click to play
      li.addEventListener('click', (e) => {
        if (e.target.classList.contains('track-fav') ||
            e.target.classList.contains('track-remove') ||
            e.target.classList.contains('track-art-thumb')) return;
        Playlist.playTrackById(track.id);
      });

      // Hover on thumbnail → show detail tooltip (3.6)
      const thumb = li.querySelector('.track-art-thumb');
      thumb.addEventListener('mouseenter', (e) => {
        tooltipTimeout = setTimeout(() => showTrackTooltip(track, e), 400);
      });
      thumb.addEventListener('mouseleave', () => {
        clearTimeout(tooltipTimeout);
        trackTooltip.classList.add('hidden');
      });
      // Click thumbnail to play
      thumb.addEventListener('click', (e) => {
        e.stopPropagation();
        Playlist.playTrackById(track.id);
      });

      // Favorite toggle
      li.querySelector('.track-fav').addEventListener('click', (e) => {
        e.stopPropagation();
        Playlist.toggleFavorite(track.id);
      });

      // Remove track (2.5)
      li.querySelector('.track-remove').addEventListener('click', (e) => {
        e.stopPropagation();
        Playlist.removeTrack(track.id);
      });

      // Right-click context menu (2.8, 2.9)
      li.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        contextTrackId = track.id;
        contextMenu.classList.remove('hidden');
        const menuW = contextMenu.offsetWidth;
        const menuH = contextMenu.offsetHeight;
        const x = Math.min(e.clientX, window.innerWidth - menuW - 4);
        const y = Math.min(e.clientY, window.innerHeight - menuH - 4);
        contextMenu.style.left = Math.max(0, x) + 'px';
        contextMenu.style.top = Math.max(0, y) + 'px';
      });

      // Drag-and-drop reorder (2.7)
      li.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', realIndex.toString());
        li.classList.add('dragging');
      });
      li.addEventListener('dragend', () => {
        li.classList.remove('dragging');
        trackList.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
      });
      li.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        li.classList.add('drag-over');
      });
      li.addEventListener('dragleave', () => {
        li.classList.remove('drag-over');
      });
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        li.classList.remove('drag-over');
        const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
        const toIndex = parseInt(li.dataset.index, 10);
        if (!isNaN(fromIndex) && !isNaN(toIndex)) {
          Playlist.moveTrack(fromIndex, toIndex);
        }
      });

      trackList.appendChild(li);
    });
  }

  // ============================================
  // TRACK DETAIL TOOLTIP (3.6)
  // ============================================

  function showTrackTooltip(track, event) {
    const lines = [
      `<strong>${escapeHTML(track.title)}</strong>`,
      `Artist: ${escapeHTML(track.artist)}`,
      `Album: ${escapeHTML(track.album)}`,
    ];
    if (track.year) lines.push(`Year: ${escapeHTML(track.year)}`);
    if (track.genre) lines.push(`Genre: ${escapeHTML(track.genre)}`);
    if (track.trackNumber) lines.push(`Track #: ${escapeHTML(track.trackNumber)}`);
    lines.push(`Duration: ${formatTime(track.duration)}`);

    trackTooltip.innerHTML = lines.join('<br>');
    trackTooltip.classList.remove('hidden');

    const ttW = trackTooltip.offsetWidth;
    const ttH = trackTooltip.offsetHeight;
    const x = Math.min(event.clientX + 12, window.innerWidth - ttW - 8);
    const y = Math.min(event.clientY + 12, window.innerHeight - ttH - 8);
    trackTooltip.style.left = Math.max(0, x) + 'px';
    trackTooltip.style.top = Math.max(0, y) + 'px';
  }

  // Close context menu on click elsewhere
  document.addEventListener('click', () => {
    contextMenu.classList.add('hidden');
  });

  // Context menu actions
  contextMenu.addEventListener('click', (e) => {
    const action = e.target.dataset.action;
    if (!action || !contextTrackId) return;
    switch (action) {
      case 'play-next':
        Playlist.playNext(contextTrackId);
        break;
      case 'add-to-queue':
        Playlist.addToQueue(contextTrackId);
        break;
      case 'remove':
        Playlist.removeTrack(contextTrackId);
        break;
    }
    contextMenu.classList.add('hidden');
    contextTrackId = null;
  });

  Playlist.on('favoriteschanged', () => {
    const pl = Playlist.getActive();
    if (pl) renderCurrentTracks();
  });

  function renderCurrentTracks() {
    refreshTrackView();
  }

  // ============================================
  // PLAYBACK
  // ============================================

  Playlist.on('playtrack', async ({ track, index }) => {
    const ok = await Player.loadTrack(track);
    if (ok) Player.play();

    trackTitle.textContent = track.title;
    trackArtist.textContent = track.artist;

    // Album art in Now Playing bar (3.4, 3.5)
    if (track.artUrl) {
      albumArt.src = track.artUrl;
      albumArt.style.display = '';
      albumArt.removeAttribute('hidden');
    } else {
      albumArt.src = PLACEHOLDER_ART;
      albumArt.style.display = '';
      albumArt.removeAttribute('hidden');
    }

    btnFavorite.innerHTML = Playlist.isFavorite(track.id) ? '&#x2605;' : '&#x2606;';

    renderCurrentTracks();
  });

  btnPlay.addEventListener('click', () => Player.togglePlay());
  btnPrev.addEventListener('click', () => Playlist.prev());
  btnNext.addEventListener('click', () => Playlist.next());
  btnShuffle.addEventListener('click', () => Playlist.toggleShuffle());
  btnRepeat.addEventListener('click', () => Playlist.cycleRepeat());
  btnMute.addEventListener('click', () => Player.toggleMute());

  btnFavorite.addEventListener('click', () => {
    const id = Playlist.getCurrentTrackId();
    if (id) {
      Playlist.toggleFavorite(id);
      btnFavorite.innerHTML = Playlist.isFavorite(id) ? '&#x2605;' : '&#x2606;';
    }
  });

  Player.on('statechange', (state) => {
    btnPlay.innerHTML = state === 'playing' ? '&#x23f8;' : '&#x25b6;';
  });

  Player.on('timeupdate', ({ currentTime, duration }) => {
    timeElapsed.textContent = formatTime(currentTime);
    timeTotal.textContent = formatTime(duration);
    if (duration && !progressBar.matches(':active')) {
      progressBar.value = (currentTime / duration) * 100;
    }
  });

  Player.on('ended', () => Playlist.next());

  progressBar.addEventListener('input', () => {
    const dur = Player.getDuration();
    if (dur) Player.seek((progressBar.value / 100) * dur);
  });

  volumeSlider.addEventListener('input', () => {
    const v = volumeSlider.value / 100;
    Player.setVolume(v);
    try { Storage.saveSetting('volume', v); } catch (_) {}
  });

  Player.on('mutechange', (muted) => {
    btnMute.innerHTML = muted ? '&#x1f507;' : '&#x1f50a;';
  });

  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
  let speedIdx = 2;
  btnSpeed.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % speeds.length;
    Player.setSpeed(speeds[speedIdx]);
    btnSpeed.textContent = speeds[speedIdx] + 'x';
  });

  Playlist.on('shufflechanged', (on) => btnShuffle.classList.toggle('active', on));
  Playlist.on('repeatchanged', (mode) => {
    btnRepeat.classList.toggle('active', mode !== 'off');
    btnRepeat.title = `Repeat: ${mode}`;
  });

  // ============================================
  // PANEL TOGGLES
  // ============================================

  function togglePanel(section) {
    const wasVisible = !section.classList.contains('hidden');
    [eqSection, settingsSection, patchSection].forEach(s => s.classList.add('hidden'));
    if (!wasVisible) section.classList.remove('hidden');
  }

  btnEqToggle.addEventListener('click', () => togglePanel(eqSection));
  btnSettings.addEventListener('click', () => togglePanel(settingsSection));
  btnPatchNotes.addEventListener('click', () => {
    togglePanel(patchSection);
    if (!patchSection.classList.contains('hidden')) {
      PatchNotes.render($('#patch-notes-content'));
    }
  });

  // ============================================
  // VISUALIZER
  // ============================================

  function openVisualizer() { vizOverlay.classList.remove('hidden'); Visualizer.start(); vizModeLabel.textContent = Visualizer.getCurrentMode().name; }
  function closeVisualizer() { vizOverlay.classList.add('hidden'); Visualizer.stop(); }
  function toggleVisualizer() { vizOverlay.classList.contains('hidden') ? openVisualizer() : closeVisualizer(); }

  btnVizToggle.addEventListener('click', toggleVisualizer);
  $('#btn-viz-close').addEventListener('click', closeVisualizer);
  $('#btn-viz-next').addEventListener('click', () => { vizModeLabel.textContent = Visualizer.nextMode().name; });
  $('#btn-viz-prev').addEventListener('click', () => { vizModeLabel.textContent = Visualizer.prevMode().name; });

  // ============================================
  // EQ
  // ============================================

  const eqPresetsContainer = $('#eq-presets');
  const eqSlidersContainer = $('#eq-sliders');
  const eqCurveCanvas = $('#eq-curve');
  const btnEqBypass = $('#btn-eq-bypass');
  const eqPreamp = $('#eq-preamp');
  const eqPreampValue = $('#eq-preamp-value');
  const eqCustomSection = $('#eq-custom-presets');
  const eqCustomList = $('#eq-custom-list');

  function renderEQPresetButtons() {
    eqPresetsContainer.innerHTML = '';
    Equalizer.getPresetNames().forEach((name) => {
      const btn = document.createElement('button');
      btn.textContent = name;
      btn.addEventListener('click', () => {
        Equalizer.applyPreset(name);
        eqPresetsContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderEQSliders();
        Equalizer.drawCurve();
      });
      if (name === Equalizer.activePreset) btn.classList.add('active');
      eqPresetsContainer.appendChild(btn);
    });
  }
  renderEQPresetButtons();

  function renderEQSliders() {
    eqSlidersContainer.innerHTML = '';
    Equalizer.BANDS.forEach((freq, i) => {
      const div = document.createElement('div');
      div.className = 'eq-band';
      const label = freq >= 1000 ? (freq / 1000) + 'k' : freq + '';
      div.innerHTML = `
        <span class="eq-value">${Equalizer.gains[i] > 0 ? '+' : ''}${Equalizer.gains[i]}dB</span>
        <input type="range" min="-12" max="12" value="${Equalizer.gains[i]}" step="0.5" aria-label="${label} Hz">
        <span class="eq-label">${label}</span>
      `;
      div.querySelector('input').addEventListener('input', (e) => {
        Equalizer.setBand(i, parseFloat(e.target.value));
        div.querySelector('.eq-value').textContent = `${e.target.value > 0 ? '+' : ''}${e.target.value}dB`;
        Equalizer.drawCurve();
      });
      eqSlidersContainer.appendChild(div);
    });
  }
  renderEQSliders();

  // Frequency response curve (5.7)
  Equalizer.initCurve(eqCurveCanvas);

  // Pre-amp
  if (eqPreamp) {
    eqPreamp.addEventListener('input', () => {
      const val = parseFloat(eqPreamp.value);
      Equalizer.setPreamp(val);
      eqPreampValue.textContent = `${val > 0 ? '+' : ''}${val}dB`;
      Equalizer.drawCurve();
    });
  }

  // Bypass toggle (5.12)
  btnEqBypass.addEventListener('click', () => {
    Equalizer.toggleBypass();
    btnEqBypass.classList.toggle('active', Equalizer.bypassed);
    btnEqBypass.textContent = Equalizer.bypassed ? 'Bypassed' : 'Bypass';
    Equalizer.drawCurve();
  });

  // Save custom preset (5.8)
  $('#btn-save-preset').addEventListener('click', () => {
    const name = prompt('Preset name:');
    if (name && name.trim()) {
      Equalizer.saveCustomPreset(name.trim());
      renderEQPresetButtons();
      renderCustomPresetList();
    }
  });

  // Custom preset management (5.9)
  function renderCustomPresetList() {
    const names = Equalizer.getCustomPresetNames();
    if (names.length === 0) {
      eqCustomSection.classList.add('hidden');
      return;
    }
    eqCustomSection.classList.remove('hidden');
    eqCustomList.innerHTML = '';
    names.forEach(name => {
      const li = document.createElement('li');
      li.innerHTML = `
        <span class="custom-preset-name">${escapeHTML(name)}</span>
        <button class="btn-small" data-action="rename">Rename</button>
        <button class="btn-small btn-danger" data-action="delete">Del</button>
      `;
      li.querySelector('[data-action="rename"]').addEventListener('click', () => {
        const newName = prompt('New name:', name);
        if (newName && newName.trim() && newName.trim() !== name) {
          Equalizer.renameCustomPreset(name, newName.trim());
          renderEQPresetButtons();
          renderCustomPresetList();
        }
      });
      li.querySelector('[data-action="delete"]').addEventListener('click', () => {
        if (confirm(`Delete preset "${name}"?`)) {
          Equalizer.deleteCustomPreset(name);
          renderEQPresetButtons();
          renderCustomPresetList();
        }
      });
      eqCustomList.appendChild(li);
    });
  }
  renderCustomPresetList();

  // Restore EQ state (5.10)
  Equalizer.restoreState().then(() => {
    renderEQPresetButtons();
    renderEQSliders();
    renderCustomPresetList();
    eqPreamp.value = Equalizer.preamp;
    eqPreampValue.textContent = `${Equalizer.preamp > 0 ? '+' : ''}${Equalizer.preamp}dB`;
    btnEqBypass.classList.toggle('active', Equalizer.bypassed);
    btnEqBypass.textContent = Equalizer.bypassed ? 'Bypassed' : 'Bypass';
    Equalizer.drawCurve();
  });

  // ============================================
  // SEARCH, FILTER & SORT (3.8–3.11)
  // ============================================

  const filterGenre  = $('#filter-genre');
  const filterArtist = $('#filter-artist');
  const filterAlbum  = $('#filter-album');
  const sortBy       = $('#sort-by');
  const btnSortDir   = $('#btn-sort-dir');
  let sortAscending  = true;

  /**
   * Get the currently visible tracks after applying search, filters, and sort.
   */
  function getVisibleTracks() {
    const pl = Playlist.getActive();
    if (!pl) return [];
    let tracks = pl.tracks;

    // Search filter
    const query = searchInput.value;
    if (query) tracks = Playlist.search(query);

    // Metadata filters (3.8–3.10)
    const genre = filterGenre.value;
    if (genre) tracks = tracks.filter(t => (t.genre || '') === genre);
    const artist = filterArtist.value;
    if (artist) tracks = tracks.filter(t => (t.artist || '') === artist);
    const album = filterAlbum.value;
    if (album) tracks = tracks.filter(t => (t.album || '') === album);

    // Sort (3.11)
    const sortKey = sortBy.value;
    if (sortKey) tracks = Playlist.sortTracks(tracks, sortKey, sortAscending);

    return tracks;
  }

  function refreshTrackView() {
    renderTracks(getVisibleTracks());
  }

  /**
   * Populate filter dropdowns with unique values from the active playlist.
   */
  function populateFilters() {
    populateFilterSelect(filterGenre, 'genre', 'All Genres');
    populateFilterSelect(filterArtist, 'artist', 'All Artists');
    populateFilterSelect(filterAlbum, 'album', 'All Albums');
  }

  function populateFilterSelect(select, field, defaultLabel) {
    const current = select.value;
    select.innerHTML = '';
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = defaultLabel;
    select.appendChild(opt);

    Playlist.getUniqueValues(field).forEach(val => {
      const o = document.createElement('option');
      o.value = val;
      o.textContent = val;
      if (val === current) o.selected = true;
      select.appendChild(o);
    });
  }

  function resetFilters() {
    filterGenre.value = '';
    filterArtist.value = '';
    filterAlbum.value = '';
    sortBy.value = '';
  }

  searchInput.addEventListener('input', refreshTrackView);
  filterGenre.addEventListener('change', refreshTrackView);
  filterArtist.addEventListener('change', refreshTrackView);
  filterAlbum.addEventListener('change', refreshTrackView);
  sortBy.addEventListener('change', refreshTrackView);
  btnSortDir.addEventListener('click', () => {
    sortAscending = !sortAscending;
    btnSortDir.textContent = sortAscending ? '\u2191' : '\u2193';
    btnSortDir.title = sortAscending ? 'Ascending' : 'Descending';
    refreshTrackView();
  });

  // ============================================
  // SMART PLAYLISTS (4.5, 4.7, 4.8)
  // ============================================

  const smartTrackList = $('#smart-track-list');
  const smartTabs = $$('.smart-tab');
  let activeSmartTab = 'favorites';

  smartTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      smartTabs.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      activeSmartTab = btn.dataset.smart;
      renderSmartTracks();
    });
  });

  function getSmartTracks() {
    switch (activeSmartTab) {
      case 'favorites': return Playlist.getFavorites();
      case 'recent':    return Playlist.getRecentlyPlayed();
      case 'most':      return Playlist.getMostPlayed();
      default:          return [];
    }
  }

  function renderSmartTracks() {
    const tracks = getSmartTracks();
    smartTrackList.innerHTML = '';

    if (tracks.length === 0) {
      smartTrackList.innerHTML = `<li class="empty-state">No ${activeSmartTab === 'favorites' ? 'favorites' : activeSmartTab === 'recent' ? 'recently played tracks' : 'play history'} yet</li>`;
      return;
    }

    const currentId = Playlist.getCurrentTrackId();

    tracks.forEach((track) => {
      const artSrc = track.artUrl || PLACEHOLDER_ART;
      const li = document.createElement('li');
      li.dataset.id = track.id;
      if (track.id === currentId) li.classList.add('active');

      let extraInfo = '';
      if (activeSmartTab === 'most') {
        const count = Playlist.getPlayCount(track.id);
        extraInfo = `<span class="smart-play-count">${count} play${count !== 1 ? 's' : ''}</span>`;
      }

      li.innerHTML = `
        <img class="track-art-thumb" src="${escapeAttr(artSrc)}" alt="" loading="lazy">
        <div class="track-info">
          <span class="track-name">${escapeHTML(track.title)}</span>
          <span class="track-artist-line">${escapeHTML(track.artist)}${track.album && track.album !== 'Unknown Album' ? ' \u2022 ' + escapeHTML(track.album) : ''}</span>
        </div>
        <span class="track-duration">${formatTime(track.duration)}</span>
        ${extraInfo}
        <span class="track-fav">${Playlist.isFavorite(track.id) ? '\u2605' : '\u2606'}</span>
      `;

      li.addEventListener('click', (e) => {
        if (e.target.classList.contains('track-fav')) return;
        Playlist.playTrackById(track.id);
      });

      li.querySelector('.track-fav').addEventListener('click', (e) => {
        e.stopPropagation();
        Playlist.toggleFavorite(track.id);
      });

      smartTrackList.appendChild(li);
    });
  }

  // Re-render smart playlists when relevant data changes
  Playlist.on('favoriteschanged', renderSmartTracks);
  Playlist.on('playtrack', () => setTimeout(renderSmartTracks, 100));

  // Initial render
  renderSmartTracks();

  // ============================================
  // KEYBOARD SHORTCUTS
  // ============================================

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key) {
      case ' ':
        e.preventDefault(); Player.togglePlay(); break;
      case 'ArrowLeft':
        e.preventDefault(); e.shiftKey ? Playlist.prev() : Player.seek(Player.getCurrentTime() - 5); break;
      case 'ArrowRight':
        e.preventDefault(); e.shiftKey ? Playlist.next() : Player.seek(Player.getCurrentTime() + 5); break;
      case 'ArrowUp':
        e.preventDefault(); volumeSlider.value = Math.min(100, +volumeSlider.value + 5);
        Player.setVolume(volumeSlider.value / 100);
        try { Storage.saveSetting('volume', volumeSlider.value / 100); } catch (_) {} break;
      case 'ArrowDown':
        e.preventDefault(); volumeSlider.value = Math.max(0, +volumeSlider.value - 5);
        Player.setVolume(volumeSlider.value / 100);
        try { Storage.saveSetting('volume', volumeSlider.value / 100); } catch (_) {} break;
      case 'm': case 'M': Player.toggleMute(); break;
      case 's': case 'S': Playlist.toggleShuffle(); break;
      case 'r': case 'R': Playlist.cycleRepeat(); break;
      case 'f': case 'F': toggleVisualizer(); break;
      case 'e': case 'E': togglePanel(eqSection); break;
      case 'Escape':
        if (!vizOverlay.classList.contains('hidden')) closeVisualizer();
        contextMenu.classList.add('hidden');
        break;
      case '/': e.preventDefault(); searchInput.focus(); break;
      case '1': case '2': case '3': case '4': case '5': case '6':
        if (!vizOverlay.classList.contains('hidden')) {
          const idx = parseInt(e.key) - 1;
          if (idx < Visualizer.MODES.length) vizModeLabel.textContent = Visualizer.setMode(idx).name;
        }
        break;
    }
  });

  window.addEventListener('resize', () => {
    if (!vizOverlay.classList.contains('hidden')) Visualizer.resize();
  });

  // ============================================
  // THEME
  // ============================================

  try {
    const themeSetting = await Storage.getSetting('theme');
    if (themeSetting) { applyTheme(themeSetting); $('#setting-theme').value = themeSetting; }
  } catch (_) {}

  function applyTheme(value) {
    if (value === 'system') {
      const prefersDark = !window.matchMedia('(prefers-color-scheme: light)').matches;
      document.documentElement.dataset.theme = prefersDark ? 'dark' : 'light';
    } else {
      document.documentElement.dataset.theme = value;
    }
  }

  $('#setting-theme').addEventListener('change', (e) => {
    applyTheme(e.target.value);
    try { Storage.saveSetting('theme', e.target.value); } catch (_) {}
  });

  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    try { Storage.getSetting('theme').then(t => { if (t === 'system') applyTheme('system'); }); } catch (_) {}
  });

  // ============================================
  // MEDIA SESSION
  // ============================================

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => Player.play());
    navigator.mediaSession.setActionHandler('pause', () => Player.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => Playlist.prev());
    navigator.mediaSession.setActionHandler('nexttrack', () => Playlist.next());

    Player.on('trackloaded', (track) => {
      const artwork = [];
      if (track.artUrl) {
        artwork.push({ src: track.artUrl, type: 'image/jpeg' });
      }
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title, artist: track.artist, album: track.album,
        artwork,
      });
    });
  }

  // ============================================
  // INITIAL RENDER
  // ============================================

  renderPlaylistSelector();
  populateFilters();
  const activePl = Playlist.getActive();
  if (activePl) renderTracks(activePl.tracks);

  // ============================================
  // HELPERS
  // ============================================

  function formatTime(sec) {
    if (!sec || !isFinite(sec)) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function escapeHTML(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
  }
})();
