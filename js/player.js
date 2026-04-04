/**
 * player.js — Web Audio API playback engine
 *
 * Audio graph: source → eqFilters[] → gainNode → analyser → destination
 *
 * IMPORTANT: MediaElementSource is created ONCE in init() and reused.
 * Calling createMediaElementSource() more than once per element throws.
 */
const Player = (() => {
  let ctx = null;
  let gainNode = null;
  let analyser = null;
  let sourceNode = null;
  let audioElement = null;
  let eqFilters = [];

  // State
  let currentTrack = null;
  let isPlaying = false;
  let volume = 0.8;
  let speed = 1.0;
  let isMuted = false;

  const listeners = {};

  function on(event, fn) {
    (listeners[event] = listeners[event] || []).push(fn);
  }
  function off(event, fn) {
    const list = listeners[event];
    if (list) listeners[event] = list.filter(f => f !== fn);
  }
  function emit(event, data) {
    (listeners[event] || []).forEach(fn => fn(data));
  }

  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = ctx.createGain();
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;

    audioElement = new Audio();

    // Create the source node ONCE and keep it connected
    sourceNode = ctx.createMediaElementSource(audioElement);
    connectGraph();

    gainNode.gain.value = volume;

    // iOS/Safari: AudioContext starts suspended. Unlock on first user gesture.
    function unlockAudio() {
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      document.removeEventListener('touchstart', unlockAudio, true);
      document.removeEventListener('touchend', unlockAudio, true);
      document.removeEventListener('click', unlockAudio, true);
    }
    document.addEventListener('touchstart', unlockAudio, true);
    document.addEventListener('touchend', unlockAudio, true);
    document.addEventListener('click', unlockAudio, true);

    audioElement.addEventListener('timeupdate', () => {
      emit('timeupdate', {
        currentTime: audioElement.currentTime,
        duration: audioElement.duration || 0,
      });
    });
    audioElement.addEventListener('ended', () => emit('ended'));
    audioElement.addEventListener('play', () => { isPlaying = true; emit('statechange', 'playing'); });
    audioElement.addEventListener('pause', () => { isPlaying = false; emit('statechange', 'paused'); });
  }

  /**
   * (Re)connect the full audio graph.
   * source → [eqFilters] → gain → analyser → destination
   */
  function connectGraph() {
    if (!sourceNode || !gainNode || !analyser) return;

    sourceNode.disconnect();
    eqFilters.forEach(f => f.disconnect());
    gainNode.disconnect();
    analyser.disconnect();

    if (eqFilters.length > 0) {
      sourceNode.connect(eqFilters[0]);
      for (let i = 0; i < eqFilters.length - 1; i++) {
        eqFilters[i].connect(eqFilters[i + 1]);
      }
      eqFilters[eqFilters.length - 1].connect(gainNode);
    } else {
      sourceNode.connect(gainNode);
    }
    gainNode.connect(analyser);
    analyser.connect(ctx.destination);
  }

  /**
   * Load a track. Pauses current playback first to avoid AbortError.
   * Returns a Promise that resolves when the track is ready to play.
   */
  function loadTrack(track) {
    // Pause current playback to prevent AbortError on src change
    if (!audioElement.paused) {
      audioElement.pause();
    }

    currentTrack = track;
    audioElement.src = track.url;
    audioElement.playbackRate = speed;
    emit('trackloaded', track);

    // Return a promise that resolves when audio is ready
    return new Promise((resolve) => {
      const onReady = () => {
        audioElement.removeEventListener('canplay', onReady);
        audioElement.removeEventListener('error', onError);
        resolve(true);
      };
      const onError = () => {
        audioElement.removeEventListener('canplay', onReady);
        audioElement.removeEventListener('error', onError);
        emit('error', { message: 'Failed to load track', track });
        resolve(false);
      };
      audioElement.addEventListener('canplay', onReady);
      audioElement.addEventListener('error', onError);
    });
  }

  async function play() {
    if (!currentTrack) return;
    // Always attempt resume — must happen before audioElement.play()
    // Call without await first to keep user gesture context on iOS
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    try {
      await audioElement.play();
    } catch (err) {
      // Autoplay blocked or AbortError from rapid track switching — not fatal
      if (err.name !== 'AbortError') {
        emit('error', { message: 'Playback failed', error: err });
      }
    }
  }

  function pause() {
    audioElement.pause();
  }

  function togglePlay() {
    if (!currentTrack) return;
    isPlaying ? pause() : play();
  }

  function seek(time) {
    if (!audioElement.duration) return;
    audioElement.currentTime = Math.max(0, Math.min(time, audioElement.duration));
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (gainNode) gainNode.gain.value = isMuted ? 0 : volume;
    emit('volumechange', volume);
  }

  function getVolume() {
    return volume;
  }

  function toggleMute() {
    isMuted = !isMuted;
    if (gainNode) gainNode.gain.value = isMuted ? 0 : volume;
    emit('mutechange', isMuted);
  }

  function setSpeed(s) {
    speed = s;
    if (audioElement) audioElement.playbackRate = speed;
    emit('speedchange', speed);
  }

  function setEQFilters(filters) {
    eqFilters = filters;
    if (sourceNode) connectGraph();
  }

  /**
   * Apply preamp gain offset. Adjusts the master gain node.
   * @param {number} db — preamp in dB (-12 to +12)
   */
  function setPreampGain(db) {
    if (!gainNode) return;
    // Convert dB to linear gain, layered on top of volume
    const linear = Math.pow(10, db / 20);
    gainNode.gain.value = isMuted ? 0 : volume * linear;
  }

  function getAnalyser() {
    return analyser;
  }

  function getContext() {
    return ctx;
  }

  function getCurrentTime() {
    return audioElement ? audioElement.currentTime : 0;
  }

  function getDuration() {
    return audioElement ? audioElement.duration || 0 : 0;
  }

  function getState() {
    return { isPlaying, currentTrack, volume, speed, isMuted };
  }

  return {
    init, on, off, loadTrack, play, pause, togglePlay, seek,
    setVolume, getVolume, toggleMute, setSpeed, setEQFilters,
    setPreampGain, getAnalyser, getContext, getCurrentTime, getDuration, getState,
  };
})();
