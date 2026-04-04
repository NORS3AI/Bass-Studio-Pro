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
  const settingsModal  = $('#settings-modal');
  const patchModal     = $('#patch-notes-modal');
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
    try {
      const files = await FileLoader.openFiles();
      if (files.length) await Playlist.addFiles(files);
    } catch (err) { console.warn('Open files failed:', err); }
  });

  btnOpenFolder.addEventListener('click', async () => {
    try {
      const files = await FileLoader.openFolder();
      if (files.length) await Playlist.addFiles(files);
    } catch (err) { console.warn('Open folder failed:', err); }
  });

  // Drag-and-drop on the whole main area
  const mainApp = $('#app');
  let dragCounter = 0;
  mainApp.addEventListener('dragenter', (e) => { e.preventDefault(); dragCounter++; dropZone.classList.remove('hidden'); dropZone.classList.add('dragover'); });
  mainApp.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  mainApp.addEventListener('dragleave', () => { dragCounter--; if (dragCounter <= 0) { dragCounter = 0; dropZone.classList.remove('dragover'); dropZone.classList.add('hidden'); } });
  mainApp.addEventListener('drop', async (e) => {
    e.preventDefault();
    try {
      const files = await FileLoader.handleDrop(e.dataTransfer);
      if (files.length) await Playlist.addFiles(files);
    } catch (err) {
      console.warn('Drop handling failed:', err);
    } finally {
      dragCounter = 0;
      dropZone.classList.remove('dragover');
      dropZone.classList.add('hidden');
    }
  });

  // Storage full notification
  Playlist.on('storagefull', () => {
    alert('Storage full — audio for new tracks cannot be saved. Remove some tracks or clear old data in Settings.');
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
    importInput.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const pl = Playlist.importPlaylist(reader.result);
        if (pl) Playlist.setActive(pl.id);
        else alert('Invalid playlist file.');
      } catch (err) {
        alert('Import failed: ' + err.message);
      }
    };
    reader.onerror = () => alert('Could not read playlist file.');
    reader.onabort = () => alert('Playlist import was cancelled.');
    reader.readAsText(file);
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
    // loadTrack now calls play() immediately (required for iPhone gesture chain)
    await Player.loadTrack(track);

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

  btnPlay.addEventListener('click', () => {
    if (!Player.getState().currentTrack) {
      Playlist.playFirst();
    } else {
      Player.togglePlay();
    }
  });
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

  Playlist.on('trackerror', ({ message }) => {
    trackTitle.textContent = message;
    trackArtist.textContent = 'Open your music files again to reconnect';
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
    [eqSection].forEach(s => s.classList.add('hidden'));
    if (!wasVisible) section.classList.remove('hidden');
  }

  btnEqToggle.addEventListener('click', () => togglePanel(eqSection));

  // Settings — modal popup
  btnSettings.addEventListener('click', () => {
    settingsModal.classList.remove('hidden');
  });
  $('#btn-settings-close').addEventListener('click', () => {
    settingsModal.classList.add('hidden');
  });
  settingsModal.addEventListener('click', (e) => {
    if (e.target === settingsModal) settingsModal.classList.add('hidden');
  });

  // Patch Notes — modal popup
  btnPatchNotes.addEventListener('click', () => {
    patchModal.classList.remove('hidden');
    PatchNotes.render($('#patch-notes-content'));
  });
  $('#btn-patch-close').addEventListener('click', () => {
    patchModal.classList.add('hidden');
  });
  patchModal.addEventListener('click', (e) => {
    if (e.target === patchModal) patchModal.classList.add('hidden');
  });

  // ============================================
  // VISUALIZER
  // ============================================

  function openVisualizer() {
    vizOverlay.classList.remove('hidden');
    Visualizer.start();
    vizModeLabel.textContent = Visualizer.getCurrentMode().name;
  }
  function closeVisualizer() {
    vizOverlay.classList.add('hidden');
    vizOverlay.classList.remove('controls-visible');
    Visualizer.stop();
  }
  function toggleVisualizer() { vizOverlay.classList.contains('hidden') ? openVisualizer() : closeVisualizer(); }

  btnVizToggle.addEventListener('click', toggleVisualizer);
  $('#btn-viz-close').addEventListener('click', closeVisualizer);
  $('#btn-viz-next').addEventListener('click', (e) => { e.stopPropagation(); vizModeLabel.textContent = Visualizer.nextMode().name; });
  $('#btn-viz-prev').addEventListener('click', (e) => { e.stopPropagation(); vizModeLabel.textContent = Visualizer.prevMode().name; });

  // Click canvas to cycle modes (6.11) — desktop only
  const vizCanvas = $('#visualizer-canvas');
  let vizWasSwiped = false;
  let vizTouchHandled = false;
  vizCanvas.addEventListener('click', (e) => {
    if (vizWasSwiped || vizTouchHandled) { vizTouchHandled = false; return; }
    vizModeLabel.textContent = Visualizer.nextMode().name;
  });

  // Swipe down to exit on mobile (6.15) + tap-to-toggle-controls
  let vizTouchStartY = 0;
  let vizTouchStartX = 0;
  vizOverlay.addEventListener('touchstart', (e) => {
    vizTouchStartY = e.touches[0].clientY;
    vizTouchStartX = e.touches[0].clientX;
    vizWasSwiped = false;
  }, { passive: true });
  vizCanvas.addEventListener('touchend', (e) => {
    if (!e.changedTouches.length) return;
    const dy = e.changedTouches[0].clientY - vizTouchStartY;
    const dx = Math.abs(e.changedTouches[0].clientX - vizTouchStartX);
    const absDy = Math.abs(dy);
    vizTouchHandled = true;
    if (dy > 100 && dx < 80) {
      vizWasSwiped = true;
      closeVisualizer();
    } else if (absDy < 10 && dx < 10) {
      // Tap: toggle controls visibility on mobile
      vizOverlay.classList.toggle('controls-visible');
      e.preventDefault();
    }
  });

  // Color theme buttons (6.12)
  const vizThemeBtns = $('#viz-theme-btns');
  const themeColors = { neon: '#ff00ff', sunset: '#ff6b35', ocean: '#0077b6', monochrome: '#ffffff' };
  Visualizer.getThemeNames().forEach(({ id, name }) => {
    const btn = document.createElement('button');
    btn.title = name;
    btn.style.background = themeColors[id] || '#888';
    btn.dataset.theme = id;
    if (id === 'neon') btn.classList.add('active');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      Visualizer.setTheme(id);
      vizThemeBtns.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
    vizThemeBtns.appendChild(btn);
  });

  // Custom color pickers (6.13)
  const vizColorAccent = $('#viz-color-accent');
  const vizColorSecondary = $('#viz-color-secondary');
  function applyCustomColors() {
    Visualizer.setCustomTheme(vizColorAccent.value, vizColorSecondary.value);
    vizThemeBtns.querySelectorAll('button').forEach(b => b.classList.remove('active'));
  }
  vizColorAccent.addEventListener('input', applyCustomColors);
  vizColorSecondary.addEventListener('input', applyCustomColors);
  // Prevent color picker from cycling modes
  vizColorAccent.addEventListener('click', (e) => e.stopPropagation());
  vizColorSecondary.addEventListener('click', (e) => e.stopPropagation());

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
    if (!name || !name.trim()) return;
    const trimmed = name.trim();
    if (Equalizer.getCustomPresetNames().includes(trimmed)) {
      if (!confirm(`Preset "${trimmed}" exists. Overwrite?`)) return;
    }
    const result = Equalizer.saveCustomPreset(trimmed);
    if (!result.ok) {
      if (result.reason === 'builtin') alert('That name is taken by a built-in preset. Choose another name.');
      return;
    }
    renderEQPresetButtons();
    renderCustomPresetList();
  });

  // Re-render preset buttons when active preset changes (e.g. user drags a slider -> Custom)
  Equalizer.on('presetchanged', () => {
    eqPresetsContainer.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.textContent === Equalizer.activePreset);
    });
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
        e.preventDefault();
        if (!Player.getState().currentTrack) {
          Playlist.playFirst();
        } else {
          Player.togglePlay();
        }
        break;
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
        if (!settingsModal.classList.contains('hidden')) settingsModal.classList.add('hidden');
        else if (!patchModal.classList.contains('hidden')) patchModal.classList.add('hidden');
        else if (!vizOverlay.classList.contains('hidden')) closeVisualizer();
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
    Equalizer.drawCurve();
  });

  // ============================================
  // THEME
  // ============================================

  // --- Theme ---
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

  // --- Accent Color ---
  const settingAccent = $('#setting-accent');
  function applyAccentColor(color) {
    if (!/^#[0-9a-fA-F]{6}$/.test(color)) return;
    document.documentElement.style.setProperty('--accent', color);
    document.documentElement.style.setProperty('--accent-hover', lightenColor(color, 20));
    const r = parseInt(color.slice(1, 3), 16);
    const g = parseInt(color.slice(3, 5), 16);
    const b = parseInt(color.slice(5, 7), 16);
    document.documentElement.style.setProperty('--accent-rgb', `${r}, ${g}, ${b}`);
  }
  try {
    const savedAccent = await Storage.getSetting('accentColor');
    if (savedAccent) {
      settingAccent.value = savedAccent;
      applyAccentColor(savedAccent);
    }
  } catch (_) {}

  settingAccent.addEventListener('input', (e) => {
    const color = e.target.value;
    applyAccentColor(color);
    try { Storage.saveSetting('accentColor', color); } catch (_) {}
    Equalizer.drawCurve();
  });

  function lightenColor(hex, percent) {
    if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return hex;
    const r = Math.min(255, parseInt(hex.slice(1, 3), 16) + percent);
    const g = Math.min(255, parseInt(hex.slice(3, 5), 16) + percent);
    const b = Math.min(255, parseInt(hex.slice(5, 7), 16) + percent);
    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
  }

  // --- Crossfade Slider ---
  const settingCrossfade = $('#setting-crossfade');
  const crossfadeValue = $('#crossfade-value');

  try {
    const savedCrossfade = await Storage.getSetting('crossfade');
    if (savedCrossfade != null) {
      settingCrossfade.value = savedCrossfade;
      crossfadeValue.textContent = savedCrossfade + 's';
    }
  } catch (_) {}

  settingCrossfade.addEventListener('input', (e) => {
    crossfadeValue.textContent = e.target.value + 's';
    try { Storage.saveSetting('crossfade', Number(e.target.value)); } catch (_) {}
  });

  // --- Default Speed ---
  const settingSpeed = $('#setting-speed');

  try {
    const savedSpeed = await Storage.getSetting('defaultSpeed');
    if (savedSpeed != null) {
      settingSpeed.value = savedSpeed;
      Player.setSpeed(Number(savedSpeed));
      const idx = speeds.indexOf(Number(savedSpeed));
      if (idx >= 0) { speedIdx = idx; btnSpeed.textContent = savedSpeed + 'x'; }
    }
  } catch (_) {}

  settingSpeed.addEventListener('change', (e) => {
    const val = Number(e.target.value);
    Player.setSpeed(val);
    const idx = speeds.indexOf(val);
    if (idx >= 0) { speedIdx = idx; btnSpeed.textContent = val + 'x'; }
    try { Storage.saveSetting('defaultSpeed', e.target.value); } catch (_) {}
  });

  // --- Gapless / Normalization / Remember Position checkboxes ---
  const settingGapless = $('#setting-gapless');
  const settingNormalize = $('#setting-normalize');
  const settingRememberPos = $('#setting-remember-pos');

  try {
    const savedGapless = await Storage.getSetting('gapless');
    if (savedGapless !== null) settingGapless.checked = !!savedGapless;
    const savedNormalize = await Storage.getSetting('normalize');
    if (savedNormalize !== null) settingNormalize.checked = !!savedNormalize;
    const savedRememberPos = await Storage.getSetting('rememberPosition');
    if (savedRememberPos !== null) settingRememberPos.checked = !!savedRememberPos;
  } catch (_) {}

  settingGapless.addEventListener('change', (e) => {
    try { Storage.saveSetting('gapless', e.target.checked); } catch (_) {}
  });
  settingNormalize.addEventListener('change', (e) => {
    try { Storage.saveSetting('normalize', e.target.checked); } catch (_) {}
  });
  settingRememberPos.addEventListener('change', (e) => {
    try { Storage.saveSetting('rememberPosition', e.target.checked); } catch (_) {}
  });

  // Save playback position periodically when "remember position" is on
  let positionSaveInterval = null;
  function startPositionSaving() {
    if (positionSaveInterval) return;
    positionSaveInterval = setInterval(() => {
      if (settingRememberPos.checked && Player.getState().isPlaying) {
        const state = Player.getState();
        if (state.currentTrack) {
          try {
            Storage.saveState('lastPosition', {
              trackId: state.currentTrack.id,
              time: Player.getCurrentTime(),
            });
          } catch (_) {}
        }
      }
    }, 5000);
  }
  startPositionSaving();

  // Restore position on track load if enabled
  Player.on('trackloaded', async (track) => {
    if (!settingRememberPos.checked) return;
    try {
      const pos = await Storage.getState('lastPosition');
      if (pos && pos.trackId === track.id && pos.time > 0) {
        Player.seek(pos.time);
      }
    } catch (_) {}
  });

  // --- Sleep Timer ---
  let sleepTimerId = null;
  let sleepEndTime = 0;
  let sleepDisplayId = null;
  const sleepCountdown = $('#sleep-countdown');
  const sleepRemaining = $('#sleep-remaining');

  function startSleepTimer(minutes) {
    clearSleepTimer();
    sleepEndTime = Date.now() + minutes * 60000;
    sleepTimerId = setTimeout(() => {
      Player.pause();
      clearSleepTimer();
    }, minutes * 60000);
    sleepCountdown.classList.remove('hidden');
    updateSleepDisplay();
    sleepDisplayId = setInterval(updateSleepDisplay, 1000);
  }

  function clearSleepTimer() {
    if (sleepTimerId) { clearTimeout(sleepTimerId); sleepTimerId = null; }
    if (sleepDisplayId) { clearInterval(sleepDisplayId); sleepDisplayId = null; }
    sleepCountdown.classList.add('hidden');
    sleepEndTime = 0;
  }

  function updateSleepDisplay() {
    const remaining = Math.max(0, sleepEndTime - Date.now());
    if (remaining <= 0) { clearSleepTimer(); return; }
    const mins = Math.floor(remaining / 60000);
    const secs = Math.floor((remaining % 60000) / 1000);
    sleepRemaining.textContent = `${mins}m ${secs.toString().padStart(2, '0')}s`;
  }

  document.querySelectorAll('.sleep-btn').forEach(btn => {
    btn.addEventListener('click', () => startSleepTimer(Number(btn.dataset.minutes)));
  });

  $('#btn-sleep-set').addEventListener('click', () => {
    const val = Number($('#sleep-custom').value);
    if (val > 0 && val <= 480) startSleepTimer(val);
  });

  $('#btn-sleep-cancel').addEventListener('click', clearSleepTimer);

  // --- Data: Clear All ---
  $('#btn-clear-data').addEventListener('click', async () => {
    if (!confirm('Clear all playlists, settings, and stored audio? This cannot be undone.')) return;
    try {
      clearSleepTimer();
      if (positionSaveInterval) { clearInterval(positionSaveInterval); positionSaveInterval = null; }
      await Storage.clearAll();
      window.location.reload();
    } catch (err) {
      alert('Error clearing data: ' + err.message);
    }
  });

  // Cleanup timers on unload
  window.addEventListener('beforeunload', () => {
    if (sleepTimerId) { clearTimeout(sleepTimerId); sleepTimerId = null; }
    if (sleepDisplayId) { clearInterval(sleepDisplayId); sleepDisplayId = null; }
    if (positionSaveInterval) { clearInterval(positionSaveInterval); positionSaveInterval = null; }
  });

  // --- Data: Export Settings ---
  $('#btn-export-settings').addEventListener('click', async () => {
    try {
      const settings = {};
      for (const key of ['theme', 'accentColor', 'crossfade', 'defaultSpeed', 'gapless', 'normalize', 'rememberPosition', 'volume']) {
        settings[key] = await Storage.getSetting(key);
      }
      const blob = new Blob([JSON.stringify(settings, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'bass-studio-settings.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert('Export failed: ' + err.message);
    }
  });

  // --- Data: Import Settings ---
  $('#btn-import-settings').addEventListener('click', () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json,application/json';
    input.addEventListener('change', async () => {
      if (!input.files.length) return;
      try {
        const text = await input.files[0].text();
        const settings = JSON.parse(text);
        if (typeof settings !== 'object' || settings === null) throw new Error('Invalid format');
        for (const [key, value] of Object.entries(settings)) {
          if (value != null) await Storage.saveSetting(key, value);
        }
        alert('Settings imported. Reloading…');
        window.location.reload();
      } catch (err) {
        alert('Import failed: ' + err.message);
      }
    });
    input.click();
  });

  // ============================================
  // MEDIA SESSION
  // ============================================

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => Player.play());
    navigator.mediaSession.setActionHandler('pause', () => Player.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => Playlist.prev());
    navigator.mediaSession.setActionHandler('nexttrack', () => Playlist.next());
    navigator.mediaSession.setActionHandler('seekbackward', (details) => {
      Player.seek(Player.getCurrentTime() - (details.seekOffset || 10));
    });
    navigator.mediaSession.setActionHandler('seekforward', (details) => {
      Player.seek(Player.getCurrentTime() + (details.seekOffset || 10));
    });
    try {
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        Player.seek(details.seekTime);
      });
      navigator.mediaSession.setActionHandler('stop', () => {
        Player.pause();
        Player.seek(0);
      });
    } catch (_) {} // Not all browsers support these

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

    // Update position state for lock screen / Control Center scrubber
    Player.on('timeupdate', ({ currentTime, duration }) => {
      if (duration && navigator.mediaSession.setPositionState) {
        try {
          navigator.mediaSession.setPositionState({
            duration,
            playbackRate: Player.getState().speed || 1,
            position: Math.min(currentTime, duration),
          });
        } catch (_) {}
      }
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
