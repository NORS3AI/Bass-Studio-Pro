/**
 * equalizer.js — 10-band EQ with presets, custom curves, and bypass
 */
const Equalizer = (() => {
  const BANDS = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];

  const PRESETS = {
    'Flat':        [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
    'Bass Boost':  [8, 6, 4, 2, 0, 0, 0, 0, 0, 0],
    'Treble Boost':[0, 0, 0, 0, 0, 0, 2, 4, 6, 8],
    'Dance':       [6, 4, 1, -2, -4, -2, 1, 4, 6, 6],
    'Rock':        [5, 4, 2, 0, -1, -1, 2, 3, 4, 4],
    'Pop':         [1, 2, 3, 2, 0, -1, 0, 2, 3, 2],
    'Jazz':        [3, 2, 1, 2, 0, 0, 1, 2, 1, 0],
    'Classical':   [0, 0, 0, 0, 0, 0, 0, 1, 2, 2],
    'Hip-Hop':     [7, 5, 3, 1, -1, -1, 1, 2, 3, 4],
    'R&B / Soul':  [4, 3, 1, 2, 1, 0, 1, 2, 2, 1],
    'Electronic':  [6, 5, 2, 0, -2, -1, 1, 3, 5, 6],
    'Acoustic':    [2, 1, 0, 1, 2, 1, 1, 2, 1, 0],
    'Vocal':       [0, 0, 0, 1, 3, 4, 3, 1, 0, 0],
    'Late Night':  [-3, -2, -1, 0, 0, 0, 0, -1, -2, -3],
  };

  let filters = [];
  let activePreset = 'Flat';
  let gains = [...PRESETS['Flat']];
  let preamp = 0;
  let customPresets = {};
  let bypassed = false;
  let curveCanvas = null;
  let curveCtx = null;
  let curveRAF = null;

  const listeners = {};
  function on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); }
  function emit(event, data) { (listeners[event] || []).forEach(fn => fn(data)); }

  function init() {
    const ctx = Player.getContext();
    filters = BANDS.map((freq, i) => {
      const f = ctx.createBiquadFilter();
      f.type = 'peaking';
      f.frequency.value = freq;
      f.Q.value = 1.4;
      f.gain.value = gains[i];
      return f;
    });
    Player.setEQFilters(filters);
  }

  function applyPreset(name) {
    const values = PRESETS[name] || customPresets[name];
    if (!values) return;
    activePreset = name;
    gains = [...values];
    if (!bypassed) {
      filters.forEach((f, i) => { f.gain.value = gains[i]; });
    }
    schedulePersist();
    emit('presetchanged', name);
  }

  function setBand(index, value) {
    gains[index] = value;
    if (filters[index] && !bypassed) filters[index].gain.value = value;
    activePreset = 'Custom';
    schedulePersist();
  }

  function setPreamp(value) {
    preamp = value;
    Player.setPreampGain(bypassed ? 0 : preamp);
    schedulePersist();
  }

  // --- Bypass (5.12) ---
  function toggleBypass() {
    bypassed = !bypassed;
    if (bypassed) {
      filters.forEach(f => { f.gain.value = 0; });
      Player.setPreampGain(0);
    } else {
      filters.forEach((f, i) => { f.gain.value = gains[i]; });
      Player.setPreampGain(preamp);
    }
    emit('bypasschanged', bypassed);
    schedulePersist();
  }

  // --- Custom Presets (5.8, 5.9) ---
  function saveCustomPreset(name) {
    customPresets[name] = [...gains];
    emit('presetschanged');
    schedulePersist();
  }

  function deleteCustomPreset(name) {
    delete customPresets[name];
    if (activePreset === name) activePreset = 'Flat';
    emit('presetschanged');
    schedulePersist();
  }

  function renameCustomPreset(oldName, newName) {
    if (!customPresets[oldName] || !newName) return;
    customPresets[newName] = customPresets[oldName];
    delete customPresets[oldName];
    if (activePreset === oldName) activePreset = newName;
    emit('presetschanged');
    schedulePersist();
  }

  function getPresetNames() {
    return [...Object.keys(PRESETS), ...Object.keys(customPresets)];
  }

  function getCustomPresetNames() {
    return Object.keys(customPresets);
  }

  // --- Frequency Curve (5.7) ---
  function initCurve(canvas) {
    curveCanvas = canvas;
    curveCtx = canvas.getContext('2d');
    drawCurve();
  }

  function drawCurve() {
    if (!curveCanvas || !curveCtx) return;
    const w = curveCanvas.width = curveCanvas.offsetWidth * (window.devicePixelRatio || 1);
    const h = curveCanvas.height = curveCanvas.offsetHeight * (window.devicePixelRatio || 1);
    const ctx = curveCtx;

    ctx.clearRect(0, 0, w, h);

    // Background grid
    ctx.strokeStyle = 'rgba(150, 150, 180, 0.15)';
    ctx.lineWidth = 1;
    // Horizontal 0dB line
    const zeroY = h / 2;
    ctx.beginPath();
    ctx.moveTo(0, zeroY);
    ctx.lineTo(w, zeroY);
    ctx.stroke();
    // +6 / -6 lines
    const sixY = h * (1 - (6 + 12) / 24);
    const negSixY = h * (1 - (-6 + 12) / 24);
    ctx.beginPath();
    ctx.moveTo(0, sixY); ctx.lineTo(w, sixY);
    ctx.moveTo(0, negSixY); ctx.lineTo(w, negSixY);
    ctx.stroke();

    // Map band frequencies to x positions (log scale)
    const minFreq = 20;
    const maxFreq = 20000;
    const logMin = Math.log10(minFreq);
    const logMax = Math.log10(maxFreq);

    function freqToX(freq) {
      return ((Math.log10(freq) - logMin) / (logMax - logMin)) * w;
    }
    function gainToY(gain) {
      // -12 to +12 mapped to h..0
      return h * (1 - (gain + 12) / 24);
    }

    // Interpolate a smooth curve through the band points
    // Sample many frequencies and sum contributions from each band filter
    const points = [];
    const numSamples = 200;
    for (let s = 0; s < numSamples; s++) {
      const logFreq = logMin + (s / (numSamples - 1)) * (logMax - logMin);
      const freq = Math.pow(10, logFreq);
      let totalGain = 0;

      for (let i = 0; i < BANDS.length; i++) {
        const g = bypassed ? 0 : gains[i];
        const centerFreq = BANDS[i];
        const Q = 1.4;
        // Approximate peaking filter response
        const ratio = Math.log2(freq / centerFreq);
        const bandwidth = 1 / Q;
        const response = g * Math.exp(-(ratio * ratio) / (2 * bandwidth * bandwidth));
        totalGain += response;
      }

      // Clamp to -12..+12
      totalGain = Math.max(-12, Math.min(12, totalGain));
      points.push({ x: freqToX(freq), y: gainToY(totalGain) });
    }

    // Draw fill
    ctx.beginPath();
    ctx.moveTo(points[0].x, zeroY);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, zeroY);
    ctx.closePath();
    ctx.fillStyle = bypassed ? 'rgba(150, 150, 150, 0.15)' : 'rgba(108, 92, 231, 0.2)';
    ctx.fill();

    // Draw line
    ctx.beginPath();
    points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
    ctx.strokeStyle = bypassed ? 'rgba(150, 150, 150, 0.5)' : '#6c5ce7';
    ctx.lineWidth = 2 * (window.devicePixelRatio || 1);
    ctx.stroke();

    // Draw band dots
    const dotColor = bypassed ? 'rgba(150, 150, 150, 0.6)' : '#7f70f0';
    BANDS.forEach((freq, i) => {
      const x = freqToX(freq);
      const y = gainToY(bypassed ? 0 : gains[i]);
      ctx.beginPath();
      ctx.arc(x, y, 3 * (window.devicePixelRatio || 1), 0, Math.PI * 2);
      ctx.fillStyle = dotColor;
      ctx.fill();
    });
  }

  // --- Persistence (5.10) ---
  let persistTimer = null;
  function schedulePersist() {
    if (persistTimer) clearTimeout(persistTimer);
    persistTimer = setTimeout(persistState, 400);
  }

  async function persistState() {
    try {
      await Storage.saveState('eq', {
        activePreset,
        gains: [...gains],
        preamp,
        bypassed,
        customPresets: { ...customPresets },
      });
    } catch (_) {}
  }

  async function restoreState() {
    try {
      const saved = await Storage.getState('eq');
      if (!saved) return;

      if (saved.customPresets && typeof saved.customPresets === 'object') {
        customPresets = saved.customPresets;
      }
      if (typeof saved.preamp === 'number') {
        preamp = saved.preamp;
      }
      if (typeof saved.bypassed === 'boolean') {
        bypassed = saved.bypassed;
      }
      if (Array.isArray(saved.gains) && saved.gains.length === 10) {
        gains = saved.gains;
      }
      if (saved.activePreset) {
        activePreset = saved.activePreset;
      }

      // Apply restored state to filters
      filters.forEach((f, i) => {
        f.gain.value = bypassed ? 0 : gains[i];
      });
      Player.setPreampGain(bypassed ? 0 : preamp);

      emit('restored');
    } catch (_) {}
  }

  return {
    BANDS, PRESETS, init, applyPreset, setBand, setPreamp,
    toggleBypass, saveCustomPreset, deleteCustomPreset, renameCustomPreset,
    getPresetNames, getCustomPresetNames, initCurve, drawCurve, restoreState,
    on,
    get activePreset() { return activePreset; },
    get gains() { return gains; },
    get preamp() { return preamp; },
    get bypassed() { return bypassed; },
    get customPresets() { return customPresets; },
  };
})();
