/**
 * visualizer.js — Beat-synced Canvas visualizers with color themes and FPS-aware rendering
 */
const Visualizer = (() => {
  const MODES = [
    { id: 'bars',       name: 'Frequency Bars' },
    { id: 'waveform',   name: 'Waveform' },
    { id: 'circular',   name: 'Circular Spectrum' },
    { id: 'particles',  name: 'Particle Field' },
    { id: 'spectro',    name: 'Spectrogram' },
    { id: 'blob',       name: 'Blob' },
  ];

  // --- Color Themes ---
  const THEMES = {
    neon:       { name: 'Neon',       colors: ['#ff00ff', '#00ffff', '#ff3366', '#33ff99', '#ffff00'], bg: '#000000' },
    sunset:     { name: 'Sunset',     colors: ['#ff6b35', '#f7c59f', '#e84855', '#ffcf56', '#a855f7'], bg: '#1a0a2e' },
    ocean:      { name: 'Ocean',      colors: ['#0077b6', '#00b4d8', '#90e0ef', '#48cae4', '#023e8a'], bg: '#001219' },
    monochrome: { name: 'Monochrome', colors: ['#ffffff', '#cccccc', '#999999', '#e0e0e0', '#b0b0b0'], bg: '#000000' },
  };

  let canvas = null;
  let canvasCtx = null;
  let analyser = null;
  let animId = null;
  let modeIndex = 0;
  let active = false;
  let themeId = 'neon';
  let customThemeColors = null; // { accent: '#ff00ff', secondary: '#00ffff' }

  // Spectrogram persistent buffer
  let spectroImageData = null;

  // Particle state (persistent across frames)
  let particles = [];
  let particlesInited = false;

  // Beat detection state
  let beatEnergy = 0;
  let beatThreshold = 1.2;
  let beatDecay = 0.98;
  let beatHistory = [];
  let isBeat = false;
  let beatFlash = 0; // 0-1 flash intensity, decays per frame

  // FPS tracking
  let lastFrameTime = 0;
  let frameCount = 0;
  let fps = 60;
  let fpsUpdateTime = 0;
  let qualityScale = 1; // 1 = full, reduced when FPS drops

  function init() {
    canvas = document.getElementById('visualizer-canvas');
    canvasCtx = canvas.getContext('2d');
    analyser = Player.getAnalyser();
  }

  function start() {
    active = true;
    resize();
    spectroImageData = null;
    particlesInited = false;
    beatHistory = [];
    beatFlash = 0;
    lastFrameTime = performance.now();
    fpsUpdateTime = lastFrameTime;
    frameCount = 0;
    fps = 60;
    qualityScale = 1;
    draw();
  }

  function stop() {
    active = false;
    if (animId) cancelAnimationFrame(animId);
    animId = null;
  }

  function resize() {
    canvas.width = canvas.clientWidth * devicePixelRatio;
    canvas.height = canvas.clientHeight * devicePixelRatio;
    canvasCtx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    spectroImageData = null;
  }

  // --- Theme helpers ---

  function getTheme() {
    if (customThemeColors) {
      return {
        name: 'Custom',
        colors: [customThemeColors.accent, customThemeColors.secondary,
                 customThemeColors.accent, customThemeColors.secondary, customThemeColors.accent],
        bg: '#000000',
      };
    }
    return THEMES[themeId] || THEMES.neon;
  }

  function setTheme(id) {
    themeId = id;
    customThemeColors = null;
    spectroImageData = null;
  }

  function setCustomTheme(accent, secondary) {
    customThemeColors = { accent, secondary };
    themeId = 'custom';
    spectroImageData = null;
  }

  function getThemeNames() {
    return Object.entries(THEMES).map(([id, t]) => ({ id, name: t.name }));
  }

  // --- Beat Detection ---

  function detectBeat(freqData) {
    // Focus on bass frequencies (bins 0-15) for kick detection
    let energy = 0;
    const bassEnd = Math.min(16, freqData.length);
    for (let i = 0; i < bassEnd; i++) {
      energy += freqData[i] * freqData[i];
    }
    energy = Math.sqrt(energy / bassEnd) / 255;

    beatHistory.push(energy);
    if (beatHistory.length > 30) beatHistory.shift();

    // Average energy over history
    const avg = beatHistory.reduce((a, b) => a + b, 0) / beatHistory.length;

    isBeat = energy > avg * beatThreshold && energy > 0.3;
    if (isBeat) {
      beatFlash = 1;
    }
    beatFlash *= 0.85; // decay flash
    beatEnergy = energy;
  }

  // --- FPS-aware rendering ---

  function updateFPS(now) {
    frameCount++;
    if (now - fpsUpdateTime >= 1000) {
      fps = frameCount;
      frameCount = 0;
      fpsUpdateTime = now;

      // Adjust quality based on FPS
      if (fps < 30) {
        qualityScale = Math.max(0.4, qualityScale - 0.15);
      } else if (fps < 45) {
        qualityScale = Math.max(0.6, qualityScale - 0.05);
      } else if (fps > 55 && qualityScale < 1) {
        qualityScale = Math.min(1, qualityScale + 0.1);
      }
    }
  }

  // --- Main draw loop ---

  function draw() {
    if (!active) return;
    animId = requestAnimationFrame(draw);

    const now = performance.now();
    updateFPS(now);
    lastFrameTime = now;

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    const theme = getTheme();

    // Get frequency data and run beat detection
    const freqData = getFrequencyData();
    const timeData = getTimeDomainData();
    detectBeat(freqData);

    // Spectrogram manages its own clearing
    if (MODES[modeIndex].id !== 'spectro') {
      canvasCtx.fillStyle = theme.bg;
      canvasCtx.fillRect(0, 0, w, h);

      // Beat flash overlay
      if (beatFlash > 0.05) {
        canvasCtx.fillStyle = `rgba(255, 255, 255, ${beatFlash * 0.08})`;
        canvasCtx.fillRect(0, 0, w, h);
      }
    }

    switch (MODES[modeIndex].id) {
      case 'bars':       drawBars(w, h, freqData, theme); break;
      case 'waveform':   drawWaveform(w, h, timeData, theme); break;
      case 'circular':   drawCircular(w, h, freqData, theme); break;
      case 'particles':  drawParticles(w, h, freqData, theme); break;
      case 'spectro':    drawSpectrogram(w, h, freqData, theme); break;
      case 'blob':       drawBlob(w, h, freqData, theme); break;
    }
  }

  function getFrequencyData() {
    if (!analyser) return new Uint8Array(1024);
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    return data;
  }

  function getTimeDomainData() {
    if (!analyser) return new Uint8Array(2048);
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    return data;
  }

  // --- Color utility ---

  function hexToRgb(hex) {
    if (!hex || typeof hex !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(hex)) {
      return { r: 255, g: 255, b: 255 };
    }
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return { r, g, b };
  }

  function lerpColor(hex1, hex2, t) {
    const c1 = hexToRgb(hex1);
    const c2 = hexToRgb(hex2);
    const r = Math.round(c1.r + (c2.r - c1.r) * t);
    const g = Math.round(c1.g + (c2.g - c1.g) * t);
    const b = Math.round(c1.b + (c2.b - c1.b) * t);
    return { r, g, b };
  }

  function themeColor(theme, t, alpha) {
    // t is 0-1, maps across theme colors
    const colors = theme.colors;
    const idx = t * (colors.length - 1);
    const i = Math.floor(idx);
    const frac = idx - i;
    const c = i >= colors.length - 1
      ? hexToRgb(colors[colors.length - 1])
      : lerpColor(colors[i], colors[i + 1], frac);
    if (alpha !== undefined) return `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
    return `rgb(${c.r}, ${c.g}, ${c.b})`;
  }

  // --- Renderers ---

  function drawBars(w, h, data, theme) {
    const barCount = Math.round(64 * qualityScale);
    const step = Math.floor(data.length / barCount);
    const gap = 2;
    const barWidth = w / barCount - gap;
    const beatScale = 1 + beatFlash * 0.15;

    for (let i = 0; i < barCount; i++) {
      const val = data[i * step] / 255;
      const barH = val * h * beatScale;
      const t = i / barCount;

      // Gradient per bar
      const grad = canvasCtx.createLinearGradient(0, h, 0, h - barH);
      grad.addColorStop(0, themeColor(theme, t, 0.9));
      grad.addColorStop(1, themeColor(theme, t, 0.3));
      canvasCtx.fillStyle = grad;

      // Rounded top
      const x = i * (barWidth + gap);
      const y = h - barH;
      const radius = Math.min(barWidth / 2, 4);
      canvasCtx.beginPath();
      canvasCtx.moveTo(x, h);
      canvasCtx.lineTo(x, y + radius);
      canvasCtx.quadraticCurveTo(x, y, x + radius, y);
      canvasCtx.lineTo(x + barWidth - radius, y);
      canvasCtx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
      canvasCtx.lineTo(x + barWidth, h);
      canvasCtx.fill();

      // Glow on beat
      if (isBeat && val > 0.5) {
        canvasCtx.shadowColor = themeColor(theme, t);
        canvasCtx.shadowBlur = 15;
        canvasCtx.fill();
        canvasCtx.shadowBlur = 0;
      }
    }
  }

  function drawWaveform(w, h, data, theme) {
    const mid = h / 2;
    const sliceW = w / data.length;
    const lineWidth = 2 + beatFlash * 2;

    // Glow line
    canvasCtx.lineWidth = lineWidth + 4;
    canvasCtx.strokeStyle = themeColor(theme, 0.5, 0.15);
    canvasCtx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] / 128.0 - 1);
      const y = mid + v * mid * 0.9;
      i === 0 ? canvasCtx.moveTo(0, y) : canvasCtx.lineTo(i * sliceW, y);
    }
    canvasCtx.stroke();

    // Main line
    canvasCtx.lineWidth = lineWidth;
    canvasCtx.strokeStyle = themeColor(theme, 0.3);
    canvasCtx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] / 128.0 - 1);
      const y = mid + v * mid * 0.9;
      i === 0 ? canvasCtx.moveTo(0, y) : canvasCtx.lineTo(i * sliceW, y);
    }
    canvasCtx.stroke();

    // Beat: fill area under waveform
    if (beatFlash > 0.1) {
      canvasCtx.lineTo(w, mid);
      canvasCtx.lineTo(0, mid);
      canvasCtx.closePath();
      canvasCtx.fillStyle = themeColor(theme, 0.3, beatFlash * 0.15);
      canvasCtx.fill();
    }

    // Mirror line (subtle)
    canvasCtx.lineWidth = 1;
    canvasCtx.strokeStyle = themeColor(theme, 0.7, 0.3);
    canvasCtx.beginPath();
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] / 128.0 - 1);
      const y = mid - v * mid * 0.4;
      i === 0 ? canvasCtx.moveTo(0, y) : canvasCtx.lineTo(i * sliceW, y);
    }
    canvasCtx.stroke();
  }

  function drawCircular(w, h, data, theme) {
    const cx = w / 2;
    const cy = h / 2;
    const baseRadius = Math.min(cx, cy) * 0.3;
    const radius = baseRadius + beatFlash * baseRadius * 0.1;
    const bars = Math.round(128 * qualityScale);
    const step = Math.floor(data.length / bars);

    // Inner ring glow
    canvasCtx.beginPath();
    canvasCtx.arc(cx, cy, radius, 0, Math.PI * 2);
    canvasCtx.strokeStyle = themeColor(theme, 0.5, 0.3 + beatFlash * 0.4);
    canvasCtx.lineWidth = 2 + beatFlash * 3;
    canvasCtx.stroke();

    // Bass pulse ring
    if (beatFlash > 0.1) {
      canvasCtx.beginPath();
      canvasCtx.arc(cx, cy, radius + beatFlash * 40, 0, Math.PI * 2);
      canvasCtx.strokeStyle = themeColor(theme, 0, beatFlash * 0.3);
      canvasCtx.lineWidth = 1;
      canvasCtx.stroke();
    }

    for (let i = 0; i < bars; i++) {
      const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
      const val = data[i * step] / 255;
      const len = val * radius * 1.2;
      const x1 = cx + Math.cos(angle) * radius;
      const y1 = cy + Math.sin(angle) * radius;
      const x2 = cx + Math.cos(angle) * (radius + len);
      const y2 = cy + Math.sin(angle) * (radius + len);
      const t = i / bars;

      canvasCtx.strokeStyle = themeColor(theme, t, 0.4 + val * 0.6);
      canvasCtx.lineWidth = 2 + val * 2;
      canvasCtx.beginPath();
      canvasCtx.moveTo(x1, y1);
      canvasCtx.lineTo(x2, y2);
      canvasCtx.stroke();
    }
  }

  function drawParticles(w, h, data, theme) {
    const bass = data.slice(0, 8).reduce((a, b) => a + b, 0) / (8 * 255);
    const treble = data.slice(data.length - 16).reduce((a, b) => a + b, 0) / (16 * 255);
    const targetCount = Math.round(80 * qualityScale);

    // Initialize particles
    if (!particlesInited || particles.length !== targetCount) {
      particles = [];
      for (let i = 0; i < targetCount; i++) {
        particles.push({
          x: Math.random() * w,
          y: Math.random() * h,
          vx: (Math.random() - 0.5) * 2,
          vy: (Math.random() - 0.5) * 2,
          size: 2 + Math.random() * 4,
          colorT: Math.random(),
        });
      }
      particlesInited = true;
    }

    // Beat impulse
    const impulse = isBeat ? 3 : 0;

    for (const p of particles) {
      // Physics
      p.vx += (Math.random() - 0.5) * 0.3 + impulse * (Math.random() - 0.5);
      p.vy += (Math.random() - 0.5) * 0.3 + impulse * (Math.random() - 0.5);
      p.vx *= 0.96;
      p.vy *= 0.96;
      p.x += p.vx * (1 + bass * 2);
      p.y += p.vy * (1 + bass * 2);

      // Wrap around
      if (p.x < 0) p.x += w;
      if (p.x > w) p.x -= w;
      if (p.y < 0) p.y += h;
      if (p.y > h) p.y -= h;

      const r = p.size * (1 + bass * 2);
      const alpha = 0.4 + bass * 0.5 + treble * 0.1;
      canvasCtx.fillStyle = themeColor(theme, p.colorT, Math.min(1, alpha));
      canvasCtx.beginPath();
      canvasCtx.arc(p.x, p.y, r, 0, Math.PI * 2);
      canvasCtx.fill();
    }

    // Draw lines between close particles
    const maxDist = 80 + bass * 60;
    canvasCtx.lineWidth = 0.5;
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = dx * dx + dy * dy;
        if (dist < maxDist * maxDist) {
          const alpha = (1 - Math.sqrt(dist) / maxDist) * 0.3;
          canvasCtx.strokeStyle = themeColor(theme, particles[i].colorT, alpha);
          canvasCtx.beginPath();
          canvasCtx.moveTo(particles[i].x, particles[i].y);
          canvasCtx.lineTo(particles[j].x, particles[j].y);
          canvasCtx.stroke();
        }
      }
    }
  }

  function drawSpectrogram(w, h, data, theme) {
    const pw = canvas.width;
    const ph = canvas.height;

    canvasCtx.save();
    canvasCtx.setTransform(1, 0, 0, 1, 0, 0);
    const shift = Math.max(2, Math.round(2 * devicePixelRatio));
    if (spectroImageData) {
      canvasCtx.putImageData(spectroImageData, -shift, 0);
    } else {
      // Fill with theme background on first frame
      const bg = hexToRgb(theme.bg);
      canvasCtx.fillStyle = `rgb(${bg.r}, ${bg.g}, ${bg.b})`;
      canvasCtx.fillRect(0, 0, pw, ph);
    }

    const binH = ph / data.length;
    for (let i = 0; i < data.length; i++) {
      const val = data[i] / 255;
      const color = themeColor(theme, val);
      canvasCtx.fillStyle = color;
      canvasCtx.fillRect(pw - shift, ph - (i + 1) * binH, shift, binH);
    }

    spectroImageData = canvasCtx.getImageData(0, 0, pw, ph);
    canvasCtx.restore();
  }

  function drawBlob(w, h, data, theme) {
    const bass = data.slice(0, 16).reduce((a, b) => a + b, 0) / (16 * 255);
    const treble = data.slice(data.length - 16).reduce((a, b) => a + b, 0) / (16 * 255);
    const mid = data.slice(32, 64).reduce((a, b) => a + b, 0) / (32 * 255);
    const cx = w / 2;
    const cy = h / 2;
    const baseR = Math.min(cx, cy) * 0.25;
    const r = baseR + bass * baseR * 0.8 + beatFlash * baseR * 0.2;
    const points = 16;
    const t = performance.now() * 0.002;

    // Outer glow
    const glowR = r * 1.6 + beatFlash * 30;
    const glowGrad = canvasCtx.createRadialGradient(cx, cy, r * 0.5, cx, cy, glowR);
    glowGrad.addColorStop(0, themeColor(theme, 0.3, 0.15));
    glowGrad.addColorStop(1, themeColor(theme, 0.3, 0));
    canvasCtx.fillStyle = glowGrad;
    canvasCtx.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2);

    // Main blob
    canvasCtx.beginPath();
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const wobble = Math.sin(t + i * 1.5) * treble * 35
                   + Math.cos(t * 0.7 + i * 2.1) * bass * 25
                   + Math.sin(t * 1.3 + i * 0.8) * mid * 15;
      const pr = r + wobble;
      const px = cx + Math.cos(angle) * pr;
      const py = cy + Math.sin(angle) * pr;

      if (i === 0) {
        canvasCtx.moveTo(px, py);
      } else {
        const prevAngle = ((i - 0.5) / points) * Math.PI * 2;
        const prevWobble = Math.sin(t + (i - 0.5) * 1.5) * treble * 35
                         + Math.cos(t * 0.7 + (i - 0.5) * 2.1) * bass * 25
                         + Math.sin(t * 1.3 + (i - 0.5) * 0.8) * mid * 15;
        const cpR = r + prevWobble;
        const cpx = cx + Math.cos(prevAngle) * cpR;
        const cpy = cy + Math.sin(prevAngle) * cpR;
        canvasCtx.quadraticCurveTo(cpx, cpy, px, py);
      }
    }
    canvasCtx.closePath();

    const grad = canvasCtx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.3);
    const c0 = hexToRgb(theme.colors[0]);
    const c1 = hexToRgb(theme.colors[1] || theme.colors[0]);
    grad.addColorStop(0, `rgba(${c0.r}, ${c0.g}, ${c0.b}, 0.9)`);
    grad.addColorStop(0.6, `rgba(${c1.r}, ${c1.g}, ${c1.b}, 0.5)`);
    grad.addColorStop(1, `rgba(${c1.r}, ${c1.g}, ${c1.b}, 0.05)`);
    canvasCtx.fillStyle = grad;
    canvasCtx.fill();

    // Inner highlight on beat
    if (beatFlash > 0.15) {
      canvasCtx.fillStyle = `rgba(255, 255, 255, ${beatFlash * 0.15})`;
      canvasCtx.fill();
    }
  }

  // --- Mode switching ---

  function nextMode() {
    modeIndex = (modeIndex + 1) % MODES.length;
    spectroImageData = null;
    particlesInited = false;
    beatHistory = [];
    return MODES[modeIndex];
  }

  function prevMode() {
    modeIndex = (modeIndex - 1 + MODES.length) % MODES.length;
    spectroImageData = null;
    particlesInited = false;
    beatHistory = [];
    return MODES[modeIndex];
  }

  function setMode(idx) {
    if (idx >= 0 && idx < MODES.length) {
      modeIndex = idx;
      spectroImageData = null;
      particlesInited = false;
      beatHistory = [];
    }
    return MODES[modeIndex];
  }

  function getCurrentMode() {
    return MODES[modeIndex];
  }

  function isActive() {
    return active;
  }

  return {
    MODES, THEMES, init, start, stop, resize, isActive,
    nextMode, prevMode, setMode, getCurrentMode,
    setTheme, setCustomTheme, getThemeNames, getTheme,
  };
})();
