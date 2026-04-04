/**
 * app.js — Application initialization and UI wiring
 */
(async function () {
  'use strict';

  // --- Init core modules ---
  // Wrap Storage.init in try-catch so app works even if IndexedDB is unavailable
  try {
    await Storage.init();
  } catch (e) {
    console.warn('IndexedDB unavailable, running without persistence:', e);
  }

  Player.init();
  Equalizer.init();
  Visualizer.init();
  await PatchNotes.load();

  // --- Restore persisted volume ---
  try {
    const savedVolume = await Storage.getSetting('volume');
    if (savedVolume !== null) {
      Player.setVolume(savedVolume);
    }
  } catch (_) {}

  // --- DOM refs ---
  const $ = (sel) => document.querySelector(sel);
  const btnOpenFiles   = $('#btn-open-files');
  const btnOpenFolder  = $('#btn-open-folder');
  const dropZone       = $('#drop-zone');
  const trackList      = $('#track-list');
  const searchInput    = $('#search-input');
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

  // Hide album art initially (no src to avoid spurious request)
  albumArt.style.display = 'none';
  albumArt.removeAttribute('src');

  // Sync volume slider to restored value
  volumeSlider.value = Player.getVolume() * 100;

  // ============================================
  // FILE LOADING (Phase 1: tasks 1.1, 1.2, 1.3)
  // ============================================

  btnOpenFiles.addEventListener('click', async () => {
    const files = await FileLoader.openFiles();
    if (files.length) await Playlist.addFiles(files);
  });

  btnOpenFolder.addEventListener('click', async () => {
    const files = await FileLoader.openFolder();
    if (files.length) await Playlist.addFiles(files);
  });

  // Drag-and-drop with counter to prevent flicker from child elements
  let dragCounter = 0;
  dropZone.addEventListener('dragenter', (e) => {
    e.preventDefault();
    dragCounter++;
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
  });
  dropZone.addEventListener('dragleave', () => {
    dragCounter--;
    if (dragCounter === 0) dropZone.classList.remove('dragover');
  });
  dropZone.addEventListener('drop', async (e) => {
    e.preventDefault();
    dragCounter = 0;
    dropZone.classList.remove('dragover');
    const files = await FileLoader.handleDrop(e.dataTransfer);
    if (files.length) await Playlist.addFiles(files);
  });

  // ============================================
  // PLAYLIST RENDERING
  // ============================================

  /**
   * Render tracks into the list. Uses track.id for click handlers
   * to avoid index mismatch when rendering search results.
   */
  function renderTracks(tracks) {
    trackList.innerHTML = '';

    if (tracks.length === 0) {
      trackList.innerHTML = '<li class="empty-state">No tracks loaded \u2014 use the buttons above to add music</li>';
      return;
    }

    const currentId = Playlist.getCurrentTrackId();
    const pl = Playlist.getActive();
    const fullTracks = pl ? pl.tracks : [];

    tracks.forEach((track, i) => {
      const li = document.createElement('li');
      li.dataset.id = track.id;
      if (track.id === currentId) li.classList.add('active');

      // Find the real index in the full playlist for display numbering
      const realIndex = fullTracks.indexOf(track);
      const displayNum = realIndex >= 0 ? realIndex + 1 : i + 1;

      li.innerHTML = `
        <span class="track-number">${displayNum}</span>
        <span class="track-name">${escapeHTML(track.title)}</span>
        <span class="track-duration">${formatTime(track.duration)}</span>
        <span class="track-fav">${Playlist.isFavorite(track.id) ? '\u2605' : '\u2606'}</span>
      `;
      // Use track ID to play, not array index — avoids search index mismatch
      li.addEventListener('click', () => Playlist.playTrackById(track.id));
      li.querySelector('.track-fav').addEventListener('click', (e) => {
        e.stopPropagation();
        Playlist.toggleFavorite(track.id);
      });
      trackList.appendChild(li);
    });
  }

  Playlist.on('trackschanged', (pl) => renderTracks(pl.tracks));
  Playlist.on('favoriteschanged', () => {
    const pl = Playlist.getActive();
    if (pl) renderTracks(pl.tracks);
  });

  // ============================================
  // PLAYBACK (Phase 1: tasks 1.4–1.11)
  // ============================================

  Playlist.on('playtrack', async ({ track, index }) => {
    const ok = await Player.loadTrack(track);
    if (ok) Player.play();

    trackTitle.textContent = track.title;
    trackArtist.textContent = track.artist;
    albumArt.style.display = 'none'; // No album art extraction yet (Phase 3)

    // Update favorite button
    btnFavorite.innerHTML = Playlist.isFavorite(track.id) ? '&#x2605;' : '&#x2606;';

    // Re-render to update active highlight
    const pl = Playlist.getActive();
    if (pl) {
      const query = searchInput.value;
      renderTracks(query ? Playlist.search(query) : pl.tracks);
    }
  });

  // Play / Pause (1.5)
  btnPlay.addEventListener('click', () => Player.togglePlay());

  // Previous / Next (1.10, 1.11)
  btnPrev.addEventListener('click', () => Playlist.prev());
  btnNext.addEventListener('click', () => Playlist.next());

  // Shuffle / Repeat
  btnShuffle.addEventListener('click', () => Playlist.toggleShuffle());
  btnRepeat.addEventListener('click', () => Playlist.cycleRepeat());

  // Mute (1.9)
  btnMute.addEventListener('click', () => Player.toggleMute());

  // Favorite in now-playing bar
  btnFavorite.addEventListener('click', () => {
    const id = Playlist.getCurrentTrackId();
    if (id) {
      Playlist.toggleFavorite(id);
      btnFavorite.innerHTML = Playlist.isFavorite(id) ? '&#x2605;' : '&#x2606;';
    }
  });

  // Play/Pause icon update
  Player.on('statechange', (state) => {
    btnPlay.innerHTML = state === 'playing' ? '&#x23f8;' : '&#x25b6;';
  });

  // Time display + progress bar (1.6, 1.7)
  Player.on('timeupdate', ({ currentTime, duration }) => {
    timeElapsed.textContent = formatTime(currentTime);
    timeTotal.textContent = formatTime(duration);
    if (duration && !progressBar.matches(':active')) {
      progressBar.value = (currentTime / duration) * 100;
    }
  });

  // Auto-advance (1.11)
  Player.on('ended', () => Playlist.next());

  // Seek (1.6)
  progressBar.addEventListener('input', () => {
    const dur = Player.getDuration();
    if (dur) Player.seek((progressBar.value / 100) * dur);
  });

  // Volume (1.8) — persist on change
  volumeSlider.addEventListener('input', () => {
    const v = volumeSlider.value / 100;
    Player.setVolume(v);
    try { Storage.saveSetting('volume', v); } catch (_) {}
  });

  // Mute icon update (1.9)
  Player.on('mutechange', (muted) => {
    btnMute.innerHTML = muted ? '&#x1f507;' : '&#x1f50a;';
  });

  // Speed toggle
  const speeds = [0.5, 0.75, 1, 1.25, 1.5, 2];
  let speedIdx = 2;
  btnSpeed.addEventListener('click', () => {
    speedIdx = (speedIdx + 1) % speeds.length;
    Player.setSpeed(speeds[speedIdx]);
    btnSpeed.textContent = speeds[speedIdx] + 'x';
  });

  // Shuffle / repeat visual feedback
  Playlist.on('shufflechanged', (on) => btnShuffle.classList.toggle('active', on));
  Playlist.on('repeatchanged', (mode) => {
    btnRepeat.classList.toggle('active', mode !== 'off');
    btnRepeat.title = `Repeat: ${mode}`;
  });

  // ============================================
  // PANEL TOGGLES (fixed: save state before hiding all)
  // ============================================

  function togglePanel(section) {
    const wasVisible = !section.classList.contains('hidden');
    // Hide all panels
    [eqSection, settingsSection, patchSection].forEach(s => s.classList.add('hidden'));
    // Toggle: show only if it was previously hidden
    if (!wasVisible) {
      section.classList.remove('hidden');
    }
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
  // VISUALIZER (F toggles on/off, ESC closes)
  // ============================================

  function openVisualizer() {
    vizOverlay.classList.remove('hidden');
    Visualizer.start();
    vizModeLabel.textContent = Visualizer.getCurrentMode().name;
  }

  function closeVisualizer() {
    vizOverlay.classList.add('hidden');
    Visualizer.stop();
  }

  function toggleVisualizer() {
    if (vizOverlay.classList.contains('hidden')) {
      openVisualizer();
    } else {
      closeVisualizer();
    }
  }

  btnVizToggle.addEventListener('click', toggleVisualizer);

  $('#btn-viz-close').addEventListener('click', closeVisualizer);

  $('#btn-viz-next').addEventListener('click', () => {
    vizModeLabel.textContent = Visualizer.nextMode().name;
  });

  $('#btn-viz-prev').addEventListener('click', () => {
    vizModeLabel.textContent = Visualizer.prevMode().name;
  });

  // ============================================
  // EQ PRESETS, SLIDERS & PREAMP
  // ============================================

  const eqPresetsContainer = $('#eq-presets');
  Equalizer.getPresetNames().forEach((name) => {
    const btn = document.createElement('button');
    btn.textContent = name;
    btn.addEventListener('click', () => {
      Equalizer.applyPreset(name);
      eqPresetsContainer.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      renderEQSliders();
    });
    if (name === 'Flat') btn.classList.add('active');
    eqPresetsContainer.appendChild(btn);
  });

  const eqSlidersContainer = $('#eq-sliders');
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
      });
      eqSlidersContainer.appendChild(div);
    });
  }
  renderEQSliders();

  // Preamp slider
  const eqPreamp = $('#eq-preamp');
  if (eqPreamp) {
    eqPreamp.addEventListener('input', () => {
      Equalizer.setPreamp(parseFloat(eqPreamp.value));
    });
  }

  // ============================================
  // KEYBOARD SHORTCUTS
  // ============================================

  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        Player.togglePlay();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        e.shiftKey ? Playlist.prev() : Player.seek(Player.getCurrentTime() - 5);
        break;
      case 'ArrowRight':
        e.preventDefault();
        e.shiftKey ? Playlist.next() : Player.seek(Player.getCurrentTime() + 5);
        break;
      case 'ArrowUp':
        e.preventDefault();
        volumeSlider.value = Math.min(100, +volumeSlider.value + 5);
        Player.setVolume(volumeSlider.value / 100);
        try { Storage.saveSetting('volume', volumeSlider.value / 100); } catch (_) {}
        break;
      case 'ArrowDown':
        e.preventDefault();
        volumeSlider.value = Math.max(0, +volumeSlider.value - 5);
        Player.setVolume(volumeSlider.value / 100);
        try { Storage.saveSetting('volume', volumeSlider.value / 100); } catch (_) {}
        break;
      case 'm': case 'M':
        Player.toggleMute();
        break;
      case 's': case 'S':
        Playlist.toggleShuffle();
        break;
      case 'r': case 'R':
        Playlist.cycleRepeat();
        break;
      case 'f': case 'F':
        toggleVisualizer();
        break;
      case 'e': case 'E':
        togglePanel(eqSection);
        break;
      case 'Escape':
        if (!vizOverlay.classList.contains('hidden')) {
          closeVisualizer();
        }
        break;
      case '/':
        e.preventDefault();
        searchInput.focus();
        break;
      case '1': case '2': case '3': case '4': case '5': case '6':
        if (!vizOverlay.classList.contains('hidden')) {
          const idx = parseInt(e.key) - 1;
          if (idx < Visualizer.MODES.length) {
            vizModeLabel.textContent = Visualizer.setMode(idx).name;
          }
        }
        break;
    }
  });

  // ============================================
  // WINDOW RESIZE
  // ============================================

  window.addEventListener('resize', () => {
    if (!vizOverlay.classList.contains('hidden')) Visualizer.resize();
  });

  // ============================================
  // SEARCH
  // ============================================

  searchInput.addEventListener('input', () => {
    const results = searchInput.value
      ? Playlist.search(searchInput.value)
      : (Playlist.getActive()?.tracks || []);
    renderTracks(results);
  });

  // ============================================
  // THEME
  // ============================================

  try {
    const themeSetting = await Storage.getSetting('theme');
    if (themeSetting) {
      applyTheme(themeSetting);
      $('#setting-theme').value = themeSetting;
    }
  } catch (_) {}

  function applyTheme(value) {
    if (value === 'system') {
      // Remove data-theme and let prefers-color-scheme decide
      delete document.documentElement.dataset.theme;
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

  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', () => {
    try {
      Storage.getSetting('theme').then(t => { if (t === 'system') applyTheme('system'); });
    } catch (_) {}
  });

  // ============================================
  // MEDIA SESSION API
  // ============================================

  if ('mediaSession' in navigator) {
    navigator.mediaSession.setActionHandler('play', () => Player.play());
    navigator.mediaSession.setActionHandler('pause', () => Player.pause());
    navigator.mediaSession.setActionHandler('previoustrack', () => Playlist.prev());
    navigator.mediaSession.setActionHandler('nexttrack', () => Playlist.next());

    Player.on('trackloaded', (track) => {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: track.title,
        artist: track.artist,
        album: track.album,
      });
    });
  }

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
})();
