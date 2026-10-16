/* String art solver. Runs in a Web Worker so the page stays responsive.
   Input: darkness map (Float32Array, 0 = white, 1 = black) of size x size pixels.
   Output: the nail order, posted in batches as lines are chosen. */
'use strict';

self.onmessage = function (e) {
  if (e.data && e.data.type === 'run') run(e.data);
};

function run(m) {
  const size = m.size, n = m.nails, lines = m.lines, strength = m.strength, skip = m.skip;
  const dark = new Float32Array(m.dark);
  const t0 = performance.now();

  // Nail positions: evenly spaced on a circle, nail 0 at 3 o'clock, counter-clockwise.
  const c = (size - 1) / 2, r = size / 2 - 1;
  const NX = new Int32Array(n), NY = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    const t = 2 * Math.PI * i / n;
    NX[i] = Math.round(c + r * Math.cos(t));
    NY[i] = Math.round(c - r * Math.sin(t));
  }

  // Precompute the pixels under every nail pair (i < j). Each line steps one pixel
  // along its major axis, so no pixel repeats within a line.
  const pairs = n * (n - 1) / 2;
  const offs = new Uint32Array(pairs + 1);
  let p = 0, total = 0;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    offs[p++] = total;
    total += Math.max(Math.abs(NX[j] - NX[i]), Math.abs(NY[j] - NY[i])) + 1;
  }
  offs[pairs] = total;
  const pix = new Uint32Array(total);
  p = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const x0 = NX[i], y0 = NY[i], dx = NX[j] - x0, dy = NY[j] - y0;
      const L = Math.max(Math.abs(dx), Math.abs(dy));
      let q = offs[p++];
      for (let s = 0; s <= L; s++) {
        const f = L === 0 ? 0 : s / L;
        pix[q++] = Math.round(y0 + dy * f) * size + Math.round(x0 + dx * f);
      }
    }
    if (i % 12 === 0) self.postMessage({ type: 'prep', done: i / n });
  }
  const tPrep = performance.now() - t0;

  // rowStart[i] = index of pair (i, i+1); pair(i, j) = rowStart[i] + (j - i - 1)
  const rowStart = new Uint32Array(n);
  for (let i = 0, acc = 0; i < n; i++) { rowStart[i] = acc; acc += n - 1 - i; }

  const order = new Uint16Array(lines + 1);
  let cur = 0, prev = -1, k = 0, sent = 0, lastPost = performance.now();
  order[0] = 0;
  for (k = 0; k < lines; k++) {
    let best = 0, bj = -1;
    for (let j = 0; j < n; j++) {
      if (j === cur || j === prev) continue;
      let d = Math.abs(j - cur); if (n - d < d) d = n - d;
      if (d <= skip) continue;
      const pr = cur < j ? rowStart[cur] + (j - cur - 1) : rowStart[j] + (cur - j - 1);
      const a = offs[pr], b = offs[pr + 1];
      let sum = 0;
      for (let q = a; q < b; q++) sum += dark[pix[q]];
      const score = sum / (b - a);
      if (score > best) { best = score; bj = j; }
    }
    if (bj < 0) break; // no line crosses any remaining darkness
    const pr = cur < bj ? rowStart[cur] + (bj - cur - 1) : rowStart[bj] + (cur - bj - 1);
    for (let q = offs[pr], b = offs[pr + 1]; q < b; q++) {
      const v = dark[pix[q]] - strength;
      dark[pix[q]] = v > 0 ? v : 0;
    }
    prev = cur; cur = bj; order[k + 1] = cur;
    const now = performance.now();
    if (now - lastPost > 30) {
      self.postMessage({ type: 'lines', nails: Array.from(order.subarray(sent + 1, k + 2)), count: k + 1 });
      sent = k + 1; lastPost = now;
    }
  }
  if (sent < k) self.postMessage({ type: 'lines', nails: Array.from(order.subarray(sent + 1, k + 1)), count: k });
  self.postMessage({ type: 'done', count: k, prepMs: tPrep, totalMs: performance.now() - t0 });
}
