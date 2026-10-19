(function () {
  'use strict';
  // S&P 500 vs. the cost of essentials. Reads /data/prices/data/sp-essentials.json (built by tools/build_sp_essentials.py).
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  var $ = function (id) { return document.getElementById(id); };
  var D, S, n, sY, sM, AMT = 10000;
  var state = { y: 2000, r: 'tr' };
  var LINES = [
    { k: 'nom', cls: 's-nom', label: 'Not adjusted' },
    { k: 'cpi', cls: 's-cpi', label: 'Adjusted for overall prices (CPI-U)' },
    { k: 'ess', cls: 's-ess', label: 'Adjusted for essentials' },
    { k: 'essh', cls: 's-essh', label: 'Adjusted for essentials, home prices for shelter' }
  ];

  function ym(i) { var t = sM - 1 + i; return { y: sY + Math.floor(t / 12), m: t % 12 + 1 }; }
  function idx(y, m) { return (y - sY) * 12 + (m - sM); }
  function pym(s) { var p = s.split('-'); return { y: +p[0], m: +p[1] }; }
  function mname(i) { var a = ym(i); return MONTHS[a.m - 1] + ' ' + a.y; }
  function sname(i) { var a = ym(i); return SHORT[a.m - 1] + ' ' + a.y; }
  function pct(x) { var r = Math.round(x); return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r).toLocaleString('en-US') + '%'; }
  function word(x) { var r = Math.round(x); return r < 0 ? 'a loss of ' + Math.abs(r).toLocaleString('en-US') + '%' : r.toLocaleString('en-US') + '%'; }
  function pa(x) { return (x >= 0 ? '+' : '−') + Math.abs(x).toFixed(1) + '%'; }
  function money(x) {
    if (x >= 1e6) return '$' + (x / 1e6).toFixed(x >= 1e7 ? 1 : 2).replace(/\.?0+$/, '') + 'M';
    if (x >= 1e4) return '$' + Math.round(x / 1e3).toLocaleString('en-US') + 'k';
    if (x >= 1e3) return '$' + (x / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
    return '$' + Math.round(x);
  }
  function dollars(x) { return '$' + Math.round(x).toLocaleString('en-US'); }

  // value of AMT invested at base month b, at month i, in base-month money under deflator k
  function val(k, b, i) {
    var g = S[state.r][i] / S[state.r][b];
    if (k === 'nom') return AMT * g;
    if (k === 'cpi') return AMT * g / (S.cpi[i] / S.cpi[b]);
    if (k === 'ess') return AMT * g / (S.ess[i] / S.ess[b]);
    if (S.essh[i] == null || S.essh[b] == null) return null;
    return AMT * g / (S.essh[i] / S.essh[b]);
  }
  function endFor(k) { return k === 'essh' ? Math.min(n - 1, idx(pym(D.hpi_last).y, pym(D.hpi_last).m)) : n - 1; }
  function baseFor(y) { return idx(y, ym(n - 1).m); }
  function hasHome(b) { return S.essh[b] != null; }

  function el(name, attrs, text) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function ticks(lo, hi) {
    var sets = [[1], [1, 2, 5], [1, 1.5, 2, 3, 5, 7], [1, 1.2, 1.4, 1.6, 1.8, 2, 2.5, 3, 4, 5, 6, 7, 8, 9]], out = [];
    for (var s = 0; s < sets.length; s++) {
      out = [];
      for (var e = Math.floor(Math.log10(lo)); e <= Math.ceil(Math.log10(hi)); e++)
        sets[s].forEach(function (m) { var v = m * Math.pow(10, e); if (v >= lo * 0.999 && v <= hi * 1.001) out.push(v); });
      if (out.length >= 4) break;
    }
    return out.length > 9 ? out.filter(function (v, i) { return i % 2 === 0; }) : out;
  }

  function draw(b, res) {
    var svg = $('sp-chart'), W = Math.max(300, Math.round($('sp-stage').clientWidth || 640));
    var narrow = W < 520, H = Math.round(W * (narrow ? 0.78 : 0.56));
    var fs = narrow ? 11 : 12, padL = narrow ? 44 : 50, padR = narrow ? 50 : 58, padT = 12, padB = 26;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H);
    while (svg.lastChild && svg.lastChild.nodeName !== 'desc') svg.removeChild(svg.lastChild);
    var e = n - 1, lo = AMT, hi = AMT;
    LINES.forEach(function (L) { for (var i = b; i <= endFor(L.k); i++) { var v = val(L.k, b, i); if (v != null) { if (v < lo) lo = v; if (v > hi) hi = v; } } });
    lo = lo / 1.04; hi = hi * 1.04;
    var LLo = Math.log(lo), LHi = Math.log(hi);
    var X = function (i) { return padL + (i - b) / Math.max(1, e - b) * (W - padL - padR); };
    var Y = function (v) { return padT + (LHi - Math.log(v)) / (LHi - LLo) * (H - padT - padB); };
    ticks(lo, hi).forEach(function (t) {
      svg.appendChild(el('line', { 'class': Math.abs(t - AMT) < 1e-6 ? 'zero' : 'grid', x1: padL, x2: W - padR, y1: Y(t), y2: Y(t) }));
      svg.appendChild(el('text', { x: padL - 6, y: Y(t) + 4, 'text-anchor': 'end', 'font-size': fs }, money(t)));
    });
    var y0 = ym(b).y, y1 = ym(e).y, span = y1 - y0 + 1, ystep = Math.max(1, Math.ceil(span / (narrow ? 4 : 8)));
    if (ystep > 2) ystep = ystep <= 5 ? 5 : ystep <= 10 ? 10 : 20;
    for (var y = y0 + 1; y <= y1; y++) {
      if (y % ystep !== 0 && ystep > 1) continue;
      var xi = idx(y, 1);
      svg.appendChild(el('line', { 'class': 'grid', x1: X(xi), x2: X(xi), y1: H - padB, y2: H - padB + 4 }));
      svg.appendChild(el('text', { x: X(xi), y: H - padB + 17, 'text-anchor': 'middle', 'font-size': fs }, String(y)));
    }
    var labels = [];
    LINES.slice().reverse().forEach(function (L) {
      var end = endFor(L.k), d = '', pen = false;
      if (val(L.k, b, b) == null) return;
      for (var i = b; i <= end; i++) {
        var v = val(L.k, b, i); if (v == null) { pen = false; continue; }
        d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(v).toFixed(1); pen = true;
      }
      svg.appendChild(el('path', { 'class': 'l ' + L.cls, d: d }));
      labels.push({ cls: L.cls, x: X(end), y: Y(val(L.k, b, end)), t: money(val(L.k, b, end)) });
    });
    // end labels, pushed apart so they do not overlap
    labels.sort(function (p, q) { return p.y - q.y; });
    var gap = fs + 2;
    for (var k = 1; k < labels.length; k++) if (labels[k].y - labels[k - 1].y < gap) labels[k].y = labels[k - 1].y + gap;
    var over = labels.length ? labels[labels.length - 1].y - (H - padB) : 0;
    if (over > 0) labels.forEach(function (p) { p.y -= over; });
    labels.forEach(function (p) { svg.appendChild(el('text', { 'class': 'end ' + p.cls, x: W - padR + 6, y: p.y + 4, 'font-size': fs }, p.t)); });
    $('sp-desc').textContent = 'Line chart, logarithmic scale, of ' + dollars(AMT) + ' invested in the S&P 500 in ' + mname(b) + ' through ' + mname(e) +
      ', in ' + ym(b).y + ' dollars. ' + LINES.map(function (L) { return res[L.k] ? L.label + ': ' + dollars(res[L.k].v) : ''; }).filter(Boolean).join('. ') + '.';
  }

  function render() {
    var e = n - 1, years = [];
    for (var y = sY; y < ym(e).y; y++) if (baseFor(y) >= 0) years.push(y);
    if (years.indexOf(state.y) < 0) state.y = 2000;
    var ysel = $('sp-year'); if (!ysel.options.length) years.slice().reverse().forEach(function (y) { var o = document.createElement('option'); o.value = y; o.textContent = y; ysel.appendChild(o); });
    ysel.value = String(state.y); $('sp-ret').value = state.r;
    var b = baseFor(state.y), res = {};
    LINES.forEach(function (L) {
      var end = endFor(L.k), v = val(L.k, b, end); if (v == null) return;
      var yrs = (end - b) / 12;
      res[L.k] = { end: end, v: v, g: (v / AMT - 1) * 100, pa: (Math.pow(v / AMT, 1 / yrs) - 1) * 100 };
    });
    $('sp-since').textContent = sname(b);
    var tr = state.r === 'tr';
    var s = (tr ? 'With dividends reinvested, the S&P 500 is ' : 'Counting price only, the S&P 500 is ') + (Math.round(res.nom.g) >= 0 ? 'up ' : 'down ') + Math.abs(Math.round(res.nom.g)).toLocaleString('en-US') + '%' + ' since ' + mname(b) + '. ' +
      'Adjusted for overall prices, the gain is ' + word(res.cpi.g) + '; for the cost of essentials, ' + word(res.ess.g) +
      (res.essh ? '; for essentials with home prices in place of rent-based shelter, ' + word(res.essh.g) + ' (to ' + mname(res.essh.end) + ').' : '.');
    $('sp-summary').textContent = s;
    draw(b, res);
    // results table
    var tb = $('sp-table').tBodies[0]; tb.innerHTML = '';
    LINES.forEach(function (L) {
      var r = res[L.k], tr2 = document.createElement('tr');
      if (L.k === 'ess') tr2.className = 'on';
      tr2.innerHTML = '<td><span class="sw ' + L.cls + '" aria-hidden="true"></span>' + L.label + (r && r.end !== e ? '<span class="tag"> to ' + sname(r.end) + '</span>' : '') + '</td>' +
        (r ? '<td class="num">' + pct(r.g) + '</td><td class="num">' + pa(r.pa) + '</td><td class="num">' + dollars(r.v) + '</td>'
           : '<td class="num">—</td><td class="num">—</td><td class="num">—</td>');
      tb.appendChild(tr2);
    });
    $('sp-th-val').textContent = dollars(AMT) + ' became, in ' + state.y + ' dollars';
    $('sp-homenote').hidden = hasHome(b);
    // basket table: price changes since the base month
    var bt = $('sp-basket').tBodies[0]; bt.innerHTML = '';
    var rows = D.components.map(function (c) { return [c.label + ' <span class="tag">' + c.id + '</span>', (c.w * 100).toFixed(1) + '%', (S[c.key][e] / S[c.key][b] - 1) * 100]; });
    rows.push(['<strong>Essentials index</strong>', '100%', (S.ess[e] / S.ess[b] - 1) * 100]);
    rows.push(['Overall prices (CPI-U, all items) <span class="tag">CUUR0000SA0</span>', '', (S.cpi[e] / S.cpi[b] - 1) * 100]);
    var he = endFor('essh');
    rows.push(['Home prices (FHFA HPI) <span class="tag">to ' + sname(he) + '</span>', 'replaces shelter', S.hpi[b] != null ? (S.hpi[he] / S.hpi[b] - 1) * 100 : null]);
    rows.forEach(function (r) { var t = document.createElement('tr'); t.innerHTML = '<td>' + r[0] + '</td><td class="num">' + r[1] + '</td><td class="num">' + (r[2] == null ? '—' : pct(r[2])) + '</td>'; bt.appendChild(t); });
    $('sp-since2').textContent = sname(b);
    $('sp-asof').textContent = 'S&P 500 and prices through ' + mname(e) + '; home prices through ' + mname(he) + '. Data file built ' + D.built + '.';
    var p = new URLSearchParams(location.search); p.set('sy', state.y); p.set('sr', state.r);
    var q = '?' + p.toString(); if (location.search !== q) history.replaceState(null, '', q + location.hash);
  }

  function init(data) {
    D = data; S = D.series; var a = pym(D.start); sY = a.y; sM = a.m; n = S.tr.length;
    var q = new URLSearchParams(location.search);
    if (/^\d{4}$/.test(q.get('sy') || '')) state.y = +q.get('sy');
    if (q.get('sr') === 'px') state.r = 'px';
    $('sp-year').addEventListener('change', function () { state.y = +$('sp-year').value; render(); });
    $('sp-ret').addEventListener('change', function () { state.r = $('sp-ret').value; render(); });
    $('sp-copy').addEventListener('click', function () {
      var url = location.href.split('#')[0] + '#sp', done = function () { $('sp-status').textContent = 'Link copied.'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(url).then(done, function () { $('sp-status').textContent = url; });
      else $('sp-status').textContent = url;
    });
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(render, 120); });
    render();
    if (location.hash === '#sp') $('sp').scrollIntoView();
  }

  fetch('/data/prices/data/sp-essentials.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(init).catch(function () { $('sp-summary').textContent = 'The S&P 500 data could not be loaded. Try reloading the page.'; });
})();
