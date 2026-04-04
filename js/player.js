/**
 * player.js — Web Audio API playback engine
 *
 * Audio graph: source → eqFilters[] → gainNode → analyser → destination
 *
 * Background playback (iOS/iPad): When the page goes to background, iOS
 * suspends the AudioContext, killing all Web Audio output. To keep music
 * playing, we spin up a backup <audio> element that plays the same blob
 * URL directly (bypassing Web Audio). When the page returns, we sync
 * position back and resume the Web Audio path with EQ.
 */
const Player = (() => {
  let ctx = null;
  let gainNode = null;
  let analyser = null;
  let sourceNode = null;
  let audioElement = null;
  let eqFilters = [];

  // Background playback
  let backupAudio = null;
  let wasPlayingBeforeHide = false;

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
    // Also warm up the audio element so future play() calls aren't blocked.
    let audioUnlocked = false;
    function unlockAudio() {
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
      // Warm up audio element with a silent play — required on iPhone
      if (!audioUnlocked) {
        audioUnlocked = true;
        const silence = audioElement.src;
        if (!silence) {
          // Load a tiny silent data URI to unlock the element
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

    // Background/foreground handling for iOS
    document.addEventListener('visibilitychange', handleVisibilityChange);

    // Handle iOS interruptions (phone calls, Siri, etc.)
    ctx.addEventListener('statechange', () => {
      if (ctx.state === 'interrupted') {
        ctx.resume().catch(() => {});
      }
    });

    audioElement.addEventListener('timeupdate', () => {
      // Don't emit timeupdate if backup is active (backup handles its own)
      if (backupAudio) return;
      emit('timeupdate', {
        currentTime: audioElement.currentTime,
        duration: audioElement.duration || 0,
      });
    });
    audioElement.addEventListener('ended', () => {
      if (!backupAudio) emit('ended');
    });
    audioElement.addEventListener('play', () => {
      if (!backupAudio) { isPlaying = true; emit('statechange', 'playing'); }
    });
    audioElement.addEventListener('pause', () => {
      if (!backupAudio) { isPlaying = false; emit('statechange', 'paused'); }
    });
  }

  /**
   * Handle page visibility changes for background playback on iOS.
   *
   * Going to background: Spin up a backup audio element that plays
   * the same source directly (no Web Audio) so iOS doesn't kill audio.
   *
   * Coming back: Sync position from backup, kill backup, resume Web Audio.
   */
  function handleVisibilityChange() {
    if (document.hidden) {
      // Page going to background
      wasPlayingBeforeHide = isPlaying;
      if (isPlaying && currentTrack && currentTrack.url) {
        startBackupAudio();
      }
    } else {
      // Page returning to foreground
      if (backupAudio) {
        stopBackupAudio();
      }
      // Resume AudioContext (may have been suspended by OS)
      if (ctx.state === 'suspended') {
        ctx.resume();
      }
    }
  }

  function startBackupAudio() {
    try {
      backupAudio = new Audio();
      backupAudio.src = audioElement.src;
      backupAudio.currentTime = audioElement.currentTime;
      backupAudio.volume = isMuted ? 0 : volume;
      backupAudio.playbackRate = speed;

      // When backup track ends, advance to next
      backupAudio.addEventListener('ended', () => {
        emit('ended');
      });

      // Keep emitting timeupdate from backup
      backupAudio.addEventListener('timeupdate', () => {
        emit('timeupdate', {
          currentTime: backupAudio.currentTime,
          duration: backupAudio.duration || 0,
        });
      });

      backupAudio.play().catch(() => {
        // If backup fails to play, clean up
        backupAudio = null;
      });

      // Pause main element so it doesn't consume resources
      audioElement.pause();
    } catch (_) {
      backupAudio = null;
    }
  }

  function stopBackupAudio() {
    if (!backupAudio) return;

    const backupTime = backupAudio.currentTime;
    const backupWasPlaying = !backupAudio.paused;

    // Stop backup
    backupAudio.pause();
    backupAudio.removeAttribute('src');
    backupAudio.load();
    backupAudio = null;

    // Sync main element to where backup left off
    if (audioElement.src) {
      audioElement.currentTime = backupTime;
      if (backupWasPlaying) {
        // Resume through Web Audio path
        isPlaying = true;
        emit('statechange', 'playing');
        audioElement.play().catch(() => {});
      }
    }
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
   * Load a track and start playing immediately.
   *
   * IMPORTANT: On iPhone Safari, audioElement.play() MUST be called
   * synchronously within the user gesture handler. Awaiting canplay
   * breaks the gesture chain and play() gets rejected. So we set src
   * and call play() in one synchronous flow — the browser buffers
   * and starts playback when ready.
   */
  function loadTrack(track) {
    // Kill backup if it exists
    if (backupAudio) {
      backupAudio.pause();
      backupAudio.removeAttribute('src');
      backupAudio.load();
      backupAudio = null;
    }

    // Pause current playback to prevent AbortError on src change
    if (!audioElement.paused) {
      audioElement.pause();
    }

    currentTrack = track;
    audioElement.src = track.url;
    audioElement.playbackRate = speed;
    emit('trackloaded', track);

    // Start playing immediately — don't await canplay (breaks iOS gesture)
    // The browser will buffer and begin playback when ready.
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const playPromise = audioElement.play();
    if (playPromise) {
      playPromise.catch(err => {
        if (err.name !== 'AbortError') {
          emit('error', { message: 'Playback failed', error: err });
        }
      });
    }

    // Return a promise that resolves once audio is confirmed playable
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
      // If already have enough data, resolve immediately
      if (audioElement.readyState >= 3) {
        resolve(true);
      } else {
        audioElement.addEventListener('canplay', onReady);
        audioElement.addEventListener('error', onError);
      }
    });
  }

  async function play() {
    if (!currentTrack) return;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }
    try {
      await audioElement.play();
    } catch (err) {
      if (err.name !== 'AbortError') {
        emit('error', { message: 'Playback failed', error: err });
      }
    }
  }

  function pause() {
    // If backup is playing in background, pause it too
    if (backupAudio) {
      backupAudio.pause();
      isPlaying = false;
      emit('statechange', 'paused');
    }
    audioElement.pause();
  }

  function togglePlay() {
    if (!currentTrack) return;
    if (backupAudio) {
      // Handle toggle while in background
      if (backupAudio.paused) {
        backupAudio.play().catch(() => {});
        isPlaying = true;
        emit('statechange', 'playing');
      } else {
        backupAudio.pause();
        isPlaying = false;
        emit('statechange', 'paused');
      }
      return;
    }
    isPlaying ? pause() : play();
  }

  function seek(time) {
    const dur = audioElement.duration || (backupAudio ? backupAudio.duration : 0);
    if (!dur) return;
    const t = Math.max(0, Math.min(time, dur));
    audioElement.currentTime = t;
    if (backupAudio) backupAudio.currentTime = t;
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (gainNode) gainNode.gain.value = isMuted ? 0 : volume;
    if (backupAudio) backupAudio.volume = isMuted ? 0 : volume;
    emit('volumechange', volume);
  }

  function getVolume() {
    return volume;
  }

  function toggleMute() {
    isMuted = !isMuted;
    if (gainNode) gainNode.gain.value = isMuted ? 0 : volume;
    if (backupAudio) backupAudio.volume = isMuted ? 0 : volume;
    emit('mutechange', isMuted);
  }

  function setSpeed(s) {
    speed = s;
    if (audioElement) audioElement.playbackRate = speed;
    if (backupAudio) backupAudio.playbackRate = speed;
    emit('speedchange', speed);
  }

  function setEQFilters(filters) {
    eqFilters = filters;
    if (sourceNode) connectGraph();
  }

  function setPreampGain(db) {
    if (!gainNode) return;
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
    if (backupAudio) return backupAudio.currentTime;
    return audioElement ? audioElement.currentTime : 0;
  }

  function getDuration() {
    if (backupAudio) return backupAudio.duration || 0;
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
