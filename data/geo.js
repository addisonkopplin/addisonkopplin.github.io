/* Workbench housing maps, state filter and heat maps (schema dash/1.2). Built from geo.src.js, kept outside the site. Needs dash.js. */
(function () {
'use strict';
var W = window.WBDash, D = document;
var root = D.querySelector('main[data-dash=board][data-geo]');
if (!W || !root) return;
var el = W.el, sv = W.sv, add = W.add, isN = W.isN, S = W.S, A = W.A, fmt = W.fmt, fd = W.fd, pd = W.pd, ACC = W.ACC;
var GEO = root.getAttribute('data-geo') || '/data/geo/';
var SEQ7 = ['#e3e7f7', '#bcc6ee', '#93a3e2', '#6680d6', '#3f5ccb', '#1f3fbf', '#13286f'];
var SEQ = ['#d3daf4', '#9cadE5', '#6479d3', '#1f3fbf', '#13286f'];
var DIV = ['#2e2e2e', '#787878', '#bdbdbd', '#c3ccef', '#6f84d8', '#1f3fbf'];
var NODATA = '#f0f0f0';
var NAT = 'Nationwide';
var base = { title: D.title, h1: '' }, G = null, DATA = null, TOPO = null, CTOPO = {}, CDATA = {}, seq = 0;
var cur = { st: null, metric: null };
function json(u) { return W.get(u).then(function (r) { return r.json(); }); }
function ord(n) { var s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]); }
function F(v, m, short) { return fmt(v, W.isWord(m.unit) ? '' : m.unit, m.decimals) + (W.isWord(m.unit) && isN(v) && !short ? ' ' + m.unit : ''); }
function FS(v, m) { return F(v, m, 1); }
function unitWord(u) { u = S(u); return /^per (thousand|1,?000)( residents)?$/i.test(u) ? 'per 1,000 residents' : u; }
function lohi(o, k) {
if (!o) return null;
var r = o.ranges && o.ranges[k]; if (Array.isArray(r)) r = { low: r[0], high: r[1] };
if (!r && o.low && o.high && typeof o.low === 'object') r = { low: o.low[k], high: o.high[k], label: S((o.range_label || {})[k]).replace(/\bpp\b/g, 'percentage points') };
return r && isN(r.low) && isN(r.high) ? r : null;
}
function rng(o, k, m, short) { var r = lohi(o, k); if (!r) return ''; var l = S(r.label); if (short && l.length > 28) l = ''; l = l ? l.charAt(0).toUpperCase() + l.slice(1) : 'Range'; return l + ': ' + FS(r.low, m) + ' to ' + F(r.high, m); }
function unsure(o, k) { return !!o && isN(o.v[k]) && /sign depends/i.test(flagOf(o, k)); }
function flagOf(o, k) { return S(((o && o._flags) || {})[k]) || S(((o && o.flags) || {})[k]); }
function lc(s) { return s.charAt(0).toLowerCase() + s.slice(1); }
function gid(o) { return S(o.geoid) || S(o.fips) || S(o.id) || (isN(o.geoid) ? String(o.geoid) : ''); }
function vals(o) { return o.values || o.metrics || {}; }
function norm(j) {
if (!j || !/^dash\/1\.\d+$/.test(j.schema) || !Array.isArray(j.states)) return null;
var ms = A(j.metrics).filter(function (m) { return m && S(m.key) && S(m.label); }).map(function (m) {
return { key: m.key, label: m.key === 'shortfall' ? 'Shortfall (negative = surplus)' : m.label, unit: unitWord(m.unit), decimals: m.decimals, good: m.good, as_of: S(m.as_of), source: S(m.source),
div: m.scale === 'diverging', counties: m.counties !== false };
});
var st = {}, list = [];
A(j.states).forEach(function (s) {
var id = gid(s); if (!/^\d\d$/.test(id)) return;
var o = { id: id, name: S(s.name) || id, abbr: S(s.abbr) || S(s.usps) || id, v: vals(s), series: s.series || {}, flags: s.flags || {}, _flags: s._flags || {}, ranges: s.ranges || {}, low: s.low, high: s.high, range_label: s.range_label, nc: s.has_counties === false,
findings: A(s.findings).map(function (f) { return typeof f === 'string' ? f : f && S(f.text); }).filter(Boolean).slice(0, 3) };
st[id] = o; list.push(o);
});
list.sort(function (a, b) { return a.name < b.name ? -1 : 1; });
var nat = j.national || j.us || {};
var hms = A(j.heatmaps).filter(function (h) { return h && Array.isArray(h.columns) && Array.isArray(h.rows); }).map(function (h) {
var rows = {}; h.rows.forEach(function (r) { var id = gid(r); if (st[id] && Array.isArray(r.values)) rows[id] = r.values; });
return { id: S(h.id), title: S(h.title), take: S(h.takeaway), unit: unitWord(h.unit), partial: A(h.partial_columns).map(String), decimals: h.decimals, source: S(h.source), as_of: S(h.as_of),
div: h.scale === 'diverging', cols: h.columns.map(String), rows: rows, metric: S(h.metric) };
}).filter(function (h) { return Object.keys(h.rows).length; });
return { as_of: S(j.as_of), generated: S(j.generated), sources: A(j.sources), notes: A(j.notes).filter(S), metrics: ms, st: st, list: list,
nat: { v: vals(nat), series: nat.series || {} }, hms: hms, cpath: S(j.counties_path) || 'counties/' };
}
function metric(k) { for (var i = 0; i < G.metrics.length; i++) if (G.metrics[i].key === k) return G.metrics[i]; return G.metrics[0]; }
function ranked(m) {
return G.list.filter(function (s) { return isN(s.v[m.key]); }).sort(function (a, b) { return b.v[m.key] - a.v[m.key]; });
}
function rankOf(s, m) { var r = ranked(m); for (var i = 0; i < r.length; i++) if (r[i] === s) return [i + 1, r.length]; return null; }
function decode(t, name) {
var tr = t.transform, sx = tr ? tr.scale[0] : 1, sy = tr ? tr.scale[1] : 1, tx = tr ? tr.translate[0] : 0, ty = tr ? tr.translate[1] : 0;
var arcs = t.arcs.map(function (a) { var x = 0, y = 0; return a.map(function (p) { if (tr) { x += p[0]; y += p[1]; } else { x = p[0]; y = p[1]; } return [x * sx + tx, y * sy + ty]; }); });
function ring(ix) {
var out = [];
ix.forEach(function (i) { var a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; for (var k = out.length ? 1 : 0; k < a.length; k++) out.push(a[k]); });
return out;
}
var o = t.objects[name] || t.objects[Object.keys(t.objects)[0]];
return o.geometries.map(function (g) {
var polys = g.type === 'Polygon' ? [g.arcs] : g.type === 'MultiPolygon' ? g.arcs : [];
return { id: String(g.id != null ? g.id : (g.properties || {}).id), p: g.properties || {}, polys: polys.map(function (pl) { return pl.map(ring); }) };
});
}
function albers(l0, p0, p1, p2) {
var r = Math.PI / 180, n = (Math.sin(p1 * r) + Math.sin(p2 * r)) / 2, C = Math.cos(p1 * r) * Math.cos(p1 * r) + 2 * n * Math.sin(p1 * r);
var r0 = Math.sqrt(C - 2 * n * Math.sin(p0 * r)) / n;
return function (lon, lat) { var t = n * (lon - l0) * r, rho = Math.sqrt(C - 2 * n * Math.sin(lat * r)) / n; return [rho * Math.sin(t), rho * Math.cos(t) - r0]; };
}
var PROJ = { L: albers(-96, 37.5, 29.5, 45.5), AK: albers(-154, 50, 55, 65), HI: albers(-157, 3, 8, 18), PR: albers(-66.4, 18, 8, 18) };
var BOX = { L: [40, 8, 950, 500], AK: [8, 412, 250, 592], HI: [256, 500, 380, 584], PR: [858, 528, 940, 572] };
function region(id) { var s = id.slice(0, 2); return s === '02' ? 'AK' : s === '15' ? 'HI' : s === '72' ? 'PR' : 'L'; }
function project(feats) {
feats.forEach(function (f) {
var P = PROJ[region(f.id)], ak = region(f.id) === 'AK';
f.xy = f.polys.map(function (pl) { return pl.map(function (rg) { return rg.map(function (p) { return P(ak && p[0] > 0 ? p[0] - 360 : p[0], p[1]); }); }); });
});
}
function bounds(feats) {
var b = [Infinity, Infinity, -Infinity, -Infinity];
feats.forEach(function (f) { f.xy.forEach(function (pl) { pl.forEach(function (rg) { rg.forEach(function (p) { if (p[0] < b[0]) b[0] = p[0]; if (p[1] < b[1]) b[1] = p[1]; if (p[0] > b[2]) b[2] = p[0]; if (p[1] > b[3]) b[3] = p[1]; }); }); }); });
return b;
}
function fit(feats, box) {
var b = bounds(feats), k = Math.min((box[2] - box[0]) / (b[2] - b[0] || 1), (box[3] - box[1]) / (b[3] - b[1] || 1));
var ox = box[0] + ((box[2] - box[0]) - k * (b[2] - b[0])) / 2 - k * b[0], oy = box[1] + ((box[3] - box[1]) - k * (b[3] - b[1])) / 2 - k * b[1];
feats.forEach(function (f) {
f.d = f.xy.map(function (pl) { return pl.map(function (rg) {
var s = '', lx, ly;
rg.forEach(function (p, i) { var x = (ox + k * p[0]).toFixed(1), y = (oy + k * p[1]).toFixed(1); if (x === lx && y === ly) return; s += (i ? 'L' : 'M') + x + ' ' + y; lx = x; ly = y; });
return s + 'Z';
}).join(''); }).join('');
});
}
function usFeats() {
if (TOPO.f) return TOPO.f;
var fs = decode(TOPO.t, 'states'); project(fs);
['L', 'AK', 'HI', 'PR'].forEach(function (r) { var g = fs.filter(function (f) { return region(f.id) === r; }); if (g.length) fit(g, BOX[r]); });
return (TOPO.f = fs);
}
function countyFeats(id) {
var c = CTOPO[id]; if (c.f) return c.f;
var fs = decode(c.t, 'counties'), r = region(id);
if (r === 'L') {
var x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
fs.forEach(function (f) { f.polys.forEach(function (pl) { pl.forEach(function (rg) { rg.forEach(function (p) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }); }); }); });
var P = albers((x0 + x1) / 2, (y0 + y1) / 2, y0 + (y1 - y0) / 6, y1 - (y1 - y0) / 6);
fs.forEach(function (f) { f.xy = f.polys.map(function (pl) { return pl.map(function (rg) { return rg.map(function (p) { return P(p[0], p[1]); }); }); }); });
} else project(fs);
fit(fs, [12, 12, 948, 588]);
return (c.f = fs);
}
function q(xs, p) { var i = (xs.length - 1) * p, lo = Math.floor(i); return xs[lo] + (xs[Math.min(lo + 1, xs.length - 1)] - xs[lo]) * (i - lo); }
function round(v, d) { var k = Math.pow(10, d); return Math.round(v * k) / k; }
function niceStep(x) { var p = Math.pow(10, Math.floor(Math.log10(x || 1))), e = x / p; return (e >= 5 ? 5 : e >= 2 ? 2 : 1) * p; }
function scale(values, m) {
var xs = values.filter(isN).sort(function (a, b) { return a - b; });
if (!xs.length) return { col: function () { return NODATA; }, items: [] };
var d = W.dp(m.unit, m.decimals), br, cols, lo = xs[0], hi = xs[xs.length - 1];
if (m.div && lo < 0 && hi > 0) {
var st = niceStep(Math.max(Math.abs(q(xs, 0.1)), Math.abs(q(xs, 0.9))) / 2);
br = [-2 * st, -st, 0, st, 2 * st]; cols = DIV;
} else {
var ramp = m.fine ? SEQ7 : SEQ, k = ramp.length;
br = []; for (var j = 1; j < k; j++) br.push(round(q(xs, j / k), d));
br = br.filter(function (b, i) { return b > lo && (!i || b > br[i - 1]); });
cols = ramp.slice(ramp.length - br.length - 1);
if (br.length < 2) cols = [SEQ[1], SEQ[3]].slice(0, br.length + 1);
}
function col(v) { if (!isN(v)) return NODATA; for (var i = 0; i < br.length; i++) if (v < br[i]) return cols[i]; return cols[br.length]; }
var items = cols.slice(0, br.length + 1).map(function (c, i) {
var l = !br.length ? FS(lo, m) + ' to ' + FS(hi, m) : i === 0 ? 'Under ' + FS(br[0], m) : i === br.length ? FS(br[i - 1], m) + ' or more' : FS(br[i - 1], m) + ' to ' + FS(br[i], m);
return [c, l];
});
return { col: col, items: items, unit: W.isWord(m.unit) ? m.unit : '' };
}
function legend(sc, missing, label, hatched) {
var ul = el('ul', 'gleg'); ul.setAttribute('aria-label', label || 'Colour key');
if (sc.unit) add(ul, el('li', 'gu', sc.unit.charAt(0).toUpperCase() + sc.unit.slice(1) + ':'));
sc.items.concat(missing ? [[NODATA, 'No data']] : []).forEach(function (it) { var k = el('span', 'sw'); k.style.background = it[0]; add(ul, add(el('li'), k, D.createTextNode(it[1]))); });
if (hatched) add(ul, add(el('li'), el('span', 'sw swh'), D.createTextNode('Uncertain sign')));
return ul;
}
function tip(box) {
var t = el('div', 'gtip'); t.hidden = true; t.setAttribute('role', 'status'); add(box, t);
return {
show: function (lines, x, y) {
t.textContent = ''; lines.forEach(function (l, i) { add(t, el(i ? 'span' : 'strong', '', l)); });
t.hidden = false;
var bw = box.clientWidth, tw = t.offsetWidth, th = t.offsetHeight, l = Math.min(Math.max(4, x - tw / 2), bw - tw - 4), tp = y - th - 12;
if (tp < 0) tp = y + 18;
t.style.left = l + 'px'; t.style.top = tp + 'px';
},
hide: function () { t.hidden = true; }
};
}
function rel(box, e) { var r = box.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
function cen(box, node) { var r = box.getBoundingClientRect(), b = node.getBoundingClientRect(); return [b.left - r.left + b.width / 2, b.top - r.top + Math.min(b.height / 2, 40)]; }
function section(id, title, take) {
var s = el('section', 'chart gsec'), h = el('h2', '', title); s.id = id; h.id = id + '-h'; s.setAttribute('aria-labelledby', id + '-h');
add(s, h); if (take) add(s, el('p', 'take', take)); return s;
}
function src(t, as, geo) { var x = [S(t)]; if (geo) x.push('boundaries: U.S. Census Bureau, 2023'); if (as) x.push('as of ' + fd(as, 1)); x = x.filter(Boolean); return x.length ? el('p', 'src', 'Source: ' + x.join(' \u00b7 ')) : null; }
function mapSvg(feats, valOf, sc, label, nameOf, onPick, selId, hatchOf) {
var svg = sv('svg', { viewBox: '0 0 960 600', class: 'gmap', role: 'group', 'aria-label': label }), g = sv('g', {}), hl = sv('path', { class: 'ghl', d: '' });
var sel = sv('path', { class: 'gsel', d: '' }), first = true, nodes = [];
var srt = feats.slice().sort(function (a, b) { return nameOf(a) < nameOf(b) ? -1 : 1; });
srt.forEach(function (f) {
var v = valOf(f), p = sv('path', { d: f.d, fill: sc.col(v), class: isN(v) ? '' : 'nd', tabindex: first ? 0 : -1, role: 'button', 'aria-label': nameOf(f) + ': ' + (isN(v) ? label.fmt(v) : 'no data') + (hatchOf && hatchOf(f) ? ' (uncertain sign)' : '') });
p._f = f; first = false; nodes.push(p); add(g, p);
if (f.id === selId) sel.setAttribute('d', f.d);
});
var hd = '', hp = null;
if (hatchOf) feats.forEach(function (f) { if (hatchOf(f)) hd += f.d; });
if (hd) {
var pid = 'gh' + (++seq), pat = sv('pattern', { id: pid, width: 5, height: 5, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
add(pat, sv('line', { x1: 0, y1: 0, x2: 0, y2: 5, stroke: '#fff', 'stroke-width': 1.6 }));
add(svg, add(sv('defs', {}), pat));
var hp = sv('path', { d: hd, fill: 'url(#' + pid + ')', class: 'ghatch' });
}
add(svg, g, hp, sel, hl);
return { svg: svg, nodes: nodes, hl: hl, hatched: !!hd };
}
function wire(box, M, tipf, onPick) {
var tt = tip(box), nodes = M.nodes;
function over(p, xy) { M.hl.setAttribute('d', p.getAttribute('d')); tt.show(tipf(p._f), xy[0], xy[1]); }
function out() { M.hl.setAttribute('d', ''); tt.hide(); }
nodes.forEach(function (p, i) {
p.addEventListener('pointermove', function (e) { if (e.pointerType === 'mouse') over(p, rel(box, e)); });
p.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') out(); });
p.addEventListener('click', function (e) { if (e.pointerType && e.pointerType !== 'mouse') over(p, rel(box, e)); if (onPick) onPick(p._f); });
p.addEventListener('focus', function () { over(p, cen(box, p)); });
p.addEventListener('blur', out);
p.addEventListener('keydown', function (e) {
var k = e.key, j = k === 'ArrowRight' || k === 'ArrowDown' ? i + 1 : k === 'ArrowLeft' || k === 'ArrowUp' ? i - 1 : k === 'Home' ? 0 : k === 'End' ? nodes.length - 1 : null;
if (j !== null) { e.preventDefault(); j = (j + nodes.length) % nodes.length; p.setAttribute('tabindex', -1); nodes[j].setAttribute('tabindex', 0); nodes[j].focus(); }
else if ((k === 'Enter' || k === ' ') && onPick) { e.preventDefault(); onPick(p._f); }
else if (k === 'Escape') { out(); }
});
});
box.addEventListener('pointerdown', function (e) { if (e.target === M.svg) out(); });
}
function mapBlock(m) {
var s = cur.st, sec, box = el('div', 'gbox'), fmtv = function (v) { return F(v, m); };
if (s && CTOPO[s.id] && CTOPO[s.id].t && CDATA[s.id]) {
var cd = CDATA[s.id], cv = {}, has = cd.counties.length;
cd.counties.forEach(function (c) { cv[c.id] = c; });
var feats = countyFeats(s.id), mv = feats.map(function (f) { var c = cv[f.id]; return c ? c.v[m.key] : null; }), sc = scale(mv, m);
var named = function (f) { return (cv[f.id] && cv[f.id].name) || S(f.p.name) || f.id; };
var rk = feats.filter(function (f) { return isN(mv[feats.indexOf(f)]); }).map(function (f) { return [named(f), cv[f.id].v[m.key]]; }).sort(function (a, b) { return b[1] - a[1]; });
var take = rk.length > 1 ? 'Highest in ' + s.name + ': ' + rk[0][0] + ' (' + fmtv(rk[0][1]) + '); lowest: ' + rk[rk.length - 1][0] + ' (' + fmtv(rk[rk.length - 1][1]) + ').'
: has ? 'No county figures for ' + lc(m.label) + ' in ' + s.name + '.' : 'County figures for ' + s.name + ' are not available yet.';
sec = section('g-map', m.label + ' by county, ' + s.name, take);
var lab = m.label + ' by county in ' + s.name + '. Use arrow keys to move between counties.'; lab = new String(lab); lab.fmt = fmtv;
var M = mapSvg(feats, function (f) { var c = cv[f.id]; return c ? c.v[m.key] : null; }, sc, lab, named, null, null, function (f) { return unsure(cv[f.id], m.key); });
add(box, M.svg); add(sec, box);
wire(box, M, function (f) { var c = cv[f.id], v = c ? c.v[m.key] : null, r = null; for (var i = 0; i < rk.length; i++) if (rk[i][0] === named(f)) r = i + 1;
var fl = c ? [rng(c, m.key, m), flagOf(c, m.key), c.flag].filter(Boolean) : [];
return [named(f), m.label + ': ' + (isN(v) ? fmtv(v) : 'no data')].concat(r ? [ord(r) + ' highest of ' + rk.length + ' in ' + s.abbr] : [], fl.filter(function (x, i) { return fl.indexOf(x) === i; })); });
add(sec, legend(sc, mv.some(function (v) { return !isN(v); }), 'Colour key for ' + m.label, M.hatched));
add(sec, W.vhTable(m.label + ' by county, ' + s.name, ['County', m.label, 'Note'], feats.map(function (f) { var c = cv[f.id], v = c ? c.v[m.key] : null; return [named(f), isN(v) ? fmtv(v) : 'No data', c ? [flagOf(c, m.key), c.flag].filter(Boolean).join('; ') : '']; }).sort(function (a, b) { return a[0] < b[0] ? -1 : 1; })));
add(sec, add(el('p', 'gnote'), backBtn('Back to the US map')));
add(sec, src(m.source, '', 1));
return sec;
}
var fs = usFeats().filter(function (f) { return G.st[f.id]; }), rv = ranked(m), v = function (f) { var x = G.st[f.id]; return x ? x.v[m.key] : null; };
var sc2 = scale(fs.map(v), m);
var tk = rv.length > 1 ? 'Highest: ' + rv[0].name + ' (' + fmtv(rv[0].v[m.key]) + '); lowest: ' + rv[rv.length - 1].name + ' (' + fmtv(rv[rv.length - 1].v[m.key]) + ').' : '';
if (s) tk = 'County map not available for ' + s.name + '. ' + tk;
sec = section('g-map', m.label + ' by state', tk);
var lab2 = new String(m.label + ' by state. Select a state to filter the page; arrow keys move between states.'); lab2.fmt = fmtv;
var M2 = mapSvg(fs, v, sc2, lab2, function (f) { return (G.st[f.id] || {}).name || S(f.p.name) || f.id; }, null, s ? s.id : null, function (f) { return unsure(G.st[f.id], m.key); });
add(box, M2.svg); add(sec, box);
wire(box, M2, function (f) { var x = G.st[f.id], val = x ? x.v[m.key] : null, r = x && rankOf(x, m), fl = x && flagOf(x, m.key);
var rg = x && rng(x, m.key, m);
return [(x || {}).name || S(f.p.name), m.label + ': ' + (isN(val) ? fmtv(val) : 'no data')].concat(rg ? [rg] : [], r ? [ord(r[0]) + ' highest of ' + r[1]] : [], fl && !rg ? [fl] : []); },
function (f) { if (G.st[f.id]) pick(G.st[f.id]); });
add(sec, legend(sc2, fs.some(function (f) { return !isN(v(f)); }), 'Colour key for ' + m.label, M2.hatched));
if (!s) add(sec, el('p', 'gnote', 'Select a state on the map or in the list above to see its counties.'));
else add(sec, add(el('p', 'gnote'), backBtn('Back to nationwide')));
var cols = G.metrics.map(function (x) { return x.label; });
add(sec, W.vhTable('All measures by state', ['State'].concat(cols), G.list.map(function (x) { return [x.name].concat(G.metrics.map(function (mm) { return isN(x.v[mm.key]) ? F(x.v[mm.key], mm) : 'No data'; })); })));
add(sec, src(m.source, m.as_of, 1));
return sec;
}
function backBtn(t) { var b = el('button', 'glink', t); b.type = 'button'; b.onclick = function () { pick(null); }; return b; }
function rankBlock(m) {
var r = ranked(m); if (r.length < 4) return null;
var n = Math.min(10, Math.floor(r.length / 2)), s = cur.st, hi = r.slice(0, n), lo = r.slice(-n).reverse();
var take = s ? (function () { var k = rankOf(s, m); return k ? s.name + ' ranks ' + ord(k[0]) + ' highest of ' + k[1] + ' (' + F(s.v[m.key], m) + ').' : 'No figure for ' + s.name + '.'; })()
: (function () { var md = r[Math.floor((r.length - 1) / 2)], u = G.nat.v[m.key]; return 'Middle state: ' + md.name + ' (' + F(md.v[m.key], m) + ')' + (isN(u) ? '; US: ' + F(u, m) : '') + '.'; })();
var sec = section('g-rank', m.label + ': highest and lowest ' + n + ' states', take), grid = el('div', 'g2');
var a = Math.min(0, r[r.length - 1].v[m.key]), b = Math.max(0, r[0].v[m.key]), span = b - a || 1, z = (0 - a) / span * 100;
[['Highest ' + n, hi, 0], ['Lowest ' + n, lo, r.length - 1]].forEach(function (p) {
var ol = el('ol', 'grk'); ol.setAttribute('aria-label', p[0] + ' states: ' + m.label);
p[1].forEach(function (x, i) {
var v = x.v[m.key], li = el('li', x === s ? 'on' : ''), tr = el('span', 'grt'), br = el('span', 'grb');
var l = Math.min(z, (v - a) / span * 100), w = Math.abs((v - a) / span * 100 - z);
br.style.left = l + '%'; br.style.width = Math.max(w, 0.4) + '%';
add(tr, br); if (a < 0) { var zl = el('span', 'grz'); zl.style.left = z + '%'; add(tr, zl); }
add(li, el('span', 'grn', (p[2] ? r.length - i : i + 1) + '. ' + x.name), el('span', 'grv', FS(v, m)), tr);
if (x === s) li.setAttribute('aria-current', 'true');
add(ol, li);
});
add(grid, add(el('div'), el('h3', 'sub', p[0]), ol));
});
add(sec, grid, src(m.source, m.as_of));
return sec;
}
function heat(h) {
var m = { unit: h.unit, decimals: h.decimals, div: h.div, fine: 1 }, ids = Object.keys(h.rows), s = cur.st;
var all = []; ids.forEach(function (id) { h.rows[id].forEach(function (v) { all.push(v); }); });
var sc = scale(all, m), mon = /^\d{4}-\d\d$/.test(h.cols[0]), last = function (id) { var a = h.rows[id]; for (var i = a.length - 1; i >= 0; i--) if (isN(a[i]) && h.partial.indexOf(h.cols[i]) < 0) return a[i]; return null; };
var avg = function (id) { var a = h.rows[id].filter(isN); return a.length ? a.reduce(function (x, y) { return x + y; }, 0) / a.length : null; };
var hid = 'g-hm-' + (h.id || ++seq), sec = section(hid, h.title, h.take);
var ctl = el('label', 'gsort'), sel = el('select');
[['last', h.partial.length ? 'Latest full ' + (mon ? 'month' : 'year') : 'Latest value'], ['avg', 'Average'], ['name', 'Name']].forEach(function (o) { var x = el('option', '', o[1]); x.value = o[0]; add(sel, x); });
add(ctl, D.createTextNode('Sort states by '), sel); add(sec, ctl);
var wrap = el('div', 'hmw'), box = el('div', 'hmb'); wrap.tabIndex = 0; wrap.setAttribute('role', 'region'); wrap.setAttribute('aria-label', h.title + ' (scrolls sideways)');
add(box, wrap); add(sec, box);
var tt = tip(box), RH = 14, HD = 20, order = [];
function sortIds() {
var k = sel.value, f = k === 'avg' ? avg : last;
order = ids.slice().sort(k === 'name' ? function (a, b) { return G.st[a].name < G.st[b].name ? -1 : 1; } : function (a, b) { var x = f(a), y = f(b); return !isN(x) ? 1 : !isN(y) ? -1 : y - x; });
}
function draw() {
sortIds();
var avail = Math.max(200, box.clientWidth - 44), n = h.cols.length, cw = Math.max(mon ? 5 : 16, Math.min(mon ? 12 : 40, avail / n));
var Wd = n * cw, Hh = HD + order.length * RH, inner = el('div', 'hmi'), labs = el('div', 'hml'), svg = sv('svg', { width: Wd, height: Hh, 'aria-hidden': 'true', 'shape-rendering': 'crispEdges' });
add(labs, el('span', 'hmh', ''));
order.forEach(function (id, r) {
var lb = el('span', id === (s && s.id) ? 'on' : '', G.st[id].abbr); add(labs, lb);
h.rows[id].forEach(function (v, c) { add(svg, sv('rect', { x: c * cw, y: HD + r * RH, width: cw - (cw > 8 ? 1 : 0), height: RH - 1, fill: sc.col(v) })); });
});
var step = mon ? 12 : n > 20 ? 5 : 2;
h.cols.forEach(function (c, i) { if (h.partial.indexOf(c) < 0) return;
add(svg, sv('rect', { x: i * cw + 0.5, y: HD - 0.5, width: Math.max(1, cw - (cw > 8 ? 2 : 1)), height: order.length * RH, fill: 'none', stroke: '#111', 'stroke-dasharray': '2 2' }));
add(svg, W.txt(Math.min(i * cw + cw, Wd), 13, 'partial', { class: 'tick', 'text-anchor': 'end' })); });
h.cols.forEach(function (c, i) {
var yr = +c.slice(0, 4);
if (h.partial.indexOf(c) >= 0 || (!mon && i * cw + 34 > Wd - 44 && h.partial.length)) return;
if (mon ? c.slice(5) === '01' && (cw * 12 >= 34 || yr % 2 === 0) : (yr % step === 0)) add(svg, W.txt(i * cw, 13, mon ? String(yr) : c, { class: 'tick' }));
});
if (s && order.indexOf(s.id) >= 0) add(svg, sv('rect', { x: 0.5, y: HD + order.indexOf(s.id) * RH - 0.5, width: Wd - 1, height: RH, fill: 'none', stroke: '#111', 'stroke-width': 1.5 }));
add(inner, labs, svg); wrap.textContent = ''; add(wrap, inner);
function at(e) { var r = svg.getBoundingClientRect(), c = Math.floor((e.clientX - r.left) / cw), rw = Math.floor((e.clientY - r.top - HD) / RH); return c >= 0 && c < n && rw >= 0 && rw < order.length ? [c, rw] : null; }
function show(e) { var p = at(e); if (!p) return tt.hide(); var id = order[p[1]], v = h.rows[id][p[0]], xy = rel(box, e);
tt.show([G.st[id].name, fd(h.cols[p[0]], 1) + (h.partial.indexOf(h.cols[p[0]]) >= 0 ? ' (partial)' : '') + ': ' + (isN(v) ? F(v, m) : 'no data')], xy[0], xy[1]); }
svg.addEventListener('pointermove', show); svg.addEventListener('pointerdown', show); svg.addEventListener('pointerleave', function (e) { if (e.pointerType === 'mouse') tt.hide(); });
if (!wrap._sc) { wrap._sc = 1; wrap.scrollLeft = wrap.scrollWidth; }
}
sel.onchange = function () { draw(); };
wrap.addEventListener('scroll', function () { tt.hide(); }, { passive: true });
W.addDraw(draw);
add(sec, legend(sc, all.some(function (v) { return !isN(v); }), 'Colour key for ' + h.title));
if (h.partial.length) add(sec, el('p', 'gnote', 'Partial ' + (h.partial.length > 1 ? 'periods' : (mon ? 'month' : 'year')) + ', dashed: ' + h.partial.map(function (c) { return fd(c, 1); }).join(', ') + '. Not a full ' + (mon ? 'month' : 'year') + ' of data.'));
add(sec, W.vhTable(h.title, ['State'].concat(h.cols.map(function (c) { return fd(c) + (h.partial.indexOf(c) >= 0 ? ' (partial)' : ''); })), ids.map(function (id) { return [G.st[id].name].concat(h.rows[id].map(function (v) { return isN(v) ? F(v, m) : 'No data'; })); })));
add(sec, src(h.source, h.as_of));
return sec;
}
function multiples(m) {
var key = m.key, has = function (k) { return G.list.some(function (x) { return A(x.series[k]).length > 1; }); }, mm = m;
if (!has(key)) { var alt = G.metrics.filter(function (x) { return has(x.key); })[0]; if (!alt) return null; mm = alt; key = alt.key; }
var rows = G.list.map(function (x) { var p = A(x.series[key]).filter(function (q) { return Array.isArray(q) && !isNaN(pd(q[0])); }); return { s: x, p: p }; }).filter(function (r) { return r.p.some(function (q) { return isN(q[1]); }); });
var us = A(G.nat.series[key]).filter(function (q) { return Array.isArray(q) && !isNaN(pd(q[0])); });
var ys = [], ts = []; rows.forEach(function (r) { r.p.forEach(function (q) { ts.push(pd(q[0])); if (isN(q[1])) ys.push(q[1]); }); }); us.forEach(function (q) { if (isN(q[1])) ys.push(q[1]); });
var y0 = Math.min.apply(0, ys), y1 = Math.max.apply(0, ys), t0 = Math.min.apply(0, ts), t1 = Math.max.apply(0, ts);
rows.forEach(function (r) { for (var i = r.p.length - 1; i >= 0; i--) if (isN(r.p[i][1])) { r.last = r.p[i]; break; } });
rows.sort(function (a, b) { return b.last[1] - a.last[1]; });
var s = cur.st, take = 'Each line is one state, ' + fd(rows[0].p[0][0]) + ' to ' + fd(rows[0].last[0]) + ', on one shared scale' + (us.length ? '; grey is the US.' : '.');
var sec = section('g-sm', mm.label + ', each state over time', take), grid = el('ul', 'gsm');
function path(p, w, h) { var d = '', pen = 'M'; p.forEach(function (q) { if (!isN(q[1])) { pen = 'M'; return; } d += pen + ((pd(q[0]) - t0) / (t1 - t0 || 1) * w).toFixed(1) + ' ' + (2 + (y1 - q[1]) / (y1 - y0 || 1) * (h - 4)).toFixed(1); pen = 'L'; }); return d; }
var usd = us.length ? path(us, 100, 34) : '';
rows.forEach(function (r) {
var on = s === r.s, b = el('button', on ? 'on' : ''), svg = sv('svg', { viewBox: '0 0 100 34', preserveAspectRatio: 'none', 'aria-hidden': 'true' });
b.type = 'button'; b.setAttribute('aria-label', r.s.name + ': ' + F(r.last[1], mm) + ' in ' + fd(r.last[0]) + '. Show ' + r.s.name);
if (on) b.setAttribute('aria-current', 'true');
if (usd) add(svg, sv('path', { d: usd, fill: 'none', stroke: '#b3b3b3', 'stroke-width': 1, 'vector-effect': 'non-scaling-stroke' }));
add(svg, sv('path', { d: path(r.p, 100, 34), fill: 'none', stroke: on ? ACC : '#111', 'stroke-width': on ? 2 : 1.25, 'vector-effect': 'non-scaling-stroke' }));
add(b, add(el('span', 'gsmh'), el('span', 'gsma', r.s.abbr), el('span', 'gsmv', F(r.last[1], mm))), svg);
b.onclick = function () { pick(r.s); };
add(grid, add(el('li'), b));
});
add(sec, grid, src(mm.source, mm.as_of));
return sec;
}
function partialOf(k, c) { return G.hms.some(function (h) { return h.metric === k && h.partial.indexOf(String(c)) >= 0; }); }
function stateDoc(s) {
var d = { schema: 'dash/1.2', area: 'housing', title: 'Housing in ' + s.name, as_of: G.as_of || (DATA && DATA.as_of), generated: G.generated || (DATA && DATA.generated),
method_url: (DATA && DATA.method_url) || '/data/housing/method/', headline_max: 10, headline: [], charts: [], notes: G.notes.slice() };
G.metrics.forEach(function (m) {
var v = s.v[m.key], u = G.nat.v[m.key], r = rankOf(s, m), wu = W.isWord(m.unit);
var lab = wu && m.label.indexOf(m.unit.replace(/^per /, '')) < 0 ? m.label.replace(/ \(/, ' ' + m.unit + ' (') : m.label;
if (wu && lab === m.label && m.label.indexOf(m.unit.replace(/^per /, '')) < 0) lab = m.label + ', ' + m.unit;
var h = { label: lab, value: isN(v) ? v : null, unit: wu ? '' : m.unit, decimals: m.decimals, as_of: m.as_of };
if (isN(v) && isN(u)) { h.change = round(v - u, W.dp(m.unit, m.decimals)); h.change_label = (m.unit === '%' ? 'percentage points ' : '') + 'vs US (' + FS(u, m) + ')'; h.good = m.good; }
var sub = [], rg = rng(s, m.key, m, 1), fl = flagOf(s, m.key); if (r) sub.push(ord(r[0]) + ' highest of ' + r[1]); if (rg) sub.push(rg); else if (fl) sub.push(fl);
if (sub.length) h.sub = sub.join(' \u00b7 ');
d.headline.push(h);
});
Object.keys(s.series).forEach(function (k) {
var p = A(s.series[k]).filter(function (q) { return Array.isArray(q) && isN(q[1]); }); if (p.length < 2 || d.charts.length >= 2) return;
var m = metric(k); if (m.key !== k) m = { label: k.replace(/_/g, ' '), unit: '', decimals: 1, source: '' };
var ser = [{ name: s.name, points: s.series[k] }], us = A(G.nat.series[k]);
if (us.length) ser.push({ name: 'United States', points: us });
var a = p[0], b = p[p.length - 1];
d.charts.push({ id: 's-' + k, type: 'line', title: m.label + ', ' + s.name, unit: m.unit, decimals: m.decimals, source: m.source, highlight: s.name, series: ser,
takeaway: m.label + ' in ' + s.name + ' went from ' + F(a[1], m) + ' in ' + fd(a[0]) + ' to ' + F(b[1], m) + ' in ' + fd(b[0]) + (partialOf(k, b[0]) ? ' (partial year)' : '') + '.' });
});
G.hms.forEach(function (h) {
var row = h.rows[s.id]; if (!row || d.charts.length >= 3 || !/^\d{4}-\d\d$/.test(h.cols[0])) return;
var pts = h.cols.map(function (c, i) { return [c, isN(row[i]) ? row[i] : null]; }), ok = pts.filter(function (q) { return isN(q[1]); });
if (ok.length < 2) return;
var L = ok[ok.length - 1], m = { unit: h.unit, decimals: h.decimals };
d.charts.push({ id: 's-' + h.id, type: 'line', title: h.title.replace(/ by state and month$/i, '') + ', ' + s.name, unit: h.unit, decimals: h.decimals, source: h.source,
series: [{ name: s.name, points: pts }], takeaway: 'Latest month, ' + fd(L[0], 1) + ': ' + F(L[1], m) + '.' });
});
var mt = DATA && A(DATA.charts).filter(function (c) { return c && c.type === 'table' && Array.isArray(c.rows); })[0];
if (mt) {
var k0 = (A(mt.columns)[0] || {}).key, rx = new RegExp(',\\s*(?:[A-Z]{2}-)*' + s.abbr + '(?:-[A-Z]{2})*$');
var rows = mt.rows.filter(function (r) { return rx.test(S(r[k0])); });
if (rows.length) {
var rk = mt.rank_by || (mt.columns[1] || {}).key, top = rows.slice().sort(function (a, b) { return (isN(b[rk]) ? b[rk] : -1e99) - (isN(a[rk]) ? a[rk] : -1e99); })[0];
var col = A(mt.columns).filter(function (c) { return c.key === rk; })[0] || {};
var c = JSON.parse(JSON.stringify(mt)); c.rows = rows; c.id = 's-metros';
c.title = mt.title.replace(/,?\s*50 largest metros/i, '') + ', metros in ' + s.name;
c.takeaway = rows.length === 1 ? rows[0][k0] + ': ' + fmt(top[rk], col.unit, col.decimals) + ' (' + lc(col.label || '') + ').' : 'Highest of ' + rows.length + ' metros by ' + lc(col.label || 'value') + ': ' + top[k0] + ' (' + fmt(top[rk], col.unit, col.decimals) + ').';
d.charts.push(c);
}
}
if (d.charts.length < 1) d.charts.push({ id: 's-none', type: 'table', title: 'State figures', takeaway: 'This state has no time series in the latest export.', source: '', columns: [{ key: 'm', label: 'Measure' }, { key: 'v', label: s.name }], rows: d.headline.map(function (h) { return { m: h.label, v: isN(h.value) ? F(h.value, h) : null }; }) });
var seen = {}; d.sources = A(G.sources).concat(DATA ? A(DATA.sources) : []).filter(function (x) { if (!x || seen[x.name]) return false; seen[x.name] = 1; return true; });
return d;
}
var bar = null;
function buildBar() {
bar = el('div', 'gbar'); bar.setAttribute('role', 'group'); bar.setAttribute('aria-label', 'Filter the page');
var a = el('label', 'gf'), as = el('select'), mlab = el('label', 'gf gfm'), ms = el('select'), rb = el('button', 'greset', 'Reset to nationwide');
as.id = 'g-area'; ms.id = 'g-metric'; rb.type = 'button';
var o = el('option', '', NAT); o.value = ''; add(as, o);
G.list.forEach(function (s) { var x = el('option', '', s.name); x.value = s.abbr; add(as, x); });
G.metrics.forEach(function (m) { var x = el('option', '', m.label); x.value = m.key; add(ms, x); });
add(a, el('span', 'gfl', 'Area'), as); add(mlab, el('span', 'gfl', 'Map measure'), ms);
add(bar, a, mlab, rb);
as.onchange = function () { pick(find(as.value)); };
ms.onchange = function () { cur.metric = ms.value; url(false); draw(); };
rb.onclick = function () { pick(null); as.focus(); };
bar._s = as; bar._m = ms; bar._r = rb;
var meta = root.querySelector('.meta'); meta.parentNode.insertBefore(bar, meta.nextSibling);
}
function syncBar() {
bar._s.value = cur.st ? cur.st.abbr : ''; bar._m.value = cur.metric;
bar._r.disabled = !cur.st; bar._r.setAttribute('aria-label', cur.st ? 'Reset to nationwide (now showing ' + cur.st.name + ')' : 'Reset to nationwide (already nationwide)');
}
function find(x) {
x = S(x).trim(); if (!x) return null; var u = x.toUpperCase();
for (var i = 0; i < G.list.length; i++) { var s = G.list[i]; if (s.abbr.toUpperCase() === u || s.id === x || s.name.toUpperCase() === u) return s; }
return null;
}
function readUrl() {
var p = new URLSearchParams(location.search), st = find(p.get('state')), m = p.get('metric');
cur.st = st; cur.metric = metric(m || (G.metrics[0] || {}).key).key;
return { bad: !!p.get('state') && !st };
}
function url(push) {
var p = new URLSearchParams(location.search);
if (cur.st) p.set('state', cur.st.abbr); else p.delete('state');
if (cur.metric && cur.metric !== G.metrics[0].key) p.set('metric', cur.metric); else p.delete('metric');
var q = p.toString(), u = location.pathname + (q ? '?' + q : '') + location.hash;
if (u !== location.pathname + location.search + location.hash) history[push ? 'pushState' : 'replaceState'](null, '', u);
}
function pick(s) {
if (s === cur.st) return;
cur.st = s; url(true); load().then(draw);
}
function load() {
var s = cur.st; if (!s || CDATA[s.id] !== undefined) return Promise.resolve();
if (s.nc) { CDATA[s.id] = null; return Promise.resolve(); }
CTOPO[s.id] = CTOPO[s.id] || {};
var a = CTOPO[s.id].t !== undefined ? Promise.resolve() : json(GEO + 'counties/' + s.id + '.json').then(function (t) { CTOPO[s.id].t = t; }, function () { CTOPO[s.id].t = null; });
var b = json(G.cpath + s.id + '.json').then(function (j) {
if (!j || !Array.isArray(j.counties)) throw 0;
CDATA[s.id] = { as_of: S(j.as_of), source: S((A(j.sources)[0] || {}).name), counties: j.counties.map(function (c) { return { id: gid(c), name: S(c.name), v: vals(c), flag: S(c._flag), _flags: c._flags || {}, low: c.low, high: c.high, range_label: c.range_label }; }).filter(function (c) { return /^\d{5}$/.test(c.id); }) };
}).catch(function () { CDATA[s.id] = null; });
return Promise.all([a, b]);
}
function draw() {
var s = cur.st, m = metric(cur.metric), body = root.querySelector('.body'), y = scrollY;
var foc = D.activeElement && D.activeElement.closest && D.activeElement.closest('.gsec') ? D.activeElement.closest('.gsec').id || '' : '';
syncBar();
var doc = s ? stateDoc(s) : DATA;
try { if (!doc) throw 0; W.render(root, doc); } catch (e) { if (!s && !DATA) { body.textContent = ''; } }
D.title = s ? s.name + ' ' + base.title : base.title;
if (s && s.findings.length) {
var fsec = add(el('section', 'gfind'), el('h2', 'vh', 'Findings for ' + s.name)), ul = el('ul');
s.findings.forEach(function (t) { add(ul, el('li', '', t)); }); add(fsec, ul);
var hd0 = body.querySelector('.heads'); body.insertBefore(fsec, hd0 || body.firstChild);
}
var top = [mapBlock(m), rankBlock(m)], low = G.hms.map(heat).concat([multiples(m)]);
var heads = body.querySelector('.heads'), info = body.querySelector('.info');
top.filter(Boolean).forEach(function (x) { if (heads) body.insertBefore(x, heads.nextSibling) && (heads = x); else body.insertBefore(x, body.firstChild); });
low.filter(Boolean).forEach(function (x) { body.insertBefore(x, info || null); });
if (G.notes.length && !s && DATA) {
var nl = body.querySelector('.notes'); if (nl) G.notes.forEach(function (n) { add(nl, el('li', '', n)); });
}
W.redraw();
scrollTo(0, y);
if (foc) { var f = D.getElementById(foc); if (f) { var t = f.querySelector('[tabindex="0"]') || f.querySelector('button.on') || f; if (t && t.focus) t.focus({ preventScroll: true }); } }
}
function start() {
json('data.json').catch(function () { return null; }).then(function (d) {
var g = d ? (typeof d.geo === 'string' && /^[\w-]+\.json$/.test(d.geo) ? d.geo : null) : 'states.json';
if (!g) return [d, null, null];
return Promise.all([d, json(g).catch(function () { return null; }), json(GEO + 'states.json').catch(function () { return null; })]);
}).then(function (r) {
var d = r[0]; DATA = d && /^dash\/1(\.\d+)?$/.test(d.schema) && d.area === 'housing' && Array.isArray(d.charts) ? d : null;
G = norm(r[1]); TOPO = r[2] && r[2].arcs ? { t: r[2] } : null;
if (!G || !TOPO || !G.metrics.length) { if (DATA) W.render(root, DATA); else W.empty(root); return; }
buildBar();
var bad = readUrl().bad; if (bad) url(false);
addEventListener('popstate', function () { readUrl(); load().then(draw); });
return load().then(draw);
}).catch(function () { try { if (DATA) W.render(root, DATA); else W.empty(root); } catch (e) {} });
}
start();
})();
