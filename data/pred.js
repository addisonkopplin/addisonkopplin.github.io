/* Workbench predictions page: draws ./data.json (dash/1.2 with a "predictions" block). Needs dash.js (window.WBDash).
   Headline numbers and backtest charts use the shared renderer; this file adds open predictions, the track record and the models tested.
   All text is inserted as text. No libraries. */
(function () {
'use strict';
var W = window.WBDash, D = document;
var root = D.querySelector('main[data-dash=pred]');
if (!W || !root) return;
var el = W.el, add = W.add, isN = W.isN, S = W.S, A = W.A, fd = W.fd, sv = W.sv, ACC = W.ACC;
var ARROW = { up: '\u2191 up', down: '\u2193 down', flat: '\u2192 little change' };
function sgn(v, d) { return (v > 0 ? '+' : v < 0 ? '\u2212' : '') + Math.abs(v).toFixed(d); }
function rng(t) {
  if (!t || !isN(t.point)) return '';
  var d = Math.abs(t.point) < 20 ? 1 : 0, u = t.unit === '%' ? '%' : '';
  return sgn(t.point, d) + u + (isN(t.low) && isN(t.high) ? ' (range ' + sgn(t.low, d) + ' to ' + sgn(t.high, d) + u + ')' : '');
}
function day(s) { return /^\d{4}-\d\d-\d\d/.test(S(s)) ? fd(S(s).slice(0, 10)) : S(s); }
function para(c, t) { return el('p', c, t); }
function sect(id, title, take) {
  var s = el('section', 'chart pr'); s.id = id; s.setAttribute('aria-labelledby', id + '-h');
  var h = el('h2', '', title); h.id = id + '-h'; add(s, h);
  if (take) add(s, el('p', 'take', take));
  return s;
}
/* a small range strip: interval as a line, forecast as a dot, zero marked when inside */
function strip(t) {
  if (!t || !isN(t.point) || !isN(t.low) || !isN(t.high)) return null;
  var lo = Math.min(t.low, t.point, 0 > t.low && 0 < t.high ? 0 : t.low), hi = Math.max(t.high, t.point);
  var pad = (hi - lo) * 0.06 || 1, a = lo - pad, b = hi + pad, Wd = 240, H = 22;
  var X = function (v) { return 4 + (v - a) / (b - a) * (Wd - 8); };
  var s = sv('svg', { width: Wd, height: H, viewBox: '0 0 ' + Wd + ' ' + H, 'aria-hidden': 'true', class: 'strip' });
  if (t.low < 0 && t.high > 0) add(s, sv('line', { x1: X(0), x2: X(0), y1: 3, y2: H - 3, stroke: '#bdbdbd' }));
  add(s, sv('line', { x1: X(t.low), x2: X(t.high), y1: H / 2, y2: H / 2, stroke: '#111', 'stroke-width': 1.5 }),
    sv('line', { x1: X(t.low), x2: X(t.low), y1: H / 2 - 5, y2: H / 2 + 5, stroke: '#111' }),
    sv('line', { x1: X(t.high), x2: X(t.high), y1: H / 2 - 5, y2: H / 2 + 5, stroke: '#111' }),
    sv('circle', { cx: X(t.point), cy: H / 2, r: 4.5, fill: ACC }));
  if (isN(t.outcome)) add(s, sv('rect', { x: X(t.outcome) - 1, y: 2, width: 2, height: H - 4, fill: '#111' }));
  return s;
}
function markets(ms) {
  var ul = el('ul', 'mk');
  A(ms).forEach(function (m) {
    var li = el('li'), n = el('span', 'mkn', S(m.name) + (A(m.tickers).length ? ' (' + m.tickers.join(', ') + (m.vs ? ' vs ' + m.vs : '') + ')' : ''));
    add(li, n, D.createTextNode(' '), el('span', 'dir', ARROW[m.direction] || 'direction unknown'));
    if (S(m.magnitude)) add(li, D.createTextNode(': ' + m.magnitude.replace(/[.;]\s*$/, '') + '.'));
    if (S(m.price_impact)) add(li, el('span', 'pi', ' Price effect: ' + m.price_impact + '.'));
    add(ul, li);
  });
  return ul;
}
function details(sum, body) { var d = el('details'), s = el('summary', '', sum); add(d, s); body.forEach(function (b) { if (b) add(d, b); }); return d; }
function item(p, bench) {
  var li = el('li', 'pi-it');
  var top = el('div', 'pi-top');
  add(top, para('claim', (p.condition ? 'If ' + p.condition.charAt(0).toLowerCase() + p.condition.slice(1) + ': ' : '') + p.claim));
  var st = strip(p.target); if (st) add(top, add(el('div', 'pi-fig'), st, para('pi-v', rng(p.target)), para('pi-c', p.confidence)));
  add(li, top);
  add(li, para('pi-k', 'Affects'), markets(p.markets));
  if (bench.length) {
    var bl = el('p', 'bench', 'Benchmarks: ');
    bench.forEach(function (b, i) { add(bl, D.createTextNode((i ? '; ' : '') + b.title.replace(/^.*\((benchmark: )?/, '').replace(/\)$/, '') + ' ' + rng(b.target))); });
    add(li, bl);
  }
  add(li, para('bt' + (p.model_decision === 'rejected' ? ' rej' : ''), p.backtest + (p.model_decision === 'rejected' ? ' The model did not pass our backtest rule; this prediction was registered before the rule and is still scored.' : '')));
  add(li, para('pi-m', 'Resolves ' + day(p.resolve_after) + (p.resolve_note ? ' (' + p.resolve_note + ')' : '') + ' \u00b7 Registered ' + day(p.registered) + ' by ' + p.owner + ' \u00b7 Lock ' + p.lock + (p.source_lock ? ' (source lock ' + p.source_lock + ')' : '')));
  add(li, details('How it is scored', [p.why ? para('', 'Why: ' + p.why) : null, para('', p.rule), p.model ? para('', 'Model: ' + p.model + '.') : null]));
  return li;
}
function openList(P) {
  var open = A(P.open), s = sect('open', 'Open predictions', open.length ? 'What we expect, which markets it touches, and when it gets scored.' : 'No open predictions.');
  if (!open.length) return s;
  var cats = ['all'].concat(open.map(function (p) { return p.category; }).filter(function (c, i, a) { return c && c !== 'unknown' && a.indexOf(c) === i; }));
  var groups = [], by = {};
  open.forEach(function (p) { if (!by[p.group]) { by[p.group] = { name: p.group, items: [], cat: p.category, date: p.resolve_after }; groups.push(by[p.group]); } by[p.group].items.push(p); });
  var wrap = el('div', 'grp');
  if (cats.length > 2) {
    var f = el('div', 'flt'); f.setAttribute('role', 'group'); f.setAttribute('aria-label', 'Filter by area');
    cats.forEach(function (c) {
      var b = el('button', '', c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)); b.type = 'button'; b.setAttribute('aria-pressed', c === 'all');
      b.addEventListener('click', function () {
        [].forEach.call(f.children, function (x) { x.setAttribute('aria-pressed', x === b); });
        [].forEach.call(wrap.children, function (g) { g.hidden = c !== 'all' && g.getAttribute('data-cat') !== c; });
      });
      add(f, b);
    });
    add(s, f);
  }
  groups.forEach(function (g) {
    var gs = el('div', 'gi'); gs.setAttribute('data-cat', g.cat);
    add(gs, add(el('h3', 'gh'), D.createTextNode(g.name), el('span', '', g.date === 'unknown' ? 'Date depends on the decision' : 'Resolves ' + day(g.date))));
    var ol = el('ol', 'pl'), prim = g.items.filter(function (p) { return p.role === 'primary'; }), bench = g.items.filter(function (p) { return p.role !== 'primary'; });
    prim.forEach(function (p, i) { add(ol, item(p, i === 0 ? bench : [])); });
    if (!prim.length) bench.forEach(function (p) { add(ol, item(p, [])); });
    add(gs, ol); add(wrap, gs);
  });
  add(s, wrap);
  return s;
}
function trackSec(P, next) {
  var r = A(P.resolved), t = P.track || { n: 0, points: [] };
  var s = sect('track', 'Track record', t.n ? t.hits + ' of ' + t.n + ' resolved predictions landed inside their range.' :
    'Nothing has resolved yet. ' + (next ? 'The first is scored after ' + day(next.resolve_after) + ' (' + next.group + ').' : ''));
  if (!r.length) { add(s, para('src', 'Every result will be listed here, hit or miss, with a running hit rate against what the ranges promised.')); return s; }
  var tb = el('table', 't stack'), hr = el('tr'), body = el('tbody');
  add(tb, el('caption', 'vh', 'Resolved predictions'));
  ['Prediction', 'Forecast', 'Outcome', 'Result', 'Resolved'].forEach(function (h) { var th = el('th', '', h); th.scope = 'col'; add(hr, th); });
  add(tb, add(el('thead'), hr), body);
  r.forEach(function (p) {
    var tr = el('tr'), res = p.status === 'resolved-hit' ? 'Hit' : p.status === 'resolved-miss' ? 'Miss' : 'Void';
    [p.title, rng(p.target), isN(p.outcome) ? sgn(p.outcome, 2) + (p.target.unit === '%' ? '%' : '') : '\u2013', res, day(p.resolved)].forEach(function (v, i) {
      var td = el('td', i === 3 ? 'res ' + res.toLowerCase() : '', v); td.setAttribute('data-l', ['Prediction', 'Forecast', 'Outcome', 'Result', 'Resolved'][i]);
      if (i === 2 && S(p.evidence_url)) { td.textContent = ''; var a = el('a', '', v); a.href = p.evidence_url; add(td, a); }
      add(tr, td);
    });
    add(body, tr);
  });
  add(s, add(el('div', 'tw'), tb));
  return s;
}
function modelsSec(P) {
  var ms = A(P.models), s = sect('models', 'Models tested', 'Every model we backtested, including the ones that failed.');
  [['accepted', 'Accepted: make live predictions'], ['rejected', 'Rejected: no live predictions']].forEach(function (k) {
    var list = ms.filter(function (m) { return m.decision === k[0]; }); if (!list.length) return;
    var h = el('h3', 'sub', k[1] + ' (' + list.length + ')'); if (k[0] === 'rejected') h.id = 'rejected'; add(s, h);
    var ol = el('ul', 'ml');
    list.forEach(function (m) {
      var li = el('li');
      add(li, para('mt', m.title), para('', m.reason));
      add(li, para('pi-m', 'Tested ' + m.period + ', ' + m.n + ' forecasts \u00b7 Baseline: ' + m.baseline + (isN(m.coverage) ? ' \u00b7 80% ranges held ' + Math.round(m.coverage) + '%' : '') + ' \u00b7 ' + m.owner + ' \u00b7 Lock ' + m.lock));
      add(li, details('Method', [para('', m.method), para('', 'Forecasts: ' + m.target + '.'), para('', 'Data: ' + m.data + '.')]));
      add(ol, li);
    });
    add(s, ol);
  });
  return s;
}
function jump() {
  var n = el('nav', 'jump'); n.setAttribute('aria-label', 'On this page');
  [['#open', 'Open predictions'], ['#track', 'Track record'], ['#c0', 'Backtests'], ['#models', 'Models tested'], ['/data/predictions/method/', 'How it works']].forEach(function (x) { var a = el('a', '', x[1]); a.href = x[0]; add(n, a); });
  return n;
}
W.get('data.json').then(function (r) { return r.json(); }).then(function (d) {
  if (!d || !/^dash\/1(\.\d+)?$/.test(d.schema) || d.area !== 'predictions' || !d.predictions) throw 0;
  W.render(root, d);
  var P = d.predictions, body = root.querySelector('.body'), heads = body.querySelector('.heads'), charts = body.querySelectorAll('section.chart');
  var today = new Date().toISOString().slice(0, 10), next = A(P.open).filter(function (p) { return p.resolve_after !== 'unknown' && p.resolve_after >= today; })[0];
  var after = heads ? heads.nextSibling : body.firstChild;
  [jump(), openList(P), trackSec(P, next)].forEach(function (x) { body.insertBefore(x, after); });
  var tr = body.querySelector('#track'), live = [].filter.call(charts, function (c) { return /^Live track/.test(c.querySelector('h2').textContent); })[0];
  if (live && tr) { tr.appendChild(live.querySelector('.plot')); var lg = live.querySelector('.leg'); if (lg) tr.appendChild(lg); live.parentNode.removeChild(live); W.redraw(); }
  var info = body.querySelector('section.info');
  body.insertBefore(modelsSec(P), info);
  if (location.hash) { var t = D.getElementById(location.hash.slice(1)); if (t) t.scrollIntoView(); }
}).catch(function () { try { W.empty(root); } catch (e) {} });
})();
