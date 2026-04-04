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
    // Disconnect everything first
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

  function loadTrack(track) {
    currentTrack = track;
    audioElement.src = track.url;
    audioElement.playbackRate = speed;
    emit('trackloaded', track);
  }

  function play() {
    if (!currentTrack) return;
    if (ctx.state === 'suspended') ctx.resume();
    audioElement.play();
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
    init, on, loadTrack, play, pause, togglePlay, seek,
    setVolume, getVolume, toggleMute, setSpeed, setEQFilters,
    getAnalyser, getContext, getCurrentTime, getDuration, getState,
  };
})();
