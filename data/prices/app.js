(function () {
  'use strict';
  var MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  var SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  // How each category reads at the start of the summary sentence.
  var PHRASE = {
    'electricity': 'Electricity prices', 'gas-utility': 'Natural gas utility prices', 'rent': 'Rents',
    'water': 'Water, sewer and trash bills', 'renters-insurance': "Tenants' and household insurance prices",
    'gasoline': 'Gasoline prices', 'auto-repair': 'Auto repair prices', 'car-insurance': 'Car insurance prices',
    'used-cars': 'Used car and truck prices', 'new-cars': 'New car and truck prices', 'car-parts': 'Car parts prices',
    'groceries': 'Grocery prices', 'restaurants': 'Restaurant and takeout prices', 'eggs': 'Egg prices',
    'beef': 'Beef prices', 'dairy': 'Dairy prices', 'coffee': 'Coffee prices',
    'physicians': "Prices for physicians' services", 'hospital': 'Prices for hospital services',
    'prescriptions': 'Prescription drug prices', 'childcare': 'Day care and preschool prices', 'vet': 'Vet prices',
    'pet-services': 'Pet service prices (excluding vet care)', 'airfare': 'Airline fares',
    'personal-care': 'Prices for haircuts and other personal care', 'tuition': 'College tuition and fees',
    'internet': 'Internet service prices', 'wireless': 'Cell phone service prices',
    'roofing': 'Producer prices for roofing work', 'plumbing-hvac': 'Producer prices for plumbing and HVAC work',
    'electrical': 'Producer prices for electrical work', 'foundation': 'Producer prices for foundation, structure and exterior work'
  };
  // Every PHRASE above is a plural subject ("... prices are", "Rents are"). List any singular
  // subject here (e.g. a future 'tuition': 'Tuition') so the sentence uses "is ... it".
  var SINGULAR = {};
  var $ = function (id) { return document.getElementById(id); };
  var D, byKey = {}, startY, startM, nMonths, base;
  var state = { c: 'auto-repair', y: 2019 };

  function ym(i) { var t = startM - 1 + i; return { y: startY + Math.floor(t / 12), m: t % 12 + 1 }; }
  function idx(y, m) { return (y - startY) * 12 + (m - startM); }
  function parseYM(s) { var p = s.split('-'); return { y: +p[0], m: +p[1] }; }
  function monthName(y, m) { return MONTHS[m - 1] + ' ' + y; }
  function shortName(y, m) { return SHORT[m - 1] + ' ' + y; }
  function fmtPct(x) { var r = Math.round(x); return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r) + '%'; }
  function fmtPts(x) { var r = Math.round(x); return (r > 0 ? '+' : r < 0 ? '−' : '') + Math.abs(r) + ' pts'; }

  // Latest month where both the category and the baseline have data.
  function latestCommon(s) {
    for (var i = nMonths - 1; i >= 0; i--) if (s.v[i] != null && base.v[i] != null) return i;
    return -1;
  }
  // Base point: same calendar month as the latest month, in the chosen year. If that month is missing
  // (for example October 2025), step back to the nearest earlier month with data for both series.
  function basePoint(s, year, endI) {
    var e = ym(endI), i = idx(year, e.m);
    for (var k = 0; k < 12 && i - k >= 0; k++) {
      var j = i - k;
      if (s.v[j] != null && base.v[j] != null) return { i: j, shifted: k > 0 };
    }
    return null;
  }
  function compare(s, year) {
    var endI = latestCommon(s); if (endI < 0) return null;
    var b = basePoint(s, year, endI); if (!b || b.i >= endI) return null;
    var cat = (s.v[endI] / s.v[b.i] - 1) * 100, all = (base.v[endI] / base.v[b.i] - 1) * 100;
    return { endI: endI, baseI: b.i, shifted: b.shifted, cat: cat, all: all, diff: cat - all };
  }
  function yearsFor(s) {
    var endI = latestCommon(s), e = ym(endI), out = [];
    for (var y = startY; y < e.y; y++) if (basePoint(s, y, endI)) out.push(y);
    return out;
  }

  function sentence(s, r) {
    var b = ym(r.baseI), when = monthName(b.y, b.m);
    var phrase = PHRASE[s.key] || (s.label + ' prices');
    var c = Math.round(r.cat), a = Math.round(r.all), d = Math.round(r.diff);
    var one = !!SINGULAR[s.key], be = one ? ' is ' : ' are ', pro = one ? 'it' : 'they';
    var first = c === 0 ? phrase + be + 'about the same as in ' + when + '; '
      : phrase + be + Math.abs(c) + '% ' + (c > 0 ? 'higher' : 'lower') + ' than in ' + when + '; ';
    var second = 'overall prices ' + (a >= 0 ? 'rose ' + a + '%' : 'fell ' + Math.abs(a) + '%');
    var third;
    if (Math.abs(r.diff) < 1) third = ', so ' + pro + ' kept pace with inflation.';
    else if (d > 0) third = ', so ' + pro + ' outpaced inflation by about ' + d + ' point' + (d === 1 ? '' : 's') + '.';
    else third = ', so ' + pro + ' trailed inflation by about ' + Math.abs(d) + ' point' + (d === -1 ? '' : 's') + '.';
    return first + second + third;
  }

  function niceStep(range, target) {
    var raw = range / target, p = Math.pow(10, Math.floor(Math.log10(raw))), n = raw / p;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
  }
  function el(name, attrs, text) {
    var e = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }
  function pathFor(s, r, X, Y) {
    var d = '', pen = false;
    for (var i = r.baseI; i <= r.endI; i++) {
      var v = s.v[i];
      if (v == null) { pen = false; continue; }
      var p = (v / s.v[r.baseI] - 1) * 100;
      d += (pen ? 'L' : 'M') + X(i).toFixed(1) + ' ' + Y(p).toFixed(1);
      pen = true;
    }
    return d;
  }

  function draw(s, r) {
    var svg = $('chart'), W = Math.max(300, Math.round($('stage').clientWidth || 640));
    var narrow = W < 520, H = Math.round(W * (narrow ? 0.72 : 0.56));
    var fs = narrow ? 11 : 12, padL = narrow ? 40 : 46, padR = narrow ? 50 : 58, padT = 12, padB = 26;
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H); svg.setAttribute('width', W); svg.setAttribute('height', H);
    while (svg.lastChild && svg.lastChild.nodeName !== 'desc') svg.removeChild(svg.lastChild);
    var lo = 0, hi = 0;
    [s, base].forEach(function (t) {
      for (var i = r.baseI; i <= r.endI; i++) if (t.v[i] != null) {
        var p = (t.v[i] / t.v[r.baseI] - 1) * 100; if (p < lo) lo = p; if (p > hi) hi = p;
      }
    });
    var step = niceStep((hi - lo) || 10, narrow ? 4 : 5);
    lo = lo < -step * 0.1 ? Math.floor(lo / step) * step : 0; hi = Math.ceil(hi / step) * step; if (hi === lo) hi = lo + step;
    var X = function (i) { return padL + (i - r.baseI) / Math.max(1, r.endI - r.baseI) * (W - padL - padR); };
    var Y = function (p) { return padT + (hi - p) / (hi - lo) * (H - padT - padB); };
    // missing-month bands
    for (var g = r.baseI; g <= r.endI; g++) if (s.v[g] == null || base.v[g] == null) {
      var w = Math.max(2, (W - padL - padR) / Math.max(1, r.endI - r.baseI));
      svg.appendChild(el('rect', { 'class': 'gap', x: (X(g) - w / 2).toFixed(1), y: padT, width: w.toFixed(1), height: H - padT - padB }));
    }
    for (var t = lo; t <= hi + 1e-9; t += step) {
      svg.appendChild(el('line', { 'class': Math.abs(t) < 1e-9 ? 'zero' : 'grid', x1: padL, x2: W - padR, y1: Y(t), y2: Y(t) }));
      svg.appendChild(el('text', { x: padL - 6, y: Y(t) + 4, 'text-anchor': 'end', 'font-size': fs }, (t > 0 ? '+' : '') + Math.round(t) + '%'));
    }
    var b = ym(r.baseI), e = ym(r.endI), span = e.y - b.y + 1, ystep = Math.max(1, Math.ceil(span / (narrow ? 4 : 8)));
    for (var y = b.y; y <= e.y; y += ystep) {
      var xi = idx(y, 1); if (xi < r.baseI) continue;
      svg.appendChild(el('line', { 'class': 'grid', x1: X(xi), x2: X(xi), y1: H - padB, y2: H - padB + 4 }));
      svg.appendChild(el('text', { x: X(xi), y: H - padB + 17, 'text-anchor': 'middle', 'font-size': fs }, String(y)));
    }
    svg.appendChild(el('path', { 'class': 'l-all', d: pathFor(base, r, X, Y) }));
    svg.appendChild(el('path', { 'class': 'l-cat', d: pathFor(s, r, X, Y) }));
    var yc = Y(r.cat), ya = Y(r.all);
    if (Math.abs(yc - ya) < fs + 2) { if (yc <= ya) { yc -= (fs + 2 - (ya - yc)) / 2; ya = yc + fs + 2; } else { ya -= (fs + 2 - (yc - ya)) / 2; yc = ya + fs + 2; } }
    svg.appendChild(el('text', { 'class': 'end-cat', x: W - padR + 6, y: yc + 4, 'font-size': fs }, fmtPct(r.cat)));
    svg.appendChild(el('text', { 'class': 'end-all', x: W - padR + 6, y: ya + 4, 'font-size': fs }, fmtPct(r.all)));
    $('chart-desc').textContent = 'Line chart from ' + monthName(b.y, b.m) + ' to ' + monthName(e.y, e.m) + '. ' +
      s.label + ': ' + fmtPct(r.cat) + '. Overall prices: ' + fmtPct(r.all) + '.';
  }

  function render() {
    var s = byKey[state.c], years = yearsFor(s);
    if (years.indexOf(state.y) < 0) state.y = years.indexOf(2019) >= 0 ? 2019 : years[0];
    var ysel = $('year'); ysel.innerHTML = '';
    years.slice().reverse().forEach(function (y) { var o = document.createElement('option'); o.value = y; o.textContent = y; ysel.appendChild(o); });
    ysel.value = String(state.y); $('cat').value = s.key;
    var r = compare(s, state.y); if (!r) { $('summary').textContent = 'No data for this choice.'; return; }
    var b = ym(r.baseI), e = ym(r.endI);
    $('since').textContent = $('since2').textContent = shortName(b.y, b.m);
    $('summary').textContent = sentence(s, r);
    $('key-cat').textContent = s.label + (s.kind === 'ppi' ? ' (producer prices)' : '');
    $('year-hint').textContent = 'Compares ' + monthName(e.y, e.m) + ' with ' + MONTHS[b.m - 1] + ' of the year you pick.' +
      (r.shifted ? ' ' + MONTHS[e.m - 1] + ' ' + state.y + ' has no data, so the nearest earlier month is used.' : '');
    draw(s, r);
    var src = s.kind === 'ppi'
      ? 'Producer Price Index by industry, nonresidential building work. Producer prices: what contractors charge, not household bills.'
      : 'Consumer Price Index for All Urban Consumers (CPI-U), U.S. city average.';
    var rows = [
      ['Series', '<code>' + s.id + '</code>' + (s.title ? ' · ' + esc(s.title) : '')],
      ['Source', 'U.S. Bureau of Labor Statistics. ' + src + ' Not seasonally adjusted. <a href="https://data.bls.gov/timeseries/' + s.id + '">View at BLS</a>'],
      ['Baseline', '<code>' + base.id + '</code> · CPI-U, all items'],
      ['Latest data', monthName(e.y, e.m) + (s.prelim.indexOf(e.y + '-' + String(e.m).padStart(2, '0')) >= 0 ? ' (preliminary)' : '') + ' · data file built ' + D.built]
    ];
    $('meta').innerHTML = rows.map(function (x) { return '<dt>' + x[0] + '</dt><dd>' + x[1] + '</dd>'; }).join('');
    // gaps inside the charted range
    var from = b.y * 100 + b.m, to = e.y * 100 + e.m, gaps = {};
    [s, base].forEach(function (t) { t.gaps.forEach(function (g) { var p = parseYM(g), k = p.y * 100 + p.m; if (k > from && k < to) gaps[g] = p; }); });
    var keys = Object.keys(gaps).sort();
    if (keys.length) {
      var shutdown = keys.some(function (k) { return k === '2025-10' || k === '2025-11'; });
      $('gapnote').textContent = 'No data for ' + keys.map(function (k) { return monthName(gaps[k].y, gaps[k].m); }).join(', ') +
        (shutdown ? '. BLS did not collect October 2025 prices because of the federal government shutdown' : '') +
        '. The chart leaves a gap; the figures above do not use the missing month' + (keys.length > 1 ? 's' : '') + '.';
      $('gapnote').hidden = false;
    } else $('gapnote').hidden = true;
    renderTable();
    var p = new URLSearchParams(location.search); p.set('c', s.key); p.set('y', state.y);
    var q = '?' + p.toString();
    if (location.search !== q) history.replaceState(null, '', q + location.hash);
  }

  function esc(t) { return t.replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  function renderTable() {
    var rows = [];
    D.series.forEach(function (s) {
      if (s === base) return;
      var r = compare(s, state.y); if (r) rows.push({ s: s, r: r });
    });
    var br = compare(byKey[state.c], state.y);
    rows.sort(function (a, b) { return b.r.cat - a.r.cat; });
    var tb = $('ranktable').tBodies[0]; tb.innerHTML = '';
    var allRow = { s: base, r: br };
    var inserted = false;
    rows.forEach(function (x) {
      if (!inserted && br && x.r.cat < br.all) { tb.appendChild(row(allRow, true)); inserted = true; }
      tb.appendChild(row(x, false));
    });
    if (!inserted && br) tb.appendChild(row(allRow, true));
  }
  function row(x, isBase) {
    var tr = document.createElement('tr'), s = x.s, r = x.r;
    if (isBase) {
      tr.className = 'base';
      tr.innerHTML = '<td>Overall prices (CPI-U)</td><td class="num">' + fmtPct(r.all) + '</td><td class="num">—</td>';
      return tr;
    }
    if (s.key === state.c) tr.className = 'on';
    var td = document.createElement('td'), btn = document.createElement('button');
    btn.type = 'button'; btn.textContent = s.label; btn.setAttribute('data-key', s.key);
    btn.addEventListener('click', function () { state.c = s.key; render(); $('h-chart').scrollIntoView({ behavior: 'smooth', block: 'start' }); $('cat').focus({ preventScroll: true }); });
    td.appendChild(btn);
    if (s.kind === 'ppi') { var tag = document.createElement('span'); tag.className = 'tag'; tag.textContent = ' producer prices'; td.appendChild(tag); }
    var b = ym(r.baseI);
    if (b.y !== state.y) { var t2 = document.createElement('span'); t2.className = 'tag'; t2.textContent = ' from ' + shortName(b.y, b.m); td.appendChild(t2); }
    tr.appendChild(td);
    tr.insertAdjacentHTML('beforeend', '<td class="num">' + fmtPct(r.cat) + '</td><td class="num">' + fmtPts(r.diff) + '</td>');
    return tr;
  }

  function init(data) {
    D = data; var s0 = parseYM(D.start); startY = s0.y; startM = s0.m;
    var e0 = parseYM(D.end); nMonths = idx(e0.y, e0.m) + 1;
    D.series.forEach(function (s) { byKey[s.key] = s; });
    base = byKey.all;
    var sel = $('cat'), groups = {};
    D.series.forEach(function (s) {
      if (s === base) return;
      if (!groups[s.group]) { groups[s.group] = document.createElement('optgroup'); groups[s.group].label = s.group; sel.appendChild(groups[s.group]); }
      var o = document.createElement('option'); o.value = s.key; o.textContent = s.label + (s.kind === 'ppi' ? ' (producer prices)' : ''); groups[s.group].appendChild(o);
    });
    var q = new URLSearchParams(location.search);
    if (q.get('c') && byKey[q.get('c')] && q.get('c') !== 'all') state.c = q.get('c');
    if (q.get('y') && /^\d{4}$/.test(q.get('y'))) state.y = +q.get('y');
    sel.addEventListener('change', function () { state.c = sel.value; render(); });
    $('year').addEventListener('change', function () { state.y = +$('year').value; render(); });
    $('copy').addEventListener('click', function () {
      var done = function () { $('status').textContent = 'Link copied.'; };
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(location.href).then(done, function () { $('status').textContent = location.href; });
      else $('status').textContent = location.href;
    });
    var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(render, 120); });
    render();
  }

  fetch('/data/prices/data/prices.json').then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then(init).catch(function () { $('summary').textContent = 'The price data could not be loaded. Try reloading the page.'; });
})();
