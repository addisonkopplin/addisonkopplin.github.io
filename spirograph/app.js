/* Spirograph Maker. Everything runs in the browser; nothing is sent over the network. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;

  // ---------- parameters ----------
  // m: mode (hypo, epi, liss); R, r, d: ring radius, wheel radius, pen distance;
  // a, b: Lissajous frequencies; ph: phase in degrees; q: height to width; k: damping in % per turn;
  // auto: stop when the curve closes; n: turns when not automatic; w: line weight; c: color.
  const DEFAULT = { m: 'hypo', R: 120, r: 47, d: 70, a: 3, b: 2, ph: 90, q: 1, k: 0, auto: 1, n: 20, w: 0.4, c: '#111111' };
  const PRESETS = [
    ['Rosette, 120 loops', { m: 'hypo', R: 120, r: 47, d: 70, auto: 1, w: 0.4 }],
    ['Star, 5 points', { m: 'hypo', R: 100, r: 60, d: 80, auto: 1, w: 0.8 }],
    ['Ellipse', { m: 'hypo', R: 100, r: 50, d: 25, auto: 1, w: 1 }],
    ['Flower, 7 petals', { m: 'epi', R: 70, r: 10, d: 30, auto: 1, w: 0.8 }],
    ['Ring of loops', { m: 'epi', R: 90, r: 33, d: 60, auto: 1, w: 0.5 }],
    ['Cardioid', { m: 'epi', R: 40, r: 40, d: 40, auto: 1, w: 1 }],
    ['Lissajous, 3 : 2', { m: 'liss', a: 3, b: 2, ph: 90, q: 1, k: 0, auto: 1, w: 1 }],
    ['Lissajous, 5 : 4', { m: 'liss', a: 5, b: 4, ph: 45, q: 1, k: 0, auto: 1, w: 0.8 }],
    ['Damped Lissajous, 3 : 4', { m: 'liss', a: 3, b: 4, ph: 90, q: 1, k: 1.5, auto: 0, n: 60, w: 0.4 }],
  ];
  const LIM = { R: [10, 150], r: [1, 150], d: [0, 150], a: [1, 15], b: [1, 15], ph: [0, 180], q: [0.25, 2], k: [0, 10], n: [1, 100], w: [0.2, 3] };
  const INT = { R: 1, r: 1, d: 1, a: 1, b: 1, n: 1 };
  const MODES = ['hypo', 'epi', 'liss'];
  const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
  const copy = (o) => JSON.parse(JSON.stringify(o));
  const gcd = (x, y) => { x = Math.abs(x); y = Math.abs(y); while (y) [x, y] = [y, x % y]; return x || 1; };
  const isColor = (s) => /^#[0-9a-f]{6}$/i.test(s);
  let P = copy(DEFAULT);

  const damped = () => P.m === 'liss' && P.k > 0;
  // Number of turns (multiples of 2π) after which the curve closes.
  function closeTurns() {
    if (P.m === 'liss') return 1 / gcd(P.a, P.b);
    return P.r / gcd(P.R, P.r);
  }
  const usesAuto = () => P.auto && !damped();
  const turns = () => (usesAuto() ? closeTurns() : P.n);

  // ---------- URL hash ----------
  const r4 = (v) => +(+v).toFixed(4);
  const KEYS = ['R', 'r', 'd', 'a', 'b', 'ph', 'q', 'k', 'n', 'w'];
  function toHash() {
    return '#m=' + P.m + KEYS.map((k) => '&' + k + '=' + r4(P[k])).join('') + '&auto=' + P.auto + '&c=' + P.c.slice(1).toLowerCase();
  }
  function fromHash(h) {
    const q = new URLSearchParams((h || '').replace(/^#/, ''));
    if (!MODES.includes(q.get('m'))) return null;
    const o = { m: q.get('m') };
    for (const k of KEYS) {
      const v = q.get(k) === null || q.get(k).trim() === '' ? NaN : Number(q.get(k));
      o[k] = isFinite(v) ? clamp(INT[k] ? Math.round(v) : v, LIM[k]) : DEFAULT[k];
    }
    o.auto = q.get('auto') === '0' ? 0 : 1;
    const c = '#' + (q.get('c') || '');
    o.c = isColor(c) ? c.toLowerCase() : DEFAULT.c;
    return o;
  }
  let hashTimer = 0;
  function saveHash() { clearTimeout(hashTimer); hashTimer = setTimeout(() => history.replaceState(null, '', toHash()), 150); }

  // ---------- curve ----------
  // Returns points scaled so the larger of |x| and |y| is 1, centered on 0, in one continuous run.
  function curve() {
    const T = turns() * TAU;
    let N, fn;
    if (P.m === 'liss') {
      const ph = P.ph * Math.PI / 180, s = 1 - P.k / 100;
      N = Math.round(turns() * 300 * Math.max(P.a, P.b));
      fn = (t) => { const e = s < 1 ? Math.pow(s, t / TAU) : 1; return [Math.sin(P.a * t + ph) * e, P.q * Math.sin(P.b * t) * e]; };
    } else {
      const sg = P.m === 'hypo' ? -1 : 1, A = P.R + sg * P.r, kk = A / P.r, d = P.d;
      N = Math.round(turns() * 360 * (1 + Math.abs(kk)));
      fn = sg < 0
        ? (t) => [A * Math.cos(t) + d * Math.cos(kk * t), A * Math.sin(t) - d * Math.sin(kk * t)]
        : (t) => [A * Math.cos(t) - d * Math.cos(kk * t), A * Math.sin(t) - d * Math.sin(kk * t)];
    }
    N = Math.min(250000, Math.max(600, N));
    const pts = new Float64Array(2 * (N + 1));
    let m = 1e-9;
    for (let i = 0; i <= N; i++) {
      const [x, y] = fn(T * i / N);
      pts[2 * i] = x; pts[2 * i + 1] = y;
      m = Math.max(m, Math.abs(x), Math.abs(y));
    }
    for (let i = 0; i < pts.length; i++) pts[i] /= m;
    if (usesAuto()) { pts[2 * N] = pts[0]; pts[2 * N + 1] = pts[1]; } // close exactly, removing rounding drift
    return pts;
  }

  // ---------- drawing ----------
  const out = $('out'), ctx = out.getContext('2d');
  let pts = curve(), anim = 0;
  function toPx(S) { return [S / 2, S * 0.46]; }
  function strokeRange(g, S, from, to, w) {
    const [c, s] = toPx(S);
    g.lineWidth = Math.max(0.5, w * S / 1000); g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = P.c;
    g.beginPath(); g.moveTo(c + pts[2 * from] * s, c - pts[2 * from + 1] * s);
    for (let k = from + 1; k <= to; k++) g.lineTo(c + pts[2 * k] * s, c - pts[2 * k + 1] * s);
    g.stroke();
  }
  function clear(g, S) { g.fillStyle = '#fff'; g.fillRect(0, 0, S, S); }
  const lastIdx = () => pts.length / 2 - 1;
  function drawAll() { cancelAnimationFrame(anim); clear(ctx, out.width); strokeRange(ctx, out.width, 0, lastIdx(), P.w); done(); }
  function done() { document.body.dataset.state = 'done'; $('status').textContent = fmtStatus(); }
  const plural = (v, one, many) => v + ' ' + (v === 1 ? one : many);
  function fmtStatus() {
    if (P.m === 'liss') {
      return 'Lissajous figure · frequencies ' + P.a + ' : ' + P.b + ' · phase ' + Math.round(P.ph) + '°' +
        (damped() ? ' · ' + plural(P.n, 'turn', 'turns') : '');
    }
    const name = P.m === 'hypo' ? 'Hypotrochoid' : 'Epitrochoid', g = gcd(P.R, P.r);
    let s = name + ' · R ' + P.R + ', r ' + P.r + ', d ' + P.d;
    if (P.m === 'hypo' && P.R === P.r) return s + ' · wheel and ring are the same size, so the pen does not move';
    s += ' · closes after ' + plural(P.r / g, 'turn', 'turns') + ', ' + plural(P.R / g, 'loop', 'loops');
    if (!P.auto) s += ' · drawing ' + plural(P.n, 'turn', 'turns');
    return s;
  }
  function animate() {
    cancelAnimationFrame(anim); document.body.dataset.state = 'drawing';
    const S = out.width, total = lastIdx(), dur = Math.min(3000, 600 + total / 20), t0 = performance.now(), [c, s] = toPx(S);
    let drawn = 0;
    clear(ctx, S);
    const frame = (now) => {
      const to = Math.min(total, Math.round(total * Math.min(1, (now - t0) / dur)));
      if (to > drawn) {
        clear(ctx, S); strokeRange(ctx, S, 0, to, P.w); drawn = to;
        ctx.fillStyle = '#1f3fbf'; ctx.beginPath(); ctx.arc(c + pts[2 * to] * s, c - pts[2 * to + 1] * s, Math.max(4, S / 160), 0, TAU); ctx.fill();
        $('status').textContent = 'Drawing: ' + Math.round(100 * to / total) + '%';
      }
      if (to < total) anim = requestAnimationFrame(frame);
      else { clear(ctx, S); strokeRange(ctx, S, 0, total, P.w); done(); }
    };
    anim = requestAnimationFrame(frame);
  }
  // Match the canvas bitmap to its displayed size times the device pixel ratio, so lines stay sharp.
  function fitCanvas() {
    const css = out.getBoundingClientRect().width || 600;
    const S = Math.round(Math.min(2400, Math.max(300, css * (window.devicePixelRatio || 1))));
    if (out.width !== S) { out.width = out.height = S; if (document.body.dataset.state !== 'drawing') drawAll(); }
  }

  // ---------- controls ----------
  const FMT = {
    R: (v) => v, r: (v) => v, d: (v) => v, a: (v) => v, b: (v) => v,
    ph: (v) => Math.round(v) + '°', q: (v) => (+v).toFixed(2), k: (v) => (+v).toFixed(1) + '% per turn',
    n: (v) => v, w: (v) => (+v).toFixed(1),
  };
  function syncUI() {
    $('mode').value = P.m;
    for (const k of KEYS) { $(k).value = P[k]; $(k + '-o').textContent = FMT[k](P[k]); }
    $('spiro-fields').hidden = P.m === 'liss'; $('liss-fields').hidden = P.m !== 'liss';
    const fixed = usesAuto();
    $('auto').checked = !!P.auto; $('auto').disabled = damped();
    $('n').disabled = fixed; $('n-field').classList.toggle('off', fixed);
    if (fixed) $('n-o').textContent = +turns().toFixed(3) + ', set by the curve';
    $('n-hint').textContent = P.m === 'liss' ? 'One turn is one full cycle of a wave with frequency 1.' : 'One turn is one trip of the wheel around the ring.';
    $('c').value = P.c; $('c-o').textContent = P.c.toUpperCase();
  }
  function changed(animated) { pts = curve(); syncUI(); saveHash(); animated ? animate() : drawAll(); }

  for (const k of KEYS) $(k).addEventListener('input', (e) => { P[k] = +e.target.value; $('preset').value = ''; changed(false); });
  $('mode').addEventListener('change', (e) => { P.m = e.target.value; $('preset').value = ''; changed(true); });
  $('auto').addEventListener('change', (e) => { P.auto = e.target.checked ? 1 : 0; if (!P.auto) P.n = Math.max(1, Math.min(100, Math.ceil(closeTurns()))); changed(false); });
  $('c').addEventListener('input', (e) => { if (isColor(e.target.value)) { P.c = e.target.value.toLowerCase(); changed(false); } });
  $('c-ink').addEventListener('click', () => { P.c = '#111111'; changed(false); });
  $('c-acc').addEventListener('click', () => { P.c = '#1f3fbf'; changed(false); });

  const sel = $('preset');
  PRESETS.forEach(([name], i) => { const o = document.createElement('option'); o.value = i; o.textContent = name; sel.appendChild(o); });
  sel.addEventListener('change', () => { if (sel.value === '') return; P = Object.assign(copy(DEFAULT), PRESETS[+sel.value][1], { c: P.c }); changed(true); });

  // Randomize: whole-number radii chosen so the curve closes within a reasonable number of turns.
  function randomize() {
    const rnd = Math.random, int = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1)), pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const m = pick(['hypo', 'hypo', 'epi', 'liss']), next = Object.assign(copy(P), { m, auto: 1 });
    if (m === 'liss') {
      let a, b; do { a = int(1, 9); b = int(1, 9); } while (a === b || gcd(a, b) !== 1);
      Object.assign(next, { a, b, ph: 15 * int(0, 12), q: pick([1, 1, 0.75, 1.25]), k: 0, w: 0.8 });
    } else {
      let R, r; do { R = int(30, 150); r = int(5, m === 'hypo' ? R - 3 : 120); } while (r / gcd(R, r) > 40 || R / gcd(R, r) < 3);
      Object.assign(next, { R, r, d: int(Math.round(r * 0.3), Math.min(150, Math.round(r * 1.4))), w: r / gcd(R, r) > 15 ? 0.4 : 0.7 });
    }
    P = next; sel.value = ''; changed(true);
  }
  $('random').addEventListener('click', randomize);
  $('play').addEventListener('click', animate);

  // ---------- export ----------
  // One <path> with a single move-to and straight segments: one continuous stroke for a pen plotter.
  function svgString(sizeMM) {
    const c = 500, s = 460, w = (P.w).toFixed(2), n = pts.length / 2;
    const parts = [];
    let lx = Infinity, ly = Infinity;
    for (let k = 0; k < n; k++) {
      const x = c + pts[2 * k] * s, y = c - pts[2 * k + 1] * s;
      // skip points closer than 0.4 units (0.08 mm at 200 mm) to the last one kept; always keep the last point
      if (k === n - 1 || (x - lx) * (x - lx) + (y - ly) * (y - ly) >= 0.16) { parts.push(x.toFixed(1) + ' ' + y.toFixed(1)); lx = x; ly = y; }
    }
    const d = 'M' + parts[0] + 'L' + parts.slice(1).join(' ');
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + sizeMM + 'mm" height="' + sizeMM + 'mm" viewBox="0 0 1000 1000">' +
      '<path d="' + d + '" fill="none" stroke="' + P.c + '" stroke-width="' + w + '" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }
  const fileBase = () => (P.m === 'liss' ? 'lissajous' : P.m === 'hypo' ? 'hypotrochoid' : 'epitrochoid');
  function save(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  $('dl-svg').addEventListener('click', () => save(new Blob([svgString(200)], { type: 'image/svg+xml' }), fileBase() + '.svg'));
  $('dl-png').addEventListener('click', () => {
    const S = 2400, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d'); clear(g, S); strokeRange(g, S, 0, lastIdx(), P.w);
    cv.toBlob((b) => save(b, fileBase() + '.png'), 'image/png');
  });
  $('copy').addEventListener('click', async () => {
    history.replaceState(null, '', toHash());
    try { await navigator.clipboard.writeText(location.href); $('status').textContent = 'Link copied. It reopens this drawing.'; }
    catch (e) { $('status').textContent = 'Copy this page address to share the drawing.'; }
  });
  function buildPrint() { $('printout').innerHTML = svgString(170) + '<p>' + fmtStatus() + '</p>'; }
  window.addEventListener('beforeprint', buildPrint);
  $('print').addEventListener('click', () => { buildPrint(); window.print(); });
  window.addEventListener('hashchange', () => { const h = fromHash(location.hash); if (h) { P = h; changed(false); } });

  // ---------- start ----------
  const h = fromHash(location.hash);
  if (h) P = h; else history.replaceState(null, '', toHash());
  if ('ResizeObserver' in window) new ResizeObserver(fitCanvas).observe(out); else window.addEventListener('resize', fitCanvas);
  pts = curve(); syncUI(); fitCanvas(); animate();
  window.__spirograph = { get params() { return copy(P); }, toHash, svgString };
})();
