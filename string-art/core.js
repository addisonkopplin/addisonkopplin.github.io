/* String art core, shared by the page (app.js) and the workers (worker.js):
   nail layout, color separation, the line solver, a model of the preview image,
   and a score of how closely a preview matches the photo. No network access. */
(function (G) {
  'use strict';
  const SA = {};

  // ---------- nails ----------
  /* Nail layout for a frame of width A and height 1 (A = width / height).
     Returns positions as fractions of the frame width (u, to the right) and height (v, down),
     the outward direction at each nail (radians, counter-clockwise, 0 = right), the frame
     sides each nail lies on (bit mask, rectangles only), and the perimeter in height units.
     Nails are equally spaced by arc length, nail 0 at the middle of the right side,
     numbered counter-clockwise. */
  SA.nailLayout = function (shape, n, A) {
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
        const cx = x < eps ? 4 : x > A - eps ? 1 : 0, cy = y < eps ? 2 : y > 1 - eps ? 8 : 0;
        if (cx && cy) { edge[i] = cx | cy; dir[i] = Math.atan2(cy === 2 ? 1 : -1, cx === 1 ? 1 : -1); }
      }
    }
    return { u, v, dir, edge, P };
  };
  // working size in pixels for frame proportions A, longer side = T
  SA.workSize = (A, T) => (A >= 1 ? [T, Math.max(1, Math.round(T / A))] : [Math.max(1, Math.round(T * A)), T]);
  // nail positions in pixels of a w x h working image (float); the solver rounds them
  SA.nailPx = function (lay, w, h) {
    const n = lay.u.length, X = new Float64Array(n), Y = new Float64Array(n);
    for (let i = 0; i < n; i++) { X[i] = (w - 1) / 2 + (lay.u[i] - 0.5) * (w - 2); Y[i] = (h - 1) / 2 + (lay.v[i] - 0.5) * (h - 2); }
    return { X, Y };
  };
  SA.DEPOSIT = 0.65;   // need removed per line, per unit of strength (one thread); set by benchmark
  SA.skipFor = (n) => Math.round(n * 20 / 288);
  SA.insideMask = function (shape, w, h) {
    const m = new Uint8Array(w * h);
    if (shape === 'circle' || shape === 'ellipse') {
      const cx = (w - 1) / 2, cy = (h - 1) / 2, rx = w / 2, ry = h / 2;
      for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) { const a = (x - cx) / rx, b = (y - cy) / ry; m[i] = a * a + b * b <= 1 ? 1 : 0; }
    } else m.fill(1);
    return m;
  };

  // ---------- color ----------
  const hex2rgb = SA.hex2rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const lum = SA.lum = (h) => { const [r, g, b] = hex2rgb(h); return 0.299 * r + 0.587 * g + 0.114 * b; };
  SA.lightOnDark = (thread, board) => lum(thread) > lum(board);
  const LIN4 = new Float64Array(4097);
  for (let i = 0; i <= 4096; i++) { const x = i / 4096; LIN4[i] = x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }
  // sRGB value (0-255, float) to linear light, by table with linear interpolation
  const lin = (x) => { x = x * (4096 / 255); if (x <= 0) return 0; if (x >= 4096) return 1; const i = x | 0, f = x - i; return LIN4[i] + (LIN4[i + 1] - LIN4[i]) * f; };
  const ft = (x) => (x > 0.008856 ? Math.cbrt(x) : 7.787 * x + 16 / 116);
  // sRGB (0-255, float allowed) to CIELAB (D65), written into out[o..o+2]
  function labInto(r, g, b, out, o) {
    r = lin(r); g = lin(g); b = lin(b);
    const X = ft((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), Y = ft(0.2126 * r + 0.7152 * g + 0.0722 * b), Z = ft((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
    out[o] = 116 * Y - 16; out[o + 1] = 500 * (X - Y); out[o + 2] = 200 * (Y - Z);
  }
  SA.lab = function (hex) { const c = hex2rgb(hex), o = [0, 0, 0]; labInto(c[0], c[1], c[2], o, 0); return o; };

  // Luminance range that clips the darkest and lightest 1% of pixels inside the frame.
  SA.levels = function (d, inside) {
    const hist = new Uint32Array(256); let count = 0;
    for (let i = 0; i < inside.length; i++) if (inside[i]) { hist[(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]) | 0]++; count++; }
    let lo = 0, hi = 255, acc = 0;
    for (; lo < 255; lo++) { acc += hist[lo]; if (acc > count * 0.01) break; }
    for (acc = 0; hi > 0; hi--) { acc += hist[hi]; if (acc > count * 0.01) break; }
    if (hi <= lo) { lo = 0; hi = 255; }
    return [lo, hi];
  };
  // One thread: coverage follows the photo's brightness. A dark thread on a light board covers
  // the dark parts; a light thread on a dark board covers the light parts.
  SA.monoMap = function (d, inside, light) {
    const [lo, hi] = SA.levels(d, inside), N = inside.length, map = new Float32Array(N);
    for (let i = 0; i < N; i++) {
      if (!inside[i]) continue;
      let a = (0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2] - lo) / (hi - lo); a = a < 0 ? 0 : a > 1 ? 1 : a;
      map[i] = light ? 1 - Math.pow(1 - a, 1.8) : 1 - Math.pow(a, 1.8);  // exponent 1.8 strengthens mid-tones
    }
    return [map];
  };
  function projectCapped(a) {   // project onto {a_k >= 0, sum a_k <= 1}
    for (let k = 0; k < a.length; k++) if (a[k] < 0) a[k] = 0;
    let s = 0; for (let k = 0; k < a.length; k++) s += a[k];
    if (s <= 1) return;
    const z = Array.from(a).sort((p, q) => q - p); let cum = 0, th = 0;
    for (let j = 0; j < z.length; j++) { cum += z[j]; const t = (cum - 1) / (j + 1); if (z[j] - t > 0) th = t; }
    for (let k = 0; k < a.length; k++) a[k] = Math.max(0, a[k] - th);
  }
  /* Coverages a_k >= 0, sum <= 1, so that board + sum a_k (thread_k - board) is closest to T
     (sRGB, 0-1). Projected gradient descent. Returns the squared error; a holds the result. */
  function mix(T, B, D, a, iters, eta, r) {
    const K = D.length;
    a.fill(1 / (K + 1));
    for (let it = 0; it < iters; it++) {
      for (let c = 0; c < 3; c++) { let v = B[c] - T[c]; for (let k = 0; k < K; k++) v += a[k] * D[k][c]; r[c] = v; }
      for (let k = 0; k < K; k++) a[k] -= eta * (r[0] * D[k][0] + r[1] * D[k][1] + r[2] * D[k][2]);
      projectCapped(a);
    }
  }
  /* Several threads: coverage of each thread color per pixel, from a 32 x 32 x 32 lookup table.
     The photo's brightness range is first mapped onto the range the threads and board can show. */
  const lutCache = new Map();
  SA.multiMaps = function (d, inside, threads, board) {
    const K = threads.length, B = hex2rgb(board).map((x) => x / 255);
    const D = threads.map((t) => hex2rgb(t).map((x, c) => x / 255 - B[c]));
    let tr = 0; for (const dd of D) for (const x of dd) tr += x * x;
    const eta = 1 / Math.max(tr, 1e-6), Q = 32, key = board + threads.join('');
    // table entries are computed when first needed (NaN = not yet computed)
    let lut = lutCache.get(key);
    if (!lut) {
      lut = new Float32Array(Q * Q * Q * K).fill(NaN);
      if (lutCache.size > 12) lutCache.clear();
      lutCache.set(key, lut);
    }
    const a = new Float64Array(K), r = [0, 0, 0];
    const entry = (ri, gi, bi) => {
      const o = ((ri * Q + gi) * Q + bi) * K;
      if (lut[o] !== lut[o]) {
        mix([ri / (Q - 1), gi / (Q - 1), bi / (Q - 1)], B, D, a, 150, eta, r);
        for (let k = 0; k < K; k++) lut[o + k] = a[k];
      }
      return o;
    };
    const [lo, hi] = SA.levels(d, inside), N = inside.length;
    const L = [board].concat(threads).map((h) => lum(h) / 255), tlo = Math.min(...L), thi = Math.max(...L);
    const BOOST = 1.8, GAM = 1.3;
    const q = (x) => { x = (x - lo) / (hi - lo); x = x < 0 ? 0 : x > 1 ? 1 : x; x = tlo + (thi - tlo) * Math.pow(x, GAM); return Math.round(x * (Q - 1)); };
    const maps = threads.map(() => new Float32Array(N));
    for (let i = 0; i < N; i++) {
      if (!inside[i]) continue;
      const o = entry(q(d[i * 4]), q(d[i * 4 + 1]), q(d[i * 4 + 2]));
      for (let k = 0; k < K; k++) maps[k][i] = 1 - Math.pow(1 - lut[o + k], BOOST);
    }
    return maps;
  };
  SA.maps = function (d, inside, threads, board) {
    return threads.length > 1 ? SA.multiMaps(d, inside, threads, board) : SA.monoMap(d, inside, SA.lightOnDark(threads[0], board));
  };
  // Lines are shared out in proportion to each map's total coverage, at least 5% each.
  SA.budgets = function (maps, L) {
    const s = maps.map((m) => { let t = 0; for (let i = 0; i < m.length; i++) t += m[i]; return t; });
    const tot = s.reduce((p, q) => p + q, 0) || 1, min = 0.05;
    let f = s.map((x) => Math.max(min, x / tot)); const fs = f.reduce((p, q) => p + q, 0); f = f.map((x) => x / fs);
    const b = f.map((x) => Math.round(x * L)); b[b.length - 1] += L - b.reduce((p, q) => p + q, 0);
    return b;
  };

  // ---------- solver ----------
  /* Pixels under every usable nail pair. A pair is usable if the nails are more than `skip`
     apart along the frame and do not lie on the same straight side. Each line steps one pixel
     along its major axis. NX, NY: integer nail positions. */
  SA.prepare = function (n, NX, NY, edge, w, skip, onProgress) {
    const pairs = n * (n - 1) / 2, offs = new Uint32Array(pairs + 1);
    let p = 0, total = 0;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      offs[p++] = total;
      let d = j - i; if (n - d < d) d = n - d;
      if (d > skip && !(edge[i] & edge[j])) total += Math.max(Math.abs(NX[j] - NX[i]), Math.abs(NY[j] - NY[i])) + 1;
    }
    offs[pairs] = total;
    const pix = new Uint32Array(total);
    p = 0;
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++, p++) {
        if (offs[p + 1] === offs[p]) continue;
        const x0 = NX[i], y0 = NY[i], dx = NX[j] - x0, dy = NY[j] - y0;
        const L = Math.max(Math.abs(dx), Math.abs(dy));
        let q = offs[p];
        for (let s = 0; s <= L; s++) { const f = L === 0 ? 0 : s / L; pix[q++] = Math.round(y0 + dy * f) * w + Math.round(x0 + dx * f); }
      }
      if (onProgress && i % 12 === 0) onProgress(i / n);
    }
    const rowStart = new Uint32Array(n);
    for (let i = 0, acc = 0; i < n; i++) { rowStart[i] = acc; acc += n - 1 - i; }
    return { n, offs, pix, rowStart };
  };
  /* Greedy line choice, one thread at a time in winding order. From the current nail, every
     line to another nail is scored by the average remaining need along it; the best line is
     taken and the need under it is reduced by `strength`.
     o.clip: need stops at zero. Otherwise need can go below zero, so a line over an area that
       already has enough thread scores lower. Default: below zero with one thread (it scores
       better there), stop at zero with several threads (it scores better there).
     o.repeat: allow the same nail pair twice in one thread.
     With several threads, a line also scores lower where it crosses areas that need the other
     threads more (o.penalty). onLine(color, k, order) is called after every line. */
  SA.solve = function (P, maps, bud, strength, o, onLine) {
    o = o || {};
    const n = P.n, offs = P.offs, pix = P.pix, rowStart = P.rowStart, K = maps.length;
    const lam = K > 1 ? (o.penalty == null ? 0.25 : o.penalty) : 0, clip = o.clip == null ? K > 1 : !!o.clip;
    const orig = K > 1 ? maps.map((m) => m.slice()) : null;
    const dep = strength * (o.deposit == null ? SA.DEPOSIT : o.deposit);
    const orders = [], counts = []; let carry = 0;
    for (let c = 0; c < K; c++) {
      const dark = maps[c], lines = bud[c] + carry;
      let val = dark;
      if (lam > 0) {
        val = new Float32Array(dark.length);
        for (let i = 0; i < val.length; i++) { let x = 0; for (let j = 0; j < K; j++) if (j !== c) x += orig[j][i]; x -= orig[c][i]; val[i] = dark[i] - (x > 0 ? lam * x : 0); }
      }
      const used = o.repeat ? null : new Uint8Array(offs.length);
      const order = new Uint16Array(lines + 1);
      let cur = o.start || 0, prev = -1, k = 0;
      order[0] = cur;
      if (o.onStart) o.onStart(c, order, lines);
      for (k = 0; k < lines; k++) {
        let best = 0, bj = -1, bp = 0;
        const rc = rowStart[cur];
        for (let j = 0; j < n; j++) {
          if (j === cur || j === prev) continue;
          const pr = cur < j ? rc + (j - cur - 1) : rowStart[j] + (cur - j - 1);
          const a = offs[pr], b = offs[pr + 1];
          if (a === b || (used && used[pr])) continue;
          let sum = 0;
          for (let q = a; q < b; q++) sum += val[pix[q]];
          const score = sum / (b - a);
          if (score > best) { best = score; bj = j; bp = pr; }
        }
        if (bj < 0) break; // no line adds anything
        if (used) used[bp] = 1;
        const a = offs[bp], b = offs[bp + 1];
        if (clip) {
          if (val === dark) for (let q = a; q < b; q++) { const v = dark[pix[q]] - strength; dark[pix[q]] = v > 0 ? v : 0; }
          else for (let q = a; q < b; q++) { const i = pix[q], dd = dark[i] < strength ? dark[i] : strength; dark[i] -= dd; val[i] -= dd; }
        } else {
          if (val === dark) for (let q = a; q < b; q++) dark[pix[q]] -= dep;
          else for (let q = a; q < b; q++) { const i = pix[q]; dark[i] -= dep; val[i] -= dep; }
        }
        prev = cur; cur = bj; order[k + 1] = cur;
        if (onLine) onLine(c, k + 1, order);
      }
      carry = lines - k;   // lines a thread does not use pass to the next thread
      orders.push(order); counts.push(k);
      if (o.onEnd) o.onEnd(c, k);
    }
    return { orders, counts };
  };

  // ---------- preview model ----------
  /* Renders thread lines the way the page preview draws them: lines of width 0.857 px on a
     1200 px canvas, opacity min(0.9, 2.2 x strength), drawn in winding order over the board.
     Here the image is W x H pixels and each line is spread over the two nearest pixel rows
     or columns. Returns sRGB channels (0-255). counts[t] = lines of thread t to draw. */
  SA.render = function (W, H, lay, orders, counts, colors, board, strength) {
    const N = W * H, R = new Float32Array(N), Gc = new Float32Array(N), B = new Float32Array(N);
    const b = hex2rgb(board); R.fill(b[0]); Gc.fill(b[1]); B.fill(b[2]);
    const { X, Y } = SA.nailPx(lay, W, H);
    const c0 = Math.min(0.9, strength * 2.2) * (1200 / 1400) * Math.max(W, H) / 1200;
    const put = (i, w, cr, cg, cb) => { R[i] += (cr - R[i]) * w; Gc[i] += (cg - Gc[i]) * w; B[i] += (cb - B[i]) * w; };
    for (let t = 0; t < orders.length; t++) {
      const [cr, cg, cb] = hex2rgb(colors[t]), o = orders[t], cnt = counts[t];
      for (let k = 0; k < cnt; k++) {
        let x0 = X[o[k]], y0 = Y[o[k]], x1 = X[o[k + 1]], y1 = Y[o[k + 1]];
        const dx = x1 - x0, dy = y1 - y0;
        if (Math.abs(dx) >= Math.abs(dy)) {
          if (x1 < x0) { let s = x0; x0 = x1; x1 = s; s = y0; y0 = y1; y1 = s; }
          const sl = dx === 0 ? 0 : (y1 - y0) / (x1 - x0), c = c0 * Math.sqrt(1 + sl * sl);
          for (let x = Math.ceil(x0); x <= x1; x++) {
            const y = y0 + sl * (x - x0), yi = Math.floor(y), f = y - yi;
            if (yi >= 0 && yi < H) put(yi * W + x, c * (1 - f), cr, cg, cb);
            if (yi + 1 < H && f > 0) put((yi + 1) * W + x, c * f, cr, cg, cb);
          }
        } else {
          if (y1 < y0) { let s = x0; x0 = x1; x1 = s; s = y0; y0 = y1; y1 = s; }
          const sl = (x1 - x0) / (y1 - y0), c = c0 * Math.sqrt(1 + sl * sl);
          for (let y = Math.ceil(y0); y <= y1; y++) {
            const x = x0 + sl * (y - y0), xi = Math.floor(x), f = x - xi;
            if (xi >= 0 && xi < W) put(y * W + xi, c * (1 - f), cr, cg, cb);
            if (xi + 1 < W && f > 0) put(y * W + xi + 1, c * f, cr, cg, cb);
          }
        }
      }
    }
    return [R, Gc, B];
  };

  // ---------- match score ----------
  // Gaussian blur of src weighted by mask m (normalized convolution); mb = blurred mask
  function gaussN(src, m, w, h, sigma, mb) {
    const r = Math.max(1, Math.ceil(sigma * 3)), ker = new Float32Array(2 * r + 1);
    let ks = 0; for (let i = -r; i <= r; i++) { ker[i + r] = Math.exp(-i * i / (2 * sigma * sigma)); ks += ker[i + r]; }
    for (let i = 0; i < ker.length; i++) ker[i] /= ks;
    const N = w * h, inp = new Float32Array(N), tmp = new Float32Array(N), out = new Float32Array(N);
    for (let i = 0; i < N; i++) inp[i] = m ? src[i] * m[i] : src[i];
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let s = 0;
        const k0 = x - r < 0 ? r - x : 0, k1 = x + r >= w ? r + (w - 1 - x) : 2 * r;
        for (let k = k0, i = row + x - r + k0; k <= k1; k++, i++) s += ker[k] * inp[i];
        tmp[row + x] = s;
      }
    }
    for (let y = 0; y < h; y++) {
      const k0 = y - r < 0 ? r - y : 0, k1 = y + r >= h ? r + (h - 1 - y) : 2 * r;
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let k = k0, i = (y - r + k0) * w + x; k <= k1; k++, i += w) s += ker[k] * tmp[i];
        out[y * w + x] = s;
      }
    }
    if (mb) for (let i = 0; i < N; i++) out[i] = mb[i] > 1e-4 ? out[i] / mb[i] : 0;
    return out;
  }
  SA.blur = gaussN;
  const CW = 0.5;   // weight of color (a, b) differences when fitting palettes
  /* Match score. Both images are blurred in linear light (sigma = 0.4% of the frame width, the
     scale at which single threads merge into tone at normal viewing distance) and compared
     inside the frame, leaving out the nail ring:
       dE      mean CIELAB difference (CIE76)
       ssim    structural similarity of lightness L* (window sigma 0.3% of the width)
       detail  correlation of lightness detail at two feature sizes (differences of blurs at
               0.75-2.25% and 1.5-4.5% of the width). Unaffected by overall lightness and
               contrast, so it measures whether features such as eyes and edges are drawn.
       ssimC   structural similarity of the color channels a and b
     score = dE + 40 (1 - ssim) + 60 (1 - detail) + 20 (1 - ssimC); lower is better. */
  SA.scoreWeights = { de: 1, l: 40, d: 60, c: 20 };
  function labFromLin(R, G, B, mask) {
    const N = R.length, L = new Float32Array(N), A = new Float32Array(N), Bb = new Float32Array(N);
    for (let i = 0; i < N; i++) if (mask[i]) {
      const r = R[i], g = G[i], b = B[i];
      const X = ft((0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047), Y = ft(0.2126 * r + 0.7152 * g + 0.0722 * b), Z = ft((0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883);
      L[i] = 116 * Y - 16; A[i] = 500 * (X - Y); Bb[i] = 200 * (Y - Z);
    }
    return [L, A, Bb];
  }
  function prepView(ch, T) {   // sRGB channels -> blurred CIELAB inside the mask
    const N = T.w * T.h, lc = ch.map((c) => { const o = new Float32Array(N); for (let i = 0; i < N; i++) o[i] = lin(c[i]); return gaussN(o, T.m, T.w, T.h, T.sb, T.mb); });
    return labFromLin(lc[0], lc[1], lc[2], T.ins);
  }
  function stats(x, T) {
    const mu = gaussN(x, T.m, T.w, T.h, T.sw, T.mbw), xx = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) xx[i] = x[i] * x[i];
    const v = gaussN(xx, T.m, T.w, T.h, T.sw, T.mbw);
    for (let i = 0; i < x.length; i++) v[i] -= mu[i] * mu[i];
    return { x, mu, v };
  }
  function ssim(X, y, T) {
    const Y = stats(y, T), N = X.x.length, xy = new Float32Array(N);
    for (let i = 0; i < N; i++) xy[i] = X.x[i] * y[i];
    const cxy = gaussN(xy, T.m, T.w, T.h, T.sw, T.mbw);
    let s = 0;
    for (let i = 0; i < N; i++) if (T.ins[i]) {
      const mx = X.mu[i], my = Y.mu[i], cv = cxy[i] - mx * my;
      s += ((2 * mx * my + 1) * (2 * cv + 9)) / ((mx * mx + my * my + 1) * (X.v[i] + Y.v[i] + 9));
    }
    return s / T.cnt;
  }
  function bands(L, T) {
    return T.bd.map(([a, b, ma, mbb]) => { const p = gaussN(L, T.m, T.w, T.h, a, ma), q = gaussN(L, T.m, T.w, T.h, b, mbb); for (let i = 0; i < p.length; i++) p[i] -= q[i]; return p; });
  }
  function ncc(a, b, T) {
    let sa = 0, sb = 0; const ins = T.ins;
    for (let i = 0; i < a.length; i++) if (ins[i]) { sa += a[i]; sb += b[i]; }
    sa /= T.cnt; sb /= T.cnt;
    let ab = 0, aa = 0, bb = 0;
    for (let i = 0; i < a.length; i++) if (ins[i]) { const x = a[i] - sa, y = b[i] - sb; ab += x * y; aa += x * x; bb += y * y; }
    return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
  }
  /* Target for the score: the photo (RGBA, w x h) as it is, without contrast stretching. */
  SA.target = function (d, w, h, inside, shape) {
    const N = w * h, W = Math.max(w, h);
    // frame area without the nail ring: 97% of the size for round frames, 1.5% border otherwise
    const ins = new Uint8Array(N), round = shape ? (shape === 'circle' || shape === 'ellipse') : inside[0] === 0;
    const cx = (w - 1) / 2, cy = (h - 1) / 2;
    for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
      if (round) { const a = (x - cx) / (w * 0.485), b = (y - cy) / (h * 0.485); ins[i] = a * a + b * b <= 1 ? 1 : 0; }
      else ins[i] = x >= W * 0.015 && x < w - W * 0.015 && y >= W * 0.015 && y < h - W * 0.015 ? 1 : 0;
    }
    const m = new Float32Array(N); let cnt = 0; for (let i = 0; i < N; i++) { m[i] = ins[i]; cnt += ins[i]; }
    const T = { w, h, ins, m, cnt, sb: 0.004 * W, sw: 0.003 * W };
    T.mb = gaussN(m, null, w, h, T.sb); T.mbw = gaussN(m, null, w, h, T.sw);
    T.bd = [[0.0075, 0.0225], [0.015, 0.045]].map(([a, b]) => [a * W, b * W, gaussN(m, null, w, h, a * W), gaussN(m, null, w, h, b * W)]);
    const ch = [0, 1, 2].map((c) => Float32Array.from({ length: N }, (_, i) => d[i * 4 + c]));
    T.lab = prepView(ch, T);
    T.st = T.lab.map((x) => stats(x, T));
    T.band = bands(T.lab[0], T);
    // colorfulness: mean chroma C* of the photo inside the frame
    let c = 0; for (let i = 0; i < N; i++) if (ins[i]) c += Math.hypot(T.lab[1][i], T.lab[2][i]);
    T.chroma = c / cnt;
    return T;
  };
  SA.score = function (ch, T) {
    const R = prepView(ch, T), P = T.lab, N = T.w * T.h, ins = T.ins;
    let de = 0;
    for (let i = 0; i < N; i++) if (ins[i]) { const a = R[0][i] - P[0][i], b = R[1][i] - P[1][i], c = R[2][i] - P[2][i]; de += Math.sqrt(a * a + b * b + c * c); }
    de /= T.cnt;
    const ssimL = ssim(T.st[0], R[0], T), rb = bands(R[0], T);
    const detail = (ncc(T.band[0], rb[0], T) + ncc(T.band[1], rb[1], T)) / 2;
    const ssimC = (ssim(T.st[1], R[1], T) + ssim(T.st[2], R[2], T)) / 2;
    const W_ = SA.scoreWeights;
    return { score: W_.de * de + W_.l * (1 - ssimL) + W_.d * (1 - detail) + W_.c * (1 - ssimC), de, ssim: ssimL, detail, ssimC };
  };

  // ---------- palette candidates ----------
  /* Thread colors for a photo. The photo's colors (contrast-stretched, grouped into a few hundred
     bins) are matched by mixes of the board color and up to 3 DMC floss colors. For each board
     and thread count, threads are added one at a time, each time the floss that lowers the
     mean CIELAB difference most, then each thread is swapped for a better one if there is one.
     dmc: [[code, name, hex], ...]; boards: {key: hex}. Returns [{board, threads:[codes], err}]. */
  SA.fitPalettes = function (d, inside, dmc, boards, maxK) {
    const [lo, hi] = SA.levels(d, inside), bins = new Map();
    for (let i = 0; i < inside.length; i++) {
      if (!inside[i]) continue;
      const c = [0, 1, 2].map((k) => { const v = (d[i * 4 + k] - lo) / (hi - lo); return v < 0 ? 0 : v > 1 ? 1 : v; });
      const key = ((c[0] * 11.99 | 0) * 12 + (c[1] * 11.99 | 0)) * 12 + (c[2] * 11.99 | 0);
      let e = bins.get(key); if (!e) bins.set(key, e = [0, 0, 0, 0]);
      e[0] += c[0]; e[1] += c[1]; e[2] += c[2]; e[3]++;
    }
    let pts = [...bins.values()].map((e) => ({ c: [e[0] / e[3], e[1] / e[3], e[2] / e[3]], w: e[3] }));
    pts.sort((p, q) => q.w - p.w); pts = pts.slice(0, 220);
    const wsum = pts.reduce((s, p) => s + p.w, 0);
    pts.forEach((p) => { p.lab = [0, 0, 0]; labInto(p.c[0] * 255, p.c[1] * 255, p.c[2] * 255, p.lab, 0); });
    const cand = dmc.map((x) => ({ code: x[0], rgb: hex2rgb(x[2]).map((v) => v / 255) }));
    const a = new Float64Array(3), r = [0, 0, 0], q = [0, 0, 0];
    function err(B, set) {
      const D = set.map((s) => [s.rgb[0] - B[0], s.rgb[1] - B[1], s.rgb[2] - B[2]]);
      let tr = 0; for (const x of D) tr += x[0] * x[0] + x[1] * x[1] + x[2] * x[2];
      const eta = 1 / Math.max(tr, 1e-6), aa = a.subarray(0, D.length);
      let e = 0;
      for (const p of pts) {
        mix(p.c, B, D, aa, 30, eta, r);
        const m = [0, 1, 2].map((c) => { let v = B[c]; for (let k = 0; k < D.length; k++) v += aa[k] * D[k][c]; return v * 255; });
        labInto(m[0], m[1], m[2], q, 0);
        const x = q[0] - p.lab[0], y = q[1] - p.lab[1], z = q[2] - p.lab[2];
        e += p.w * Math.sqrt(x * x + CW * CW * (y * y + z * z));
      }
      return e / wsum;
    }
    const out = [];
    for (const bk of Object.keys(boards)) {
      const B = hex2rgb(boards[bk]).map((v) => v / 255);
      // skip floss too close to the board color: it would not show
      const pool = cand.filter((c) => Math.abs(c.rgb[0] - B[0]) + Math.abs(c.rgb[1] - B[1]) + Math.abs(c.rgb[2] - B[2]) > 0.25);
      let set = [];
      for (let K = 1; K <= maxK; K++) {
        let best = null, be = Infinity;
        for (const c of pool) { if (set.includes(c)) continue; const e = err(B, set.concat([c])); if (e < be) { be = e; best = c; } }
        set = set.concat([best]);
        if (K > 1) {  // one swap pass
          for (let s = 0; s < set.length; s++) for (const c of pool) {
            if (set.includes(c)) continue;
            const t = set.slice(); t[s] = c; const e = err(B, t);
            if (e < be - 1e-6) { be = e; set = t; }
          }
        }
        out.push({ board: bk, threads: set.map((c) => c.code), err: be });
      }
    }
    return out;
  };


  // ---------- automatic settings ----------
  /* Search for the settings whose preview best matches the photo. The page runs the jobs in
     several workers; the plan and the choice are made here so that they can be tested alone. */
  const AUTO = SA.auto = {
    MIN_SPACING_MM: 3.5,          // nails closer than this are hard to place and to wind
    LINES: [1000, 6000],          // line count range, as on the Lines slider
    STRENGTHS: [4, 6, 8, 11, 14], // thread strength values tried first
    TOL: 0.01,                    // a simpler setup is chosen if it scores within 1% of the best
    COARSE: 200,                  // working size (pixels along the longer side) for the first passes
    EVAL: 256,                    // size of the images compared with the photo
    MIN_SHARE: 0.03,              // threads with a smaller share of the lines are dropped
    GREY_CHROMA: 8,               // photos with less mean chroma (C*) are made with black or white thread only
    FULL: 500                     // working size of the final pass, as used by Make string art
  };
  // Nail counts to try: up to the most nails that keep the minimum spacing, in steps of 6.
  AUTO.nailCounts = function (shape, A, heightMm) {
    const P = SA.nailLayout(shape, 8, A).P * heightMm;
    let max = Math.floor(P / AUTO.MIN_SPACING_MM / 6) * 6; max = Math.min(360, Math.max(150, max));
    const set = new Set([0.55, 0.7, 0.85, 1].map((f) => Math.min(max, Math.max(150, Math.round(max * f / 6) * 6))));
    return { max, list: [...set].sort((a, b) => a - b), spacingAt: (n) => P / n };
  };
  const step = (a, b, s) => { const r = []; for (let x = a; x <= b + 1e-9; x += s) r.push(Math.round(x)); return r; };
  AUTO.checkpoints = (lo, hi, s) => step(Math.max(AUTO.LINES[0], lo), Math.min(AUTO.LINES[1], hi), s);

  /* One test: solve the lines for a palette, nail count and strength at working size `res`,
     then score the preview at several line counts. Because each thread's lines are chosen one
     after another, the first L lines of a long run are the same as a run of L lines.
     ctx: { shape, A, photo: {res: {d, w, h, inside}}, T: score target, cache } */
  AUTO.evalJob = function (ctx, job) {
    const t0 = Date.now(), ph = ctx.photo[job.res], w = ph.w, h = ph.h, n = job.n;
    const lay = SA.nailLayout(ctx.shape, n, ctx.A), px = SA.nailPx(lay, w, h);
    const key = n + '|' + job.res;
    if (!ctx.cache || ctx.cache.key !== key) {
      ctx.cache = null;   // free the previous pixel lists first
      ctx.cache = { key, P: SA.prepare(n, Int32Array.from(px.X, Math.round), Int32Array.from(px.Y, Math.round), lay.edge, w, SA.skipFor(n)) };
    }
    const maps = SA.maps(ph.d, ph.inside, job.threads, job.board);
    const Lmax = job.checkpoints[job.checkpoints.length - 1];
    const bud = job.threads.length > 1 ? SA.budgets(maps, Lmax) : [Lmax];
    const s = job.strength / 100, r = SA.solve(ctx.cache.P, maps, bud, s * job.res / AUTO.FULL, {});
    const T = ctx.T, results = []; let last = -1, lastRes = null;
    for (const L of job.checkpoints) {
      const cnt = r.counts.map((c, i) => Math.min(c, Math.round(bud[i] * L / Lmax)));
      const used = cnt.reduce((a, b) => a + b, 0);
      if (used === last) { results.push(Object.assign({}, lastRes, { L })); continue; }
      // threads with under 3% of the lines are left out of the result, and do not count
      const keep = cnt.map((c) => c >= AUTO.MIN_SHARE * used);
      const kc = cnt.map((c, i) => (keep[i] ? c : 0));
      const sc = SA.score(SA.render(T.w, T.h, lay, r.orders, kc, job.threads, job.board, s), T);
      lastRes = { L, used, score: sc.score, de: sc.de, ssim: sc.ssim, detail: sc.detail, ssimC: sc.ssimC, keep, k: keep.filter(Boolean).length, cnt };
      results.push(lastRes); last = used;
    }
    return { job, results, ms: Date.now() - t0 };
  };
  const best = (res) => res.results.reduce((a, b) => (b.score < a.score ? b : a));
  const cfgKey = (j) => j.board + j.threads.join('') + '|' + j.n + '|' + j.strength;

  /* Palettes to test: the preset palettes, the current one, and the two best fitted palettes
     for each thread count. Palettes are {board: board key, threads: DMC numbers}. */
  AUTO.palettes = function (presets, fits, current, colors, chroma) {
    if (!colors) return [current];
    // a photo with little color is made with black or white thread on a white or black board
    if (chroma < AUTO.GREY_CHROMA) return [{ board: 'white', threads: ['310'] }, { board: 'black', threads: ['B5200'] }];
    const out = [], seen = new Set();
    const add = (p) => { const k = p.board + ':' + p.threads.join('+'); if (!seen.has(k)) { seen.add(k); out.push({ board: p.board, threads: p.threads.slice() }); } };
    presets.forEach(add); add(current);
    for (let K = 1; K <= 3; K++) fits.filter((f) => f.threads.length === K).sort((a, b) => a.err - b.err).slice(0, 2).forEach(add);
    return out;
  };
  // Stage 1: every candidate palette at one nail count and two strengths.
  AUTO.stage1 = function (palettes, nails) {
    const n = nails.list[Math.max(0, nails.list.length - 2)], cps = AUTO.checkpoints(1500, 6000, 500), jobs = [];
    palettes.forEach((p, pi) => [6, 10].forEach((st) => jobs.push({ pi, threads: p.threadHex, board: p.boardHex, n, strength: st, res: AUTO.COARSE, checkpoints: cps })));
    return jobs;
  };
  // Stage 2: the best palettes (and the best one for each thread count) at all nail counts and strengths.
  AUTO.stage2 = function (palettes, nails, r1) {
    const by = new Map();
    r1.forEach((r) => { const b = best(r).score; if (!by.has(r.job.pi) || b < by.get(r.job.pi)) by.set(r.job.pi, b); });
    const rank = [...by.entries()].sort((a, b) => a[1] - b[1]).map((e) => e[0]);
    const keep = new Set(rank.slice(0, 3)), seenK = new Set();
    rank.forEach((pi) => { const K = palettes[pi].threads.length; if (!seenK.has(K)) { seenK.add(K); if (keep.size < 5) keep.add(pi); } });
    const cps = AUTO.checkpoints(1000, 6000, 500), jobs = [];
    for (const pi of keep) for (const n of nails.list) for (const st of AUTO.STRENGTHS)
      jobs.push({ pi, threads: palettes[pi].threadHex, board: palettes[pi].boardHex, n, strength: st, res: AUTO.COARSE, checkpoints: cps });
    return { jobs, kept: [...keep] };
  };
  // Stage 3: the best few settings at full working size, with strength one step either side,
  // and line counts in steps of 200 around the best line count found so far.
  AUTO.stage3 = function (palettes, r2) {
    const cand = r2.map((r) => ({ r, b: best(r) })).sort((a, b) => a.b.score - b.b.score);
    const pick = [], seen = new Set(), seenK = new Set();
    const add = (c) => { const k = cfgKey(c.r.job); if (!seen.has(k)) { seen.add(k); pick.push(c); } };
    cand.slice(0, 3).forEach(add);
    cand.forEach((c) => { const K = c.r.job.threads.length; if (!seenK.has(K)) { seenK.add(K); add(c); } });
    const top = cand[0], jobs = [], seenJ = new Set();
    const push = (c, st) => {
      const j = Object.assign({}, c.r.job, { strength: st, res: AUTO.FULL });
      const k = cfgKey(j); if (seenJ.has(k) || st < 3 || st > 16) return; seenJ.add(k);
      j.checkpoints = AUTO.checkpoints(c.b.L - 1400, c.b.L + 1000, 200); jobs.push(j);
    };
    pick.forEach((c) => push(c, c.r.job.strength));
    [-1, 1].forEach((d) => push(top, top.r.job.strength + d));
    return jobs;
  };
  /* Final choice: the lowest score; but a setup with fewer threads, then fewer lines, then fewer
     nails is preferred if its score is within TOL of the lowest. */
  AUTO.choose = function (r3) {
    const all = [];
    r3.forEach((r) => r.results.forEach((x) => all.push({ job: r.job, ...x })));
    const lo = Math.min(...all.map((x) => x.score));
    const ok = all.filter((x) => x.score <= lo * (1 + AUTO.TOL));
    ok.sort((a, b) => a.k - b.k || a.used - b.used || a.job.n - b.job.n || a.score - b.score || a.L - b.L);
    return { pick: ok[0], bestScore: lo, tested: all.length };
  };

  G.SACore = SA;
  if (typeof module !== 'undefined' && module.exports) module.exports = SA;
})(typeof self !== 'undefined' ? self : globalThis);
