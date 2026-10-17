/* String art worker. Runs the line solver off the page so the page stays responsive.
   'run': one full calculation; lines are posted in batches as they are chosen.
   'init', 'fit', 'job': parts of Find best settings (see core.js, SACore.auto). */
'use strict';
importScripts('core.js');
const SA = self.SACore;
let ctx = null;

self.onmessage = function (e) {
  const m = e.data;
  if (m.type === 'run') run(m);
  else if (m.type === 'joint') joint(m);
  else if (m.type === 'init') {
    ctx = { shape: m.shape, A: m.A, frameMM: m.frameMM || 400, photo: {}, cache: null, solveOpts: m.solveOpts };
    for (const p of m.photos) ctx.photo[p.res] = { d: new Uint8ClampedArray(p.d), w: p.w, h: p.h, inside: SA.insideMask(m.shape, p.w, p.h) };
    const t = ctx.photo[SA.auto.EVAL];
    ctx.T = SA.target(t.d, t.w, t.h, t.inside, m.shape, { frameMM: ctx.frameMM });
    self.postMessage({ type: 'ready', chroma: ctx.T.chroma });
  } else if (m.type === 'fit') {
    const t = ctx.photo[SA.auto.COARSE];
    self.postMessage({ type: 'fit', id: m.id, fits: SA.fitPalettes(t.d, t.inside, m.dmc, m.boards, 3) });
  } else if (m.type === 'job') {
    self.postMessage({ type: 'job', id: m.id, result: SA.auto.evalJob(ctx, m.job), cache: ctx.cache && ctx.cache.key });
  }
};

function run(m) {
  const w = m.w, n = m.nails, t0 = performance.now();
  const P = SA.prepare(n, m.nx, m.ny, m.edge, w, m.skip, (f) => self.postMessage({ type: 'prep', done: f }));
  const tPrep = performance.now() - t0;
  const maps = m.maps.map((b) => new Float32Array(b));
  let sent = 0, lastPost = 0, order = null, color = 0;
  const flush = (k) => {
    if (k > sent) self.postMessage({ type: 'lines', color, nails: Array.from(order.subarray(sent + 1, k + 1)), count: k });
    sent = k; lastPost = performance.now();
  };
  const r = SA.solve(P, maps, m.budgets, m.strength, {
    penalty: m.penalty, start: m.start, clip: m.clip,
    onStart: (c, o, lines) => { color = c; order = o; sent = 0; lastPost = performance.now(); self.postMessage({ type: 'lines', color: c, nails: [o[0]], count: 0, budget: lines }); },
    onEnd: (c, k) => { flush(k); self.postMessage({ type: 'colorDone', color: c, count: k }); }
  }, (c, k) => { if (performance.now() - lastPost > 30) flush(k); });
  self.postMessage({ type: 'done', counts: r.counts, prepMs: tPrep, totalMs: performance.now() - t0 });
}

// All threads placed together (SA.solveJoint); progress is posted while it runs.
function joint(m) {
  const t0 = performance.now(), n = m.nails;
  const P = SA.prepare(n, m.nx, m.ny, m.edge, m.w, m.skip);
  const tPrep = performance.now() - t0;
  const inside = SA.insideMask(m.shape, m.w, m.h);
  let last = 0;
  const r = SA.solveJoint(P, new Uint8ClampedArray(m.d), inside, m.threads, m.board, {
    frameMM: m.frameMM, maxLines: m.maxLines, minBlock: m.minBlock, switchPenalty: m.switchPenalty,
    stop: (total) => { const t = performance.now(); if (t - last > 40) { last = t; self.postMessage({ type: 'progress', total }); } return false; }
  });
  self.postMessage({ type: 'done', joint: true, orders: r.orders.map((o) => Array.from(o)), counts: r.counts, blocks: r.blocks, switches: r.switches, prepMs: tPrep, totalMs: performance.now() - t0 });
}
