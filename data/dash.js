/* Workbench data dashboards: draws ./data.json (schema dash/1) and ../method.md. Built from dash.src.js, kept outside the site. */
(function () {
'use strict';
var D = document, NS = 'http://www.w3.org/2000/svg', ACC = '#1f3fbf';
var MON = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
var MONL = ['January','February','March','April','May','June','July','August','September','October','November','December'];
var GREY = ['#8c8c8c', '#b3b3b3', '#6e6e6e', '#c4c4c4'];
var EMPTY = 'This dashboard is waiting for its first data export.';
function el(t, c, x) { var e = D.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; }
function sv(t, a, x) { var e = D.createElementNS(NS, t); for (var k in a) e.setAttribute(k, a[k]); if (x != null) e.textContent = x; return e; }
function add(p) { for (var i = 1; i < arguments.length; i++) if (arguments[i]) p.appendChild(arguments[i]); return p; }
function isN(v) { return typeof v === 'number' && isFinite(v); }
function S(v) { return typeof v === 'string' ? v : ''; }
function A(v) { return Array.isArray(v) ? v : []; }
function get(u) { return fetch(u, { cache: 'no-cache' }).then(function (r) { if (!r.ok) throw 0; return r; }); }
function dp(u, d) { return d === +d && d >= 0 && d <= 6 && d % 1 === 0 ? d : (u === 'count' ? 0 : 1); }
function num(v, d) { return v.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d }); }
function abbr(n) { return num(n, n < 100 ? 1 : 0).replace(/\.0$/, ''); }
function fmt(v, u, d, short) {
if (!isN(v)) return '\u2013';
d = dp(u, d); var a = Math.abs(v), s;
if (u === '$') s = '$' + (a >= 1e9 ? abbr(a / 1e9) + 'B' : a >= 1e6 ? abbr(a / 1e6) + 'M' : a >= 1e4 ? abbr(a / 1e3) + 'K' : num(a, d));
else if (u === '%') s = num(a, d) + '%';
else if (u === 'pp') s = num(a, d) + (short ? ' pts' : num(a, d) === num(1, d) ? ' percentage point' : ' percentage points');
else if (u === 'x') s = num(a, d) + '\u00d7';
else if (!u || u === 'count' || u === 'index') s = num(a, d);
else s = num(a, d) + ' ' + u;
return (v < 0 && s.replace(/[^1-9]/g, '') ? '\u2212' : '') + s;
}
function isWord(u) { return !!u && ['%', '$', 'x', 'pp', 'count', 'index'].indexOf(u) < 0; }
// 'pp' is the data code for percentage points; pages spell it out ("pts" only in tight chart and table spots, explained in the source line).
function words(s) { return S(s).replace(/\bpp\b/g, 'percentage points'); }
function chg(v, u, d) { var s = fmt(v, u === '%' ? '' : u, d); return v > 0 ? '+' + s : s; }
var DRX = /^(\d{4})(?:-(\d\d)(?:-(\d\d))?)?/;
function pd(s) { var m = DRX.exec(S(s)); return m ? Date.UTC(+m[1], m[2] ? m[2] - 1 : 0, m[3] ? +m[3] : 1) : NaN; }
function fd(s, longMonth) { var m = DRX.exec(S(s)); if (!m) return S(s); return m[3] ? MON[m[2] - 1] + ' ' + (+m[3]) + ', ' + m[1] : m[2] ? (longMonth ? MONL : MON)[m[2] - 1] + ' ' + m[1] : m[1]; }
function ts(s) { var t = Date.parse(S(s)); return isNaN(t) ? pd(s) : t; }
function ago(t) { var h = (Date.now() - t) / 36e5; return h < 1 ? 'under 1 hour ago' : h < 48 ? Math.round(h) + ' h ago' : Math.round(h / 24) + ' days ago'; }
function today() { return new Date().toISOString().slice(0, 10); }
function vhTable(cap, head, rows) {
var t = el('table'), tr = el('tr');
add(t, el('caption', '', cap));
head.forEach(function (h) { add(tr, el('th', '', h)); });
add(t, add(el('thead'), tr));
var tb = el('tbody'); add(t, tb);
rows.forEach(function (r) { var tr = el('tr'); r.forEach(function (c, i) { var x = el(i ? 'td' : 'th', '', c); if (!i) x.scope = 'row'; add(tr, x); }); add(tb, tr); });
return add(el('div', 'vh'), t);
}
function svgBox(W, H, label) { var s = sv('svg', { width: W, height: H, viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': label }); return s; }
function txt(x, y, s, a) { a = a || {}; a.x = x; a.y = y; return sv('text', a, s); }
function nice(lo, hi, n) {
var span = hi - lo || Math.abs(hi) || 1, st = Math.pow(10, Math.floor(Math.log10(span / n))), e = span / n / st, out = [];
st *= e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1;
for (var v = Math.floor(lo / st) * st; v <= Math.ceil(hi / st) * st + st / 2; v += st) out.push(+v.toFixed(10));
return out;
}
function cw(s, px) { return S(s).length * (px || 12) * 0.56; }
function clip(s, w, px) { var n = Math.floor(w / ((px || 12) * 0.56)); return s.length > n ? s.slice(0, Math.max(1, n - 1)) + '\u2026' : s; }
function line(c) {
var hl = S(c.highlight), ser = A(c.series).slice(0, 4).map(function (s) {
return { name: S(s.name), id: S(s.series_id), p: A(s.points).filter(function (p) { return Array.isArray(p) && !isNaN(pd(p[0])) && (p[1] === null || isN(p[1])); }).map(function (p) { return [pd(p[0]), p[1], p[0]]; }) };
}).filter(function (s) { return s.p.length; });
if (!ser.length) throw 0;
var grey = 0, hasHl = ser.some(function (s) { return s.name === hl; });
ser.forEach(function (s, i) {
s.hl = s.name === hl; s.thin = hasHl && !s.hl;
s.col = s.hl ? ACC : !hasHl && i === 0 ? '#111' : GREY[grey++ % 4];
s.last = null; for (var j = s.p.length - 1; j >= 0; j--) if (s.p[j][1] !== null) { s.last = s.p[j]; break; }
s.first = null; for (j = 0; j < s.p.length; j++) if (s.p[j][1] !== null) { s.first = s.p[j]; break; }
});
var u = c.unit, d = c.decimals, base = isN(c.baseline) ? c.baseline : null;
var label = S(c.title) + '. ' + ser.map(function (s) { return s.first ? s.name + ' from ' + fmt(s.first[1], u, d) + ' in ' + fd(s.first[2]) + ' to ' + fmt(s.last[1], u, d) + ' in ' + fd(s.last[2]) : s.name + ': no data'; }).join('; ') + '.';
var box = el('div', 'plot'), legend = null;
function draw() {
var W = Math.max(260, box.clientWidth || 600), nar = W < 520, H = nar ? 210 : 250, T = 10, B = 24;
var xs = [], ys = base === null ? [] : [base];
ser.forEach(function (s) { s.p.forEach(function (p) { xs.push(p[0]); if (p[1] !== null) ys.push(p[1]); }); });
var x0 = Math.min.apply(0, xs), x1 = Math.max.apply(0, xs), tk = nice(Math.min.apply(0, ys), Math.max.apply(0, ys), nar ? 3 : 4);
var y0 = tk[0], y1 = tk[tk.length - 1];
var td = Math.min(dp(u, d), Math.max(0, -Math.floor(Math.log10((tk[1] - tk[0]) || 1) + 1e-9)));
var tl = function (v, i) { return fmt(v, i === tk.length - 1 || (!isWord(u) && u !== 'pp') ? u : '', td, true); };
var L = Math.max.apply(0, tk.map(function (v, i) { return cw(tl(v, i), 12); })) + 10;
var lab = ser.length > 1 ? function (s) { return s.name; } : function (s) { return s.last ? fmt(s.last[1], u, d, true) : ''; };
var lw = Math.max.apply(0, ser.map(function (s) { return cw(lab(s), 12); })) + 10, useLeg = lw > W * 0.34;
var R = useLeg ? 8 : lw + 6, pw = W - L - R, ph = H - T - B;
var X = function (t) { return L + (x1 > x0 ? (t - x0) / (x1 - x0) : 0.5) * pw; }, Y = function (v) { return T + (y1 - v) / (y1 - y0 || 1) * ph; };
var svg = svgBox(W, H, label), g;
tk.forEach(function (v, i) { var y = Y(v); add(svg, sv('line', { x1: L, x2: L + pw, y1: y, y2: y, stroke: '#ececec' }), txt(L - 8, y + 4, tl(v, i), { 'text-anchor': 'end', class: 'tick' })); });
add(svg, sv('line', { x1: L, x2: L + pw, y1: T + ph + .5, y2: T + ph + .5, stroke: '#bdbdbd' }));
if (base !== null) { var by = Y(base); add(svg, sv('line', { x1: L, x2: L + pw, y1: by, y2: by, stroke: '#111', 'stroke-width': 1, 'stroke-dasharray': '3 3' })); if (S(c.base)) add(svg, txt(L + 4, by - 5, S(c.base), { class: 'tick' })); }
var ya = new Date(x0).getUTCFullYear(), yb = new Date(x1).getUTCFullYear(), n = nar ? 3 : 6, xt = [];
if (yb - ya >= 2) { var st = Math.ceil((yb - ya) / n); for (var yr = ya + (new Date(x0).getUTCMonth() ? 1 : 0); yr <= yb; yr += st) xt.push([Date.UTC(yr, 0, 1), String(yr)]); }
else xt = [[x0, fd(ser[0].p[0][2])], [x1, fd(ser[0].p[ser[0].p.length - 1][2])]];
xt.forEach(function (q, i) { var x = X(q[0]), an = xt.length === 2 ? (i ? 'end' : 'start') : 'middle'; add(svg, sv('line', { x1: x, x2: x, y1: T + ph, y2: T + ph + 4, stroke: '#bdbdbd' }), txt(x, H - 6, q[1], { 'text-anchor': an, class: 'tick' })); });
ser.slice().sort(function (a, b) { return a.hl - b.hl; }).forEach(function (s) {
var dd = '', pen = 'M';
s.p.forEach(function (p) { if (p[1] === null) { pen = 'M'; return; } dd += pen + X(p[0]).toFixed(1) + ' ' + Y(p[1]).toFixed(1); pen = 'L'; });
add(svg, sv('path', { d: dd, fill: 'none', stroke: s.col, 'stroke-width': s.hl ? 2.25 : s.thin ? 1 : 1.75, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
if (s.last) add(svg, sv('circle', { cx: X(s.last[0]), cy: Y(s.last[1]), r: s.thin ? 2 : 3, fill: s.col }));
});
if (!useLeg) {
var ls = ser.filter(function (s) { return s.last; }).map(function (s) { return { s: s, y: Y(s.last[1]) + 4 }; }).sort(function (a, b) { return a.y - b.y; });
for (var i = 1; i < ls.length; i++) if (ls[i].y - ls[i - 1].y < 14) ls[i].y = ls[i - 1].y + 14;
for (i = ls.length - 1; i >= 0; i--) { var mx = i === ls.length - 1 ? H - B : ls[i + 1].y - 14; if (ls[i].y > mx) ls[i].y = mx; }
ls.forEach(function (o) { add(svg, txt(L + pw + 8, o.y, lab(o.s), { class: 'dl', fill: o.s.hl ? ACC : o.s.col === '#111' ? '#111' : '#5c5c5c', 'font-weight': o.s.hl ? 600 : 400 })); });
}
box.textContent = ''; add(box, svg);
if (legend) legend.hidden = !useLeg;
}
if (ser.length > 1) {
legend = el('ul', 'leg');
ser.forEach(function (s) { var li = el('li'), k = el('span', 'key'); k.style.background = s.col; k.style.height = s.hl ? '3px' : s.thin ? '1px' : '2px'; add(legend, add(li, k, D.createTextNode(s.name))); });
}
var dates = {}, keys = [];
ser.forEach(function (s, i) { s.p.forEach(function (p) { if (!dates[p[2]]) { dates[p[2]] = []; keys.push(p[2]); } dates[p[2]][i] = p[1]; }); });
keys.sort(function (a, b) { return pd(a) - pd(b); });
var tbl = vhTable(S(c.title), ['Date'].concat(ser.map(function (s) { return s.name + (s.id ? ' (series ' + s.id + ')' : ''); })),
keys.map(function (k) { return [fd(k)].concat(ser.map(function (s, i) { return fmt(dates[k][i], u, d); })); }));
return { nodes: [box, legend, tbl], draw: draw };
}
function bar(c) {
var hl = A(c.highlight), u = c.unit, d = c.decimals;
var bs = A(c.bars).slice(0, 25).filter(function (b) { return b && S(b.label) && (b.value === null || isN(b.value)); });
if (!bs.length) throw 0;
var wh = bs.some(function (b) { return isN(b.low) && isN(b.high); }), anyHl = bs.some(function (b) { return hl.indexOf(b.label) >= 0; });
var vals = []; bs.forEach(function (b) { [b.value, wh && b.low, wh && b.high].forEach(function (v) { if (isN(v)) vals.push(v); }); });
var lo = Math.min(0, Math.min.apply(0, vals)), hi = Math.max(0, Math.max.apply(0, vals));
var rl = S(c.range_label) || S((bs.filter(function (b) { return b.range_label; })[0] || {}).range_label);
var label = S(c.title) + '. ' + bs.map(function (b) { return b.label + ' ' + fmt(b.value, u, d); }).join(', ') + '.';
var box = el('div', 'plot');
function draw() {
var W = Math.max(260, box.clientWidth || 600), nar = W < 520, rh = nar ? 40 : 28;
var vw = Math.max.apply(0, bs.map(function (b) { return cw(fmt(b.value, u, d, true)); })) + 10;
var lw = nar ? 0 : Math.min(W * 0.38, Math.max.apply(0, bs.map(function (b) { return cw(b.label, 13); })) + 14);
var neg = lo < 0, pw = W - lw - vw - (neg ? vw : 0), x0 = lw + (neg ? vw : 0);
var X = function (v) { return x0 + (v - lo) / (hi - lo || 1) * pw; }, H = bs.length * rh + 4;
var svg = svgBox(W, H, label);
bs.forEach(function (b, i) {
var y = i * rh, isH = hl.indexOf(b.label) >= 0, by = nar ? y + 19 : y + 6, bh = nar ? 14 : rh - 12, v = isN(b.value) ? b.value : 0;
var col = isH ? (wh ? '#a8b5ea' : ACC) : wh ? '#cfcfcf' : anyHl ? '#9e9e9e' : '#111';
var l = nar ? txt(0, y + 13, clip(b.label, W, 13), { class: 'bl' }) : txt(0, by + bh / 2 + 4.5, clip(b.label, lw - 10, 13), { class: 'bl' });
if (isH) l.setAttribute('font-weight', 600);
add(svg, l);
var a = X(Math.min(0, v)), w = Math.max(isN(b.value) ? 1 : 0, Math.abs(X(v) - X(0)));
add(svg, sv('rect', { x: a, y: by, width: w, height: bh, fill: col }));
var end = v;
if (wh && isN(b.low) && isN(b.high)) {
var my = by + bh / 2, xl = X(b.low), xh = X(b.high), k = isH ? ACC : '#111';
add(svg, sv('line', { x1: xl, x2: xh, y1: my, y2: my, stroke: k }), sv('line', { x1: xl, x2: xl, y1: my - 4, y2: my + 4, stroke: k }), sv('line', { x1: xh, x2: xh, y1: my - 4, y2: my + 4, stroke: k }));
end = v < 0 ? Math.min(v, b.low) : Math.max(v, b.high);
}
add(svg, txt(v < 0 ? X(end) - 6 : X(end) + 6, by + bh / 2 + 4.5, fmt(b.value, u, d, true), { class: 'bv', 'text-anchor': v < 0 ? 'end' : 'start', fill: isH ? ACC : '#111' }));
});
if (neg) add(svg, sv('line', { x1: X(0), x2: X(0), y1: 0, y2: H, stroke: '#111' }));
box.textContent = ''; add(box, svg);
}
var head = ['Category', 'Value'];
if (wh) head.push(rl || 'Range');
if (bs.some(function (b) { return isN(b.n); })) head.push('n');
var tbl = vhTable(S(c.title), head, bs.map(function (b) {
var r = [b.label + (S(b.series_id) ? ' (series ' + b.series_id + ')' : ''), fmt(b.value, u, d)];
if (wh) r.push(isN(b.low) && isN(b.high) ? fmt(b.low, u, d) + ' to ' + fmt(b.high, u, d) : '\u2013');
if (head[head.length - 1] === 'n') r.push(isN(b.n) ? num(b.n, 0) : '\u2013');
return r;
}));
var key = wh ? el('p', 'whk', 'Whiskers: ' + (rl || 'range') + '.') : null;
return { nodes: [box, key, tbl], draw: draw };
}
function moreBtn(rows, n) {
if (rows.length <= n) return null;
var b = el('button', 'more', 'Show all ' + rows.length); b.type = 'button'; b.setAttribute('aria-expanded', 'false');
rows.forEach(function (r, i) { r.hidden = i >= n; });
b.onclick = function () { var o = b.getAttribute('aria-expanded') !== 'true'; rows.forEach(function (r, i) { r.hidden = !o && i >= n; }); b.setAttribute('aria-expanded', o); b.textContent = o ? 'Show top ' + n : 'Show all ' + rows.length; };
return b;
}
function table(c) {
var cols = A(c.columns).filter(function (k) { return k && S(k.key) && S(k.label); }), rows = A(c.rows).slice(0, 50).filter(function (r) { return r && typeof r === 'object'; });
if (!cols.length || !rows.length) throw 0;
var rk = S(c.rank_by), rank = cols.some(function (k) { return k.key === rk; });
if (rank) { var dir = c.order === 'asc' ? 1 : -1; rows = rows.slice().sort(function (a, b) { var x = a[rk], y = b[rk]; return !isN(x) ? (isN(y) ? 1 : 0) : !isN(y) ? -1 : (x - y) * dir; }); }
var numc = cols.map(function (k) { return k.unit != null || rows.some(function (r) { return isN(r[k.key]); }); });
var t = el('table', 't' + (cols.length + rank > 3 ? ' stack' : '')), hr = el('tr'), tb = el('tbody'), flags = [], trs = [];
add(t, el('caption', 'vh', S(c.title)));
if (rank) add(hr, el('th', 'n', '#'));
cols.forEach(function (k, i) { var th = el('th', numc[i] ? 'n' : '', k.label); th.scope = 'col'; add(hr, th); });
add(t, add(el('thead'), hr)); add(t, tb);
rows.forEach(function (r, ri) {
var tr = el('tr');
if (rank) add(tr, el('td', 'n rk', String(ri + 1)));
cols.forEach(function (k, i) {
var v = r[k.key], td = el('td', numc[i] ? 'n' : '', isN(v) ? fmt(v, k.unit, k.decimals, true) : typeof v === 'string' && v ? (/^\d{4}-\d\d(-\d\d)?$/.test(v) ? fd(v) : v) : '\u2013');
td.setAttribute('data-l', k.label);
if (!i) { if (S(r.series_id)) add(td, el('span', 'vh', ' (series ' + r.series_id + ')')); if (S(r._flag)) { var fi = flags.indexOf(r._flag); if (fi < 0) { flags.push(r._flag); fi = flags.length - 1; } add(td, el('sup', 'fl', String(fi + 1))); } }
add(tr, td);
});
trs.push(tr); add(tb, tr);
});
var fn = null;
if (flags.length) { fn = el('ol', 'fn'); flags.forEach(function (f) { add(fn, el('li', '', f)); }); }
return { nodes: [add(el('div', 'tw'), t), moreBtn(trs, 10), fn] };
}
function events(c) {
var ev = A(c.events).filter(function (e) { return e && S(e.name) && !isNaN(pd(e.date)); }).sort(function (a, b) { return pd(a.date) - pd(b.date); });
if (!ev.length) throw 0;
var now = today(), up = ev.filter(function (e) { return e.date >= now; }), past = ev.filter(function (e) { return e.date < now; }).reverse(), wrap = el('div', 'evs');
[['Upcoming', up], ['Past', past]].forEach(function (g) {
if (!g[1].length) return;
var ol = el('ol', 'ev');
g[1].forEach(function (e) {
var li = el('li'), b = el('div'), rt = ts(e.registered), o = e.outcome;
add(li, el('p', 'evd', fd(e.date)), b);
add(b, el('p', 'evn', e.name));
if (S(e.prediction)) add(b, el('p', '', 'Prediction: ' + e.prediction));
var m = el('p', 'evm', isNaN(rt) ? 'Registration date missing' : 'Registered ' + fd(new Date(rt).toISOString().slice(0, 10)) + (rt >= pd(e.date) ? ' (on or after the event, not a prediction)' : ''));
add(b, m);
var oc = el('p', 'evo', 'Outcome: ' + (S(o) || (e.date < now ? 'not scored yet' : 'pending')));
if (o === 'Hit') oc.className += ' hit'; if (o === 'Miss') oc.className += ' miss';
add(b, oc); add(ol, li);
});
add(wrap, el('h3', 'sub', g[0]), ol);
});
return { nodes: [wrap] };
}
function status(c) {
var H = { fail: ['Failing', 0], warn: ['Warning', 1], ok: ['OK', 2] };
var cs = A(c.campaigns).filter(function (x) { return x && S(x.name); }).map(function (x, i) { return [x, i]; })
.sort(function (a, b) { return ((H[a[0].health] || H.warn)[1] - (H[b[0].health] || H.warn)[1]) || a[1] - b[1]; }).map(function (p) { return p[0]; });
if (!cs.length) throw 0;
var t = el('table', 't stack st'), hr = el('tr'), tb = el('tbody'), trs = [];
add(t, el('caption', 'vh', S(c.title)));
['Campaign', 'Health', 'Last run', 'Rows', 'Owner', 'Note'].forEach(function (h, i) { var th = el('th', i === 3 ? 'n' : '', h); th.scope = 'col'; add(hr, th); });
add(t, add(el('thead'), hr)); add(t, tb);
cs.forEach(function (x) {
var h = H[x.health] || ['Unknown', 1], lr = ts(x.last_run), tr = el('tr');
var cells = [x.name, '', isNaN(lr) ? '\u2013' : ago(lr), isN(x.rows) ? num(x.rows, 0) + (isN(x.rows_change) && x.rows_change ? ' (' + chg(x.rows_change, 'count') + ')' : '') : '\u2013', S(x.owner) || '\u2013', S(x.note) || ''];
cells.forEach(function (v, i) {
var td = el('td', i === 3 ? 'n' : '', v); td.setAttribute('data-l', ['Campaign', 'Health', 'Last run', 'Rows', 'Owner', 'Note'][i]);
if (i === 1) add(td, el('span', 'health h-' + (H[x.health] ? x.health : 'warn'), h[0]));
if (i === 2 && !isNaN(lr)) td.title = new Date(lr).toISOString().replace('T', ' ').slice(0, 16) + ' UTC';
add(tr, td);
});
trs.push(tr); add(tb, tr);
});
return { nodes: [add(el('div', 'tw'), t), moreBtn(trs, 10)] };
}
var TYPES = { line: line, bar: bar, table: table, events: events, status: status };
function empty(root, msg) {
var b = root.querySelector('.body'); b.textContent = '';
add(b, el('p', 'empty', msg || EMPTY));
var m = root.querySelector('.meta'); if (m) m.textContent = '';
}
function link(href, text) {
var h = S(href); if (!/^(https:\/\/|http:\/\/|\/(?!\/))/.test(h)) return el('span', '', text);
var a = el('a', '', text); a.href = h; return a;
}
function srcLine(c, fileAsOf) {
var s = [S(c.source)]; if (S(c.as_of) && c.as_of !== fileAsOf) s.push('as of ' + fd(c.as_of, 1));
if (c.unit === 'pp' || A(c.columns).some(function (k) { return k && k.unit === 'pp'; })) s.push('pts = percentage points');
s = s.filter(Boolean); return s.length ? el('p', 'src', 'Source: ' + s.join(' \u00b7 ')) : null;
}
var DRAWS = [], RZ = 0;
function redraw() { DRAWS.forEach(function (f) { try { f(); } catch (e) {} }); }
function render(root, d) {
var frag = D.createDocumentFragment(), draws = DRAWS = [];
var h1 = root.querySelector('h1'); if (S(d.title)) h1.textContent = d.title;
var meta = root.querySelector('.meta'); meta.textContent = 'Data as of ' + fd(d.as_of, 1) + ' \u00b7 Updated ' + fd(S(d.generated).slice(0, 10));
var g = ts(d.generated);
if (!isNaN(g) && Date.now() - g > 3 * 864e5) add(meta, D.createTextNode(' \u00b7 '), el('strong', 'stale', 'Stale: not updated for ' + Math.floor((Date.now() - g) / 864e5) + ' days'));
var hs = A(d.headline).slice(0, d.headline_max || 6).filter(function (h) { return h && S(h.label) && (h.value === null || isN(h.value)); });
if (hs.length) {
var row = el('div', 'heads');
hs.forEach(function (h) {
var it = el('div', 'hi'), sub = [];
var fg = el('p', 'fig', fmt(h.value, isWord(h.unit) || h.unit === 'pp' ? '' : h.unit, h.decimals));
if (isWord(h.unit) && isN(h.value)) add(fg, el('span', 'u', ' ' + h.unit));
if (h.unit === 'pp' && isN(h.value)) add(fg, el('span', 'u', ' percentage points'));
add(it, fg, el('p', 'hl', h.label));
if (isN(h.change)) {
var gd = (h.good === 'up' && h.change > 0) || (h.good === 'down' && h.change < 0);
add(it, el('p', 'ch' + (gd ? ' good' : ''), h.change === 0 ? 'No change ' + words(h.change_label) : chg(h.change, h.unit, h.decimals) + ' ' + words(h.change_label)));
}
if (h.unit === 'index' && S(h.base)) sub.push('Index, ' + h.base);
if (isN(h.n)) sub.push('n = ' + num(h.n, 0));
if (isN(h.low) && isN(h.high)) sub.push((words(h.range_label) || 'range') + ' ' + fmt(h.low, h.unit, h.decimals) + ' to ' + fmt(h.high, h.unit, h.decimals));
if (S(h.as_of) && h.as_of !== d.as_of) sub.push('as of ' + fd(h.as_of, 1));
if (S(h.sub)) sub.push(h.sub);
if (sub.length) add(it, el('p', 'hs', sub.join(' \u00b7 ')));
add(row, it);
});
add(frag, row);
}
var n = 0;
A(d.charts).slice(0, 4).forEach(function (c, i) {
try {
var f = c && TYPES[c.type]; if (!f) return;
var r = f(c), sec = el('section', 'chart'), id = 'c' + i;
sec.setAttribute('aria-labelledby', id);
var h2 = el('h2', '', S(c.title)); h2.id = id;
add(sec, h2); if (S(c.takeaway)) add(sec, el('p', 'take', c.takeaway));
r.nodes.forEach(function (x) { add(sec, x); });
add(sec, srcLine(c, d.as_of));
add(frag, sec); n++;
if (r.draw) draws.push(r.draw);
} catch (e) { /* a malformed chart is skipped; the rest still render */ }
});
if (!n && !hs.length) throw 0;
var so = A(d.sources).filter(function (s) { return s && S(s.name); });
if (so.length || S(d.method_url)) {
var sec = add(el('section', 'info'), el('h2', '', 'Sources')), ul = el('ul', 'srcs');
so.forEach(function (s) {
var li = add(el('li'), link(s.url, s.name));
if (S(s.license)) add(li, D.createTextNode(' \u00b7 ' + s.license));
var ids = A(s.series_ids).filter(S); if (ids.length) add(li, el('span', 'ids', ' \u00b7 Series: ' + ids.join(', ')));
add(ul, li);
});
add(sec, ul);
if (S(d.method_url)) add(sec, add(el('p', 'how'), link(d.method_url, 'How this is measured')));
add(frag, sec);
}
var no = A(d.notes).filter(S);
if (no.length) { var ns = add(el('section', 'info'), el('h2', '', 'Notes')), nl = el('ul', 'notes'); no.forEach(function (x) { add(nl, el('li', '', x)); }); add(frag, add(ns, nl)); }
var b = root.querySelector('.body'); b.textContent = ''; add(b, frag);
redraw();
if (!RZ) { var w = b.clientWidth, q = 0; RZ = 1;
addEventListener('resize', function () { if (q) return; q = requestAnimationFrame(function () { q = 0; if (b.clientWidth !== w) { w = b.clientWidth; redraw(); } }); }); }
}
function board(root) {
var area = root.getAttribute('data-area');
if (root.hasAttribute('data-geo')) return;
get('data.json').then(function (r) { return r.json(); }).then(function (d) {
if (!d || !/^dash\/1(\.\d+)?$/.test(d.schema) || d.area !== area || !Array.isArray(d.charts)) throw 0;
render(root, d);
}).catch(function () { try { empty(root); } catch (e) {} });
}
function esc(s) { return s.replace(/[&<>"']/g, function (c) { return '&#' + c.charCodeAt(0) + ';'; }); }
function inl(s) {
return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, t, u) {
var raw = u.replace(/&#38;/g, '&');
return /^(https?:\/\/|\/|#|\.{0,2}\/?[\w-]+(\/|\.html?|$))/i.test(raw) && !/^\s*[a-z][\w+.-]*:/i.test(raw.replace(/^https?:/i, '')) ? '<a href="' + u + '">' + t + '</a>' : t;
});
}
function md(src) {
var out = [], para = [], list = null;
function li(x) { return '<li>' + inl(x.t) + (x.sub ? '<' + x.sub.t + '>' + x.sub.i.map(function (y) { return '<li>' + inl(y) + '</li>'; }).join('') + '</' + x.sub.t + '>' : '') + '</li>'; }
function flush() { if (para.length) out.push('<p>' + inl(para.join(' ')) + '</p>'); para = []; if (list) { out.push('<' + list.t + '>' + list.i.map(li).join('') + '</' + list.t + '>'); list = null; } }
S(src).replace(/\r/g, '').split('\n').forEach(function (ln) {
var m;
if (!ln.trim()) return flush();
if ((m = /^(#{1,4})\s+(.*)$/.exec(ln))) { flush(); var lv = Math.min(m[1].length + 1, 4); out.push('<h' + lv + '>' + inl(m[2]) + '</h' + lv + '>'); return; }
if ((m = /^(\s*)([-*]|\d+[.)])\s+(.*)$/.exec(ln))) {
var t = /\d/.test(m[2]) ? 'ol' : 'ul', last = list && list.i[list.i.length - 1];
if (m[1].length >= 2 && last) { if (!last.sub) last.sub = { t: t, i: [] }; last.sub.i.push(m[3]); return; }
if (para.length || (list && list.t !== t)) flush(); if (!list) list = { t: t, i: [] }; list.i.push({ t: m[3] }); return;
}
if (list && /^\s+\S/.test(ln)) { var l = list.i[list.i.length - 1]; if (l.sub) l.sub.i[l.sub.i.length - 1] += ' ' + ln.trim(); else l.t += ' ' + ln.trim(); return; }
if (list) flush();
para.push(ln.trim());
});
flush(); return out.join('\n');
}
function method(root) {
var b = root.querySelector('.body');
get('../method.md').then(function (r) { return r.text(); }).then(function (t) {
if (!t.trim() || /^\s*</.test(t)) throw 0;
var h = md(t.replace(/^\s*#\s+[^\n]*\n/, '')); b.innerHTML = h;
}).catch(function () { b.textContent = ''; add(b, el('p', 'empty', 'Method notes coming with the first export.')); });
}
function index() {
[].forEach.call(D.querySelectorAll('[data-asof]'), function (e) {
var u = e.getAttribute('data-asof'), pr = /prices/.test(u);
get(u).then(function (r) { return r.json(); }).then(function (d) {
var v = pr ? d.end : d.as_of; if (!S(v) || isNaN(pd(v))) throw 0;
e.textContent = 'Data as of ' + fd(v, 1);
}).catch(function () { e.textContent = 'Waiting for its first data export'; });
});
}
window.WBDash = { render: render, empty: empty, get: get, el: el, sv: sv, add: add, isN: isN, S: S, A: A, fmt: fmt, chg: chg, isWord: isWord,
dp: dp, num: num, pd: pd, fd: fd, vhTable: vhTable, svgBox: svgBox, txt: txt, nice: nice, cw: cw, clip: clip, TYPES: TYPES,
addDraw: function (f) { DRAWS.push(f); }, redraw: redraw, ACC: ACC };
var root = D.querySelector('[data-dash]');
if (root) { var m = root.getAttribute('data-dash'); try { m === 'board' ? board(root) : m === 'method' ? method(root) : index(); } catch (e) {} }
})();
