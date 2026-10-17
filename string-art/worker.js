/* String art solver. Runs in a Web Worker so the page stays responsive.
   Input: nail positions in working pixels, and one coverage map per thread color
   (Float32Array, 0 = no thread wanted, 1 = full coverage wanted), w x h pixels.
   Output: one nail order per thread, posted in batches as lines are chosen. */
'use strict';

self.onmessage = function (e) {
  if (e.data && e.data.type === 'run') run(e.data);
};

function run(m) {
  const w = m.w, n = m.nails, strength = m.strength, skip = m.skip;
  const NX = m.nx, NY = m.ny, edge = m.edge;   // edge: bit mask of the frame sides a nail lies on
  const t0 = performance.now();

  // A pair is usable if the nails are more than `skip` apart along the frame
  // and do not lie on the same straight side (that line would run along the frame).
  const pairs = n * (n - 1) / 2;
  const offs = new Uint32Array(pairs + 1);
  const ok = (i, j) => {
    let d = j - i; if (n - d < d) d = n - d;
    return d > skip && !(edge[i] & edge[j]);
  };
  let p = 0, total = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    offs[p++] = total;
    if (ok(i, j)) total += Math.max(Math.abs(NX[j] - NX[i]), Math.abs(NY[j] - NY[i])) + 1;
  }
  offs[pairs] = total;

  // Pixels under every usable pair. Each line steps one pixel along its major axis,
  // so no pixel repeats within a line.
  const pix = new Uint32Array(total);
  p = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++, p++) {
      if (offs[p + 1] === offs[p]) continue;
      const x0 = NX[i], y0 = NY[i], dx = NX[j] - x0, dy = NY[j] - y0;
      const L = Math.max(Math.abs(dx), Math.abs(dy));
      let q = offs[p];
      for (let s = 0; s <= L; s++) {
        const f = L === 0 ? 0 : s / L;
        pix[q++] = Math.round(y0 + dy * f) * w + Math.round(x0 + dx * f);
      }
    }
    if (i % 12 === 0) self.postMessage({ type: 'prep', done: i / n });
  }
  const tPrep = performance.now() - t0;

  // rowStart[i] = index of pair (i, i+1); pair(i, j) = rowStart[i] + (j - i - 1)
  const rowStart = new Uint32Array(n);
  if (m.maps.length > 1) m.orig = m.maps.map((b) => new Float32Array(b).slice());
  for (let i = 0, acc = 0; i < n; i++) { rowStart[i] = acc; acc += n - 1 - i; }

  // With several threads, a line of one color is scored by the coverage it still adds for its
  // own color, minus a penalty for crossing areas that need the other colors more than this one.
  const K = m.maps.length, maps = m.maps.map((b) => new Float32Array(b)), lam = K > 1 ? (m.penalty == null ? 0.25 : m.penalty) : 0;
  const counts = []; let carry = 0;
  for (let c = 0; c < K; c++) {
    const dark = maps[c], lines = m.budgets[c] + carry;
    let val = dark;
    if (lam > 0) {
      val = new Float32Array(dark.length);
      for (let i = 0; i < val.length; i++) { let o = 0; for (let j = 0; j < K; j++) if (j !== c) o += m.orig[j][i]; o -= m.orig[c][i]; val[i] = dark[i] - (o > 0 ? lam * o : 0); }
    }
    const order = new Uint16Array(lines + 1);
    let cur = m.start || 0, prev = -1, k = 0, sent = 0, lastPost = performance.now();
    order[0] = cur;
    self.postMessage({ type: 'lines', color: c, nails: [cur], count: 0, budget: lines });
    for (k = 0; k < lines; k++) {
      let best = 0, bj = -1;
      const rc = rowStart[cur];
      for (let j = 0; j < n; j++) {
        if (j === cur || j === prev) continue;
        const pr = cur < j ? rc + (j - cur - 1) : rowStart[j] + (cur - j - 1);
        const a = offs[pr], b = offs[pr + 1];
        if (a === b) continue;
        let sum = 0;
        for (let q = a; q < b; q++) sum += val[pix[q]];
        const score = sum / (b - a);
        if (score > best) { best = score; bj = j; }
      }
      if (bj < 0) break; // no line crosses any remaining darkness
      const pr = cur < bj ? rowStart[cur] + (bj - cur - 1) : rowStart[bj] + (cur - bj - 1);
      if (val === dark) {
        for (let q = offs[pr], b = offs[pr + 1]; q < b; q++) {
          const v = dark[pix[q]] - strength;
          dark[pix[q]] = v > 0 ? v : 0;
        }
      } else {
        for (let q = offs[pr], b = offs[pr + 1]; q < b; q++) {
          const i = pix[q], dd = dark[i] < strength ? dark[i] : strength;
          dark[i] -= dd; val[i] -= dd;
        }
      }
      prev = cur; cur = bj; order[k + 1] = cur;
      const now = performance.now();
      if (now - lastPost > 30) {
        self.postMessage({ type: 'lines', color: c, nails: Array.from(order.subarray(sent + 1, k + 2)), count: k + 1 });
        sent = k + 1; lastPost = now;
      }
    }
    if (sent < k) self.postMessage({ type: 'lines', color: c, nails: Array.from(order.subarray(sent + 1, k + 1)), count: k });
    carry = lines - k;   // lines a thread does not use pass to the next thread
    counts.push(k);
    self.postMessage({ type: 'colorDone', color: c, count: k });
  }
  self.postMessage({ type: 'done', counts, prepMs: tPrep, totalMs: performance.now() - t0 });
}

