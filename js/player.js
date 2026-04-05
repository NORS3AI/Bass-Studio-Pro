/**
 * player.js — Web Audio API playback engine with dual-slot crossfade/gapless.
 *
 * Dual-slot graph (two audio elements, two slot gains, summed into the EQ chain):
 *
 *   elements[0] → sources[0] → slotGains[0] ┐
 *                                           ├→ [eqFilters] → normGain → masterGain → analyser → destination
 *   elements[1] → sources[1] → slotGains[1] ┘
 *
 * `activeSlot` tracks which element currently "owns" playback. The other slot
 * sits at gain=0 and is used only for crossfade pre-roll or gapless pre-buffer.
 * On crossfade completion the slots swap.
 *
 * Background playback (iOS/iPad): When the page goes to background, iOS
 * suspends the AudioContext, killing all Web Audio output. To keep music
 * playing, we spin up a backup <audio> element that plays the same blob
 * URL directly (bypassing Web Audio). When the page returns, we sync
 * position back and resume the Web Audio path with EQ.
 */
const Player = (() => {
  let ctx = null;
  let gainNode = null;       // master gain (volume × preamp)
  let normGainNode = null;   // normalization gain (per-track)
  let analyser = null;
  let eqFilters = [];

  // Dual-slot playback
  const elements = [null, null];
  const sources = [null, null];
  const slotGains = [null, null];
  let activeSlot = 0;
  let crossfadeActive = false;

  // Legacy-style refs that always point at the active slot
  let audioElement = null;
  let sourceNode = null;

  // State
  let currentTrack = null;
  let isPlaying = false;
  let volume = 0.8;
  let speed = 1.0;
  let pitchSemitones = 0;
  let isMuted = false;

  function applyRate() {
    const pitchRatio = Math.pow(2, pitchSemitones / 12);
    const rate = speed * pitchRatio;
    [elements[0], elements[1]].forEach(el => {
      if (!el) return;
      try { el.preservesPitch = (pitchSemitones === 0); } catch (_) {}
      try { el.mozPreservesPitch = (pitchSemitones === 0); } catch (_) {}
      try { el.webkitPreservesPitch = (pitchSemitones === 0); } catch (_) {}
      el.playbackRate = rate;
    });
  }

  const listeners = {};
  function on(event, fn) { (listeners[event] = listeners[event] || []).push(fn); }
  function off(event, fn) {
    const list = listeners[event];
    if (list) listeners[event] = list.filter(f => f !== fn);
  }
  function emit(event, data) { (listeners[event] || []).forEach(fn => fn(data)); }

  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    gainNode = ctx.createGain();
    normGainNode = ctx.createGain();
    normGainNode.gain.value = 1.0;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;

    // Create both slots up-front. MediaElementSource can only be created once
    // per element, so we make both now and reuse them for the session.
    for (let i = 0; i < 2; i++) {
      elements[i] = new Audio();
      sources[i] = ctx.createMediaElementSource(elements[i]);
      slotGains[i] = ctx.createGain();
      slotGains[i].gain.value = (i === 0) ? 1.0 : 0.0;
      sources[i].connect(slotGains[i]);
      attachElementListeners(i);
    }
    audioElement = elements[0];
    sourceNode = sources[0];

    connectGraph();
    gainNode.gain.value = volume;

    // iOS/Safari: AudioContext starts suspended. Unlock on first user gesture.
    let audioUnlocked = false;
    function unlockAudio() {
      if (ctx.state === 'suspended') ctx.resume();
      if (!audioUnlocked) {
        audioUnlocked = true;
        const silence = audioElement.src;
        if (!silence) {
          audioElement.src = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQAAAAA=';
          audioElement.play().then(() => {
            audioElement.pause();
            audioElement.removeAttribute('src');
          }).catch(() => {});
        }
      }
      document.removeEventListener('touchstart', unlockAudio, true);
      document.removeEventListener('touchend', unlockAudio, true);
      document.removeEventListener('click', unlockAudio, true);
    }
    document.addEventListener('touchstart', unlockAudio, true);
    document.addEventListener('touchend', unlockAudio, true);
    document.addEventListener('click', unlockAudio, true);

    document.addEventListener('visibilitychange', handleVisibilityChange);
    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'interrupted') ctx.resume().catch(() => {});
    });
  }

  function attachElementListeners(slot) {
    const el = elements[slot];
    el.addEventListener('timeupdate', () => {
      if (slot !== activeSlot) return;
      emit('timeupdate', { currentTime: el.currentTime, duration: el.duration || 0 });
    });
    el.addEventListener('ended', () => {
      if (slot !== activeSlot) return;
      emit('ended');
    });
    el.addEventListener('play', () => {
      if (slot !== activeSlot) return;
      isPlaying = true;
      emit('statechange', 'playing');
    });
    el.addEventListener('pause', () => {
      if (slot !== activeSlot) return;
      isPlaying = false;
      emit('statechange', 'paused');
    });
  }

  function handleVisibilityChange() {
    if (!document.hidden) {
      // On return to foreground, defensively resume ctx and re-assert gain.
      // iOS/WebKit can leave MediaElementSource routing disconnected after
      // suspend/resume; reasserting the gain value pokes the graph awake.
      if (ctx.state === 'suspended' || ctx.state === 'interrupted') {
        ctx.resume().catch(() => {});
      }
      if (gainNode) gainNode.gain.value = isMuted ? 0 : volume;
    }
  }

  /**
   * (Re)connect the full audio graph.
   *   slotGains[0] ┐
   *                ├→ [eqFilters] → normGain → masterGain → analyser → destination
   *   slotGains[1] ┘
   */
  function connectGraph() {
    if (!slotGains[0] || !slotGains[1] || !gainNode || !analyser || !normGainNode) return;
    slotGains[0].disconnect();
    slotGains[1].disconnect();
    eqFilters.forEach(f => f.disconnect());
    normGainNode.disconnect();
    gainNode.disconnect();
    analyser.disconnect();

    const chainInput = eqFilters.length > 0 ? eqFilters[0] : normGainNode;
    slotGains[0].connect(chainInput);
    slotGains[1].connect(chainInput);

    if (eqFilters.length > 0) {
      for (let i = 0; i < eqFilters.length - 1; i++) eqFilters[i].connect(eqFilters[i + 1]);
      eqFilters[eqFilters.length - 1].connect(normGainNode);
    }
    normGainNode.connect(gainNode);
    gainNode.connect(analyser);
    analyser.connect(ctx.destination);
  }

  function loadTrack(track) {
    // Any pending crossfade is invalidated by an explicit track change.
    cancelCrossfade();

    // Stop the secondary (any preloaded next-track)
    stopSlot(1 - activeSlot);

    if (!audioElement.paused) audioElement.pause();

    currentTrack = track;
    audioElement.src = track.url;
    applyRate();
    if (normGainNode) normGainNode.gain.value = 1.0;
    // Ensure active slot is at full gain (user may have interrupted a crossfade)
    slotGains[activeSlot].gain.cancelScheduledValues(ctx.currentTime);
    slotGains[activeSlot].gain.value = 1.0;
    slotGains[1 - activeSlot].gain.cancelScheduledValues(ctx.currentTime);
    slotGains[1 - activeSlot].gain.value = 0.0;

    emit('trackloaded', track);

    if (ctx.state === 'suspended') ctx.resume();
    const playPromise = audioElement.play();
    if (playPromise) {
      playPromise.catch(err => {
        if (err.name !== 'AbortError') emit('error', { message: 'Playback failed', error: err });
      });
    }

    return new Promise((resolve) => {
      const el = audioElement;
      const onReady = () => {
        el.removeEventListener('canplay', onReady);
        el.removeEventListener('error', onError);
        resolve(true);
      };
      const onError = () => {
        el.removeEventListener('canplay', onReady);
        el.removeEventListener('error', onError);
        emit('error', { message: 'Failed to load track', track });
        resolve(false);
      };
      if (el.readyState >= 3) resolve(true);
      else {
        el.addEventListener('canplay', onReady);
        el.addEventListener('error', onError);
      }
    });
  }

  /**
   * Preload the given track onto the inactive slot, ready to play.
   * Used for both crossfade (overlaps) and gapless (instant swap on ended).
   */
  function preloadSecondary(track) {
    if (!track || !track.url) return;
    const secIdx = 1 - activeSlot;
    const secEl = elements[secIdx];
    // Skip if the exact same URL is already loaded on secondary.
    if (secEl.src === track.url && secEl.readyState >= 2) return;
    try {
      if (!secEl.paused) secEl.pause();
      secEl.src = track.url;
      slotGains[secIdx].gain.cancelScheduledValues(ctx.currentTime);
      slotGains[secIdx].gain.value = 0.0;
      applyRate();
      // We deliberately do NOT play here — crossfade or gapless triggers play.
      secEl.load();
    } catch (_) {}
  }

  /**
   * Start a crossfade: play the preloaded secondary, ramp primary 1→0 and
   * secondary 0→1 over `durationSec`, then swap activeSlot and set the new
   * track as current.
   */
  function startCrossfade(durationSec, nextTrack) {
    if (crossfadeActive) return;
    const secIdx = 1 - activeSlot;
    const secEl = elements[secIdx];
    if (!secEl.src) return;  // not preloaded
    crossfadeActive = true;

    const now = ctx.currentTime;
    const d = Math.max(0.1, Math.min(20, Number(durationSec) || 2));

    // Equal-power-ish linear ramps (linearRamp is perceptually fine for short fades)
    slotGains[activeSlot].gain.cancelScheduledValues(now);
    slotGains[activeSlot].gain.setValueAtTime(slotGains[activeSlot].gain.value, now);
    slotGains[activeSlot].gain.linearRampToValueAtTime(0, now + d);

    slotGains[secIdx].gain.cancelScheduledValues(now);
    slotGains[secIdx].gain.setValueAtTime(0, now);
    slotGains[secIdx].gain.linearRampToValueAtTime(1, now + d);

    if (ctx.state === 'suspended') ctx.resume();
    secEl.play().catch(() => {});

    setTimeout(() => {
      if (!crossfadeActive) return;  // cancelled
      completeSwap(secIdx, nextTrack);
    }, d * 1000);
  }

  /**
   * Gapless swap: the active track just ended, instantly promote the preloaded
   * secondary to active.
   */
  function swapToSecondary(nextTrack) {
    const secIdx = 1 - activeSlot;
    if (!elements[secIdx].src) return false;
    // Set gains instantly
    slotGains[activeSlot].gain.cancelScheduledValues(ctx.currentTime);
    slotGains[activeSlot].gain.value = 0.0;
    slotGains[secIdx].gain.cancelScheduledValues(ctx.currentTime);
    slotGains[secIdx].gain.value = 1.0;
    if (ctx.state === 'suspended') ctx.resume();
    elements[secIdx].play().catch(() => {});
    completeSwap(secIdx, nextTrack);
    return true;
  }

  function completeSwap(newActiveSlot, nextTrack) {
    // Pause old active
    const oldActive = activeSlot;
    const oldEl = elements[oldActive];
    if (oldEl && !oldEl.paused) oldEl.pause();
    oldEl.removeAttribute('src');
    oldEl.load();

    activeSlot = newActiveSlot;
    audioElement = elements[activeSlot];
    sourceNode = sources[activeSlot];
    if (nextTrack) currentTrack = nextTrack;
    crossfadeActive = false;

    // Reset normalization for the new track; caller will apply if enabled
    if (normGainNode) normGainNode.gain.value = 1.0;

    if (nextTrack) emit('trackloaded', nextTrack);
  }

  function cancelCrossfade() {
    if (!crossfadeActive) return;
    crossfadeActive = false;
    const now = ctx.currentTime;
    slotGains[activeSlot].gain.cancelScheduledValues(now);
    slotGains[activeSlot].gain.value = 1.0;
    slotGains[1 - activeSlot].gain.cancelScheduledValues(now);
    slotGains[1 - activeSlot].gain.value = 0.0;
    // Stop secondary that was being faded in
    stopSlot(1 - activeSlot);
  }

  function stopSlot(slot) {
    const el = elements[slot];
    if (!el) return;
    try {
      if (!el.paused) el.pause();
      if (el.src) { el.removeAttribute('src'); el.load(); }
      slotGains[slot].gain.cancelScheduledValues(ctx.currentTime);
      slotGains[slot].gain.value = 0.0;
    } catch (_) {}
  }

  function isCrossfading() { return crossfadeActive; }

  async function play() {
    if (!currentTrack) return;
    if (ctx.state === 'suspended') ctx.resume();
    try { await audioElement.play(); } catch (err) {
      if (err.name !== 'AbortError') emit('error', { message: 'Playback failed', error: err });
    }
  }

  function pause() {
    audioElement.pause();
    // If we're mid-crossfade, pause the secondary too
    if (crossfadeActive) {
      const secEl = elements[1 - activeSlot];
      if (secEl && !secEl.paused) secEl.pause();
    }
  }

  function togglePlay() {
    if (!currentTrack) return;
    if (crossfadeActive) {
      const secEl = elements[1 - activeSlot];
      if (isPlaying) {
        audioElement.pause();
        if (secEl && !secEl.paused) secEl.pause();
      } else {
        audioElement.play().catch(() => {});
        if (secEl && secEl.src) secEl.play().catch(() => {});
      }
      return;
    }
    isPlaying ? pause() : play();
  }

  function seek(time) {
    const dur = audioElement.duration || 0;
    if (!dur) return;
    const t = Math.max(0, Math.min(time, dur));
    audioElement.currentTime = t;
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (gainNode) gainNode.gain.value = isMuted ? 0 : volume;
    emit('volumechange', volume);
  }
  function getVolume() { return volume; }

  function toggleMute() {
    isMuted = !isMuted;
    if (gainNode) gainNode.gain.value = isMuted ? 0 : volume;
    emit('mutechange', isMuted);
  }

  function setSpeed(s) { speed = s; applyRate(); emit('speedchange', speed); }
  function setPitch(semitones) {
    pitchSemitones = Math.max(-12, Math.min(12, Number(semitones) || 0));
    applyRate();
    emit('pitchchange', pitchSemitones);
  }

  function setEQFilters(filters) {
    eqFilters = filters;
    if (sources[0] && sources[1]) connectGraph();
  }

  function setNormalizationGain(g) {
    if (!normGainNode) return;
    const v = Math.max(0.1, Math.min(4.0, Number(g) || 1.0));
    normGainNode.gain.value = v;
  }

  function setPreampGain(db) {
    if (!gainNode) return;
    const linear = Math.pow(10, db / 20);
    gainNode.gain.value = isMuted ? 0 : volume * linear;
  }

  function getAnalyser() { return analyser; }
  function getContext() { return ctx; }
  function getCurrentTime() {
    return audioElement ? audioElement.currentTime : 0;
  }
  function getDuration() {
    return audioElement ? audioElement.duration || 0 : 0;
  }
  function getState() {
    return { isPlaying, currentTrack, volume, speed, pitch: pitchSemitones, isMuted };
  }

  return {
    init, on, off, loadTrack, play, pause, togglePlay, seek,
    setVolume, getVolume, toggleMute, setSpeed, setPitch, setEQFilters,
    setPreampGain, setNormalizationGain, getAnalyser, getContext,
    getCurrentTime, getDuration, getState,
    // Phase 7: crossfade / gapless
    preloadSecondary, startCrossfade, swapToSecondary, cancelCrossfade, isCrossfading,
  };
})();
