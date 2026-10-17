/* Harmonograph Maker. Everything runs in the browser; nothing is sent over the network. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const TAU = Math.PI * 2;

  // ---------- parameters ----------
  const DEFAULT = { n: 2, snap: 1, det: 0.004, f: [2, 3, 1], p: [0, 90, 0], a: [1, 1, 0.5], d: [0.008, 0.008, 0.006], T: 240, w: 0.4 };
  const PRESETS = [
    ['Slow spiral, 1 : 1', { n: 2, snap: 1, det: 0.006, f: [1, 1, 1], p: [0, 90, 0], a: [1, 1, 0.5], d: [0.006, 0.006, 0.006], T: 360, w: 0.5 }],
    ['Bands, 2 : 3', { n: 2, snap: 1, det: 0.004, f: [2, 3, 1], p: [0, 90, 0], a: [1, 1, 0.5], d: [0.008, 0.008, 0.006], T: 240, w: 0.4 }],
    ['Figure eight, 1 : 2', { n: 2, snap: 1, det: 0.003, f: [1, 2, 1], p: [90, 0, 0], a: [1, 0.9, 0.5], d: [0.005, 0.007, 0.006], T: 300, w: 0.5 }],
    ['Table rose, 3 : 3 : 1', { n: 3, snap: 1, det: 0.005, f: [3, 3, 1], p: [0, 90, 45], a: [1, 1, 0.55], d: [0.006, 0.006, 0.004], T: 300, w: 0.4 }],
    ['Table loops, 2 : 2 : 3', { n: 3, snap: 1, det: 0.004, f: [2, 2, 3], p: [0, 90, 0], a: [0.9, 0.9, 0.45], d: [0.005, 0.005, 0.007], T: 320, w: 0.4 }],
    ['Free frequencies', { n: 3, snap: 0, det: 0, f: [2.013, 3.007, 1.004], p: [30, 120, 300], a: [1, 0.85, 0.4], d: [0.007, 0.006, 0.005], T: 280, w: 0.5 }],
  ];
  const LIM = { f: [0.5, 8], p: [0, 360], a: [0, 1], d: [0, 0.05], T: [10, 600], w: [0.2, 3], det: [0, 0.03] };
  const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v));
  const copy = (o) => JSON.parse(JSON.stringify(o));
  let P = copy(DEFAULT);

  function effFreq(i) {
    if (!P.snap) return P.f[i];
    const base = Math.max(1, Math.round(P.f[i]));
    return base + (i === 1 ? P.det : i === 2 ? -P.det : 0);
  }

  // ---------- URL hash ----------
  const r4 = (v) => +(+v).toFixed(4);
  function toHash() {
    return '#n=' + P.n + '&s=' + P.snap + '&e=' + r4(P.det) + '&f=' + P.f.map(r4).join(',') + '&p=' + P.p.map(r4).join(',') +
      '&a=' + P.a.map(r4).join(',') + '&d=' + P.d.map(r4).join(',') + '&T=' + r4(P.T) + '&w=' + r4(P.w);
  }
  function fromHash(h) {
    const q = new URLSearchParams((h || '').replace(/^#/, ''));
    if (!q.has('f')) return null;
    const arr = (k, lim, def) => { if (!q.get(k)) return def.slice(); const v = q.get(k).split(',').map((x) => (x.trim() === '' ? NaN : Number(x))); return [0, 1, 2].map((i) => (isFinite(v[i]) ? clamp(v[i], lim) : def[i])); };
    const num = (k, lim, def) => { const v = Number(q.get(k)); return q.has(k) && isFinite(v) ? clamp(v, lim) : def; };
    return { n: q.get('n') === '3' ? 3 : 2, snap: q.get('s') === '0' ? 0 : 1, det: num('e', LIM.det, DEFAULT.det),
      f: arr('f', LIM.f, DEFAULT.f), p: arr('p', LIM.p, DEFAULT.p), a: arr('a', LIM.a, DEFAULT.a), d: arr('d', LIM.d, DEFAULT.d),
      T: num('T', LIM.T, DEFAULT.T), w: num('w', LIM.w, DEFAULT.w) };
  }
  let hashTimer = 0;
  function saveHash() { clearTimeout(hashTimer); hashTimer = setTimeout(() => history.replaceState(null, '', toHash()), 150); }

  // ---------- curve ----------
  function curve() {
    const n = P.n, f = [0, 1, 2].map(effFreq), ph = P.p.map((v) => v * Math.PI / 180), a = P.a, d = P.d;
    const fmax = Math.max(f[0], f[1], n === 3 ? f[2] : 0);
    const N = Math.min(160000, Math.max(3000, Math.round(P.T * fmax * 90)));
    const pts = new Float32Array(2 * (N + 1));
    for (let k = 0; k <= N; k++) {
      const t = P.T * k / N;
      let x = a[0] * Math.sin(TAU * f[0] * t + ph[0]) * Math.exp(-d[0] * t);
      let y = a[1] * Math.sin(TAU * f[1] * t + ph[1]) * Math.exp(-d[1] * t);
      if (n === 3) {
        const e = a[2] * Math.exp(-d[2] * t), g = TAU * f[2] * t + ph[2];
        x += e * Math.sin(g); y += e * Math.cos(g);
      }
      pts[2 * k] = x; pts[2 * k + 1] = y;
    }
    // scale to fit a unit square centred on 0, keeping proportions
    let m = 1e-9;
    for (let i = 0; i < pts.length; i++) m = Math.max(m, Math.abs(pts[i]));
    for (let i = 0; i < pts.length; i++) pts[i] /= m;
    return pts;
  }

  // ---------- drawing ----------
  const out = $('out'), ctx = out.getContext('2d');
  let pts = curve(), anim = 0;
  function toPx(R) { const c = R / 2, s = R * 0.46; return [c, s]; }
  function strokeRange(g, R, from, to, w) {
    const [c, s] = toPx(R);
    g.lineWidth = w * R / 1000; g.lineJoin = 'round'; g.lineCap = 'round'; g.strokeStyle = '#111';
    g.beginPath(); g.moveTo(c + pts[2 * from] * s, c - pts[2 * from + 1] * s);
    for (let k = from + 1; k <= to; k++) g.lineTo(c + pts[2 * k] * s, c - pts[2 * k + 1] * s);
    g.stroke();
  }
  function clear(g, R) { g.fillStyle = '#fff'; g.fillRect(0, 0, R, R); }
  function drawAll() { cancelAnimationFrame(anim); clear(ctx, out.width); strokeRange(ctx, out.width, 0, pts.length / 2 - 1, P.w); done(); }
  function done() { document.body.dataset.state = 'done'; $('status').textContent = fmtStatus(); }
  function fmtStatus() {
    const f = [0, 1, 2].slice(0, P.n).map((i) => +effFreq(i).toFixed(4));
    return (P.n === 3 ? 'Three' : 'Two') + ' pendulums · frequencies ' + f.join(' : ') + ' · ' + P.T + ' s';
  }
  function animate() {
    cancelAnimationFrame(anim); document.body.dataset.state = 'drawing';
    const R = out.width, total = pts.length / 2 - 1, dur = 3000, t0 = performance.now(), [c, s] = toPx(R);
    let drawn = 0;
    clear(ctx, R);
    const frame = (now) => {
      const to = Math.min(total, Math.round(total * Math.min(1, (now - t0) / dur)));
      if (to > drawn) {
        // redraw the whole path drawn so far each frame so line joins stay clean; the pen marker sits on top
        clear(ctx, R); strokeRange(ctx, R, 0, to, P.w); drawn = to;
        ctx.fillStyle = '#1f3fbf'; ctx.beginPath(); ctx.arc(c + pts[2 * to] * s, c - pts[2 * to + 1] * s, Math.max(4, R / 160), 0, TAU); ctx.fill();
        $('status').textContent = 'Drawing: ' + Math.round(100 * to / total) + '%';
      }
      if (to < total) anim = requestAnimationFrame(frame);
      else { clear(ctx, R); strokeRange(ctx, R, 0, total, P.w); done(); }
    };
    anim = requestAnimationFrame(frame);
  }

  // ---------- controls ----------
  const NAMES = ['Pendulum 1', 'Pendulum 2', 'Pendulum 3'];
  const ROLES = ['Moves the pen left and right.', 'Moves the pen forward and back.', 'Swings the paper table in a circle.'];
  $('pends').innerHTML = [0, 1, 2].map((i) => '<fieldset id="pend-' + i + '"><legend>' + NAMES[i] + '</legend><p class="sub">' + ROLES[i] + '</p>' +
    ['f', 'p', 'a', 'd'].map((k) => {
      const lab = { f: 'Frequency', p: 'Phase', a: 'Amplitude', d: 'Damping' }[k];
      const st = { f: 0.001, p: 1, a: 0.01, d: 0.0005 }[k];
      return '<div class="field"><label for="' + k + i + '">' + lab + ' <output id="' + k + i + '-o"></output></label>' +
        '<input id="' + k + i + '" data-k="' + k + '" data-i="' + i + '" type="range" min="' + LIM[k][0] + '" max="' + LIM[k][1] + '" step="' + st + '"></div>';
    }).join('') + '</fieldset>').join('');

  { const chk = document.querySelector('#table').closest('.check'), fs = $('pend-2'); fs.insertBefore(chk, fs.querySelector('.field')); }
  const FMT = {
    f: (v, i) => P.snap ? Math.max(1, Math.round(v)) + (i === 1 && P.det ? ' + ' + (+P.det.toFixed(4)) : i === 2 && P.det ? ' − ' + (+P.det.toFixed(4)) : '') + ' per s' : (+v).toFixed(3) + ' per s',
    p: (v) => Math.round(v) + '°', a: (v) => (+v).toFixed(2), d: (v) => (+v).toFixed(4) + ' per s',
  };
  function syncUI() {
    for (let i = 0; i < 3; i++) for (const k of ['f', 'p', 'a', 'd']) {
      const el = $(k + i);
      if (k === 'f') { el.step = P.snap ? 1 : 0.001; el.min = P.snap ? 1 : LIM.f[0]; }
      el.value = P[k][i]; $(k + i + '-o').textContent = FMT[k](P[k][i], i);
    }
    $('snap').checked = !!P.snap; $('det-field').hidden = !P.snap;
    $('det').value = P.det; $('det-o').textContent = (+P.det).toFixed(4) + ' per s';
    $('table').checked = P.n === 3; $('pend-2').classList.toggle('off', P.n !== 3);
    $('pend-2').querySelectorAll('input[type=range]').forEach((el) => (el.disabled = P.n !== 3));
    $('T').value = P.T; $('T-o').textContent = P.T + ' s';
    $('w').value = P.w; $('w-o').textContent = (+P.w).toFixed(1);
  }
  function changed(animated) { pts = curve(); syncUI(); saveHash(); animated ? animate() : drawAll(); }

  $('pends').addEventListener('input', (e) => {
    const el = e.target; if (!el.dataset.k) return;
    P[el.dataset.k][+el.dataset.i] = +el.value; $('preset').value = ''; changed(false);
  });
  $('snap').addEventListener('change', (e) => { P.snap = e.target.checked ? 1 : 0; if (P.snap) P.f = P.f.map((v) => Math.max(1, Math.round(v))); changed(false); });
  $('det').addEventListener('input', (e) => { P.det = +e.target.value; changed(false); });
  $('table').addEventListener('change', (e) => { P.n = e.target.checked ? 3 : 2; changed(false); });
  $('T').addEventListener('input', (e) => { P.T = +e.target.value; changed(false); });
  $('w').addEventListener('input', (e) => { P.w = +e.target.value; changed(false); });

  const sel = $('preset');
  PRESETS.forEach(([name], i) => { const o = document.createElement('option'); o.value = i; o.textContent = name; sel.appendChild(o); });
  sel.addEventListener('change', () => { if (sel.value === '') return; P = copy(PRESETS[+sel.value][1]); changed(true); });

  // Randomize: whole-number frequencies with a small detune give curves that almost repeat.
  function randomize() {
    const R = Math.random, pick = (arr) => arr[Math.floor(R() * arr.length)];
    const pairs = [[1, 1], [1, 2], [2, 1], [2, 3], [3, 2], [3, 4], [4, 3], [1, 3], [3, 1], [2, 2], [3, 3]];
    const [f1, f2] = pick(pairs), n = R() < 0.5 ? 3 : 2;
    const d = [0, 1, 2].map(() => +(0.003 + R() * 0.009).toFixed(4));
    const T = Math.min(600, Math.max(60, Math.round(2.3 / Math.min(...d.slice(0, n)) / 5) * 5));
    P = { n, snap: 1, det: +(0.002 + R() * 0.01).toFixed(4), f: [f1, f2, pick([1, 1, 2, 3])],
      p: [0, 1, 2].map(() => 15 * Math.floor(R() * 24)), a: [+(0.7 + R() * 0.3).toFixed(2), +(0.7 + R() * 0.3).toFixed(2), +(0.25 + R() * 0.4).toFixed(2)],
      d, T, w: P.w };
    sel.value = ''; changed(true);
  }
  $('random').addEventListener('click', randomize);
  $('play').addEventListener('click', animate);

  // ---------- export ----------
  function svgString(sizeMM) {
    const c = 500, s = 460, w = (P.w).toFixed(2);
    let d = '';
    for (let k = 0; k < pts.length / 2; k++) d += (k ? 'L' : 'M') + (c + pts[2 * k] * s).toFixed(1) + ' ' + (c - pts[2 * k + 1] * s).toFixed(1);
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + sizeMM + 'mm" height="' + sizeMM + 'mm" viewBox="0 0 1000 1000">' +
      '<path d="' + d + '" fill="none" stroke="#000" stroke-width="' + w + '" stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }
  function save(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  $('dl-svg').addEventListener('click', () => save(new Blob([svgString(200)], { type: 'image/svg+xml' }), 'harmonograph.svg'));
  $('dl-png').addEventListener('click', () => {
    const R = 2400, c = document.createElement('canvas'); c.width = c.height = R;
    const g = c.getContext('2d'); clear(g, R); strokeRange(g, R, 0, pts.length / 2 - 1, P.w);
    c.toBlob((b) => save(b, 'harmonograph.png'), 'image/png');
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
  pts = curve(); syncUI(); animate();
  window.__harmonograph = { get params() { return copy(P); }, toHash, svgString };
})();
