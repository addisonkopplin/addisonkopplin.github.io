/* Workbench shell: narrow-screen menu and the page switcher (Ctrl K / Cmd K). No libraries. */
(function () {
'use strict';
var D = document, nav = D.getElementById('site-nav'), mb = D.querySelector('.site-menu'), fb = D.querySelector('.site-find');
if (!nav) return;
var mac = /Mac|iP(hone|ad|od)/.test(navigator.platform || navigator.userAgent), k = fb && fb.querySelector('.k');
if (k && mac) k.textContent = '\u2318 K';
/* ---- menu ---- */
function focusables(r) { return [].slice.call(r.querySelectorAll('a[href],button,input')).filter(function (e) { return e.offsetParent; }); }
function menu(open, back) {
  if (!mb) return;
  nav.classList.toggle('open', open); D.documentElement.classList.toggle('menu-open', open);
  mb.setAttribute('aria-expanded', open); mb.textContent = open ? 'Close' : 'Menu';
  if (open) { var c = nav.querySelector('[aria-current]') || nav.querySelector('a'); c.focus(); } else if (back) mb.focus();
}
if (mb) mb.addEventListener('click', function () { menu(mb.getAttribute('aria-expanded') !== 'true', true); });
D.addEventListener('keydown', function (e) {
  if (!nav.classList.contains('open')) return;
  if (e.key === 'Escape') { menu(false, true); return; }
  if (e.key !== 'Tab') return;
  var f = [mb].concat(focusables(nav)), i = f.indexOf(D.activeElement);
  if (e.shiftKey && i <= 0) { e.preventDefault(); f[f.length - 1].focus(); }
  else if (!e.shiftKey && i === f.length - 1) { e.preventDefault(); f[0].focus(); }
});
matchMedia('(min-width:1024px)').addEventListener('change', function (m) { if (m.matches) menu(false); });
/* ---- page switcher ---- */
var pages = [].map.call(nav.querySelectorAll('a[href]'), function (a) {
  var g = a.closest('ul').getAttribute('aria-labelledby'); g = g ? D.getElementById(g).textContent : '';
  return { t: a.textContent, u: a.getAttribute('href'), g: g };
});
pages.filter(function (p) { return /^\/data\/[a-z]+\/$/.test(p.u) && p.u !== '/data/prices/'; }).forEach(function (p) { pages.push({ t: p.t + ' method', u: p.u + 'method/', g: 'How it is measured' }); });
if (nav.querySelector('a[href="/data/prices/"]')) pages.push({ t: 'S&P 500 vs. essentials', u: '/data/prices/#sp', g: 'Data' });
if (nav.querySelector('a[href="/data/predictions/"]')) { pages.push({ t: 'Prediction track record', u: '/data/predictions/#track', g: 'Data' }); pages.push({ t: 'Rejected models', u: '/data/predictions/#rejected', g: 'Data' }); }
var dlg, inp, ul, sel = 0, shown = [];
function go(p) { if (p) location.href = p.u; }
function list() {
  var q = inp.value.trim().toLowerCase();
  shown = pages.filter(function (p) { return (p.t + ' ' + p.g).toLowerCase().indexOf(q) >= 0; });
  sel = Math.min(sel, Math.max(0, shown.length - 1)); ul.textContent = '';
  shown.forEach(function (p, i) {
    var li = D.createElement('li'), s = D.createElement('span');
    li.id = 'sw-o' + i; li.setAttribute('role', 'option'); li.setAttribute('aria-selected', i === sel);
    li.textContent = p.t; s.textContent = p.g; li.appendChild(s);
    li.addEventListener('click', function () { go(p); });
    li.addEventListener('mousemove', function () { if (sel !== i) { sel = i; mark(); } });
    ul.appendChild(li);
  });
  if (!shown.length) { var n = D.createElement('li'); n.className = 'none'; n.textContent = 'No page matches.'; ul.appendChild(n); }
  mark();
}
function mark() {
  [].forEach.call(ul.children, function (li, i) { if (li.id) li.setAttribute('aria-selected', i === sel); });
  var c = D.getElementById('sw-o' + sel);
  if (c) { inp.setAttribute('aria-activedescendant', c.id); c.scrollIntoView({ block: 'nearest' }); } else inp.removeAttribute('aria-activedescendant');
}
function build() {
  dlg = D.createElement('dialog'); dlg.className = 'sw-dlg'; dlg.setAttribute('aria-label', 'Search pages');
  dlg.innerHTML = '<label for="sw-q">Go to page</label><input id="sw-q" type="text" autocomplete="off" spellcheck="false" role="combobox" aria-expanded="true" aria-controls="sw-l" aria-autocomplete="list"><ul id="sw-l" role="listbox" aria-label="Pages"></ul><p>Type to filter. Arrow keys to choose, Enter to open, Esc to close.</p>';
  D.body.appendChild(dlg); inp = dlg.querySelector('input'); ul = dlg.querySelector('ul');
  inp.addEventListener('input', function () { sel = 0; list(); });
  inp.addEventListener('keydown', function (e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); if (shown.length) { sel = (sel + (e.key === 'ArrowDown' ? 1 : shown.length - 1)) % shown.length; mark(); } }
    else if (e.key === 'Enter') { e.preventDefault(); go(shown[sel]); }
  });
  dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', function () { if (fb) fb.focus(); });
}
function find() {
  if (!dlg) build();
  if (dlg.open) return;
  menu(false); inp.value = ''; sel = 0; list(); dlg.showModal(); inp.focus();
}
if (fb) fb.addEventListener('click', find);
D.addEventListener('keydown', function (e) {
  if ((e.metaKey || e.ctrlKey) && !e.altKey && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); if (dlg && dlg.open) dlg.close(); else find(); }
});
})();
