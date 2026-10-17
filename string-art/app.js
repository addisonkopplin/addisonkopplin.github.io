/* String Art Maker: user interface, crop, color separation, rendering, downloads
   and build guide. The line solver runs in worker.js. Nothing is sent over the network. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const TARGET = 500;   // working resolution of the photo: pixels along the longer side
  const MAXSRC = 2400;  // photos are downscaled to this many pixels along the longer side
  const fmt = (n) => n.toLocaleString('en-US');

  // ---------- state ----------
  const S = { img: null, zoom: 1, cx: 0, cy: 0, sample: false, running: false, worker: null, result: null };

  // ---------- frame ----------
  const ASPECT = { '4:5': 4 / 5, '3:4': 3 / 4, '2:3': 2 / 3, '9:16': 9 / 16, '5:4': 5 / 4, '4:3': 4 / 3, '3:2': 3 / 2, '16:9': 16 / 9 };
  const SHAPE_NAME = { circle: 'Circle', square: 'Square', rect: 'Rectangle', ellipse: 'Oval' };
  // sizes in millimetres, kept per shape so switching shapes does not lose them
  const F = { shape: 'circle', unit: 'cm',
    size: { circle: [400, 400], square: [400, 400], rect: [400, 500], ellipse: [400, 500] },
    aspect: { rect: '4:5', ellipse: '4:5' } };
  const fw = () => F.size[F.shape][0], fh = () => F.size[F.shape][1];
  const frameAspect = () => fw() / fh();
  const frameKey = () => F.shape + ':' + frameAspect().toFixed(4);
  const UNIT = { cm: 10, in: 25.4 };
  const toUnit = (mm) => +(mm / UNIT[F.unit]).toFixed(F.unit === 'cm' ? 1 : 2);
  const unitStr = (mm) => String(+(mm / UNIT[F.unit]).toFixed(1)) + (F.unit === 'cm' ? ' cm' : ' in');
  function frameText() {
    const w = fw(), h = fh(), u = F.unit === 'cm' ? ' cm' : ' in', v = (mm) => String(+(mm / UNIT[F.unit]).toFixed(1));
    if (F.shape === 'circle') return 'Circle, ' + v(w) + u + ' diameter';
    if (F.shape === 'square') return 'Square, ' + v(w) + u + ' sides';
    return SHAPE_NAME[F.shape] + ', ' + v(w) + ' × ' + v(h) + u + ' (width × height)';
  }

  /* Nail layout for a frame of width A and height 1 (A = width / height).
     Returns positions as fractions of the frame width (u, to the right) and height (v, down),
     the outward direction at each nail (radians, counter-clockwise, 0 = right), the frame
     sides each nail lies on (bit mask, rectangles only), and the perimeter in height units.
     Nails are equally spaced by arc length, nail 0 at the middle of the right side,
     numbered counter-clockwise. */
  function nailLayout(shape, n, A) {
    const u = new Float64Array(n), v = new Float64Array(n), dir = new Float64Array(n), edge = new Uint8Array(n);
    let P;
    if (shape === 'circle' || (shape === 'ellipse' && Math.abs(A - 1) < 1e-6)) {
      for (let i = 0; i < n; i++) { const t = 2 * Math.PI * i / n; u[i] = 0.5 + 0.5 * Math.cos(t); v[i] = 0.5 - 0.5 * Math.sin(t); dir[i] = t; }
      P = Math.PI * Math.min(A, 1);
    } else if (shape === 'ellipse') {
      const a = A / 2, b = 0.5, M = 8192, L = new Float64Array(M + 1);
      for (let k = 1; k <= M; k++) {
        const t0 = 2 * Math.PI * (k - 1) / M, t1 = 2 * Math.PI * k / M;
        L[k] = L[k - 1] + Math.hypot(a * (Math.cos(t1) - Math.cos(t0)), b * (Math.sin(t1) - Math.sin(t0)));
      }
      P = L[M];
      for (let i = 0, k = 0; i < n; i++) {
        const s = i * P / n;
        while (L[k + 1] < s) k++;
        const t = 2 * Math.PI * (k + (s - L[k]) / (L[k + 1] - L[k])) / M;
        u[i] = 0.5 + 0.5 * Math.cos(t); v[i] = 0.5 - 0.5 * Math.sin(t);
        dir[i] = Math.atan2(Math.sin(t) / b, Math.cos(t) / a);
      }
    } else { // square or rectangle
      P = 2 * (A + 1);
      // path segments: [x0, y0, x1, y1, side bit, outward direction]
      const seg = [[A, 0.5, A, 0, 1, 0], [A, 0, 0, 0, 2, Math.PI / 2], [0, 0, 0, 1, 4, Math.PI], [0, 1, A, 1, 8, -Math.PI / 2], [A, 1, A, 0.5, 1, 0]];
      const eps = P * 1e-7;
      for (let i = 0; i < n; i++) {
        let s = i * P / n, q = 0;
        for (; q < seg.length - 1; q++) { const l = Math.hypot(seg[q][2] - seg[q][0], seg[q][3] - seg[q][1]); if (s <= l + eps) break; s -= l; }
        const g = seg[q], l = Math.hypot(g[2] - g[0], g[3] - g[1]), f = Math.min(1, Math.max(0, s / l));
        const x = g[0] + (g[2] - g[0]) * f, y = g[1] + (g[3] - g[1]) * f;
        u[i] = x / A; v[i] = y; edge[i] = g[4]; dir[i] = g[5];
        // a nail exactly on a corner lies on both sides
        const cx = x < eps ? 4 : x > A - eps ? 1 : 0, cy = y < eps ? 2 : y > 1 - eps ? 8 : 0;
        if (cx && cy) { edge[i] = cx | cy; dir[i] = Math.atan2(cy === 2 ? 1 : -1, cx === 1 ? 1 : -1); }
      }
    }
    return { u, v, dir, edge, P };
  }
  function workSize(A) { return A >= 1 ? [TARGET, Math.round(TARGET / A)] : [Math.round(TARGET * A), TARGET]; }
  function fitSize(A, max) { return A >= 1 ? [max, Math.round(max / A)] : [Math.round(max * A), max]; }

  // ---------- crop ----------
  const crop = $('crop'), cc = $('crop-canvas'), cctx = cc.getContext('2d');
  function cropDims() { const [w, h] = fitSize(frameAspect(), 840); if (cc.width !== w || cc.height !== h) { cc.width = w; cc.height = h; } return [w, h]; }
  function baseScale(w, h) { return Math.max(w / S.img.width, h / S.img.height); }
  function clampCenter() {
    const w = cc.width, h = cc.height, s = baseScale(w, h) * S.zoom, hx = w / 2 / s, hy = h / 2 / s;
    S.cx = Math.min(Math.max(S.cx, hx), S.img.width - hx);
    S.cy = Math.min(Math.max(S.cy, hy), S.img.height - hy);
  }
  function drawImageTo(ctx, w, h) {
    const s = baseScale(w, h) * S.zoom;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(S.img, w / 2 - S.cx * s, h / 2 - S.cy * s, S.img.width * s, S.img.height * s);
  }
  function shapePath(ctx, w, h, inset) {
    if (F.shape === 'circle' || F.shape === 'ellipse') ctx.ellipse(w / 2, h / 2, w / 2 - inset, h / 2 - inset, 0, 0, Math.PI * 2);
    else ctx.rect(inset, inset, w - 2 * inset, h - 2 * inset);
  }
  function drawCrop() {
    const [w, h] = cropDims();
    if (!S.img) { cctx.clearRect(0, 0, w, h); return; }
    clampCenter();
    drawImageTo(cctx, w, h);
    cctx.save();
    if (F.shape === 'circle' || F.shape === 'ellipse') {
      cctx.beginPath(); cctx.rect(0, 0, w, h); shapePath(cctx, w, h, 1);
      cctx.fillStyle = 'rgba(255,255,255,0.78)'; cctx.fill('evenodd');
    }
    cctx.beginPath(); shapePath(cctx, w, h, 1);
    cctx.lineWidth = 2; cctx.strokeStyle = '#111'; cctx.stroke();
    cctx.restore();
  }
  function setImage(img, isSample) {
    S.img = img; S.sample = isSample; S.zoom = 1;
    S.cx = img.width / 2; S.cy = img.height / 2;
    $('zoom').value = 1; $('zoom-o').textContent = '1.00×';
    $('crop-empty').hidden = true; $('credit').hidden = !isSample;
    $('run').disabled = S.running;
    drawCrop();
    setStatus('Position the photo, then select Make string art.');
  }

  // Photos are decoded with their EXIF orientation applied, then downscaled.
  const HEIC_MSG = 'This browser cannot open HEIC photos. Convert the photo to JPEG first. On an iPhone, Settings › Camera › Formats › Most Compatible saves new photos as JPEG.';
  function decodeWithImg(blob) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(blob), img = new Image();
      img.onload = () => { URL.revokeObjectURL(url); res(img); };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('decode')); };
      img.src = url;
    });
  }
  async function loadBlob(blob, isSample, name) {
    const heic = /hei[cf]/i.test(blob.type) || /\.(heic|heif)$/i.test(name || '');
    setStatus('Opening photo…');
    let src = null;
    try {
      if (window.createImageBitmap) { try { src = await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (e) { src = null; } }
      if (!src) src = await decodeWithImg(blob);
      if (!src.width || !src.height) throw new Error('empty');
    } catch (e) {
      setStatus(heic ? HEIC_MSG : 'This file could not be opened as an image. Use a JPEG, PNG or WebP file.');
      return;
    }
    const k = Math.min(1, MAXSRC / Math.max(src.width, src.height));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(src.width * k)); c.height = Math.max(1, Math.round(src.height * k));
    const ctx = c.getContext('2d'); ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, 0, 0, c.width, c.height);
    if (src.close) src.close();
    setImage(c, isSample);
  }
  function loadFile(file) {
    if (!file) return;
    const okType = /^image\//.test(file.type) || /\.(jpe?g|png|webp|gif|bmp|avif|heic|heif)$/i.test(file.name);
    if (!okType) { setStatus('Choose an image file, such as a JPEG, PNG or WebP photo.'); return; }
    loadBlob(file, false, file.name);
  }
  $('file').addEventListener('change', (e) => { loadFile(e.target.files[0]); e.target.value = ''; });
  $('sample').addEventListener('click', () => fetch('sample-einstein.jpg').then((r) => r.blob()).then((b) => loadBlob(b, true, 'sample.jpg'))
    .catch(() => setStatus('The sample photo could not be loaded.')));
  ['dragenter', 'dragover'].forEach((t) => crop.addEventListener(t, (e) => { e.preventDefault(); crop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((t) => crop.addEventListener(t, (e) => { e.preventDefault(); crop.classList.remove('over'); }));
  crop.addEventListener('drop', (e) => loadFile(e.dataTransfer.files[0]));

  const ptrs = new Map(); let pinch0 = 0, zoom0 = 1;
  function setZoom(z) {
    S.zoom = Math.min(4, Math.max(1, z));
    $('zoom').value = S.zoom; $('zoom-o').textContent = S.zoom.toFixed(2) + '×';
    drawCrop();
  }
  crop.addEventListener('pointerdown', (e) => {
    if (!S.img) return;
    crop.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    crop.classList.add('dragging');
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinch0 = Math.hypot(a.x - b.x, a.y - b.y); zoom0 = S.zoom; }
  });
  crop.addEventListener('pointermove', (e) => {
    if (!ptrs.has(e.pointerId)) return;
    const p = ptrs.get(e.pointerId), dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 1) {
      const k = cc.width / crop.clientWidth / (baseScale(cc.width, cc.height) * S.zoom);
      S.cx -= dx * k; S.cy -= dy * k; drawCrop();
    } else if (ptrs.size === 2 && pinch0) {
      const [a, b] = [...ptrs.values()]; setZoom(zoom0 * Math.hypot(a.x - b.x, a.y - b.y) / pinch0);
    }
  });
  const up = (e) => { ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch0 = 0; if (!ptrs.size) crop.classList.remove('dragging'); };
  crop.addEventListener('pointerup', up); crop.addEventListener('pointercancel', up);
  crop.addEventListener('wheel', (e) => { if (!S.img) return; e.preventDefault(); setZoom(S.zoom * Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
  crop.addEventListener('keydown', (e) => {
    if (!S.img) return;
    const step = 10 / (baseScale(cc.width, cc.height) * S.zoom), keys = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (keys[e.key]) { e.preventDefault(); S.cx += keys[e.key][0] * step; S.cy += keys[e.key][1] * step; drawCrop(); }
    else if (e.key === '+' || e.key === '=') setZoom(S.zoom * 1.1);
    else if (e.key === '-') setZoom(S.zoom / 1.1);
  });
  $('zoom').addEventListener('input', (e) => setZoom(+e.target.value));

  // ---------- frame controls ----------
  const radios = (name) => [...document.querySelectorAll('input[name="' + name + '"]')];
  function syncFrameInputs() {
    const sh = F.shape, two = sh === 'rect' || sh === 'ellipse';
    $('aspect-f').hidden = !two; $('fh-f').hidden = !two;
    if (two) $('aspect').value = F.aspect[sh];
    $('fw-l').textContent = sh === 'circle' ? 'Diameter' : sh === 'square' ? 'Side' : 'Width';
    $('fw').value = toUnit(fw()); $('fh').value = toUnit(fh());
    const step = F.unit === 'cm' ? 0.5 : 0.25, lo = F.unit === 'cm' ? 10 : 4, hi = F.unit === 'cm' ? 200 : 80;
    ['fw', 'fh'].forEach((id) => { $(id).step = step; $(id).min = lo; $(id).max = hi; });
  }
  function frameChanged() {
    const A = frameAspect();
    // keep the photo view and the result at the frame's proportions
    const cap = (rem) => A < 1 ? 'min(100%, ' + (rem * A).toFixed(2) + 'rem)' : '';
    crop.style.aspectRatio = String(A); crop.style.maxWidth = cap(26);
    $('stage').style.aspectRatio = String(A); $('stage').style.maxWidth = A < 1 ? 'min(44rem, ' + (40 * A).toFixed(2) + 'rem)' : '';
    if (S.img) drawCrop(); else cropDims();
    updateSpacing();
    if (S.result && !S.running) {
      if (S.result.key !== frameKey()) {
        setOutputsEnabled(false);
        setStatus('The frame shape or proportions changed. Select Make string art to make a new result for this frame.');
      } else { resizeOut(); redrawResult(); setOutputsEnabled(true); }
    } else if (!S.running) resizeOut(true);
  }
  function updateSpacing() {
    const n = +$('nails').value, lay = nailLayout(F.shape, 8, frameAspect());
    const mm = lay.P * fh() / n;
    $('spacing').textContent = 'Spacing on this frame: ' + (F.unit === 'cm' ? mm.toFixed(1) + ' mm' : (mm / 25.4).toFixed(2) + ' in') + '.';
  }
  radios('shape').forEach((r) => r.addEventListener('change', () => { if (r.checked) { F.shape = r.value; syncFrameInputs(); frameChanged(); } }));
  $('aspect').addEventListener('change', (e) => {
    const sh = F.shape; F.aspect[sh] = e.target.value;
    if (ASPECT[e.target.value]) F.size[sh][1] = F.size[sh][0] / ASPECT[e.target.value];
    syncFrameInputs(); frameChanged();
  });
  function readSize(id, final) {
    let x = parseFloat($(id).value);
    if (!isFinite(x) || x <= 0) { if (final) syncFrameInputs(); return; }
    let mm = x * UNIT[F.unit];
    if (final) mm = Math.min(2000, Math.max(100, mm));
    const sh = F.shape, sz = F.size[sh], r = ASPECT[F.aspect[sh]];
    if (sh === 'circle' || sh === 'square') { sz[0] = sz[1] = mm; }
    else if (id === 'fw') { sz[0] = mm; if (F.aspect[sh] !== 'custom') sz[1] = mm / r; }
    else { sz[1] = mm; if (F.aspect[sh] !== 'custom') sz[0] = mm * r; }
    if (final) syncFrameInputs();
    else if (F.aspect[sh] !== 'custom' && (sh === 'rect' || sh === 'ellipse')) $(id === 'fw' ? 'fh' : 'fw').value = toUnit(id === 'fw' ? sz[1] : sz[0]);
    frameChanged();
  }
  ['fw', 'fh'].forEach((id) => { $(id).addEventListener('input', () => readSize(id, false)); $(id).addEventListener('change', () => readSize(id, true)); });
  $('unit').addEventListener('change', (e) => { F.unit = e.target.value; syncFrameInputs(); updateSpacing(); });

  // ---------- color controls ----------
  // Threads are DMC floss numbers (see dmc.js). Board colors are approximate screen colors.
  const DMC = new Map((window.DMC || []).map((d) => [d[0], { code: d[0], name: d[1], hex: d[2] }]));
  const BOARDS = { white: { name: 'White', hex: '#ffffff' }, black: { name: 'Black', hex: '#161616' },
    grey: { name: 'Grey', hex: '#8c8c8c' }, wood: { name: 'Natural wood', hex: '#c9a67a' } };
  const PALETTES = {
    black: { board: 'white', threads: ['310'] },
    rgb: { board: 'black', threads: ['666', '702', '995'] },
    cmy: { board: 'white', threads: ['973', '3846', '3805'] },
    bw: { board: 'grey', threads: ['B5200', '310'] }
  };
  const C = { threads: PALETTES.black.threads.slice(), board: 'white' };
  const dmcLabel = (code) => { const d = DMC.get(code); return 'DMC ' + d.code + ' ' + d.name; };
  const cur = () => ({ threads: C.threads.map((c) => DMC.get(c).hex), board: BOARDS[C.board].hex });
  const modeOf = (n) => (n > 1 ? 'multi' : 'one');
  function lab(hex) {
    const f = (x) => { x /= 255; return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
    const [r, g, b] = hex2rgb(hex).map(f);
    const X = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883;
    const t = (x) => (x > 0.008856 ? Math.cbrt(x) : 7.787 * x + 16 / 116);
    return [116 * t(Y) - 16, 500 * (t(X) - t(Y)), 200 * (t(Y) - t(Z))];
  }
  // closest DMC floss to a picked color, by distance in CIELAB
  function nearestDMC(hex) {
    const p = lab(hex); let best = null, bd = Infinity;
    for (const d of DMC.values()) { const q = d.lab || (d.lab = lab(d.hex)); const e = (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2 + (p[2] - q[2]) ** 2; if (e < bd) { bd = e; best = d; } }
    return best.code;
  }
  function renderThreads() {
    const box = $('threads'), t = C.threads;
    box.innerHTML = '';
    t.forEach((code, i) => {
      const d = DMC.get(code), li = document.createElement('li');
      const l = document.createElement('label'); l.className = 'sw';
      const inp = document.createElement('input'); inp.type = 'color'; inp.value = d.hex;
      inp.setAttribute('aria-label', 'Thread ' + (i + 1) + ' color: ' + dmcLabel(code) + '. Pick a color to change it to the closest DMC floss.');
      inp.addEventListener('change', () => { t[i] = nearestDMC(inp.value); $('palette').value = 'custom'; renderThreads(); colorsChanged(); });
      l.appendChild(inp); li.appendChild(l);
      const s = document.createElement('span'); s.className = 'tname';
      s.innerHTML = '<b>' + (t.length > 1 ? (i + 1) + '. ' : '') + 'DMC ' + d.code + '</b> ' + d.name;
      li.appendChild(s); box.appendChild(li);
    });
    $('board').value = C.board;
    $('add-thread').disabled = t.length >= 3; $('del-thread').disabled = t.length <= 1;
  }
  $('palette').addEventListener('change', (e) => {
    const p = PALETTES[e.target.value]; if (!p) return;
    C.board = p.board; C.threads = p.threads.slice(); renderThreads(); colorsChanged();
  });
  $('add-thread').addEventListener('click', () => {
    const t = C.threads; if (t.length >= 3) return;
    const extra = ['B5200', '666', '995', '973', '310'].find((c) => !t.includes(c)) || '702';
    t.push(extra); $('palette').value = 'custom'; renderThreads(); colorsChanged();
  });
  $('del-thread').addEventListener('click', () => { const t = C.threads; if (t.length <= 1) return; t.pop(); $('palette').value = 'custom'; renderThreads(); colorsChanged(); });
  $('board').addEventListener('change', (e) => { C.board = e.target.value; $('palette').value = 'custom'; colorsChanged(); });
  // After a result exists, color edits recolor the preview at once. If the edit changes what the
  // solver would do, a note asks for a new run.
  function colorsChanged() {
    const R = S.result; if (!R || S.running || !R.finished) return;
    const c = cur();
    if (R.threads.length === c.threads.length) {
      R.board = c.board; R.boardKey = C.board;
      R.threads.forEach((t, i) => { t.color = c.threads[i]; t.code = C.threads[i]; });
      if (R.key === frameKey()) redrawResult();
      const flip = R.threads.length === 1 && lightOnDark(c.threads[0], c.board) !== R.light;
      if (R.threads.length > 1 || flip) setStatus('Colors changed. The preview shows the new colors. Select Make string art to fit the lines to them.');
    } else setStatus('The number of threads changed. Select Make string art to make a new result.');
  }

  // ---------- settings ----------
  const bind = (id, f) => { const el = $(id), o = $(id + '-o'); const u = () => (o.textContent = f(+el.value)); el.addEventListener('input', u); u(); };
  bind('nails', fmt); bind('lines', fmt); bind('dark', String);
  $('nails').addEventListener('input', updateSpacing);

  // ---------- color helpers ----------
  const hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = (h) => { const [r, g, b] = hex2rgb(h); return 0.299 * r + 0.587 * g + 0.114 * b; };
  const lightOnDark = (thread, board) => lum(thread) > lum(board);

  // ---------- preprocessing: photo -> coverage maps ----------
  function insideMask(w, h) {
    const m = new Uint8Array(w * h);
    if (F.shape === 'circle' || F.shape === 'ellipse') {
      const cx = (w - 1) / 2, cy = (h - 1) / 2, rx = w / 2, ry = h / 2;
      for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) { const a = (x - cx) / rx, b = (y - cy) / ry; m[i] = a * a + b * b <= 1 ? 1 : 0; }
    } else m.fill(1);
    return m;
  }
  function photoPixels(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    drawImageTo(ctx, w, h);
    return ctx.getImageData(0, 0, w, h).data;
  }
  // Luminance range that clips the darkest and lightest 1% of pixels inside the frame.
  function levels(d, inside) {
    const hist = new Uint32Array(256); let count = 0;
    for (let i = 0; i < inside.length; i++) if (inside[i]) { hist[(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) | 0]++; count++; }
    let lo = 0, hi = 255, acc = 0;
    for (; lo < 255; lo++) { acc += hist[lo]; if (acc > count * 0.01) break; }
    for (acc = 0; hi > 0; hi--) { acc += hist[hi]; if (acc > count * 0.01) break; }
    if (hi <= lo) { lo = 0; hi = 255; }
    return [lo, hi];
  }
  // One thread: coverage follows the photo's brightness. A dark thread on a light board covers
  // the dark parts; a light thread on a dark board covers the light parts.
  function monoMap(w, h, light) {
    const d = photoPixels(w, h), inside = insideMask(w, h), [lo, hi] = levels(d, inside), N = w * h, map = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      if (!inside[i]) continue;
      let a = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2] - lo) / (hi - lo); a = a < 0 ? 0 : a > 1 ? 1 : a;
      map[i] = light ? 1 - Math.pow(1 - a, 1.8) : 1 - Math.pow(a, 1.8);  // exponent 1.8 strengthens mid-tones
    }
    return [map];
  }
  /* Several threads: for each pixel, find the coverage of each thread color (each >= 0, total <= 1)
     so that board + sum(coverage_k * (thread_k - board)) is closest to the pixel color.
     Solved by projected gradient descent on a 32 x 32 x 32 lookup table of colors. */
  function projectCapped(a) {   // project onto {a_k >= 0, sum a_k <= 1}
    for (let k = 0; k < a.length; k++) if (a[k] < 0) a[k] = 0;
    let s = 0; for (const x of a) s += x;
    if (s <= 1) return;
    const z = Array.from(a).sort((p, q) => q - p); let cum = 0, th = 0;
    for (let j = 0; j < z.length; j++) { cum += z[j]; const t = (cum - 1) / (j + 1); if (z[j] - t > 0) th = t; }
    for (let k = 0; k < a.length; k++) a[k] = Math.max(0, a[k] - th);
  }
  function multiMaps(w, h, threads, board) {
    const K = threads.length, B = hex2rgb(board).map((x) => x / 255);
    const D = threads.map((t) => hex2rgb(t).map((x, c) => x / 255 - B[c]));
    let tr = 0; for (const d of D) for (const x of d) tr += x * x;
    const eta = 1 / Math.max(tr, 1e-6), Q = 32, lut = new Float32Array(Q * Q * Q * K), a = new Float64Array(K), r = [0, 0, 0];
    for (let ri = 0; ri < Q; ri++) for (let gi = 0; gi < Q; gi++) for (let bi = 0; bi < Q; bi++) {
      const T = [ri / (Q - 1), gi / (Q - 1), bi / (Q - 1)];
      a.fill(1 / (K + 1));
      for (let it = 0; it < 150; it++) {
        for (let c = 0; c < 3; c++) { let v = B[c] - T[c]; for (let k = 0; k < K; k++) v += a[k] * D[k][c]; r[c] = v; }
        for (let k = 0; k < K; k++) a[k] -= eta * (r[0] * D[k][0] + r[1] * D[k][1] + r[2] * D[k][2]);
        projectCapped(a);
      }
      const o = ((ri * Q + gi) * Q + bi) * K;
      for (let k = 0; k < K; k++) lut[o + k] = a[k];
    }
    const d = photoPixels(w, h), inside = insideMask(w, h), [lo, hi] = levels(d, inside), N = w * h;
    // Map the photo's brightness range onto the range the threads and board can show:
    // from the darkest to the lightest of them. A gamma curve sets how mid-tones are shown.
    const L = [board].concat(threads).map((h) => lum(h) / 255), tlo = Math.min(...L), thi = Math.max(...L);
    const BOOST = 1.8, GAM = 1.3;
    const q = (x) => { x = (x - lo) / (hi - lo); x = x < 0 ? 0 : x > 1 ? 1 : x; x = tlo + (thi - tlo) * Math.pow(x, GAM); return Math.round(x * (Q - 1)); };
    const maps = threads.map(() => new Float32Array(N));
    for (let i = 0; i < N; i++) {
      if (!inside[i]) continue;
      const o = ((q(d[i * 4]) * Q + q(d[i * 4 + 1])) * Q + q(d[i * 4 + 2])) * K;
      for (let k = 0; k < K; k++) maps[k][i] = 1 - Math.pow(1 - lut[o + k], BOOST);
    }
    return maps;
  }
  // Lines are shared out in proportion to each map's total coverage, at least 5% each.
  function budgets(maps, L) {
    const s = maps.map((m) => { let t = 0; for (let i = 0; i < m.length; i++) t += m[i]; return t; });
    const tot = s.reduce((p, q) => p + q, 0) || 1, min = 0.05;
    let f = s.map((x) => Math.max(min, x / tot)); const fs = f.reduce((p, q) => p + q, 0); f = f.map((x) => x / fs);
    const b = f.map((x) => Math.round(x * L)); b[b.length - 1] += L - b.reduce((p, q) => p + q, 0);
    return b;
  }

  // ---------- result rendering ----------
  const out = $('out'), octx = out.getContext('2d');
  function resizeOut(clear) {
    const A = S.result ? S.result.A : frameAspect(), [w, h] = fitSize(A, 1200);
    if (out.width !== w || out.height !== h) { out.width = w; out.height = h; }
    if (clear) { octx.fillStyle = '#fff'; octx.fillRect(0, 0, w, h); }
  }
  function geom(lay, w, h) {
    const inset = Math.max(w, h) * 0.006, n = lay.u.length, X = new Float32Array(n), Y = new Float32Array(n);
    for (let i = 0; i < n; i++) { X[i] = inset + lay.u[i] * (w - 2 * inset); Y[i] = inset + lay.v[i] * (h - 2 * inset); }
    return { X, Y };
  }
  const threadAlpha = (strength) => Math.min(0.9, strength * 2.2);
  function paintBoard(ctx, w, h, R) {
    ctx.fillStyle = R.board; ctx.fillRect(0, 0, w, h);
    const { X, Y } = geom(R.lay, w, h), M = Math.max(w, h);
    ctx.fillStyle = lum(R.board) < 110 ? '#bdbdbd' : '#8a8a8a';
    for (let i = 0; i < X.length; i++) { ctx.beginPath(); ctx.arc(X[i], Y[i], Math.max(1, M / 900), 0, Math.PI * 2); ctx.fill(); }
  }
  function drawSegments(ctx, w, h, R, t, from, to) {
    const { X, Y } = geom(R.lay, w, h), order = R.threads[t].order;
    ctx.lineWidth = Math.max(0.5, Math.max(w, h) / 1400);
    const [r, g, b] = hex2rgb(R.threads[t].color);
    ctx.strokeStyle = 'rgba(' + r + ',' + g + ',' + b + ',' + threadAlpha(R.strength) + ')';
    ctx.lineCap = 'round';
    for (let k = from; k < to; k++) {
      const a = order[k], c = order[k + 1];
      ctx.beginPath(); ctx.moveTo(X[a], Y[a]); ctx.lineTo(X[c], Y[c]); ctx.stroke();
    }
  }
  function paintAll(ctx, w, h, R) {
    paintBoard(ctx, w, h, R);
    R.threads.forEach((t, i) => drawSegments(ctx, w, h, R, i, 0, t.count));
  }
  function redrawResult() { const R = S.result; if (!R || !R.finished) return; paintAll(octx, out.width, out.height, R); renderLegend(); }
  // Thread needed per color at the current frame size: the sum of the line lengths plus 10%.
  const SKEIN_M = 8;
  function threadMeters(R) {
    const W = fw(), H = fh(), u = R.lay.u, v = R.lay.v;
    return R.threads.map((t) => {
      let mm = 0; const o = t.order;
      for (let k = 0; k < t.count; k++) mm += Math.hypot((u[o[k]] - u[o[k + 1]]) * W, (v[o[k]] - v[o[k + 1]]) * H);
      return mm / 1000 * 1.1;
    });
  }
  const meters = (m) => fmt(Math.ceil(m)) + ' m';
  const skeins = (m) => { const k = Math.ceil(m / SKEIN_M); return fmt(k) + (k === 1 ? ' skein' : ' skeins'); };
  function renderLegend() {
    const R = S.result, sl = $('shoplist');
    if (!R || !R.finished) { sl.hidden = true; return; }
    const m = threadMeters(R);
    sl.innerHTML = '<h3>Shopping list</h3><table><thead><tr><th scope="col">Thread</th><th scope="col">Lines</th><th scope="col">Length</th><th scope="col">8 m skeins</th></tr></thead><tbody>' +
      R.threads.map((t, i) => '<tr><td><i style="background:' + t.color + '"></i>' + (R.threads.length > 1 ? (i + 1) + '. ' : '') + dmcLabel(t.code) + '</td><td>' + fmt(t.count) +
        '</td><td>' + meters(m[i]) + '</td><td>' + fmt(Math.ceil(m[i] / SKEIN_M)) + '</td></tr>').join('') +
      '</tbody></table><p class="hint">Frame: ' + frameText() + '. Board: ' + BOARDS[R.boardKey].name.toLowerCase() + '. Length is the total length of the lines plus 10% for knots and winding around the nails.</p>';
    sl.hidden = false;
  }

  // ---------- run ----------
  let raf = 0, perFrame = 20, timing = null;
  function setStatus(t) { $('status').textContent = t; }
  function setBar(f) { $('bar').style.width = (f * 100).toFixed(1) + '%'; }
  function setOutputsEnabled(on) { ['dl-png', 'dl-txt', 'print'].forEach((id) => ($(id).disabled = !on)); $('guide-note').hidden = on; }

  function start() {
    if (!S.img || S.running) return;
    if (S.worker) S.worker.terminate();
    cancelAnimationFrame(raf);
    const n = +$('nails').value, L = +$('lines').value, strength = +$('dark').value / 100;
    const A = frameAspect(), lay = nailLayout(F.shape, n, A), [w, h] = workSize(A), c = cur();
    const mode = modeOf(c.threads.length), light = mode === 'one' && lightOnDark(c.threads[0], c.board);
    setOutputsEnabled(false); setBar(0); $('shoplist').hidden = true;
    setStatus(mode === 'multi' ? 'Separating colors…' : 'Preparing lines…');
    $('run').textContent = 'Making string art…'; $('run').disabled = true;
    S.running = true;
    // let the status paint before the color separation, which blocks for a moment
    setTimeout(() => {
      const multi = mode === 'multi';
      const maps = multi ? multiMaps(w, h, c.threads, c.board) : monoMap(w, h, light);
      const bud = multi ? budgets(maps, L) : [L];
      const R = S.result = { key: frameKey(), shape: F.shape, A, lay, nails: n, lines: L, strength, mode, light, board: c.board, boardKey: C.board, finished: false,
        threads: c.threads.map((col, i) => ({ color: col, code: C.threads[i], budget: bud[i], order: new Uint16Array(bud[i] + 1), rec: 0, drawn: 0, count: bud[i], done: false })) };
      resizeOut(); paintBoard(octx, out.width, out.height, R);
      perFrame = Math.max(10, Math.ceil(L / 180)); timing = null;
      const NX = new Int32Array(n), NY = new Int32Array(n);
      for (let i = 0; i < n; i++) { NX[i] = Math.round((w - 1) / 2 + (lay.u[i] - 0.5) * (w - 2)); NY[i] = Math.round((h - 1) / 2 + (lay.v[i] - 0.5) * (h - 2)); }
      const wk = new Worker('worker.js'); S.worker = wk;
      wk.onmessage = (e) => {
        const m = e.data;
        if (m.type === 'prep') { setStatus('Preparing lines: ' + Math.round(m.done * 100) + '%'); setBar(m.done * 0.1); }
        else if (m.type === 'lines') {
          const t = R.threads[m.color];
          if (m.budget && m.budget !== t.budget) { const o = new Uint16Array(m.budget + 1); o.set(t.order.subarray(0, t.rec)); t.order = o; t.budget = m.budget; }
          t.order.set(m.nails, t.rec); t.rec += m.nails.length;
        }
        else if (m.type === 'colorDone') { const t = R.threads[m.color]; t.count = m.count; t.done = true; }
        else if (m.type === 'done') { timing = m; wk.terminate(); S.worker = null; }
      };
      wk.onerror = () => { setStatus('The calculation stopped because of an error. Try fewer nails or lines.'); cancelAnimationFrame(raf); stop(); };
      wk.postMessage({ type: 'run', w, h, nails: n, nx: NX, ny: NY, edge: lay.edge, strength, skip: Math.round(n * 20 / 288),
        maps: maps.map((m) => m.buffer), budgets: bud, start: 0, penalty: 0.25 }, maps.map((m) => m.buffer));
      if (window.matchMedia('(max-width: 860px)').matches) $('h-res').scrollIntoView({ behavior: 'smooth', block: 'start' });
      raf = requestAnimationFrame(frame);
    }, 30);
  }
  function stop() { S.running = false; $('run').textContent = 'Make string art'; $('run').disabled = !S.img; }
  function frame() {
    const R = S.result; let left = perFrame;
    for (let i = 0; i < R.threads.length && left > 0; i++) {
      const t = R.threads[i];
      const to = Math.min(t.rec - 1, t.drawn + left);
      if (to > t.drawn) { drawSegments(octx, out.width, out.height, R, i, t.drawn, to); left -= to - t.drawn; t.drawn = to; }
      if (!(t.done && t.drawn >= t.count)) break;   // threads are drawn in winding order
    }
    const total = R.threads.reduce((p, t) => p + t.budget, 0), drawn = R.threads.reduce((p, t) => p + t.drawn, 0);
    const ti = R.threads.findIndex((t) => !(t.done && t.drawn >= t.count));
    if (drawn > 0) {
      setStatus((R.threads.length > 1 && ti >= 0 ? 'Thread ' + (ti + 1) + ' of ' + R.threads.length + ' · ' : '') + 'Line ' + fmt(drawn) + ' of ' + fmt(total));
      setBar(0.1 + 0.9 * drawn / total);
    }
    if (timing && ti < 0) {
      R.finished = true; R.lines = R.threads.reduce((p, t) => p + t.count, 0);
      setBar(1); stop(); setOutputsEnabled(R.key === frameKey()); renderLegend();
      setStatus('Finished: ' + fmt(R.lines) + ' lines on ' + fmt(R.nails) + ' nails' + (R.threads.length > 1 ? ', ' + R.threads.length + ' threads' : '') +
        '. Calculated in ' + (timing.totalMs / 1000).toFixed(1) + ' s.');
      document.body.dataset.state = 'done';
      return;
    }
    raf = requestAnimationFrame(frame);
  }
  $('run').addEventListener('click', () => { document.body.dataset.state = 'running'; start(); });

  // ---------- downloads ----------
  function save(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const baseName = () => { const R = S.result; return 'string-art-' + R.shape + '-' + R.nails + '-nails-' + R.lines + '-lines-dmc-' + R.threads.map((t) => t.code.toLowerCase()).join('-'); };
  function renderPNG(max) {
    const R = S.result, [w, h] = fitSize(R.A, max), c = document.createElement('canvas'); c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.save(); ctx.scale(w / out.width, h / out.height); paintAll(ctx, out.width, out.height, R); ctx.restore();
    return c;
  }
  const NUMBERING = 'Nail 0 is at the middle of the right side; the numbers increase counter-clockwise.';
  function nailOrderText() {
    const R = S.result, multi = R.threads.length > 1, m = threadMeters(R);
    const head = ['# String art nail order',
      '# Frame: ' + frameText() + '. Board: ' + BOARDS[R.boardKey].name.toLowerCase() + '.',
      '# ' + R.nails + ' nails, numbered 0 to ' + (R.nails - 1) + '. ' + NUMBERING,
      '# Thread: DMC six-strand embroidery floss, 8 m skeins. Lengths include 10% for knots and winding.'];
    R.threads.forEach((t, i) => head.push('#   ' + (multi ? (i + 1) + '. ' : '') + dmcLabel(t.code) + ': ' + fmt(t.count) + ' lines, ' + meters(m[i]) + ', ' + skeins(m[i])));
    head.push(multi ? '# Wind the threads in the order listed; the last thread lies on top. Each thread section lists one nail number per row, in winding order, starting with the first nail.'
      : '# One nail number per row, in winding order, starting with the first nail.');
    let s = head.join('\n') + '\n';
    R.threads.forEach((t, i) => {
      if (multi) s += '\n# Thread ' + (i + 1) + ' of ' + R.threads.length + ': ' + dmcLabel(t.code) + ', ' + t.count + ' lines\n';
      s += Array.from(t.order.subarray(0, t.count + 1)).join('\n') + '\n';
    });
    return s;
  }
  $('dl-png').addEventListener('click', () => renderPNG(2400).toBlob((b) => save(b, baseName() + '.png'), 'image/png'));
  $('dl-txt').addEventListener('click', () => save(new Blob([nailOrderText()], { type: 'text/plain' }), baseName() + '-nail-order.txt'));

  // ---------- build guide ----------
  const PAPER = { letter: { w: 215.9, h: 279.4, css: 'letter' }, a4: { w: 210, h: 297, css: 'A4' } };
  const MARGIN = 10, BAND = 14;

  // SVG group of the nail template in millimetres: frame outline, centre mark, numbered nails.
  function templateGroup(W, H, R, labelEvery) {
    const lay = R.lay, n = lay.u.length, Tw = W + 2 * BAND, Th = H + 2 * BAND, sp = lay.P * H / n;
    const fs = labelEvery > 1 ? Math.min(4.5, sp * labelEvery * 0.5) : Math.min(3.2, Math.max(1.4, sp * 0.72));
    const X = (i) => BAND + lay.u[i] * W, Y = (i) => BAND + lay.v[i] * H, cx = Tw / 2, cy = Th / 2;
    let s = '<g font-family="Inter,Helvetica,Arial,sans-serif" fill="#000">';
    s += R.shape === 'circle' || R.shape === 'ellipse'
      ? '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + W / 2 + '" ry="' + H / 2 + '" fill="none" stroke="#bbb" stroke-width="0.2"/>'
      : '<rect x="' + BAND + '" y="' + BAND + '" width="' + W + '" height="' + H + '" fill="none" stroke="#bbb" stroke-width="0.2"/>';
    s += '<path d="M' + (cx - 4) + ' ' + cy + 'h8M' + cx + ' ' + (cy - 4) + 'v8" stroke="#000" stroke-width="0.25"/>';
    const pts = [];
    for (let i = 0; i < n; i++) {
      const x = X(i), y = Y(i), t = lay.dir[i], co = Math.cos(t), si = Math.sin(t);
      pts.push([x, y]);
      s += '<circle cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="0.55"/>';
      if (i % labelEvery) continue;
      const lx = x + 1.6 * co, ly = y - 1.6 * si, deg = -t * 180 / Math.PI;
      const left = co < -1e-9, rot = left ? deg + 180 : deg;
      s += '<text x="' + lx.toFixed(2) + '" y="' + ly.toFixed(2) + '" font-size="' + fs.toFixed(2) + '" dominant-baseline="central"' +
        (left ? ' text-anchor="end"' : '') + (i % 10 === 0 ? ' font-weight="700"' : '') +
        ' transform="rotate(' + rot.toFixed(2) + ' ' + lx.toFixed(2) + ' ' + ly.toFixed(2) + ')">' + i + '</text>';
    }
    return { g: s + '</g>', w: Tw, h: Th, cx, cy, pts, sp };
  }
  function scaleBar(unit) {
    const mm = '<svg class="scale" xmlns="http://www.w3.org/2000/svg" width="106mm" height="7mm" viewBox="-3 -3 106 7" font-family="Inter,Helvetica,Arial,sans-serif" font-size="2.6">' +
      '<path d="M0 0h100M0 -1.8v1.8M50 -1.2v1.2M100 -1.8v1.8" stroke="#000" stroke-width="0.3" fill="none"/>' +
      '<text x="0" y="3">0</text><text x="100" y="3" text-anchor="end">100 mm: check with a ruler</text></svg>';
    if (unit !== 'in') return mm;
    return mm + '<svg class="scale" xmlns="http://www.w3.org/2000/svg" width="108mm" height="7mm" viewBox="-3 -3 108 7" font-family="Inter,Helvetica,Arial,sans-serif" font-size="2.6">' +
      '<path d="M0 0h101.6M0 -1.8v1.8M25.4 -1.2v1.2M50.8 -1.2v1.2M76.2 -1.2v1.2M101.6 -1.8v1.8" stroke="#000" stroke-width="0.3" fill="none"/>' +
      '<text x="0" y="3">0</text><text x="101.6" y="3" text-anchor="end">4 in: check with a ruler</text></svg>';
  }
  function buildGuide() {
    const R = S.result, W = fw(), H = fh(), paper = PAPER[$('paper').value], mode = $('mode').value, n = R.nails, L = R.lines;
    const cw = paper.w - 2 * MARGIN, ch = paper.h - 2 * MARGIN, multi = R.threads.length > 1;
    const pages = [], tplPages = [];
    if (mode === 'tiled') {
      const T = templateGroup(W, H, R, 1), tw = Math.floor(cw) - 1, th = Math.floor(ch) - (F.unit === 'in' ? 26 : 18);
      const cols = Math.ceil(T.w / tw), rows = Math.ceil(T.h / th);
      const ox = (cols * tw - T.w) / 2, oy = (rows * th - T.h) / 2;
      for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
        const x = q * tw - ox, y = r * th - oy;
        // keep tiles that hold a nail or its number, or the centre mark
        const hasCentre = T.cx >= x && T.cx <= x + tw && T.cy >= y && T.cy <= y + th;
        const hasNail = T.pts.some(([px, py]) => px >= x - BAND && px <= x + tw + BAND && py >= y - BAND && py <= y + th + BAND);
        if (!hasCentre && !hasNail) continue;
        tplPages.push('<p class="tlabel">Template · row ' + (r + 1) + ' of ' + rows + ', column ' + (q + 1) + ' of ' + cols + '</p>' +
          '<div class="tile"><svg xmlns="http://www.w3.org/2000/svg" width="' + tw + 'mm" height="' + th + 'mm" viewBox="' + x.toFixed(2) + ' ' + y.toFixed(2) + ' ' + tw + ' ' + th + '">' +
          '<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + tw + '" height="' + th + '" fill="none" stroke="#000" stroke-width="0.3"/>' +
          T.g + '</svg></div>' + scaleBar(F.unit));
      }
    } else {
      const T0 = templateGroup(W, H, R, 1), k = Math.min(cw / T0.w, (ch - 30) / T0.h);
      const every = Math.min(3.2, Math.max(1.4, T0.sp * 0.72)) * k < 1.8 ? 5 : 1;
      const T = every === 1 ? T0 : templateGroup(W, H, R, every);
      tplPages.push('<p class="tlabel">Template · reduced to fit the page, not to scale' + (every > 1 ? ' · every 5th nail numbered' : '') + '</p>' +
        '<div class="tile"><svg xmlns="http://www.w3.org/2000/svg" width="' + (T.w * k).toFixed(1) + 'mm" height="' + (T.h * k).toFixed(1) + 'mm" viewBox="0 0 ' + T.w + ' ' + T.h + '">' + T.g + '</svg></div>');
    }
    // cover page
    const spacing = R.lay.P * H / n, img = renderPNG(1200).toDataURL('image/png');
    const iw = R.A >= 1 ? 80 : 80 * R.A, ih = R.A >= 1 ? 80 / R.A : 80;
    const steps = mode === 'tiled'
      ? ['Print this guide at 100% scale. In the print dialog, choose “Actual size” or a scale of 100%. Check the scale bar on each template page with a ruler.',
         'Trim each template page along its border. Tape the pages together edge to edge, in the order given by the row and column labels.']
      : ['The template on the next page is reduced to fit the paper. Use it to see the nail numbering. For a full-size template, choose “Full size, tiled”.'];
    steps.push('Fix the template to the board. Put a nail at each dot. ' + NUMBERING.replace(';', ', and'));
    if (multi) steps.push('Wind the threads in the order listed below. For each thread, tie it to the first nail of its sequence, wind it to each nail in order, keeping the thread taut, then tie it off at the last nail. The last thread lies on top.');
    else steps.push('Tie the thread to nail ' + R.threads[0].order[0] + '. Wind it to each nail in the winding sequence, in order, keeping the thread taut.', 'Tie off the thread at the last nail.');
    const sw = (c) => '<span class="gsw" style="background:' + c + '"></span>', tm = threadMeters(R);
    const threadRows = '<dt>' + (multi ? 'Threads' : 'Thread') + '</dt><dd>' + R.threads.map((t, i) => sw(t.color) + (multi ? (i + 1) + '. ' : '') + dmcLabel(t.code) + ', ' + fmt(t.count) + ' lines').join('<br>') + '</dd>';
    const shop = '<dt>Shopping list</dt><dd>' + R.threads.map((t, i) => dmcLabel(t.code) + ': ' + meters(tm[i]) + ', ' + skeins(tm[i]) + ' of six-strand floss').join('<br>') +
      '<br><span class="gnote">Line lengths at this frame size plus 10% for knots and winding.</span></dd>';
    pages.push('<div class="gpage ghead"><h1>String art build guide</h1><dl>' +
      '<dt>Frame</dt><dd>' + frameText() + '</dd><dt>Nails</dt><dd>' + fmt(n) + '</dd><dt>Nail spacing</dt><dd>' +
      (F.unit === 'in' ? (spacing / 25.4).toFixed(2) + ' in' : spacing.toFixed(1) + ' mm') + ' along the edge</dd>' +
      '<dt>Lines</dt><dd>' + fmt(L) + '</dd>' + threadRows + '<dt>Board</dt><dd>' + sw(R.board) + BOARDS[R.boardKey].name + '</dd>' + shop +
      '<dt>Template</dt><dd>' + (mode === 'tiled' ? 'Full size, ' + tplPages.length + ' pages' : 'Reduced to fit one page') + '</dd></dl>' +
      '<ol>' + steps.map((t) => '<li>' + t + '</li>').join('') + '</ol>' +
      '<img src="' + img + '" alt="" style="width:' + iw.toFixed(1) + 'mm;height:' + ih.toFixed(1) + 'mm;display:block;margin-top:4mm"></div>');
    tplPages.forEach((t) => pages.push('<div class="gpage">' + t + '</div>'));
    // winding sequence, one block per thread
    const COLS = 8, ROWS = Math.floor((ch - 24) / 3.73), per = COLS * ROWS;
    R.threads.forEach((t, ti) => {
      const name = multi ? ' · thread ' + (ti + 1) + ' of ' + R.threads.length + ': ' + dmcLabel(t.code) : '';
      for (let p = 0, k = 1; k <= t.count; p++) {
        let cells = '';
        for (let i = 0; i < per && k <= t.count; i++, k++)
          cells += '<div' + (k % 100 === 1 && k > 1 ? ' class="hund"' : '') + '><span class="s">' + k + '</span><span class="n">' + t.order[k] + '</span></div>';
        pages.push('<div class="gpage seq"><h2>' + (multi ? sw(t.color) : '') + 'Winding sequence' + name + (p ? ' (continued)' : '') + '</h2>' +
          (p ? '' : '<p style="margin:0 0 3mm">Start at nail ' + t.order[0] + '. Each row gives the step number and the nail to wind to. A line marks every 100 steps.</p>') +
          '<div class="cols" style="column-count:' + COLS + '">' + cells + '</div></div>');
      }
    });
    $('guide').innerHTML = pages.join('');
    let st = $('page-style');
    if (!st) { st = document.createElement('style'); st.id = 'page-style'; document.head.appendChild(st); }
    st.textContent = '@page{size:' + paper.css + ';margin:' + MARGIN + 'mm}';
    return pages.length;
  }
  $('print').addEventListener('click', () => { buildGuide(); window.print(); });

  // ---------- init ----------
  renderThreads(); syncFrameInputs(); frameChanged();
  window.__stringArt = { buildGuide, nailOrderText, nailLayout, state: S, frame: F, colors: C, dmc: DMC, nearestDMC };
})();
