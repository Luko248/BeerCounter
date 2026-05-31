/* Beer Counter — living "beer in a glass" background.
   A full-screen canvas behind the UI: deep amber liquid, rising bubbles and a
   light caustic that slosh in response to the phone's gyroscope (DeviceOrientation).
   Falls back to a gentle idle sway on devices/desktops without a sensor. */
(() => {
  'use strict';

  const canvas = document.getElementById('beerCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: false });

  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

  let W = 0, H = 0, DPR = 1;
  let bubbles = [];

  // tilt: smoothed gravity vector in screen space, components roughly -1..1
  const tilt = { x: 0, y: 0 };       // current (eased)
  const target = { x: 0, y: 0 };     // from sensor
  let haveSensor = false;
  let lastSensor = 0;

  function resize() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.clientWidth;
    H = canvas.clientHeight;
    canvas.width = Math.round(W * DPR);
    canvas.height = Math.round(H * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    seedBubbles();
  }

  function seedBubbles() {
    const area = W * H;
    const count = reduceMotion ? 0 : Math.max(18, Math.min(70, Math.round(area / 16000)));
    bubbles = [];
    for (let i = 0; i < count; i++) bubbles.push(newBubble(true));
  }

  function newBubble(scatter) {
    const r = 1.2 + Math.pow(Math.random(), 1.6) * 7;
    return {
      x: Math.random() * W,
      y: scatter ? Math.random() * H : H + r + Math.random() * 30,
      r,
      speed: 8 + r * 4 + Math.random() * 16,   // px/s upward
      wob: Math.random() * Math.PI * 2,         // wobble phase
      wobSpeed: 0.6 + Math.random() * 1.4,
      drift: 0.4 + Math.random() * 0.8,         // how much tilt pushes it
      alpha: 0.10 + Math.random() * 0.22,
    };
  }

  // ---------- orientation ----------
  function onOrient(e) {
    // gamma: left-right tilt (-90..90), beta: front-back (-180..180)
    const g = (e.gamma || 0) / 45;   // normalise, ~±1 at 45°
    const b = ((e.beta || 0) - 25) / 45; // 25° = comfortable holding angle
    target.x = Math.max(-1.4, Math.min(1.4, g));
    target.y = Math.max(-1.4, Math.min(1.4, b));
    haveSensor = true;
    lastSensor = performance.now();
  }

  function attachSensor() {
    if (!window.DeviceOrientationEvent) return;
    window.addEventListener('deviceorientation', onOrient, true);
  }

  // iOS 13+ needs an explicit permission grant from a user gesture.
  if (typeof DeviceOrientationEvent !== 'undefined' &&
      typeof DeviceOrientationEvent.requestPermission === 'function') {
    const ask = () => {
      DeviceOrientationEvent.requestPermission()
        .then((state) => { if (state === 'granted') attachSensor(); })
        .catch(() => {});
      window.removeEventListener('pointerdown', ask);
    };
    window.addEventListener('pointerdown', ask, { once: true });
  } else {
    attachSensor();
  }

  // ---------- draw ----------
  let last = performance.now();

  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // gentle idle sway so the beer always breathes, even with no sensor
    const t = now / 1000;
    const idleX = reduceMotion ? 0 : Math.sin(t * 0.5) * 0.18 + Math.sin(t * 0.23) * 0.1;
    const idleY = reduceMotion ? 0 : Math.cos(t * 0.37) * 0.12;
    const sensorFresh = haveSensor && (now - lastSensor) < 1200;
    const tx = (sensorFresh ? target.x : 0) + idleX;
    const ty = (sensorFresh ? target.y : 0) + idleY;

    // ease toward target
    tilt.x += (tx - tilt.x) * Math.min(1, dt * 4);
    tilt.y += (ty - tilt.y) * Math.min(1, dt * 4);

    render(dt, t);
    raf = requestAnimationFrame(frame);
  }

  function render(dt, t) {
    // --- liquid base: deep amber gradient that shifts with tilt ---
    const gx = W * (0.5 + tilt.x * 0.14);
    const gy = H * (0.42 + tilt.y * 0.14);
    const base = ctx.createLinearGradient(0, 0, gx * 0.2, H);
    base.addColorStop(0, '#241606');
    base.addColorStop(0.55, '#1d1207');
    base.addColorStop(1, '#130b05');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, W, H);

    // --- caustic light blob (refraction), parallax-driven by tilt ---
    const lx = W * 0.5 - tilt.x * W * 0.32;
    const ly = H * 0.38 - tilt.y * H * 0.30;
    const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(W, H) * 0.75);
    glow.addColorStop(0, 'rgba(214, 150, 40, 0.30)');
    glow.addColorStop(0.4, 'rgba(178, 116, 28, 0.12)');
    glow.addColorStop(1, 'rgba(120, 70, 12, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    // a second warmer streak near the bottom (settled, richer beer)
    const warm = ctx.createLinearGradient(0, H, 0, H * 0.55);
    warm.addColorStop(0, 'rgba(150, 84, 16, 0.22)');
    warm.addColorStop(1, 'rgba(150, 84, 16, 0)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, W, H);

    // --- bubbles rising along the (tilted) up-direction ---
    if (!reduceMotion) {
      ctx.save();
      for (const bub of bubbles) {
        bub.wob += bub.wobSpeed * dt;
        // up direction leans opposite gravity → tilt pushes bubbles sideways
        bub.y -= bub.speed * dt;
        bub.x += (tilt.x * 26 * bub.drift + Math.sin(bub.wob) * 8) * dt;

        if (bub.y < -bub.r - 4 || bub.x < -20 || bub.x > W + 20) {
          Object.assign(bub, newBubble(false));
          continue;
        }
        drawBubble(bub);
      }
      ctx.restore();
    }

    // --- soft top fade + vignette for depth and text legibility ---
    const topFade = ctx.createLinearGradient(0, 0, 0, H * 0.3);
    topFade.addColorStop(0, 'rgba(8, 5, 2, 0.55)');
    topFade.addColorStop(1, 'rgba(8, 5, 2, 0)');
    ctx.fillStyle = topFade;
    ctx.fillRect(0, 0, W, H * 0.3);

    const vig = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, 'rgba(0,0,0,0.45)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  function drawBubble(b) {
    const g = ctx.createRadialGradient(b.x - b.r * 0.3, b.y - b.r * 0.3, 0, b.x, b.y, b.r);
    g.addColorStop(0, `rgba(255, 244, 214, ${b.alpha + 0.18})`);
    g.addColorStop(0.6, `rgba(255, 211, 121, ${b.alpha})`);
    g.addColorStop(1, 'rgba(255, 211, 121, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    // bright rim highlight
    ctx.strokeStyle = `rgba(255, 248, 224, ${b.alpha * 0.7})`;
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, Math.PI * 0.9, Math.PI * 1.7);
    ctx.stroke();
  }

  // ---------- lifecycle ----------
  let raf = 0;
  function start() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function stop() { cancelAnimationFrame(raf); raf = 0; }

  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start()));
  window.addEventListener('resize', resize);

  resize();
  start();
})();
