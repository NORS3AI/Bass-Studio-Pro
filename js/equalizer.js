/**
 * equalizer.js — 10-band EQ with presets and custom curves
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
    filters.forEach((f, i) => { f.gain.value = gains[i]; });
  }

  function setBand(index, value) {
    gains[index] = value;
    if (filters[index]) filters[index].gain.value = value;
    activePreset = 'Custom';
  }

  function setPreamp(value) {
    preamp = value;
    Player.setPreampGain(preamp);
  }

  function saveCustomPreset(name) {
    customPresets[name] = [...gains];
  }

  function deleteCustomPreset(name) {
    delete customPresets[name];
  }

  function getPresetNames() {
    return [...Object.keys(PRESETS), ...Object.keys(customPresets)];
  }

  return {
    BANDS, PRESETS, init, applyPreset, setBand, setPreamp,
    saveCustomPreset, deleteCustomPreset, getPresetNames,
    get activePreset() { return activePreset; },
    get gains() { return gains; },
    get preamp() { return preamp; },
  };
})();
