/* String Art Maker: user interface, crop, rendering, downloads and build guide.
   The solver runs in worker.js. Nothing is sent over the network. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const TARGET = 500;           // working resolution of the photo, in pixels
  const fmt = (n) => n.toLocaleString('en-US');

  // ---------- state ----------
  const S = { img: null, zoom: 1, cx: 0, cy: 0, sample: false,
              order: null, nails: 0, lines: 0, strength: 0.08, running: false, worker: null };

  // ---------- crop ----------
  const crop = $('crop'), cc = $('crop-canvas'), cctx = cc.getContext('2d');
  const V = cc.width;

  function baseScale(view) { return view / Math.min(S.img.width, S.img.height); }
  function clampCenter() {
    const s = baseScale(V) * S.zoom, half = V / 2 / s;
    S.cx = Math.min(Math.max(S.cx, half), S.img.width - half);
    S.cy = Math.min(Math.max(S.cy, half), S.img.height - half);
  }
  function drawImageTo(ctx, view) {
    const s = baseScale(view) * S.zoom;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, view, view);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(S.img, view / 2 - S.cx * s, view / 2 - S.cy * s, S.img.width * s, S.img.height * s);
  }
  function drawCrop() {
    if (!S.img) { cctx.clearRect(0, 0, V, V); return; }
    clampCenter();
    drawImageTo(cctx, V);
    cctx.save();
    cctx.beginPath(); cctx.rect(0, 0, V, V); cctx.arc(V / 2, V / 2, V / 2 - 1, 0, Math.PI * 2, true);
    cctx.fillStyle = 'rgba(255,255,255,0.78)'; cctx.fill('evenodd');
    cctx.beginPath(); cctx.arc(V / 2, V / 2, V / 2 - 1, 0, Math.PI * 2);
    cctx.lineWidth = 2; cctx.strokeStyle = '#111'; cctx.stroke();
    cctx.restore();
  }
  function setImage(img, isSample) {
    S.img = img; S.sample = isSample; S.zoom = 1;
    S.cx = img.width / 2; S.cy = img.height / 2;
    $('zoom').value = 1; $('zoom-o').textContent = '1.00×';
    $('crop-empty').hidden = true; $('credit').hidden = !isSample;
    $('run').disabled = false;
    drawCrop();
    setStatus('Position the photo, then select Make string art.');
  }
  function loadURL(url, isSample) {
    const img = new Image();
    img.onload = () => setImage(img, isSample);
    img.onerror = () => setStatus('This file could not be read as an image.');
    img.src = url;
  }
  function loadFile(file) {
    if (!file || !/^image\//.test(file.type)) { setStatus('Choose an image file (JPEG, PNG or similar).'); return; }
    loadURL(URL.createObjectURL(file), false);
  }
  $('file').addEventListener('change', (e) => loadFile(e.target.files[0]));
  $('sample').addEventListener('click', () => loadURL('sample-einstein.jpg', true));
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
      const k = V / crop.clientWidth / (baseScale(V) * S.zoom);
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
    const step = 10 / (baseScale(V) * S.zoom), keys = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
    if (keys[e.key]) { e.preventDefault(); S.cx += keys[e.key][0] * step; S.cy += keys[e.key][1] * step; drawCrop(); }
    else if (e.key === '+' || e.key === '=') setZoom(S.zoom * 1.1);
    else if (e.key === '-') setZoom(S.zoom / 1.1);
  });
  $('zoom').addEventListener('input', (e) => setZoom(+e.target.value));

  // ---------- settings ----------
  const bind = (id, f) => { const el = $(id), o = $(id + '-o'); const u = () => (o.textContent = f(+el.value)); el.addEventListener('input', u); u(); };
  bind('nails', fmt); bind('lines', fmt); bind('dark', String);

  // ---------- preprocessing: photo -> darkness map ----------
  function darknessMap() {
    const c = document.createElement('canvas'); c.width = c.height = TARGET;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    drawImageTo(ctx, TARGET);
    const d = ctx.getImageData(0, 0, TARGET, TARGET).data;
    const N = TARGET * TARGET, g = new Float32Array(N), inside = new Uint8Array(N), hist = new Uint32Array(256);
    const m = (TARGET - 1) / 2, r2 = (TARGET / 2) * (TARGET / 2);
    let count = 0;
    for (let y = 0, i = 0; y < TARGET; y++) for (let x = 0; x < TARGET; x++, i++) {
      const v = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
      g[i] = v;
      if ((x - m) * (x - m) + (y - m) * (y - m) <= r2) { inside[i] = 1; hist[v | 0]++; count++; }
    }
    // Stretch contrast so the darkest and lightest 1% of pixels become black and white.
    let lo = 0, hi = 255, acc = 0;
    for (; lo < 255; lo++) { acc += hist[lo]; if (acc > count * 0.01) break; }
    for (acc = 0; hi > 0; hi--) { acc += hist[hi]; if (acc > count * 0.01) break; }
    if (hi <= lo) { lo = 0; hi = 255; }
    const dark = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      if (!inside[i]) continue;
      let a = (g[i] - lo) / (hi - lo); a = a < 0 ? 0 : a > 1 ? 1 : a;
      dark[i] = 1 - Math.pow(a, 1.8);  // gamma 1.8 darkens mid-tones
    }
    return dark;
  }

  // ---------- result rendering ----------
  const out = $('out'), octx = out.getContext('2d');
  function geom(R, n) {
    const c = R / 2, r = R / 2 - R * 0.006, X = new Float32Array(n), Y = new Float32Array(n);
    for (let i = 0; i < n; i++) { const t = 2 * Math.PI * i / n; X[i] = c + r * Math.cos(t); Y[i] = c - r * Math.sin(t); }
    return { X, Y };
  }
  function threadStyle(ctx, R, strength) {
    ctx.lineWidth = Math.max(0.5, R / 1400);
    ctx.strokeStyle = 'rgba(0,0,0,' + Math.min(0.9, strength * 2.2) + ')';
    ctx.lineCap = 'round';
  }
  function clearOut(n) {
    const R = out.width;
    octx.fillStyle = '#fff'; octx.fillRect(0, 0, R, R);
    if (n) drawNails(octx, R, n);
  }
  function drawNails(ctx, R, n) {
    const { X, Y } = geom(R, n);
    ctx.fillStyle = '#9a9a9a';
    for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(X[i], Y[i], Math.max(1, R / 900), 0, Math.PI * 2); ctx.fill(); }
  }
  function drawSegments(ctx, R, n, order, from, to, strength) {
    const { X, Y } = geom(R, n);
    threadStyle(ctx, R, strength);
    for (let k = from; k < to; k++) {
      const a = order[k], b = order[k + 1];
      ctx.beginPath(); ctx.moveTo(X[a], Y[a]); ctx.lineTo(X[b], Y[b]); ctx.stroke();
    }
  }

  // ---------- run ----------
  let drawn = 0, received = 0, finished = false, timing = null, raf = 0, perFrame = 20;
  function setStatus(t) { $('status').textContent = t; }
  function setBar(f) { $('bar').style.width = (f * 100).toFixed(1) + '%'; }
  function setOutputsEnabled(on) { ['dl-png', 'dl-txt', 'print'].forEach((id) => ($(id).disabled = !on)); $('guide-note').hidden = on; }

  function start() {
    if (!S.img) return;
    if (S.worker) S.worker.terminate();
    cancelAnimationFrame(raf);
    const n = +$('nails').value, L = +$('lines').value, strength = +$('dark').value / 100;
    Object.assign(S, { nails: n, lines: L, strength, order: new Uint16Array(L + 1), running: true });
    drawn = 0; received = 0; finished = false; timing = null;
    perFrame = Math.max(10, Math.ceil(L / 180));
    setOutputsEnabled(false); clearOut(n); setBar(0);
    setStatus('Preparing lines…');
    $('run').textContent = 'Making string art…'; $('run').disabled = true;
    const dark = darknessMap();
    const w = new Worker('worker.js'); S.worker = w;
    w.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'prep') { setStatus('Preparing lines: ' + Math.round(m.done * 100) + '%'); setBar(m.done * 0.1); }
      else if (m.type === 'lines') { S.order.set(m.nails, received + 1); received += m.nails.length; }
      else if (m.type === 'done') { finished = true; timing = m; S.lines = m.count; w.terminate(); S.worker = null; }
    };
    w.onerror = () => { setStatus('The calculation stopped because of an error. Try fewer nails or lines.'); stop(); };
    w.postMessage({ type: 'run', dark: dark.buffer, size: TARGET, nails: n, lines: L, strength, skip: Math.round(n * 20 / 288) }, [dark.buffer]);
    if (window.matchMedia('(max-width: 860px)').matches) $('h-res').scrollIntoView({ behavior: 'smooth', block: 'start' });
    raf = requestAnimationFrame(frame);
  }
  function stop() { S.running = false; $('run').textContent = 'Make string art'; $('run').disabled = !S.img; }
  function frame() {
    const to = Math.min(received, drawn + perFrame);
    if (to > drawn) { drawSegments(octx, out.width, S.nails, S.order, drawn, to, S.strength); drawn = to; }
    if (drawn > 0) {
      setStatus('Line ' + fmt(drawn) + ' of ' + fmt(S.lines));
      setBar(0.1 + 0.9 * drawn / S.lines);
    }
    if (finished && drawn >= S.lines) {
      setBar(1); stop(); setOutputsEnabled(true);
      setStatus('Finished: ' + fmt(S.lines) + ' lines on ' + fmt(S.nails) + ' nails. Calculated in ' + (timing.totalMs / 1000).toFixed(1) + ' s.');
      document.body.dataset.state = 'done';
      return;
    }
    raf = requestAnimationFrame(frame);
  }
  $('run').addEventListener('click', start);

  // ---------- downloads ----------
  function save(blob, name) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }
  const baseName = () => 'string-art-' + S.nails + '-nails-' + S.lines + '-lines';
  function renderPNG(R) {
    const c = document.createElement('canvas'); c.width = c.height = R;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, R, R);
    ctx.save(); ctx.scale(R / out.width, R / out.width);
    drawNails(ctx, out.width, S.nails);
    drawSegments(ctx, out.width, S.nails, S.order, 0, S.lines, S.strength);
    ctx.restore();
    return c;
  }
  $('dl-png').addEventListener('click', () => renderPNG(2400).toBlob((b) => save(b, baseName() + '.png'), 'image/png'));
  $('dl-txt').addEventListener('click', () => {
    const head = ['# String art nail order',
      '# ' + S.nails + ' nails, numbered 0 to ' + (S.nails - 1) + ', counter-clockwise from the 3 o\'clock position.',
      '# ' + S.lines + ' lines. One nail number per row, in winding order, starting with the first nail.'];
    const body = Array.from(S.order.subarray(0, S.lines + 1)).join('\n');
    save(new Blob([head.join('\n') + '\n' + body + '\n'], { type: 'text/plain' }), baseName() + '-nail-order.txt');
  });

  // ---------- build guide ----------
  const PAPER = { letter: { w: 215.9, h: 279.4, css: 'letter' }, a4: { w: 210, h: 297, css: 'A4' } };
  const MARGIN = 10, BAND = 14;

  function templateGroup(D, n, labelEvery) {
    const R = D / 2, S0 = D + 2 * BAND, c = S0 / 2, sp = Math.PI * D / n;
    const fs = labelEvery > 1 ? Math.min(4.5, sp * labelEvery * 0.5) : Math.min(3.2, Math.max(1.4, sp * 0.72));
    let s = '<g font-family="Inter,Helvetica,Arial,sans-serif" fill="#000">';
    s += '<circle cx="' + c + '" cy="' + c + '" r="' + R + '" fill="none" stroke="#bbb" stroke-width="0.2"/>';
    s += '<path d="M' + (c - 4) + ' ' + c + 'h8M' + c + ' ' + (c - 4) + 'v8" stroke="#000" stroke-width="0.25"/>';
    for (let i = 0; i < n; i++) {
      const t = 2 * Math.PI * i / n, co = Math.cos(t), si = Math.sin(t);
      const x = c + R * co, y = c - R * si;
      s += '<circle cx="' + x.toFixed(2) + '" cy="' + y.toFixed(2) + '" r="0.55"/>';
      if (i % labelEvery) continue;
      const lx = c + (R + 1.6) * co, ly = c - (R + 1.6) * si, deg = -t * 180 / Math.PI;
      const left = co < -1e-9, rot = left ? deg + 180 : deg;
      s += '<text x="' + lx.toFixed(2) + '" y="' + ly.toFixed(2) + '" font-size="' + fs.toFixed(2) + '" dominant-baseline="central"' +
        (left ? ' text-anchor="end"' : '') + (i % 10 === 0 ? ' font-weight="700"' : '') +
        ' transform="rotate(' + rot.toFixed(2) + ' ' + lx.toFixed(2) + ' ' + ly.toFixed(2) + ')">' + i + '</text>';
    }
    return { g: s + '</g>', size: S0, center: c, R };
  }
  function scaleBar() {
    return '<svg class="scale" xmlns="http://www.w3.org/2000/svg" width="106mm" height="7mm" viewBox="-3 -3 106 7" font-family="Inter,Helvetica,Arial,sans-serif" font-size="2.6">' +
      '<path d="M0 0h100M0 -1.8v1.8M50 -1.2v1.2M100 -1.8v1.8" stroke="#000" stroke-width="0.3" fill="none"/>' +
      '<text x="0" y="3">0</text><text x="100" y="3" text-anchor="end">100 mm: check with a ruler</text></svg>';
  }
  function buildGuide() {
    const D = +$('diam').value, paper = PAPER[$('paper').value], mode = $('mode').value, n = S.nails, L = S.lines;
    const cw = paper.w - 2 * MARGIN, ch = paper.h - 2 * MARGIN;
    const pages = [];
    // template
    let tplPages = [];
    if (mode === 'tiled') {
      const T = templateGroup(D, n, 1), W = Math.floor(cw) - 1, H = Math.floor(ch) - 18;
      const cols = Math.ceil(T.size / W), rows = Math.ceil(T.size / H);
      const ox = (cols * W - T.size) / 2, oy = (rows * H - T.size) / 2;
      for (let r = 0; r < rows; r++) for (let q = 0; q < cols; q++) {
        const x = q * W - ox, y = r * H - oy;
        // keep tiles that contain part of the nail ring or the centre mark
        const nx = Math.max(x, Math.min(T.center, x + W)), ny = Math.max(y, Math.min(T.center, y + H));
        const near = Math.hypot(nx - T.center, ny - T.center);
        const far = Math.max(...[[x, y], [x + W, y], [x, y + H], [x + W, y + H]].map(([a, b]) => Math.hypot(a - T.center, b - T.center)));
        const hasCentre = near === 0;
        if (!hasCentre && (near > T.R + BAND || far < T.R - 3)) continue;
        tplPages.push({ r, q, html: '<p class="tlabel">Template · row ' + (r + 1) + ' of ' + rows + ', column ' + (q + 1) + ' of ' + cols + '</p>' +
          '<div class="tile"><svg xmlns="http://www.w3.org/2000/svg" width="' + W + 'mm" height="' + H + 'mm" viewBox="' + x.toFixed(2) + ' ' + y.toFixed(2) + ' ' + W + ' ' + H + '">' +
          '<rect x="' + x.toFixed(2) + '" y="' + y.toFixed(2) + '" width="' + W + '" height="' + H + '" fill="none" stroke="#000" stroke-width="0.3"/>' +
          T.g + '</svg></div>' + scaleBar() });
      }
    } else {
      const side = Math.min(cw, ch - 30), T0 = templateGroup(D, n, 1);
      const every = Math.min(3.2, Math.max(1.4, Math.PI * D / n * 0.72)) * side / T0.size < 1.8 ? 5 : 1;
      const T = every === 1 ? T0 : templateGroup(D, n, every);
      tplPages.push({ html: '<p class="tlabel">Template · reduced to fit the page, not to scale' + (every > 1 ? ' · every 5th nail numbered' : '') + '</p>' +
        '<div class="tile"><svg xmlns="http://www.w3.org/2000/svg" width="' + side.toFixed(1) + 'mm" height="' + side.toFixed(1) + 'mm" viewBox="0 0 ' + T.size + ' ' + T.size + '">' + T.g + '</svg></div>' });
    }
    // cover page
    const sp = (Math.PI * D / n).toFixed(1), img = renderPNG(1200).toDataURL('image/png');
    const steps = mode === 'tiled'
      ? ['Print this guide at 100% scale. In the print dialog, choose “Actual size” or a scale of 100%. Check the 100 mm scale bar on each template page with a ruler.',
         'Trim each template page along its border. Tape the pages together edge to edge, in the order given by the row and column labels.']
      : ['The template on the next page is reduced to fit the paper. Use it to see the nail numbering. For a full-size template, choose “Full size, tiled”.'];
    steps.push('Fix the template to the board. Put a nail at each dot. Nail 0 is at the 3 o’clock position, and the numbers increase counter-clockwise.',
      'Tie the thread to nail ' + S.order[0] + '. Wind it to each nail in the winding sequence, in order, keeping the thread taut.',
      'Tie off the thread at the last nail.');
    pages.push('<div class="gpage ghead"><h1>String art build guide</h1><dl>' +
      '<dt>Nails</dt><dd>' + fmt(n) + '</dd><dt>Lines</dt><dd>' + fmt(L) + '</dd><dt>Diameter</dt><dd>' + D / 10 + ' cm</dd>' +
      '<dt>Nail spacing</dt><dd>' + sp + ' mm along the circle</dd><dt>Template</dt><dd>' + (mode === 'tiled' ? 'Full size, ' + tplPages.length + ' pages' : 'Reduced to fit one page') + '</dd>' +
      '<dt>Sequence</dt><dd>' + fmt(L + 1) + ' nail numbers, starting at nail ' + S.order[0] + '</dd></dl>' +
      '<ol>' + steps.map((t) => '<li>' + t + '</li>').join('') + '</ol>' +
      '<img src="' + img + '" alt="" style="width:70mm;height:70mm;display:block;margin-top:4mm"></div>');
    tplPages.forEach((t) => pages.push('<div class="gpage">' + t.html + '</div>'));
    // winding sequence
    const COLS = 8, ROWS = Math.floor((ch - 22) / 3.73), per = COLS * ROWS;
    for (let p = 0, k = 1; k <= L; p++) {
      let cells = '';
      for (let i = 0; i < per && k <= L; i++, k++)
        cells += '<div' + (k % 100 === 1 && k > 1 ? ' class="hund"' : '') + '><span class="s">' + k + '</span><span class="n">' + S.order[k] + '</span></div>';
      pages.push('<div class="gpage seq"><h2>Winding sequence' + (p ? ' (continued)' : '') + '</h2>' +
        (p ? '' : '<p style="margin:0 0 3mm">Start at nail ' + S.order[0] + '. Each row gives the step number and the nail to wind to. A line marks every 100 steps.</p>') +
        '<div class="cols" style="column-count:' + COLS + '">' + cells + '</div></div>');
    }
    $('guide').innerHTML = pages.join('');
    let st = $('page-style');
    if (!st) { st = document.createElement('style'); st.id = 'page-style'; document.head.appendChild(st); }
    st.textContent = '@page{size:' + paper.css + ';margin:' + MARGIN + 'mm}';
    return pages.length;
  }
  $('print').addEventListener('click', () => { buildGuide(); window.print(); });
  window.__stringArt = { buildGuide, state: S };
})();
