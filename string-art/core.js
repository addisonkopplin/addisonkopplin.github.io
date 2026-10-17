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
  SA.multiMaps = function (d, inside, threads, board, mo) {
    const linear = mo && mo.linear != null ? mo.linear : SA.LINEAR_MIX, tf = linear ? (x) => lin(x * 255) : (x) => x;
    const K = threads.length, B = hex2rgb(board).map((x) => tf(x / 255));
    const D = threads.map((t) => hex2rgb(t).map((x, c) => tf(x / 255) - B[c]));
    let tr = 0; for (const dd of D) for (const x of dd) tr += x * x;
    const eta = 1 / Math.max(tr, 1e-6), Q = 32, key = (linear ? 'L' : 'S') + board + threads.join('');
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
        mix([tf(ri / (Q - 1)), tf(gi / (Q - 1)), tf(bi / (Q - 1))], B, D, a, 150, eta, r);
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
  SA.LINEAR_MIX = false;
  SA.maps = function (d, inside, threads, board, mo) {
    return threads.length > 1 ? SA.multiMaps(d, inside, threads, board, mo) : SA.monoMap(d, inside, SA.lightOnDark(threads[0], board));
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
    return { n, offs, pix, rowStart, NX, NY, w };
  };
  /* Greedy line choice, one thread at a time in winding order. From the current nail, every
     line to another nail is scored by the average remaining need along it; the best line is
     taken and the need under it is reduced by `strength`.
     o.clip: need stops at zero. Otherwise need can go below zero, so a line over an area that
       already has enough thread scores lower. Default: below zero with one thread (it scores
       better there), stop at zero with several threads (it scores better there).
     o.repeat: allow the same nail pair twice in one thread.
     o.stop(color, k, order): called after every line; returning true ends that thread there.
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
        if (o.stop && o.stop(c, k + 1, order)) { k++; break; }
      }
      carry = lines - k;   // lines a thread does not use pass to the next thread
      orders.push(order); counts.push(k);
      if (o.onEnd) o.onEnd(c, k);
    }
    return { orders, counts };
  };

  // ---------- joint solver (several threads) ----------
  /* All threads are placed together on one simulated board. The board is kept as it looks:
     opaque thread SA.THREAD_MM wide over the board color, later lines on top, in a linear
     opponent color space (lightness Y, red-green X/Xn - Y, blue-yellow Y - Z/Zn). The error
     against the photo is weighted as CIELAB sees it (more weight in dark areas, a* and b*
     scaled as in CIELAB) and, as seen from the viewing distance, color differences count
     partly blurred over a wider area (S-CIELAB), so neighboring lines of two colors can mix.
     Each step takes the line, from the current nail of a thread, that lowers the error most.
     Threads are wound in turns of at least o.minBlock lines; another thread takes over when its
     best line beats the current thread's best line. It stops when no line lowers the error, or
     after o.maxLines lines.
     P: SA.prepare at the working size; d: photo RGBA at that size; inside: frame mask.
     o: {frameMM, viewMM, maxLines, minBlock, chromaW, refresh, stop(total) -> true to stop}.
     Returns {orders, counts, blocks: [[thread, from, to], ...]} (lines from..to-1 of a thread). */
  SA.solveJoint = function (P, d, inside, threads, board, o) {
    o = o || {};
    const n = P.n, offs = P.offs, pix = P.pix, rowStart = P.rowStart, w = P.w, N = inside.length, h = N / w, K = threads.length;
    const frameMM = o.frameMM || 400, viewMM = o.viewMM || SA.viewMM(frameMM);
    const c0 = SA.THREAD_MM * Math.max(w, h) / frameMM;
    const maxLines = o.maxLines || 6000, minBlock = o.minBlock == null ? 60 : o.minBlock, refresh = o.refresh || 32;
    // colors as XYZ / white point (linear)
    const xyz = (r, g, b) => [(0.4124 * r + 0.3576 * g + 0.1805 * b) / XN, 0.2126 * r + 0.7152 * g + 0.0722 * b, (0.0193 * r + 0.1192 * g + 0.9505 * b) / ZN];
    const hx = (hexc) => { const c = hex2rgb(hexc); return xyz(lin(c[0]), lin(c[1]), lin(c[2])); };
    const tau = threads.map(hx), B0 = hx(board);
    // per pixel: canvas C (XYZ), target CIELAB, error e = Lab(C) - Lab(target)
    const C = [new Float32Array(N), new Float32Array(N), new Float32Array(N)], TL = [new Float32Array(N), new Float32Array(N), new Float32Array(N)];
    const e = [new Float32Array(N), new Float32Array(N), new Float32Array(N)];
    const labOf = (X, Y, Z, out) => { const fx = ft(X), fy = ft(Y), fz = ft(Z); out[0] = 116 * fy - 16; out[1] = 500 * (fx - fy); out[2] = 200 * (fy - fz); };
    const q = [0, 0, 0];
    for (let i = 0; i < N; i++) {
      const T = xyz(lin(d[i * 4]), lin(d[i * 4 + 1]), lin(d[i * 4 + 2]));
      labOf(T[0], T[1], T[2], q); TL[0][i] = q[0]; TL[1][i] = q[1]; TL[2][i] = q[2];
      for (let c = 0; c < 3; c++) C[c][i] = B0[c];
    }
    function setErr(i) {   // error at the current canvas color
      labOf(C[0][i], C[1][i], C[2][i], q);
      e[0][i] = q[0] - TL[0][i]; e[1][i] = q[1] - TL[1][i]; e[2][i] = q[2] - TL[2][i];
    }
    for (let i = 0; i < N; i++) setErr(i);
    // weights: lightness 1, color chromaW (the match score counts color more)
    const cw = o.chromaW == null ? 2 : o.chromaW, Wc = [1, cw, cw];
    // S-CIELAB: share of each channel seen sharp and blurred, blur width in pixels
    const ppd = Math.max(w, h) / frameMM * viewMM * Math.tan(Math.PI / 180);
    const alpha = [1, 0.616725, 0.567885], beta = [0, 0.383275, 0.432115], sigPx = [0, 0.826 * ppd / 2.3548, 0.6451 * ppd / 2.3548];
    // the blurred part on a coarse grid of f x f pixel cells
    const f = Math.max(1, Math.round(sigPx[2] / 1.5)), gw = Math.ceil(w / f), gh = Math.ceil(h / f), GN = gw * gh, f2 = 1 / (f * f);
    const cell = new Uint32Array(N); for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) cell[i] = ((y / f) | 0) * gw + ((x / f) | 0);
    const Ec = [null, new Float32Array(GN), new Float32Array(GN)], F = [null, new Float32Array(GN), new Float32Array(GN)];
    for (let c = 1; c < 3; c++) for (let i = 0; i < N; i++) if (inside[i]) Ec[c][cell[i]] += e[c][i] * f2;
    const kap = [0, 1 / (2 * Math.sqrt(Math.PI) * sigPx[1]), 1 / (2 * Math.sqrt(Math.PI) * sigPx[2])];
    function refreshF() {
      for (let c = 1; c < 3; c++) { const sg = sigPx[c] / f; F[c] = gaussN(gaussN(Ec[c], null, gw, gh, sg, null), null, gw, gh, sg, null); }
    }
    // per thread and pixel: Lt (times the line coverage) and Qt (times coverage squared)
    const Lt = threads.map(() => new Float32Array(N)), Qt = threads.map(() => new Float32Array(N));
    const qa = [Wc[0] * alpha[0], Wc[1] * (alpha[1] + beta[1] * kap[1]), Wc[2] * (alpha[2] + beta[2] * kap[2])];
    // Dt: CIELAB change per unit of coverage when one line of thread t crosses the pixel
    // (measured over one line's coverage c0, so it stays right for large steps such as light
    // thread on black)
    const Dt = threads.map(() => [new Float32Array(N), new Float32Array(N), new Float32Array(N)]), q2 = [0, 0, 0];
    function setD(i) {
      const X = C[0][i], Y = C[1][i], Z = C[2][i]; labOf(X, Y, Z, q);
      for (let t = 0; t < K; t++) {
        const tc = tau[t]; labOf(X + c0 * (tc[0] - X), Y + c0 * (tc[1] - Y), Z + c0 * (tc[2] - Z), q2);
        for (let c = 0; c < 3; c++) Dt[t][c][i] = (q2[c] - q[c]) / c0;
      }
    }
    function upd(i) {
      if (!inside[i]) return;
      const g = cell[i];
      const g0 = Wc[0] * alpha[0] * e[0][i], g1 = Wc[1] * (alpha[1] * e[1][i] + beta[1] * F[1][g]), g2 = Wc[2] * (alpha[2] * e[2][i] + beta[2] * F[2][g]);
      for (let t = 0; t < K; t++) {
        const D = Dt[t], DL = D[0][i], Da = D[1][i], Db = D[2][i];
        Lt[t][i] = 2 * (g0 * DL + g1 * Da + g2 * Db);
        Qt[t][i] = qa[0] * DL * DL + qa[1] * Da * Da + qa[2] * Db * Db;
      }
    }
    for (let i = 0; i < N; i++) if (inside[i]) setD(i);
    refreshF();
    for (let i = 0; i < N; i++) upd(i);
    // line coverage: thread width over the pixels the line steps through
    const NX = P.NX, NY = P.NY;
    const cov = (i, j) => { const dx = NX[j] - NX[i], dy = NY[j] - NY[i], L = Math.max(Math.abs(dx), Math.abs(dy)); return L ? Math.min(1, c0 * Math.hypot(dx, dy) / L) : 0; };
    const used = threads.map(() => new Uint8Array(offs.length));
    const cur = threads.map(() => o.start || 0), prev = threads.map(() => -1);
    const orders = threads.map(() => [cur[0]]), blocks = [];
    // best line from thread t's current nail: [error change, nail, pair]
    function bestFrom(t) {
      const c = cur[t], rc = rowStart[c], Lr = Lt[t], Qr = Qt[t], us = used[t];
      let bd = 0, bj = -1, bp = 0;
      for (let j = 0; j < n; j++) {
        if (j === c || j === prev[t]) continue;
        const pr = c < j ? rc + (j - c - 1) : rowStart[j] + (c - j - 1);
        const a = offs[pr], b = offs[pr + 1];
        if (a === b || us[pr]) continue;
        let sl = 0, sq = 0;
        for (let k = a; k < b; k++) { const p = pix[k]; sl += Lr[p]; sq += Qr[p]; }
        const wv = cov(c, j), dlt = wv * sl + wv * wv * sq;
        if (dlt < bd) { bd = dlt; bj = j; bp = pr; }
      }
      return [bd, bj, bp];
    }
    function place(t, j, pr) {
      const a = offs[pr], b = offs[pr + 1], wv = cov(cur[t], j), tc = tau[t];
      for (let k = a; k < b; k++) {
        const i = pix[k], g = cell[i], e1 = e[1][i], e2 = e[2][i];
        for (let c = 0; c < 3; c++) C[c][i] += wv * (tc[c] - C[c][i]);
        setErr(i);
        if (inside[i]) { Ec[1][g] += (e[1][i] - e1) * f2; Ec[2][g] += (e[2][i] - e2) * f2; }
      }
      for (let k = a; k < b; k++) { const i = pix[k]; if (inside[i]) { setD(i); upd(i); } }
      used[t][pr] = 1; prev[t] = cur[t]; cur[t] = j; orders[t].push(j);
    }
    // o.switchPenalty p: another thread takes over only if its best line is (1 + p) times better.
    // o.layered: each thread is finished before the next starts (no return to a finished thread).
    const pen = o.switchPenalty || 0, layered = !!o.layered, closed = new Uint8Array(K), every = o.checkEvery || 8;
    let total = 0, ct = -1, blockStart = 0, blockLen = 0, switches = 0;
    const closeBlock = () => { if (ct >= 0 && orders[ct].length - 1 > blockStart) blocks.push([ct, blockStart, orders[ct].length - 1]); };
    while (total < maxLines) {
      if (total && total % refresh === 0) { refreshF(); for (let i = 0; i < N; i++) upd(i); }
      let pick = null;
      if (ct >= 0) { const r = bestFrom(ct); if (r[1] >= 0) pick = [ct, r]; else if (layered) closed[ct] = 1; }
      // after minBlock lines of a turn, the other threads are tried every checkEvery lines
      if (ct < 0 || !pick || (!layered && blockLen >= minBlock && (blockLen - minBlock) % every === 0)) {
        const own = pick ? pick[1][0] * (1 + pen) : 0;
        for (let t = 0; t < K; t++) {
          if (t === ct || closed[t]) continue;
          const r = bestFrom(t);
          if (r[1] >= 0 && r[0] < own && (!pick || pick[0] === ct || r[0] < pick[1][0])) pick = [t, r];
        }
      }
      if (!pick) break;   // no line lowers the error
      const [t, [, j, pr]] = pick;
      if (t !== ct) { closeBlock(); if (ct >= 0) switches++; ct = t; blockStart = orders[t].length - 1; blockLen = 0; }
      place(t, j, pr); total++; blockLen++;
      if (o.stop && o.stop(total, { orders, blocks: blocks.concat([[ct, blockStart, orders[ct].length - 1]]) })) break;
    }
    closeBlock();
    return { orders: orders.map((x) => Uint16Array.from(x)), counts: orders.map((x) => x.length - 1), blocks, total, switches };
  };

  // ---------- render ----------
  /* Thread lines drawn in winding order over the board, each line spread over the two nearest
     pixel rows or columns. Returns sRGB channels (0-255). counts[t] = lines of thread t to draw.
     With frameMM, lines are drawn at the real thread width: opaque, SA.THREAD_MM wide on a frame
     frameMM across (the longer side). Without it, the old screen preview is drawn instead: width
     0.857 px on a 1200 px canvas, opacity min(0.9, 2.2 x strength). */
  SA.THREAD_MM = 0.45;   // DMC six-strand embroidery floss used whole, pulled tight
  /* blocks (optional): [[thread, from, to], ...] draws lines from..to-1 of each thread in this
     order (threads wound in turns); without it, each thread is drawn whole, in thread order. */
  SA.render = function (W, H, lay, orders, counts, colors, board, strength, frameMM, blocks, rows) {
    // rows (optional): [y0, y1], only these rows are made (to draw a large image in strips)
    const ya = rows ? rows[0] : 0, yb = rows ? rows[1] : H, HH = yb - ya;
    const N = W * HH, R = new Float32Array(N), Gc = new Float32Array(N), B = new Float32Array(N);
    const b = hex2rgb(board);
    const { X, Y } = SA.nailPx(lay, W, H);
    const c0 = frameMM ? SA.THREAD_MM * Math.max(W, H) / frameMM : Math.min(0.9, strength * 2.2) * (1200 / 1400) * Math.max(W, H) / 1200;
    // mixing is done in linear light for the real thread, in sRGB for the screen preview (as a canvas does)
    const toL = frameMM ? lin : (v) => v;
    R.fill(toL(b[0])); Gc.fill(toL(b[1])); B.fill(toL(b[2]));
    const put = (i, w, cr, cg, cb) => { if (w > 1) w = 1; R[i] += (cr - R[i]) * w; Gc[i] += (cg - Gc[i]) * w; B[i] += (cb - B[i]) * w; };
    // a line c pixels thick across the minor axis at position p: coverage of each pixel
    // (up to 1 px thick: shared by the two nearest pixels; thicker: overlap of the thread with each pixel)
    const across = (p, c, lim, fn) => {
      if (c <= 1) { const pi = Math.floor(p), f = p - pi; if (pi >= 0 && pi < lim) fn(pi, c * (1 - f)); if (pi + 1 < lim && f > 0) fn(pi + 1, c * f); return; }
      const lo = p - c / 2 + 0.5, hi = p + c / 2 + 0.5;
      for (let r = Math.max(0, Math.floor(lo)); r < lim && r < hi; r++) { const ov = Math.min(r + 1, hi) - Math.max(r, lo); if (ov > 0) fn(r, ov); }
    };
    const cols = colors.map((c) => hex2rgb(c).map(toL));
    const runs = blocks ? SA.blocksUpTo(blocks, counts) : orders.map((o, t) => [t, 0, counts[t]]);
    for (const [t, from, to] of runs) {
      const [cr, cg, cb] = cols[t], o = orders[t];
      for (let k = from; k < to; k++) {
        let x0 = X[o[k]], y0 = Y[o[k]], x1 = X[o[k + 1]], y1 = Y[o[k + 1]];
        const dx = x1 - x0, dy = y1 - y0;
        if (Math.abs(dx) >= Math.abs(dy)) {
          if (x1 < x0) { let s = x0; x0 = x1; x1 = s; s = y0; y0 = y1; y1 = s; }
          const sl = dx === 0 ? 0 : (y1 - y0) / (x1 - x0), c = c0 * Math.sqrt(1 + sl * sl);
          if (Math.max(y0, y1) + c + 1 < ya || Math.min(y0, y1) - c - 1 > yb) continue;
          for (let x = Math.ceil(x0); x <= x1; x++) {
            const y = y0 + sl * (x - x0);
            across(y - ya, c, HH, (r, wv) => put(r * W + x, wv, cr, cg, cb));
          }
        } else {
          if (y1 < y0) { let s = x0; x0 = x1; x1 = s; s = y0; y0 = y1; y1 = s; }
          const sl = (x1 - x0) / (y1 - y0), c = c0 * Math.sqrt(1 + sl * sl);
          for (let y = Math.max(Math.ceil(y0), ya); y <= y1 && y < yb; y++) {
            const x = x0 + sl * (y - y0), row = (y - ya) * W;
            across(x, c, W, (cx, wv) => put(row + cx, wv, cr, cg, cb));
          }
        }
      }
    }
    if (frameMM) for (let i = 0; i < N; i++) { R[i] = srgb(R[i]); Gc[i] = srgb(Gc[i]); B[i] = srgb(B[i]); }
    return [R, Gc, B];
  };
  // blocks cut to at most counts[t] lines of each thread
  SA.blocksUpTo = function (blocks, counts) {
    const out = [];
    for (const [t, a, b] of blocks) { const e = Math.min(b, counts[t]); if (e > a) out.push([t, a, e]); }
    return out;
  };
  // the first L lines of a wound sequence: lines per thread and the blocks
  SA.firstLines = function (blocks, K, L) {
    const counts = new Array(K).fill(0), out = []; let left = L;
    for (const [t, a, b] of blocks) { if (left <= 0) break; const e = Math.min(b, a + left); out.push([t, a, e]); counts[t] = e; left -= e - a; }
    return { counts, blocks: out };
  };
  const srgb = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);

  // ---------- match score ----------
  // Gaussian blur of src weighted by mask m (normalized convolution); mb = blurred mask
  function gaussN(src, m, w, h, sigma, mb) {
    if (sigma > 3) return boxN(src, m, w, h, sigma, mb);
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
  // Wide blurs: three box blurs in each direction (same variance as the Gaussian), zero outside the image.
  function boxN(src, m, w, h, sigma, mb) {
    const r = Math.max(1, Math.round((Math.sqrt(1 + 4 * sigma * sigma) - 1) / 2)), k = 1 / (2 * r + 1);
    const N = w * h; let a = new Float32Array(N), b = new Float32Array(N);
    for (let i = 0; i < N; i++) a[i] = m ? src[i] * m[i] : src[i];
    for (let pass = 0; pass < 6; pass++) {
      const horiz = pass % 2 === 0, len = horiz ? w : h, lines = horiz ? h : w, st = horiz ? 1 : w, ls = horiz ? w : 1;
      for (let l = 0; l < lines; l++) {
        const o = l * ls; let s = 0;
        for (let x = 0; x <= r && x < len; x++) s += a[o + x * st];
        for (let x = 0; x < len; x++) {
          b[o + x * st] = s * k;
          const p = x + r + 1, q = x - r;
          if (p < len) s += a[o + p * st];
          if (q >= 0) s -= a[o + q * st];
        }
      }
      const t = a; a = b; b = t;
    }
    if (mb) for (let i = 0; i < N; i++) a[i] = mb[i] > 1e-4 ? a[i] / mb[i] : 0;
    return a;
  }
  SA.blur = gaussN;
  const CW = 1;   // weight of color (a, b) differences when fitting palettes
  /* Match score: how the finished piece looks from a normal viewing distance compared with the
     photo. The piece is drawn at the real thread width (SA.render with frameMM) and both images
     are seen as the eye sees them from the viewing distance (S-CIELAB filters, Zhang & Wandell
     1996, on an opponent space that keeps greys grey; distance 5 x the frame size, at least 1 m).
     Inside the frame, leaving out the nail ring:
       de      mean CIELAB difference (CIE76): overall tone and color
       dab     mean difference of color (a*, b*) only
       detail  correlation of lightness detail (difference of blurs at 1.5% and 4.5% of the
               width). Unaffected by overall lightness and contrast, so it measures whether
               features such as eyes and edges are drawn.
       ssim, ssimC  structural similarity of L* and of a*, b* (computed only if weighted)
     score = 0.5 de + 1 dab + 60 (1 - detail); lower is better. The weights were tuned on a set
     of results with a known quality order (sa-bench/ranking). */
  SA.scoreWeights = { de: 0.5, ab: 1, d: 60, l: 0, c: 0 };
  const XN = 0.95047, ZN = 1.08883;
  // [FWHM in degrees, weight] for the lightness, red-green and blue-yellow channels
  const SCIELAB = [[[0.05, 1.00327], [0.225, 0.114416], [7.0, -0.117686]], [[0.0685, 0.616725], [0.826, 0.383275]], [[0.092, 0.567885], [0.6451, 0.432115]]];
  const mbFor = (T, s) => { let v = T.mbs.get(s); if (!v) { v = gaussN(T.m, null, T.w, T.h, s); T.mbs.set(s, v); } return v; };
  const blurT = (x, T, s) => gaussN(x, T.m, T.w, T.h, s, mbFor(T, s));
  function seen(lc, T) {   // linear RGB channels -> CIELAB as seen from the viewing distance
    const N = T.w * T.h, opp = [new Float32Array(N), new Float32Array(N), new Float32Array(N)];
    for (let i = 0; i < N; i++) {
      const r = lc[0][i], g = lc[1][i], b = lc[2][i];
      const X = 0.4124 * r + 0.3576 * g + 0.1805 * b, Y = 0.2126 * r + 0.7152 * g + 0.0722 * b, Z = 0.0193 * r + 0.1192 * g + 0.9505 * b;
      opp[0][i] = Y; opp[1][i] = X / XN - Y; opp[2][i] = Y - Z / ZN;
    }
    const f = opp.map((ch, c) => {
      const out = new Float32Array(N), tot = SCIELAB[c].reduce((s, k) => s + k[1], 0);
      for (const [spread, wt] of SCIELAB[c]) {
        const s = Math.max(0.3, spread * T.ppd / 2.3548);
        const bl = blurT(ch, T, Math.round(s * 100) / 100);
        for (let i = 0; i < N; i++) out[i] += (wt / tot) * bl[i];
      }
      return out;
    });
    const L = new Float32Array(N), A = new Float32Array(N), Bb = new Float32Array(N), ins = T.ins;
    for (let i = 0; i < N; i++) if (ins[i]) {
      const Y = f[0][i], X = XN * (f[1][i] + Y), Z = ZN * (Y - f[2][i]);
      const fx = ft(X > 0 ? X / XN : 0), fy = ft(Y > 0 ? Y : 0), fz = ft(Z > 0 ? Z / ZN : 0);
      L[i] = 116 * fy - 16; A[i] = 500 * (fx - fy); Bb[i] = 200 * (fy - fz);
    }
    return [L, A, Bb];
  }
  const linCh = (ch) => ch.map((c) => { const o = new Float32Array(c.length); for (let i = 0; i < c.length; i++) o[i] = lin(c[i]); return o; });
  function stats(x, T) {
    const mu = blurT(x, T, T.sw), xx = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) xx[i] = x[i] * x[i];
    const v = blurT(xx, T, T.sw);
    for (let i = 0; i < x.length; i++) v[i] -= mu[i] * mu[i];
    return { x, mu, v };
  }
  function ssim(X, y, T) {
    const Y = stats(y, T), N = X.x.length, xy = new Float32Array(N);
    for (let i = 0; i < N; i++) xy[i] = X.x[i] * y[i];
    const cxy = blurT(xy, T, T.sw);
    let s = 0;
    for (let i = 0; i < N; i++) if (T.ins[i]) {
      const mx = X.mu[i], my = Y.mu[i], cv = cxy[i] - mx * my;
      s += ((2 * mx * my + 1) * (2 * cv + 9)) / ((mx * mx + my * my + 1) * (X.v[i] + Y.v[i] + 9));
    }
    return s / T.cnt;
  }
  function band(L, T) { const p = blurT(L, T, T.b1), q = blurT(L, T, T.b2); for (let i = 0; i < p.length; i++) p[i] -= q[i]; return p; }
  function ncc(a, b, T) {
    let sa = 0, sb = 0; const ins = T.ins;
    for (let i = 0; i < a.length; i++) if (ins[i]) { sa += a[i]; sb += b[i]; }
    sa /= T.cnt; sb /= T.cnt;
    let ab = 0, aa = 0, bb = 0;
    for (let i = 0; i < a.length; i++) if (ins[i]) { const x = a[i] - sa, y = b[i] - sb; ab += x * y; aa += x * x; bb += y * y; }
    return aa > 0 && bb > 0 ? ab / Math.sqrt(aa * bb) : 0;
  }
  SA.viewMM = (frameMM) => Math.max(1000, 5 * frameMM);
  /* Target for the score: the photo (RGBA, w x h) as it is, without contrast stretching.
     view: {frameMM: longer frame side in mm (default 400), viewMM: viewing distance}. */
  SA.target = function (d, w, h, inside, shape, view) {
    view = view || {};
    const N = w * h, W = Math.max(w, h), frameMM = view.frameMM || 400, viewMM = view.viewMM || SA.viewMM(frameMM);
    // frame area without the nail ring: 97% of the size for round frames, 1.5% border otherwise
    const ins = new Uint8Array(N), round = shape ? (shape === 'circle' || shape === 'ellipse') : inside[0] === 0;
    const cx = (w - 1) / 2, cy = (h - 1) / 2;
    for (let y = 0, i = 0; y < h; y++) for (let x = 0; x < w; x++, i++) {
      if (round) { const a = (x - cx) / (w * 0.485), b = (y - cy) / (h * 0.485); ins[i] = a * a + b * b <= 1 ? 1 : 0; }
      else ins[i] = x >= W * 0.015 && x < w - W * 0.015 && y >= W * 0.015 && y < h - W * 0.015 ? 1 : 0;
    }
    const m = new Float32Array(N); let cnt = 0; for (let i = 0; i < N; i++) { m[i] = ins[i]; cnt += ins[i]; }
    const T = { w, h, ins, m, cnt, frameMM, viewMM, mbs: new Map(), sw: 1.5 * W / 512, b1: 0.015 * W, b2: 0.045 * W };
    T.ppd = W / frameMM * viewMM * Math.tan(Math.PI / 180);   // pixels per degree of visual angle
    const ch = [0, 1, 2].map((c) => Float32Array.from({ length: N }, (_, i) => d[i * 4 + c]));
    T.lab = seen(linCh(ch), T);
    T.band = band(T.lab[0], T);
    const W_ = SA.scoreWeights;
    if (W_.l || SA.SCORE_ALL) T.stL = stats(T.lab[0], T);
    if (W_.c || SA.SCORE_ALL) T.stC = [stats(T.lab[1], T), stats(T.lab[2], T)];
    // colorfulness: mean chroma C* of the photo inside the frame
    let c = 0; for (let i = 0; i < N; i++) if (ins[i]) c += Math.hypot(T.lab[1][i], T.lab[2][i]);
    T.chroma = c / cnt;
    return T;
  };
  /* ch: sRGB channels of SA.render(..., frameMM) at the target size. */
  SA.score = function (ch, T) {
    const R = seen(linCh(ch), T), P = T.lab, N = T.w * T.h, ins = T.ins;
    let de = 0, dab = 0;
    for (let i = 0; i < N; i++) if (ins[i]) {
      const a = R[0][i] - P[0][i], b = R[1][i] - P[1][i], c = R[2][i] - P[2][i], ab = b * b + c * c;
      de += Math.sqrt(a * a + ab); dab += Math.sqrt(ab);
    }
    de /= T.cnt; dab /= T.cnt;
    const detail = ncc(T.band, band(R[0], T), T), W_ = SA.scoreWeights;
    const ssimL = W_.l || SA.SCORE_ALL ? ssim(T.stL, R[0], T) : null;
    const ssimC = W_.c || SA.SCORE_ALL ? (ssim(T.stC[0], R[1], T) + ssim(T.stC[1], R[2], T)) / 2 : null;
    const score = W_.de * de + W_.ab * dab + W_.d * (1 - detail) + (W_.l ? W_.l * (1 - ssimL) : 0) + (W_.c ? W_.c * (1 - ssimC) : 0);
    return { score, de, dab, detail, ssim: ssimL, ssimC };
  };
  /* Score of a finished result, as Find best settings scores it.
     o: {photo(w, h) -> RGBA, shape, A, lay, orders, counts, threads (hex), board (hex), strength, frameMM} */
  SA.scoreResult = function (o) {
    const [w, h] = SA.workSize(o.A, SA.auto.EVAL), ins = SA.insideMask(o.shape, w, h);
    const T = SA.target(o.photo(w, h), w, h, ins, o.shape, { frameMM: o.frameMM });
    return SA.score(SA.render(w, h, o.lay, o.orders, o.counts, o.threads, o.board, o.strength, o.frameMM || 400, o.blocks), T);
  };

  // ---------- palette candidates ----------
  /* Thread colors for a photo. The photo's colors (contrast-stretched, grouped into bins) are
     matched by mixes of the board color and up to 3 DMC floss colors, mixed in linear light as
     thread and board mix when seen from a distance. Only floss near one of the photo's main
     colors is considered, plus white and black. For each board and thread count, threads are
     added one at a time, each time the floss that lowers the mean CIELAB difference most, then
     each thread is swapped for a better one if there is one.
     dmc: [[code, name, hex], ...]; boards: {key: hex}. Returns [{board, threads:[codes], err}]. */
  SA.fitPalettes = function (d, inside, dmc, boards, maxK) {
    const [lo, hi] = SA.levels(d, inside), bins = new Map();
    for (let i = 0; i < inside.length; i++) {
      if (!inside[i]) continue;
      const c = [0, 1, 2].map((k) => { const v = (d[i * 4 + k] - lo) / (hi - lo); return v < 0 ? 0 : v > 1 ? 1 : v; });
      const key = ((c[0] * 7.99 | 0) * 8 + (c[1] * 7.99 | 0)) * 8 + (c[2] * 7.99 | 0);
      let e = bins.get(key); if (!e) bins.set(key, e = [0, 0, 0, 0]);
      e[0] += c[0]; e[1] += c[1]; e[2] += c[2]; e[3]++;
    }
    let pts = [...bins.values()].map((e) => ({ c: [e[0] / e[3], e[1] / e[3], e[2] / e[3]], w: e[3] }));
    pts.sort((p, q) => q.w - p.w); pts = pts.slice(0, 56);
    const wsum = pts.reduce((s, p) => s + p.w, 0);
    pts.forEach((p) => { p.lab = [0, 0, 0]; labInto(p.c[0] * 255, p.c[1] * 255, p.c[2] * 255, p.lab, 0); p.l = p.c.map((v) => lin(v * 255)); });
    const all = dmc.map((x) => { const rgb = hex2rgb(x[2]), lab = [0, 0, 0]; labInto(rgb[0], rgb[1], rgb[2], lab, 0); return { code: x[0], l: rgb.map(lin), lab }; });
    // floss near the main photo colors (the 6 nearest to each of the 20 largest bins), white and black
    const near = new Set();
    for (const p of pts.slice(0, 20)) {
      all.map((c) => [c, (c.lab[0] - p.lab[0]) ** 2 + (c.lab[1] - p.lab[1]) ** 2 + (c.lab[2] - p.lab[2]) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, 6).forEach((x) => near.add(x[0]));
    }
    all.filter((c) => c.code === 'B5200' || c.code === '310').forEach((c) => near.add(c));
    const cand = [...near];
    const a = new Float64Array(3), r = [0, 0, 0], q = [0, 0, 0];
    function err(B, set) {
      const D = set.map((s) => [s.l[0] - B[0], s.l[1] - B[1], s.l[2] - B[2]]);
      let tr = 0; for (const x of D) tr += x[0] * x[0] + x[1] * x[1] + x[2] * x[2];
      const eta = 1 / Math.max(tr, 1e-6), aa = a.subarray(0, D.length);
      let e = 0;
      for (const p of pts) {
        mix(p.l, B, D, aa, 24, eta, r);
        let X = 0, Y = 0, Z = 0;
        const m = [0, 1, 2].map((c) => { let v = B[c]; for (let k = 0; k < D.length; k++) v += aa[k] * D[k][c]; return v; });
        X = ft((0.4124 * m[0] + 0.3576 * m[1] + 0.1805 * m[2]) / 0.95047); Y = ft(0.2126 * m[0] + 0.7152 * m[1] + 0.0722 * m[2]); Z = ft((0.0193 * m[0] + 0.1192 * m[1] + 0.9505 * m[2]) / 1.08883);
        q[0] = 116 * Y - 16; q[1] = 500 * (X - Y); q[2] = 200 * (Y - Z);
        const x = q[0] - p.lab[0], y = q[1] - p.lab[1], z = q[2] - p.lab[2];
        e += p.w * Math.sqrt(x * x + CW * CW * (y * y + z * z));
      }
      return e / wsum;
    }
    const out = [];
    for (const bk of Object.keys(boards)) {
      const B = hex2rgb(boards[bk]).map(lin), Bs = hex2rgb(boards[bk]).map((v) => v / 255);
      // skip floss too close to the board color: it would not show
      const pool = cand.filter((c) => { const s = c.l.map((v) => srgb(v) / 255); return Math.abs(s[0] - Bs[0]) + Math.abs(s[1] - Bs[1]) + Math.abs(s[2] - Bs[2]) > 0.25; });
      let set = [];
      for (let K = 1; K <= maxK && K <= pool.length; K++) {
        let bestC = null, be = Infinity;
        for (const c of pool) { if (set.includes(c)) continue; const e = err(B, set.concat([c])); if (e < be) { be = e; bestC = c; } }
        set = set.concat([bestC]);
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
  /* Search for the settings whose finished piece best matches the photo (see the match score).
     The page runs the tests in several workers; the plan and the choice are made here, so they
     can be tested alone. */
  const AUTO = SA.auto = {
    MIN_SPACING_MM: 3.5,   // nails closer than this are hard to place and to wind
    LINES: [200, 6000],    // line count range, as on the Lines slider
    STRENGTH: [3, 60],     // thread strength range, as on the slider
    TOL: 0.01,             // a simpler setup is chosen if it scores within 1% of the best
    BOARD_MARGIN: 0.03,    // a grey or wood board must score 3% better than white or black, with no less detail
    FIRST: 80,             // working size (pixels along the longer side) of the first pass
    COARSE: 120,           // working size of the later passes
    EVAL: 120,             // size of the images compared with the photo
    MIN_SHARE: 0.03,       // threads with a smaller share of the lines are dropped
    GREY_CHROMA: 8,        // photos with less mean chroma (C*) are made with black or white thread only
    FULL: 500,             // working size of Make string art
    BUDGET_MS: 4500,       // after this, the search stops refining and chooses from what it has
    PRESETS: [{ board: 'white', threads: ['310'] }, { board: 'black', threads: ['B5200'] }]
  };
  /* Where the thread covers the board about once, from the frame size (longer side, mm):
     a 40 cm frame looks best with about 1500 lines at strength 24; the line count grows and the
     strength falls in proportion to the frame size. */
  AUTO.linesFor = (frameMM) => Math.round(1500 * frameMM / 400 / 100) * 100;
  AUTO.strengthFor = (frameMM) => Math.round(Math.min(AUTO.STRENGTH[1], Math.max(AUTO.STRENGTH[0], 24 * 400 / frameMM)));
  // working size of the joint solver: about 2 mm per pixel, where single threads merge into tone
  AUTO.jointRes = (frameMM) => Math.round(Math.min(400, Math.max(120, frameMM / 2)));
  AUTO.workers = (cores) => (!cores || cores <= 4 ? 2 : Math.min(4, cores - 1));
  // Nail counts to try: up to the most nails that keep the minimum spacing, in steps of 6.
  AUTO.nailCounts = function (shape, A, heightMm) {
    const P = SA.nailLayout(shape, 8, A).P * heightMm;
    let max = Math.floor(P / AUTO.MIN_SPACING_MM / 6) * 6; max = Math.min(360, Math.max(150, max));
    const set = new Set([0.75, 1].map((f) => Math.min(max, Math.max(150, Math.round(max * f / 6) * 6))));
    return { max, list: [...set].sort((a, b) => a - b), spacingAt: (n) => P / n };
  };
  const r100 = (x) => Math.max(AUTO.LINES[0], Math.min(AUTO.LINES[1], Math.round(x / 100) * 100));
  AUTO.checkpoints = (L0) => [...new Set([0.5, 0.67, 0.83, 1, 1.2, 1.45, 1.75, 2.1, 2.5].map((f) => r100(L0 * f)))];

  /* One test: solve the lines for a palette, nail count and strength at working size `res`,
     then score the finished piece at several line counts. Because each thread's lines are chosen
     one after another, the first L lines of a long run are the same as a run of L lines.
     ctx: { shape, A, frameMM, photo: {res: {d, w, h, inside}}, T: score target, cache } */
  /* One test: the joint solver for a palette and nail count at working size `res`, scored as a
     finished piece after several line counts. Because lines are placed one after another, the
     first L lines of a long run are the same as a run of L lines; the test stops once the score
     has risen at two line counts in a row, or when no line lowers the error.
     ctx: { shape, A, frameMM, photo: {res: {d, w, h, inside}}, T: score target, cache } */
  AUTO.evalJob = function (ctx, job) {
    const t0 = Date.now(), ph = ctx.photo[job.res], w = ph.w, h = ph.h, n = job.n;
    const lay = SA.nailLayout(ctx.shape, n, ctx.A), px = SA.nailPx(lay, w, h);
    const key = n + '|' + job.res;
    if (!ctx.cache || ctx.cache.key !== key) {
      ctx.cache = null;   // free the previous pixel lists first
      ctx.cache = { key, P: SA.prepare(n, Int32Array.from(px.X, Math.round), Int32Array.from(px.Y, Math.round), lay.edge, w, SA.skipFor(n)) };
    }
    const T = ctx.T, K = job.threads.length, results = [], cps = job.checkpoints;
    let ci = 0, last = null, worse = 0, late = false;
    const evalAt = (total, orders, blocks) => {
      const fl = SA.firstLines(blocks, K, total), cnt = fl.counts;
      // threads with under 3% of the lines are left out of the result, and do not count
      const keep = cnt.map((c) => c >= AUTO.MIN_SHARE * total), kc = cnt.map((c, i) => (keep[i] ? c : 0));
      const sc = SA.score(SA.render(T.w, T.h, lay, orders, kc, job.threads, job.board, 0, ctx.frameMM, fl.blocks), T);
      const res = { L: total, used: total, score: sc.score, de: sc.de, dab: sc.dab, detail: sc.detail, keep, k: keep.filter(Boolean).length, cnt };
      worse = last && res.score > last.score ? worse + 1 : 0;
      results.push(res); last = res;
    };
    const r = SA.solveJoint(ctx.cache.P, ph.d, ph.inside, job.threads, job.board, Object.assign({ frameMM: ctx.frameMM, maxLines: cps[cps.length - 1] }, ctx.jointOpts || {}, {
      stop: (total, st) => {
        // past the time limit: score what is there and stop
        if (job.deadline && total > 0 && !(total & 15) && Date.now() > job.deadline) { if (!last || last.L !== total) evalAt(total, st.orders, st.blocks); late = true; return true; }
        if (total !== cps[ci]) return false;
        evalAt(total, st.orders, st.blocks); ci++;
        return worse >= 2;
      }
    }));
    // the solver stopped by itself (no line lowers the error): score what it made
    if (!late && worse < 2 && (!last || last.L !== r.total) && r.total > 0) evalAt(r.total, r.orders, r.blocks);
    return { job, results, ms: Date.now() - t0, switches: r.switches, late };
  };
  const best = (res) => (res.results.length ? res.results.reduce((a, b) => (b.score < a.score ? b : a)) : { score: Infinity });
  const cfgKey = (j) => j.board + j.threads.join('') + '|' + j.n + '|' + j.res;

  /* Palettes to test: the presets, the current one, and the best fitted palette for each thread
     count. Palettes are {board: board key, threads: DMC numbers}. */
  AUTO.palettes = function (presets, fits, current, colors, chroma) {
    if (!colors) return [current];
    // a photo with little color is made with black or white thread on a white or black board
    if (chroma < AUTO.GREY_CHROMA) return [{ board: 'white', threads: ['310'] }, { board: 'black', threads: ['B5200'] }];
    const out = [], seen = new Set();
    const add = (p) => { const k = p.board + ':' + p.threads.join('+'); if (!seen.has(k)) { seen.add(k); out.push({ board: p.board, threads: p.threads.slice() }); } };
    // in order of priority (a slow device may only get through the first few): black on white,
    // the fitted three threads and pair on white, the current colors, the other presets, then the
    // fitted three threads on each other board
    const rank = (f) => (f.board === 'white' ? 0 : f.board === 'black' ? 1 : 2), by = (a, b) => rank(a) - rank(b) || a.err - b.err;
    const f3 = fits.filter((f) => f.threads.length === 3).sort(by), f2 = fits.filter((f) => f.threads.length === 2).sort(by);
    add(presets[0]); f3.slice(0, 1).forEach(add); f2.slice(0, 1).forEach(add);
    add(current); presets.slice(1).forEach(add); f3.slice(1).forEach(add);
    return out;
  };
  const plain = (b) => b === 'white' || b === 'black';
  /* Final choice: the lowest score. A grey or wood board is only chosen if it beats the best
     white or black board result by BOARD_MARGIN and shows at least as much detail. A setup with
     fewer threads, then fewer lines, then fewer nails is preferred if it scores within TOL. */
  AUTO.choose = function (rs, palettes) {
    let all = [];
    rs.forEach((r) => r.results.forEach((x) => all.push({ job: r.job, ...x })));
    const boardOf = (x) => (palettes ? palettes[x.job.pi].board : 'white');
    const P = all.filter((x) => plain(boardOf(x)));
    if (P.length) {
      const bp = P.reduce((a, b) => (b.score < a.score ? b : a));
      all = all.filter((x) => plain(boardOf(x)) || (x.score < bp.score * (1 - AUTO.BOARD_MARGIN) && x.detail >= bp.detail));
    }
    const lo = Math.min(...all.map((x) => x.score));
    const ok = all.filter((x) => x.score <= lo * (1 + AUTO.TOL));
    ok.sort((a, b) => a.k - b.k || a.used - b.used || a.job.n - b.job.n || a.score - b.score || a.L - b.L);
    return { pick: ok[0], bestScore: lo };
  };

  /* The whole search. o: {shape, A, frameMM: [width, height] in mm, photos: [{res, w, h, d}],
     dmc: [[code, name, hex]], boards: {key: {hex}}, presets, current, colors,
     init(msg): send msg to every worker; run(msgs, label, from, to) -> results (or a promise),
     now(): ms clock, budgetMs}. Returns {settings, tested, pick, palettes, stages}. */
  AUTO.search = async function (o) {
    const now = o.now || (() => Date.now()), t0 = now(), budget = o.budgetMs == null ? AUTO.BUDGET_MS : o.budgetMs;
    const fMM = Math.max(o.frameMM[0], o.frameMM[1]), L0 = AUTO.linesFor(fMM), s0 = AUTO.strengthFor(fMM);
    // time limit: on a slow device, tests not started by a stage's limit are skipped and running
    // tests stop at it; the choice is made from what finished. Deadlines are Date.now() times.
    const limit = (f) => (isFinite(budget) ? Date.now() + budget * f - (now() - t0) : 0);
    const ready = await o.init({ type: 'init', shape: o.shape, A: o.A, photos: o.photos, frameMM: fMM });
    const chroma = ready && ready.chroma != null ? ready.chroma : 99;
    const nails = AUTO.nailCounts(o.shape, o.A, o.frameMM[1]);
    let fits = [];
    if (o.colors && chroma >= AUTO.GREY_CHROMA) {
      // white and black boards first
      const bs = Object.keys(o.boards).sort((a, b) => plain(b) - plain(a));
      const parts = await o.run(bs.map((b) => ({ type: 'fit', dmc: o.dmc, boards: { [b]: o.boards[b].hex } })), 'choosing thread colors', 0, 0.1, limit(0.2));
      fits = [].concat(...parts.filter(Boolean).map((p) => p.fits));
    }
    const hex = new Map(o.dmc.map((d) => [d[0], d[2]]));
    const pals = AUTO.palettes(o.presets || AUTO.PRESETS, fits, o.current, o.colors, chroma)
      .map((p) => Object.assign(p, { boardHex: o.boards[p.board].hex, threadHex: p.threads.map((c) => hex.get(c)) }));
    const cps = AUTO.checkpoints(L0), nMax = nails.list[nails.list.length - 1], nLo = nails.list[0];
    const jobsRun = async (jobs, label, a, b, f) => {
      if (!jobs.length) return [];
      const dl = f ? limit(f) : 0;
      // stable order: palette priority, then nails and size
      // a started test stops at the stage limit plus a little, so it can usually finish
      const ms = jobs.map((job) => ({ type: 'job', job: Object.assign(job, { deadline: dl && dl + 0.15 * budget }) }));
      return (await o.run(ms, label, a, b, dl)).filter((m) => m && m.result && m.result.results.length).map((m) => m.result);
    };
    const mk = (pi, n, res) => ({ pi, threads: pals[pi].threadHex, board: pals[pi].boardHex, n, res, checkpoints: cps });
    // 1: every palette, quickly (small working size, fewer nails)
    const r1 = await jobsRun(pals.map((p, pi) => mk(pi, nLo, AUTO.FIRST)), 'step 1 of 2', 0.1, 0.5, 0.6);
    if (!r1.length) r1.push(...(await jobsRun([mk(0, nLo, AUTO.FIRST)], 'step 1 of 2', 0.1, 0.5, 0)));
    const byPal = r1.map((r) => ({ pi: r.job.pi, b: best(r).score })).sort((a, b) => a.b - b.b);
    // 2: the palettes within 15% of the best (at most 3; 2 on a slow device), at full search size
    const slow = now() - t0 > budget / 2;
    const keep = byPal.filter((x) => x.b <= byPal[0].b * 1.15).slice(0, slow ? 2 : 3).map((x) => x.pi);
    let all = r1.slice(), stage2 = 0;
    if (now() - t0 < budget * 0.75) {
      const js = [].concat(...keep.map((pi) => (slow ? [mk(pi, nMax, AUTO.COARSE)] : [mk(pi, nMax, AUTO.COARSE), mk(pi, nLo, AUTO.COARSE)])));
      const r2 = await jobsRun(js, 'step 2 of 2', 0.5, 1, 1); stage2 = r2.length;
      // the step-1 results are only a guide when step 2 ran
      if (r2.length) all = r2;
    }
    const ch = AUTO.choose(all, pals), pk = ch.pick, pal = pals[pk.job.pi];
    const tested = (all === r1 ? [r1] : [r1, all]).reduce((a, rs) => a + rs.reduce((b, r) => b + r.results.length, 0), 0);
    const keptUsed = pk.cnt.reduce((a, c, i) => a + (pk.keep[i] ? c : 0), 0), dropped = pk.k < pk.job.threads.length;
    const lines = pk.k === 1 || dropped ? r100(Math.ceil(keptUsed / 100) * 100) : pk.L;
    return {
      settings: { nails: pk.job.n, lines, strength: s0, threads: pal.threads.filter((c, i) => pk.keep[i]), board: pal.board },
      tested, pick: pk, bestScore: ch.bestScore, chroma, palettes: pals.map((p) => p.board + ':' + p.threads.join('+')),
      stages: [r1.length, stage2], ms: now() - t0, spacingMM: nails.spacingAt(pk.job.n),
      first: r1.map((r) => { const b = best(r); return { palette: pals[r.job.pi].board + ':' + pals[r.job.pi].threads.join('+'), score: b.score, L: b.L, detail: b.detail, dab: b.dab }; })
    };
  };

  G.SACore = SA;
  if (typeof module !== 'undefined' && module.exports) module.exports = SA;
})(typeof self !== 'undefined' ? self : globalThis);
