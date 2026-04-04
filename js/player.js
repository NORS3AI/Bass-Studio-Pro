/**
 * player.js — Web Audio API playback engine
 *
 * Audio graph: source → gainNode → eqFilters[] → analyser → destination
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

    // Connect: gain → analyser → destination (EQ filters inserted later)
    gainNode.connect(analyser);
    analyser.connect(ctx.destination);
    gainNode.gain.value = volume;

    audioElement = new Audio();
    audioElement.crossOrigin = 'anonymous';

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

  function loadTrack(track) {
    if (sourceNode) {
      sourceNode.disconnect();
    }
    currentTrack = track;
    audioElement.src = track.url;
    audioElement.playbackRate = speed;

    sourceNode = ctx.createMediaElementSource(audioElement);
    // Connect source to first EQ filter or directly to gain
    reconnectGraph();

    emit('trackloaded', track);
  }

  function reconnectGraph() {
    if (!sourceNode) return;
    sourceNode.disconnect();
    eqFilters.forEach(f => f.disconnect());
    gainNode.disconnect();

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

  function play() {
    if (ctx.state === 'suspended') ctx.resume();
    audioElement.play();
  }

  function pause() {
    audioElement.pause();
  }

  function togglePlay() {
    isPlaying ? pause() : play();
  }

  function seek(time) {
    audioElement.currentTime = time;
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (gainNode) gainNode.gain.value = isMuted ? 0 : volume;
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
    reconnectGraph();
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
    setVolume, toggleMute, setSpeed, setEQFilters,
    getAnalyser, getContext, getCurrentTime, getDuration, getState,
  };
})();
