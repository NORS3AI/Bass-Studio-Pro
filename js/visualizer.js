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
    { id: 'blob',       name: 'Liquid Blob' },
    { id: 'aurora',     name: 'Aurora Ribbons' },
    { id: 'nebula',     name: 'Nebula' },
    { id: 'tunnel',     name: 'Warp Tunnel' },
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

    // These modes manage their own trails/clearing
    const selfClearing = ['spectro', 'nebula', 'tunnel', 'aurora'];
    if (!selfClearing.includes(MODES[modeIndex].id)) {
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
      case 'aurora':     drawAurora(w, h, freqData, theme); break;
      case 'nebula':     drawNebula(w, h, freqData, theme); break;
      case 'tunnel':     drawTunnel(w, h, freqData, theme); break;
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
    const bass   = data.slice(0, 16).reduce((a, b) => a + b, 0) / (16 * 255);
    const lowMid = data.slice(16, 48).reduce((a, b) => a + b, 0) / (32 * 255);
    const mid    = data.slice(48, 128).reduce((a, b) => a + b, 0) / (80 * 255);
    const treble = data.slice(data.length - 32).reduce((a, b) => a + b, 0) / (32 * 255);
    const cx = w / 2, cy = h / 2;
    const baseR = Math.min(cx, cy) * 0.3;
    const t = performance.now() * 0.0012;
    const colors = theme.colors;

    // Soft atmospheric glow (outer)
    const glowR = baseR * 2.4 + beatFlash * 60;
    const glowGrad = canvasCtx.createRadialGradient(cx, cy, baseR * 0.3, cx, cy, glowR);
    const cGlow = hexToRgb(colors[2] || colors[0]);
    glowGrad.addColorStop(0.0, `rgba(${cGlow.r}, ${cGlow.g}, ${cGlow.b}, ${0.18 + beatFlash * 0.2})`);
    glowGrad.addColorStop(0.5, `rgba(${cGlow.r}, ${cGlow.g}, ${cGlow.b}, 0.06)`);
    glowGrad.addColorStop(1.0, `rgba(${cGlow.r}, ${cGlow.g}, ${cGlow.b}, 0)`);
    canvasCtx.fillStyle = glowGrad;
    canvasCtx.fillRect(cx - glowR, cy - glowR, glowR * 2, glowR * 2);

    // Draw four nested liquid-metal layers, each with its own phase & color
    const layers = [
      { pts: 72, rScale: 1.30, wobble: 0.30, speed: 0.7, phase: 0.0, alpha: 0.22, ci: 3 },
      { pts: 72, rScale: 1.10, wobble: 0.45, speed: 1.0, phase: 1.7, alpha: 0.40, ci: 2 },
      { pts: 72, rScale: 0.90, wobble: 0.55, speed: 1.3, phase: 3.1, alpha: 0.75, ci: 1 },
      { pts: 72, rScale: 0.62, wobble: 0.70, speed: 1.8, phase: 4.4, alpha: 1.0,  ci: 0 },
    ];

    canvasCtx.globalCompositeOperation = 'lighter';
    for (const L of layers) {
      const r = baseR * L.rScale + bass * baseR * 0.55 * L.rScale + beatFlash * baseR * 0.18;
      const wAmp = baseR * L.wobble;
      const tt = t * L.speed + L.phase;
      const pts = L.pts;

      canvasCtx.beginPath();
      for (let i = 0; i <= pts; i++) {
        const a = (i / pts) * Math.PI * 2;
        // Multi-octave noise — organic, non-repeating wobble
        const wob =
            Math.sin(tt + a * 3) * treble * wAmp * 0.7
          + Math.cos(tt * 0.8 + a * 5) * mid * wAmp * 0.5
          + Math.sin(tt * 0.5 + a * 2) * lowMid * wAmp * 0.9
          + Math.cos(tt * 1.7 + a * 7) * treble * wAmp * 0.25;
        const pr = r + wob;
        const px = cx + Math.cos(a) * pr;
        const py = cy + Math.sin(a) * pr;
        if (i === 0) canvasCtx.moveTo(px, py);
        else {
          const a2 = ((i - 0.5) / pts) * Math.PI * 2;
          const wob2 =
              Math.sin(tt + a2 * 3) * treble * wAmp * 0.7
            + Math.cos(tt * 0.8 + a2 * 5) * mid * wAmp * 0.5
            + Math.sin(tt * 0.5 + a2 * 2) * lowMid * wAmp * 0.9
            + Math.cos(tt * 1.7 + a2 * 7) * treble * wAmp * 0.25;
          const pr2 = r + wob2;
          canvasCtx.quadraticCurveTo(cx + Math.cos(a2) * pr2, cy + Math.sin(a2) * pr2, px, py);
        }
      }
      canvasCtx.closePath();

      // Iridescent gradient that shifts with phase
      const c0 = hexToRgb(colors[L.ci % colors.length]);
      const c1 = hexToRgb(colors[(L.ci + 1) % colors.length]);
      const c2 = hexToRgb(colors[(L.ci + 2) % colors.length]);
      const offX = Math.cos(tt * 0.6) * r * 0.35;
      const offY = Math.sin(tt * 0.6) * r * 0.35;
      const grad = canvasCtx.createRadialGradient(cx + offX, cy + offY, r * 0.05, cx, cy, r * 1.25);
      grad.addColorStop(0.0, `rgba(${c0.r}, ${c0.g}, ${c0.b}, ${L.alpha})`);
      grad.addColorStop(0.5, `rgba(${c1.r}, ${c1.g}, ${c1.b}, ${L.alpha * 0.7})`);
      grad.addColorStop(1.0, `rgba(${c2.r}, ${c2.g}, ${c2.b}, ${L.alpha * 0.0})`);
      canvasCtx.fillStyle = grad;
      canvasCtx.fill();
    }
    canvasCtx.globalCompositeOperation = 'source-over';

    // Specular highlight on beat
    if (beatFlash > 0.1) {
      const hi = canvasCtx.createRadialGradient(
        cx - baseR * 0.25, cy - baseR * 0.3, 0,
        cx - baseR * 0.25, cy - baseR * 0.3, baseR * 0.9
      );
      hi.addColorStop(0, `rgba(255, 255, 255, ${beatFlash * 0.35})`);
      hi.addColorStop(1, 'rgba(255, 255, 255, 0)');
      canvasCtx.fillStyle = hi;
      canvasCtx.beginPath();
      canvasCtx.arc(cx, cy, baseR * 1.2, 0, Math.PI * 2);
      canvasCtx.fill();
    }
  }

  function drawAurora(w, h, data, theme) {
    // Flowing ribbons of color sweeping across the canvas
    const bass   = data.slice(0, 24).reduce((a, b) => a + b, 0) / (24 * 255);
    const mid    = data.slice(48, 128).reduce((a, b) => a + b, 0) / (80 * 255);
    const treble = data.slice(data.length - 48).reduce((a, b) => a + b, 0) / (48 * 255);
    const t = performance.now() * 0.0006;
    const colors = theme.colors;

    // Subtle backdrop wash
    const bg = canvasCtx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, 'rgba(0, 0, 0, 0.25)');
    bg.addColorStop(1, 'rgba(0, 0, 0, 0.5)');
    canvasCtx.fillStyle = bg;
    canvasCtx.fillRect(0, 0, w, h);

    canvasCtx.globalCompositeOperation = 'lighter';
    const ribbons = 6;
    for (let r = 0; r < ribbons; r++) {
      const phase = r * 0.7 + t * (0.5 + r * 0.15);
      const ampBase = h * 0.18 + bass * h * 0.15;
      const thickness = 40 + mid * 120 + beatFlash * 30;
      const yCenter = h * (0.2 + 0.12 * r) + Math.sin(t * 0.9 + r) * h * 0.05;
      const colA = hexToRgb(colors[r % colors.length]);
      const colB = hexToRgb(colors[(r + 1) % colors.length]);

      canvasCtx.beginPath();
      const steps = 80;
      for (let i = 0; i <= steps; i++) {
        const x = (i / steps) * w;
        const u = i / steps;
        const y = yCenter
          + Math.sin(u * 6 + phase) * ampBase
          + Math.cos(u * 11 + phase * 1.4) * ampBase * 0.4 * (0.4 + treble)
          + Math.sin(u * 3 + phase * 0.5) * ampBase * 0.6;
        if (i === 0) canvasCtx.moveTo(x, y);
        else canvasCtx.lineTo(x, y);
      }
      // Vertical gradient over the ribbon band
      const g = canvasCtx.createLinearGradient(0, yCenter - thickness, 0, yCenter + thickness);
      g.addColorStop(0.0, `rgba(${colA.r}, ${colA.g}, ${colA.b}, 0)`);
      g.addColorStop(0.5, `rgba(${colB.r}, ${colB.g}, ${colB.b}, ${0.55 + beatFlash * 0.2})`);
      g.addColorStop(1.0, `rgba(${colA.r}, ${colA.g}, ${colA.b}, 0)`);
      canvasCtx.strokeStyle = g;
      canvasCtx.lineWidth = thickness;
      canvasCtx.lineCap = 'round';
      canvasCtx.lineJoin = 'round';
      canvasCtx.shadowBlur = 20 + treble * 40;
      canvasCtx.shadowColor = `rgba(${colB.r}, ${colB.g}, ${colB.b}, 0.6)`;
      canvasCtx.stroke();
    }
    canvasCtx.shadowBlur = 0;
    canvasCtx.globalCompositeOperation = 'source-over';
  }

  function drawNebula(w, h, data, theme) {
    // Cosmic clouds: many radial blobs, slow drift, color-shifted
    const bass = data.slice(0, 20).reduce((a, b) => a + b, 0) / (20 * 255);
    const mid  = data.slice(40, 120).reduce((a, b) => a + b, 0) / (80 * 255);
    const treble = data.slice(data.length - 40).reduce((a, b) => a + b, 0) / (40 * 255);
    const t = performance.now() * 0.0004;
    const colors = theme.colors;

    // Slow fade overlay for trails
    canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    canvasCtx.fillRect(0, 0, w, h);

    canvasCtx.globalCompositeOperation = 'lighter';
    const clouds = 14;
    const diag = Math.hypot(w, h);
    for (let i = 0; i < clouds; i++) {
      const phase = i * 1.37 + t;
      const cx = w * 0.5 + Math.cos(phase * 0.6) * w * 0.35 + Math.sin(phase * 0.3) * w * 0.1;
      const cy = h * 0.5 + Math.sin(phase * 0.7) * h * 0.35 + Math.cos(phase * 0.4) * h * 0.1;
      const sizeEnergy = (i % 3 === 0) ? bass : (i % 3 === 1) ? mid : treble;
      const radius = (diag * 0.06) + sizeEnergy * diag * 0.14 + beatFlash * 30;
      const c = hexToRgb(colors[i % colors.length]);
      const g = canvasCtx.createRadialGradient(cx, cy, 0, cx, cy, radius);
      g.addColorStop(0.0, `rgba(${c.r}, ${c.g}, ${c.b}, ${0.35 + beatFlash * 0.15})`);
      g.addColorStop(0.4, `rgba(${c.r}, ${c.g}, ${c.b}, 0.12)`);
      g.addColorStop(1.0, `rgba(${c.r}, ${c.g}, ${c.b}, 0)`);
      canvasCtx.fillStyle = g;
      canvasCtx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
    }

    // Starfield twinkle on treble peaks
    const stars = Math.floor(20 + treble * 80);
    canvasCtx.fillStyle = 'rgba(255, 255, 255, 0.7)';
    for (let s = 0; s < stars; s++) {
      const sx = ((s * 9301 + 49297) % 233280) / 233280 * w;
      const sy = ((s * 54321 + 91283) % 233280) / 233280 * h;
      const size = 0.5 + (s % 3) * 0.4 + treble * 1.5;
      canvasCtx.globalAlpha = 0.3 + treble * 0.6;
      canvasCtx.fillRect(sx, sy, size, size);
    }
    canvasCtx.globalAlpha = 1;
    canvasCtx.globalCompositeOperation = 'source-over';
  }

  function drawTunnel(w, h, data, theme) {
    // Concentric rings warping outward, bass-pulsed
    const bass = data.slice(0, 20).reduce((a, b) => a + b, 0) / (20 * 255);
    const mid  = data.slice(40, 120).reduce((a, b) => a + b, 0) / (80 * 255);
    const treble = data.slice(data.length - 40).reduce((a, b) => a + b, 0) / (40 * 255);
    const cx = w / 2, cy = h / 2;
    const t = performance.now() * 0.001;
    const colors = theme.colors;
    const maxR = Math.hypot(cx, cy);

    // Trails
    canvasCtx.fillStyle = 'rgba(0, 0, 0, 0.18)';
    canvasCtx.fillRect(0, 0, w, h);

    canvasCtx.globalCompositeOperation = 'lighter';
    const rings = 18;
    for (let i = 0; i < rings; i++) {
      // Rings move outward over time, with phase offset
      const phase = ((i / rings) + t * (0.35 + bass * 0.6)) % 1;
      const r = phase * maxR * (1.1 + bass * 0.3);
      if (r < 10) continue;
      const alpha = (1 - phase) * 0.55;
      const wobble = Math.sin(t * 2 + i) * (8 + treble * 30);
      const c = hexToRgb(colors[i % colors.length]);

      canvasCtx.beginPath();
      const segs = 64;
      for (let s = 0; s <= segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const rr = r + Math.sin(a * 6 + t * 3 + i) * wobble + Math.cos(a * 3 + t * 2) * mid * 20;
        const px = cx + Math.cos(a) * rr;
        const py = cy + Math.sin(a) * rr;
        if (s === 0) canvasCtx.moveTo(px, py);
        else canvasCtx.lineTo(px, py);
      }
      canvasCtx.closePath();
      canvasCtx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${alpha})`;
      canvasCtx.lineWidth = 2 + bass * 4 + beatFlash * 3;
      canvasCtx.shadowBlur = 15 + treble * 25;
      canvasCtx.shadowColor = `rgba(${c.r}, ${c.g}, ${c.b}, 0.8)`;
      canvasCtx.stroke();
    }
    canvasCtx.shadowBlur = 0;
    canvasCtx.globalCompositeOperation = 'source-over';
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
