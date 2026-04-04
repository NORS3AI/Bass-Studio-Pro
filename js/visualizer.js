/**
 * visualizer.js — Beat-synced Canvas visualizers
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

  let canvas = null;
  let canvasCtx = null;
  let analyser = null;
  let animId = null;
  let modeIndex = 0;
  let active = false;

  function init() {
    canvas = document.getElementById('visualizer-canvas');
    canvasCtx = canvas.getContext('2d');
    analyser = Player.getAnalyser();
  }

  function start() {
    active = true;
    resize();
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
    canvasCtx.scale(devicePixelRatio, devicePixelRatio);
  }

  function draw() {
    if (!active) return;
    animId = requestAnimationFrame(draw);

    const w = canvas.clientWidth;
    const h = canvas.clientHeight;
    canvasCtx.clearRect(0, 0, w, h);

    switch (MODES[modeIndex].id) {
      case 'bars':       drawBars(w, h); break;
      case 'waveform':   drawWaveform(w, h); break;
      case 'circular':   drawCircular(w, h); break;
      case 'particles':  drawParticles(w, h); break;
      case 'spectro':    drawSpectrogram(w, h); break;
      case 'blob':       drawBlob(w, h); break;
    }
  }

  function getFrequencyData() {
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(data);
    return data;
  }

  function getTimeDomainData() {
    const data = new Uint8Array(analyser.fftSize);
    analyser.getByteTimeDomainData(data);
    return data;
  }

  // --- Renderers ---

  function drawBars(w, h) {
    const data = getFrequencyData();
    const barCount = 64;
    const step = Math.floor(data.length / barCount);
    const barWidth = w / barCount - 2;

    for (let i = 0; i < barCount; i++) {
      const val = data[i * step] / 255;
      const barH = val * h;
      const hue = (i / barCount) * 260 + 180;
      canvasCtx.fillStyle = `hsl(${hue}, 80%, ${50 + val * 30}%)`;
      canvasCtx.fillRect(i * (barWidth + 2), h - barH, barWidth, barH);
    }
  }

  function drawWaveform(w, h) {
    const data = getTimeDomainData();
    canvasCtx.lineWidth = 2;
    canvasCtx.strokeStyle = '#6c5ce7';
    canvasCtx.beginPath();
    const sliceW = w / data.length;
    for (let i = 0; i < data.length; i++) {
      const v = data[i] / 128.0;
      const y = (v * h) / 2;
      i === 0 ? canvasCtx.moveTo(0, y) : canvasCtx.lineTo(i * sliceW, y);
    }
    canvasCtx.stroke();
  }

  function drawCircular(w, h) {
    const data = getFrequencyData();
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(cx, cy) * 0.4;
    const bars = 128;
    const step = Math.floor(data.length / bars);

    for (let i = 0; i < bars; i++) {
      const angle = (i / bars) * Math.PI * 2 - Math.PI / 2;
      const val = data[i * step] / 255;
      const len = val * radius;
      const x1 = cx + Math.cos(angle) * radius;
      const y1 = cy + Math.sin(angle) * radius;
      const x2 = cx + Math.cos(angle) * (radius + len);
      const y2 = cy + Math.sin(angle) * (radius + len);
      const hue = (i / bars) * 360;
      canvasCtx.strokeStyle = `hsl(${hue}, 70%, 60%)`;
      canvasCtx.lineWidth = 2;
      canvasCtx.beginPath();
      canvasCtx.moveTo(x1, y1);
      canvasCtx.lineTo(x2, y2);
      canvasCtx.stroke();
    }
  }

  function drawParticles(w, h) {
    // Simplified particle system — driven by bass energy
    const data = getFrequencyData();
    const bass = data.slice(0, 8).reduce((a, b) => a + b, 0) / (8 * 255);
    const count = 60;

    for (let i = 0; i < count; i++) {
      const t = performance.now() * 0.001 + i;
      const x = ((Math.sin(t * 0.7 + i) + 1) / 2) * w;
      const y = ((Math.cos(t * 0.5 + i * 1.3) + 1) / 2) * h;
      const r = 2 + bass * 16;
      const alpha = 0.3 + bass * 0.7;
      canvasCtx.fillStyle = `rgba(108, 92, 231, ${alpha})`;
      canvasCtx.beginPath();
      canvasCtx.arc(x, y, r, 0, Math.PI * 2);
      canvasCtx.fill();
    }
  }

  function drawSpectrogram(w, h) {
    // Placeholder — full implementation will scroll a heatmap
    const data = getFrequencyData();
    const barH = h / data.length;
    for (let i = 0; i < data.length; i++) {
      const val = data[i];
      canvasCtx.fillStyle = `rgb(${val}, ${val / 2}, ${255 - val})`;
      canvasCtx.fillRect(w - 2, h - i * barH, 2, barH);
    }
  }

  function drawBlob(w, h) {
    const data = getFrequencyData();
    const bass = data.slice(0, 16).reduce((a, b) => a + b, 0) / (16 * 255);
    const treble = data.slice(data.length - 16).reduce((a, b) => a + b, 0) / (16 * 255);
    const cx = w / 2;
    const cy = h / 2;
    const baseR = Math.min(cx, cy) * 0.3;
    const r = baseR + bass * baseR * 0.8;
    const points = 6;

    canvasCtx.beginPath();
    for (let i = 0; i <= points; i++) {
      const angle = (i / points) * Math.PI * 2;
      const wobble = Math.sin(performance.now() * 0.002 + i * 1.5) * treble * 30;
      const px = cx + Math.cos(angle) * (r + wobble);
      const py = cy + Math.sin(angle) * (r + wobble);
      i === 0 ? canvasCtx.moveTo(px, py) : canvasCtx.lineTo(px, py);
    }
    canvasCtx.closePath();
    const grad = canvasCtx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.2);
    grad.addColorStop(0, `rgba(108, 92, 231, 0.8)`);
    grad.addColorStop(1, `rgba(108, 92, 231, 0.1)`);
    canvasCtx.fillStyle = grad;
    canvasCtx.fill();
  }

  // --- Mode switching ---

  function nextMode() {
    modeIndex = (modeIndex + 1) % MODES.length;
    return MODES[modeIndex];
  }

  function prevMode() {
    modeIndex = (modeIndex - 1 + MODES.length) % MODES.length;
    return MODES[modeIndex];
  }

  function getCurrentMode() {
    return MODES[modeIndex];
  }

  return { MODES, init, start, stop, nextMode, prevMode, getCurrentMode, resize };
})();
