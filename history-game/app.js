(function(){
'use strict';
const EV = window.EVENTS || [];
const BY = Object.fromEntries(EV.map(e => [e.id, e]));
const KEY = 'guessYear.v1';
const ERAS = [
  {id:'Ancient', from:-1e7, to:499}, {id:'Medieval', from:500, to:1499},
  {id:'Early Modern', from:1500, to:1799}, {id:'1800s', from:1800, to:1899},
  {id:'1900s', from:1900, to:1999}, {id:'2000s', from:2000, to:9999}];
const TIERS = ['Auto', '1', '2', '3', '4'];
const TIER_NAME = {1:'Major', 2:'Notable', 3:'Specific', 4:'Deep cut'};
const uniq = a => [...new Set(a)].sort();
const REGIONS = uniq(EV.flatMap(e => e.regions));
const CATS = uniq(EV.flatMap(e => e.categories));

// ---------- state ----------
let S = load();
function load(){
  const d = {history:[], filters:{regions:[], cats:[], eras:[], from:'', to:'', tiers:['Auto']}, current:null};
  try { return Object.assign(d, JSON.parse(localStorage.getItem(KEY)) || {}); } catch(e) { return d; }
}
function save(){ try { localStorage.setItem(KEY, JSON.stringify(S)); } catch(e) {} }

// ---------- helpers ----------
function parseYear(s){
  if (s == null) return null;
  s = String(s).trim().toUpperCase().replace(/,/g, '').replace(/\s+/g, ' ');
  if (!s) return null;
  const m = s.match(/^(-)?\s*(\d{1,7})\s*(BCE|BC|B\.C\.|CE|AD|A\.D\.)?$/) || s.match(/^(AD|CE)\s*(\d{1,7})$/);
  if (!m) return null;
  if (/^(AD|CE)$/.test(m[1] || '')) return +m[2];
  let y = +m[2];
  if (m[1] === '-' || /^B/.test(m[3] || '')) y = -y;
  return y;
}
function fmt(y){
  if (y < -9999) return (-y).toLocaleString() + ' BC';
  return y < 0 ? (-y) + ' BC' : (y < 1000 ? y + ' AD' : String(y));
}
function fmtRange(e){
  const p = e.precision === 'approx' ? 'c. ' : '';
  return p + fmt(e.year) + (e.endYear && e.endYear !== e.year ? ' – ' + fmt(e.endYear) : '');
}
function eraOf(y){ return (ERAS.find(r => y >= r.from && y <= r.to) || ERAS[0]).id; }
// error is 0 inside the event's range; tolerance scales with how far back it is
function score(e, g){
  const lo = e.year, hi = e.endYear || e.year;
  const err = g < lo ? lo - g : (g > hi ? g - hi : 0);
  const scale = e.year < -5000 ? 5000 : e.year < -1000 ? 250 : e.year < 500 ? 120 : e.year < 1500 ? 60 : e.year < 1800 ? 30 : 12;
  const slack = e.precision === 'approx' ? scale * 0.15 : 0;
  const pts = Math.round(100 * Math.exp(-Math.max(0, err - slack) / scale));
  return {err, pts};
}
const cls = p => p >= 75 ? 'good' : p >= 40 ? 'mid' : 'bad';
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

// ---------- adaptive selection ----------
function recentAvg(n){
  const h = S.history.slice(-n);
  return h.length ? h.reduce((a, b) => a + b.pts, 0) / h.length : 0;
}
function autoMaxTier(){
  const n = S.history.length, a = recentAvg(12);
  if (n >= 30 && a >= 70) return 4;
  if (n >= 18 && a >= 60) return 3;
  if (n >= 8 && a >= 50) return 2;
  return 1;
}
function weakness(){ // average miss (100-pts) per era and per category, with prior
  const acc = {};
  for (const h of S.history){
    const e = BY[h.id]; if (!e) continue;
    for (const k of ['era:' + eraOf(e.year), ...e.categories.map(c => 'cat:' + c)]){
      acc[k] = acc[k] || {sum:0, n:0}; acc[k].sum += 100 - h.pts; acc[k].n++;
    }
  }
  const out = {};
  for (const k in acc) out[k] = (acc[k].sum + 50) / (acc[k].n + 1); // shrink toward 50
  return out;
}
function filtered(){
  const f = S.filters;
  const from = parseYear(f.from), to = parseYear(f.to);
  const explicit = f.tiers.filter(t => t !== 'Auto').map(Number);
  const auto = f.tiers.includes('Auto') || !explicit.length;
  let maxT = autoMaxTier(), out;
  // in Auto mode, widen to more specific tiers if the filters leave too few events
  do { out = filterWith(maxT); } while (auto && out.length < 6 && ++maxT <= 4);
  return out;
  function filterWith(maxT){ return EV.filter(e => {
    if (f.regions.length && !e.regions.some(r => f.regions.includes(r))) return false;
    if (f.cats.length && !e.categories.some(c => f.cats.includes(c))) return false;
    const hi = e.endYear || e.year;
    if (f.eras.length && !f.eras.some(id => { const r = ERAS.find(x => x.id === id); return hi >= r.from && e.year <= r.to; })) return false;
    if (from != null && hi < from) return false;
    if (to != null && e.year > to) return false;
    if (explicit.length && explicit.includes(e.tier)) return true;
    if (auto) return e.tier <= maxT;
    return false;
  }); }
}
function pick(){
  let pool = filtered();
  if (!pool.length) return null;
  const last = {};
  S.history.forEach((h, i) => last[h.id] = {pts:h.pts, i});
  const W = weakness(), n = S.history.length, recent = new Set(S.history.slice(-8).map(h => h.id));
  if (pool.length > 10) pool = pool.filter(e => !recent.has(e.id));
  const ws = pool.map(e => {
    const l = last[e.id];
    let w = !l ? 3 : l.pts < 50 ? 2.5 + (n - l.i) / 20 : l.pts < 80 ? 1 : 0.25;
    const keys = ['era:' + eraOf(e.year), ...e.categories.map(c => 'cat:' + c)];
    const wk = Math.max(...keys.map(k => W[k] ?? 50));
    return w * (0.5 + wk / 50);
  });
  let r = Math.random() * ws.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++){ r -= ws[i]; if (r <= 0) return pool[i]; }
  return pool[pool.length - 1];
}

// ---------- views ----------
const $ = s => document.querySelector(s);
function tags(e){
  return `<div class="meta"><span class="tag tier">${TIER_NAME[e.tier]}</span>` +
    e.regions.map(r => `<span class="tag">${esc(r)}</span>`).join('') +
    e.categories.map(c => `<span class="tag">${esc(c)}</span>`).join('') + '</div>';
}
function showQuestion(){
  let e = S.current && BY[S.current] && !S.current_done ? BY[S.current] : null;
  if (!e || !filtered().includes(e)) e = pick();
  const pool = filtered().length;
  $('#filterNote').textContent = pool + ' events match your filters' +
    (S.filters.tiers.includes('Auto') ? ` · auto level: up to tier ${autoMaxTier()}` : '') + ` · ${S.history.length} answered`;
  if (!e){ $('#card').innerHTML = '<p>No events match these filters. <a href="#" id="toF">Change filters</a></p>';
    $('#toF').onclick = ev => { ev.preventDefault(); go('filters'); }; return; }
  S.current = e.id; S.current_done = false; save();
  $('#card').innerHTML = tags(e) + `<h2>${esc(e.title)}</h2><p class="prompt">${esc(e.prompt)}</p>
    <form class="guess" autocomplete="off"><input id="g" inputmode="text" enterkeyhint="go" placeholder="Year, e.g. 1066 or 2560 BC" aria-label="Your guess">
    <button>Guess</button></form><p class="hint" id="gh">Use BC or a minus sign for years before 1 AD. <a href="#" id="skip">Skip</a></p>`;
  $('form.guess').onsubmit = ev => { ev.preventDefault();
    const g = parseYear($('#g').value);
    if (g == null){ $('#gh').textContent = 'Type a year like 1492, -44 or 44 BC.'; return; }
    answer(e, g); };
  $('#skip').onclick = ev => { ev.preventDefault(); S.current = null; showQuestion(); };
}
function answer(e, g, demo){
  const {err, pts} = score(e, g);
  if (!demo){ S.history.push({id:e.id, guess:g, pts, t:Date.now()}); S.current_done = true; save(); }
  const rel = (e.related || []).map(id => BY[id]).filter(Boolean);
  $('#card').innerHTML = tags(e) + `<h2>${esc(e.title)}</h2>
    <div class="result"><div class="yr">${esc(fmtRange(e))}</div>
    <div class="pts ${cls(pts)}">You said ${esc(fmt(g))} · ${err === 0 ? 'spot on' : 'off by ' + err.toLocaleString() + ' yr'} · ${pts} pts</div></div>
    ${e.image ? `<img src="${esc(e.image)}" alt="" loading="lazy">${credit(e)}` : ''}
    <p>${esc(e.explanation.replace(/\s*\[disputed\]\s*/g, ' ').trim())}</p>
    ${e.disputed ? '<div class="disputed">Date disputed or approximate: sources disagree, so scoring is a little more forgiving.</div>' : ''}
    ${rel.length ? `<div class="related">Related: ${rel.map(r => esc(r.title) + ' (' + esc(fmt(r.year)) + ')').join(' · ')}</div>` : ''}
    <div class="links"><a href="${esc(e.wikipediaUrl)}" target="_blank" rel="noopener noreferrer">Wikipedia: ${esc(e.wikipedia)} ↗</a>
    <button id="next">Next</button></div>`;
  $('#next').onclick = () => { S.current = null; showQuestion(); window.scrollTo(0, 0); };
  $('#next').focus();
}
function credit(e){ const c = e.imageCredit; if (!c) return '';
  return `<div class="credit">Image: <a href="${esc(c.page)}" target="_blank" rel="noopener noreferrer">${esc(c.author)}</a>, ${esc(c.license)}, via Wikimedia Commons</div>`; }
function showCredits(){
  $('#credits').innerHTML = `<h2>Credits</h2><p class="hint">Event text is original. Dates were checked against Wikipedia; disputed or approximate dates are marked.
    Images come from Wikipedia / Wikimedia Commons under the free licenses listed below (public domain, CC0, CC BY, CC BY-SA). They were resized for this app.</p>
    <ul class="cr">` + EV.filter(e => e.imageCredit).map(e => { const c = e.imageCredit;
      return `<li><b>${esc(e.title)}</b><br><a href="${esc(c.page)}" target="_blank" rel="noopener noreferrer">${esc(c.file)}</a> · ${esc(c.author)} · ${esc(c.license)}</li>`; }).join('') + '</ul>';
}
function showTimeline(){
  const best = {};
  for (const h of S.history) if (!best[h.id] || h.pts > best[h.id].pts) best[h.id] = h;
  const seen = Object.keys(best).map(id => BY[id]).filter(Boolean).sort((a, b) => a.year - b.year);
  $('#timeline').innerHTML = `<h2 style="font-size:15px;color:var(--muted)">Your timeline · ${seen.length} of ${EV.length} events</h2>` +
    (seen.length ? '<ul class="tl">' + seen.map(e => { const p = best[e.id].pts;
      return `<li style="--c:var(--${cls(p) === 'good' ? 'good' : cls(p) === 'mid' ? 'mid' : 'bad'})"><span class="y">${esc(fmtRange(e))}</span>
      <span class="s ${cls(p)}">${p}</span><br><a href="${esc(e.wikipediaUrl)}" target="_blank" rel="noopener noreferrer">${esc(e.title)}</a></li>`; }).join('') + '</ul>'
     : '<p class="hint">Events you answer will appear here in order.</p>');
}
function showStats(){
  const n = S.history.length, W = weakness();
  const avg = n ? Math.round(S.history.reduce((a, b) => a + b.pts, 0) / n) : 0;
  const bars = (prefix, list) => list.map(k => ({k, v:W[prefix + k]})).filter(x => x.v != null).sort((a, b) => b.v - a.v)
    .map(x => `<div class="bar"><span>${esc(x.k)}</span><i style="width:${Math.round(x.v * 1.6)}px"></i><span>${Math.round(x.v)}</span></div>`).join('') || '<p class="hint">Not enough answers yet.</p>';
  $('#stats').innerHTML = `<div class="big"><div><b>${n}</b>answered</div><div><b>${avg}</b>avg pts</div><div><b>${Math.round(recentAvg(12))}</b>last 12</div><div><b>${autoMaxTier()}</b>level</div></div>
    <h2>Weakest eras (avg miss)</h2>${bars('era:', ERAS.map(e => e.id))}<h2>Weakest categories</h2>${bars('cat:', CATS)}
    <p class="hint">Questions are weighted toward the eras and categories you miss most, and toward events you got wrong before.</p>`;
}
function chips(el, list, key){
  el.innerHTML = list.map(v => `<button class="chip${S.filters[key].includes(v) ? ' on' : ''}" data-v="${esc(v)}">${esc(key === 'tiers' && v !== 'Auto' ? v + ' · ' + TIER_NAME[v] : v)}</button>`).join('');
  el.onclick = ev => { const b = ev.target.closest('.chip'); if (!b) return;
    const a = S.filters[key], v = b.dataset.v, i = a.indexOf(v);
    i >= 0 ? a.splice(i, 1) : a.push(v); save(); showFilters(); };
}
function showFilters(){
  chips($('#fRegion'), REGIONS, 'regions'); chips($('#fCat'), CATS, 'cats');
  chips($('#fEra'), ERAS.map(e => e.id), 'eras'); chips($('#fTier'), TIERS, 'tiers');
  $('#fFrom').value = S.filters.from; $('#fTo').value = S.filters.to;
  const bad = [S.filters.from, S.filters.to].some(v => v && parseYear(v) == null);
  $('#fCount').textContent = (bad ? 'Could not read a year in From/To. ' : '') + filtered().length + ' events match.';
}
$('#fFrom').onchange = ev => { S.filters.from = ev.target.value; save(); showFilters(); };
$('#fTo').onchange = ev => { S.filters.to = ev.target.value; save(); showFilters(); };
$('#fReset').onclick = () => { S.filters = {regions:[], cats:[], eras:[], from:'', to:'', tiers:['Auto']}; save(); showFilters(); };
$('#resetAll').onclick = () => { if (confirm('Erase all answers and filters?')){ localStorage.removeItem(KEY); S = load(); showFilters(); } };

function go(v){
  document.querySelectorAll('.view').forEach(s => s.hidden = s.id !== v);
  document.querySelectorAll('nav button').forEach(b => b.classList.toggle('on', b.dataset.view === v));
  ({play:showQuestion, timeline:showTimeline, stats:showStats, filters:showFilters, credits:showCredits})[v]();
}
document.querySelectorAll('nav button').forEach(b => b.onclick = () => go(b.dataset.view));

// demo hooks for screenshots: ?demo=<id> shows that question, ?demo=<id>&guess=1960 shows the reveal (not saved)
const q = new URLSearchParams(location.search);
if (q.get('demo') && BY[q.get('demo')]){
  const e = BY[q.get('demo')]; S.current = e.id; S.current_done = false; go('play');
  if (q.get('guess')) answer(e, parseYear(q.get('guess')), true);
} else go('play');
})();
