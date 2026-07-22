'use strict';
/* Passjäger — App-Logik (Nocturne-Redesign).
   Reine Auswertung (parsen, rechnen, matchen) liegt in passlib.js. */

const { parseGpx, computeStats, bounds, fetchPasses, matchPasses,
  countCurves, simplifyPath, encodePolyline, decodePolyline } = window.PassLib;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

/* ── Design-Konstanten (Nocturne) ── */
const C = {
  accent: '#9184d9', accent200: '#e7e5fe', accent300: '#d2cefd',
  accent700: '#5d5294', accent900: '#2b2741',
  n300: '#cfd3e5', n400: '#b2b6ca', n500: '#9397ab', n600: '#75798c',
  text: '#e9e9ed', bg: '#161826', mapbg: '#14162a', contour: '#252840',
  white: '#f5f4ff',
};
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';

/* ── State ── */
const state = {
  settings: { toleranz: 250, hideWater: true },
  ui: { sort: 'uhrzeit', topsort: 'hoehe', stageFilter: null, topExpanded: false },
  fileName: null,
  pts: null, stats: null, rawPasses: null, hits: null,
  days: null, // [{date, tagNr|null, km, gain, firstIdx, riding, curves:{kurven,kehren}}]
  routes: null, // {date: [[lat,lon],...]} — Quelle fürs Zeichnen (Datei- UND Link-Modus)
  totals: null, // {km, gain, kurven, kehren}
  viewer: false, // true = per Link geöffnet, keine Rohdaten/kein Rematch
  shareUrl: null,
};
try {
  Object.assign(state.settings, JSON.parse(localStorage.getItem('pj.settings') || '{}'));
  state.ui.sort = localStorage.getItem('pj.sort') || 'uhrzeit';
} catch (e) { /* private mode etc. */ }

/* ── Format-Helfer ── */
const de = (n) => Math.round(n).toLocaleString('de-DE');
const fmtEle = (e) => (e || e === 0) ? de(e) + ' m' : '?';
const fmtGain = (g) => de(Math.round(g / 10) * 10) + ' m';
const hhmm = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
};
// Uhrzeit eines Treffers — im Link-Modus vorformatiert (timeStr), sonst aus ISO
const hT = (h) => h.timeStr ?? hhmm(h.time);
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const MON = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli',
  'August', 'September', 'Oktober', 'November', 'Dezember'];
const wdShort = (iso) => {
  if (!iso || iso === 'ohne-datum') return '';
  return WD[new Date(iso + 'T12:00:00').getDay()];
};
const dShort = (iso) => {
  if (!iso || iso === 'ohne-datum') return 'Tour';
  const [, m, d] = iso.split('-');
  return `${d}.${m}.`;
};
function dateRangeLabel(days) {
  const dated = days.filter((d) => d.date !== 'ohne-datum');
  if (!dated.length) return '';
  const a = dated[0].date.split('-'), b = dated[dated.length - 1].date.split('-');
  const monA = MON[+a[1] - 1], monB = MON[+b[1] - 1];
  if (a[1] === b[1] && a[0] === b[0]) return `${+a[2]}.–${+b[2]}. ${monB} ${b[0]}`;
  if (a[0] === b[0]) return `${+a[2]}. ${monA} – ${+b[2]}. ${monB} ${b[0]}`;
  return `${+a[2]}.${a[1]}.${a[0]} – ${+b[2]}.${b[1]}.${b[0]}`;
}

/* ── Karten ── */
let map1, map2, routeLayers = {}, markerLayer, pano = {};

function tiles() {
  return L.tileLayer(TILE_URL, { maxZoom: 18, subdomains: 'abcd' });
}
function initMap1() {
  if (map1) return;
  map1 = L.map('map1', { zoomControl: false, attributionControl: false, scrollWheelZoom: true });
  tiles().addTo(map1);
  $('#zoom-in').addEventListener('click', () => map1.zoomIn());
  $('#zoom-out').addEventListener('click', () => map1.zoomOut());
}
function dayEndIdx(d) {
  return d + 1 < state.days.length ? state.days[d + 1].firstIdx : state.pts.length - 1;
}
// Routen je Tag aufbauen — aus Trackpunkten (Datei-Modus); im Link-Modus
// kommen sie fertig decodiert aus dem Link.
function buildRoutes() {
  state.routes = {};
  for (let d = 0; d < state.days.length; d++) {
    const from = state.days[d].firstIdx, to = dayEndIdx(d);
    const step = Math.max(1, Math.floor((to - from) / 1500));
    const arr = [];
    for (let i = from; i <= to; i += step) arr.push([state.pts[i].lat, state.pts[i].lon]);
    state.routes[state.days[d].date] = arr;
  }
}
function drawTrack() {
  initMap1();
  Object.values(routeLayers).forEach((l) => map1.removeLayer(l));
  routeLayers = {};
  for (const [date, latlngs] of Object.entries(state.routes)) {
    routeLayers[date] = L.polyline(latlngs, {
      color: C.accent, weight: 3.5, opacity: .95,
      lineCap: 'round', lineJoin: 'round', className: 'route-line',
    }).addTo(map1);
  }
  fitAll();
}
function fitAll() {
  const g = L.featureGroup(Object.values(routeLayers));
  map1.fitBounds(g.getBounds(), { padding: [30, 30] });
  setTimeout(() => { map1.invalidateSize(); map1.fitBounds(g.getBounds(), { padding: [30, 30] }); }, 150);
}
function drawMarkers() {
  if (markerLayer) map1.removeLayer(markerLayer);
  markerLayer = L.layerGroup().addTo(map1);
  const best = state.hits.reduce((a, b) => ((b.ele || 0) > (a.ele || 0) ? b : a), state.hits[0]);
  for (const h of state.hits) {
    const isBest = h === best;
    const m = L.circleMarker([h.lat, h.lon], {
      radius: isBest ? 8 : 6,
      fillColor: isBest ? C.white : C.accent200, fillOpacity: 1,
      color: isBest ? C.accent : C.accent700, weight: isBest ? 3.5 : 3,
    });
    if (isBest) {
      m.bindTooltip(`${h.name} · ${fmtEle(h.ele)}`,
        { permanent: true, direction: 'right', offset: [12, 0], className: 'peak-label' });
    } else {
      m.bindTooltip(`${h.name} · ${fmtEle(h.ele)}${hT(h) ? ' · ' + hT(h) + ' Uhr' : ''}`,
        { direction: 'top', offset: [0, -10] });
    }
    m.on('mouseover', () => rowHover(h, true));
    m.on('mouseout', () => rowHover(h, false));
    m.on('click', () => { if (h.row) { h.row.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); flashRow(h.row); } });
    m.addTo(markerLayer);
    h.marker = m; h.isBest = isBest;
  }
}
function rowHover(h, on) {
  if (h.row) h.row.classList.toggle('hov', on);
  if (h.marker && !h.isBest) {
    h.marker.setStyle({ radius: on ? 9 : 6, weight: on ? 3.5 : 3 });
    if (on) h.marker.openTooltip(); else h.marker.closeTooltip();
  }
}
function flashRow(row) {
  row.classList.add('hov');
  setTimeout(() => row.classList.remove('hov'), 1200);
}
function applyStageFilter(date) {
  state.ui.stageFilter = date;
  for (const [d, layer] of Object.entries(routeLayers)) {
    layer.setStyle({ opacity: (!date || d === date) ? .95 : .25 });
  }
  for (const h of state.hits || []) {
    const on = !date || h.day === date;
    if (h.marker) h.marker.setStyle({ fillOpacity: on ? 1 : .3, opacity: on ? 1 : .3 });
    if (h.row) h.row.classList.toggle('dimmed', !on);
  }
  $$('#tp-list .tp-group').forEach((g) => g.classList.toggle('dimmed', !!date && g.dataset.date !== date));
  if (date) {
    const layer = routeLayers[date];
    if (layer) map1.fitBounds(layer.getBounds(), { padding: [40, 40] });
    const grp = $(`#tp-list .tp-group[data-date="${date}"]`);
    if (grp) grp.scrollIntoView({ block: 'start', behavior: 'smooth' });
  } else {
    fitAll();
  }
  renderMapTags();
}
function renderMapTags() {
  const el = $('#map-tags');
  const riding = state.days.filter((d) => d.riding);
  const mk = (label, date, active) =>
    `<span class="tag ${active ? 'tag-accent' : 'tag-outline'}" data-date="${date ?? ''}" role="button" tabindex="0">${label}</span>`;
  el.innerHTML = mk('Alle Etappen', null, !state.ui.stageFilter) +
    riding.map((d) => mk(`Tag ${d.tagNr}`, d.date, state.ui.stageFilter === d.date)).join('');
  el.querySelectorAll('.tag').forEach((t) => {
    const go = () => applyStageFilter(t.dataset.date || null);
    t.addEventListener('click', go);
    t.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
  });
}
function initPanorama() {
  if (map2) { setTimeout(() => { map2.invalidateSize(); panoFit(); }, 60); return; }
  map2 = L.map('map2', { zoomControl: false, attributionControl: false, scrollWheelZoom: false });
  tiles().addTo(map2);
  pano.route = [];
  for (const layer of Object.values(routeLayers)) {
    pano.route.push(L.polyline(layer.getLatLngs(), {
      color: C.accent, weight: 3, opacity: .95, lineCap: 'round', className: 'route-line',
    }).addTo(map2));
  }
  const best = state.hits.reduce((a, b) => ((b.ele || 0) > (a.ele || 0) ? b : a), state.hits[0]);
  for (const h of state.hits) {
    const isBest = h === best;
    const m = L.circleMarker([h.lat, h.lon], {
      radius: isBest ? 7 : 5.5,
      fillColor: isBest ? C.white : C.accent200, fillOpacity: 1,
      color: isBest ? C.accent : C.accent700, weight: 3,
    }).addTo(map2);
    if (isBest) m.bindTooltip(h.name, { permanent: true, direction: 'right', offset: [10, 0], className: 'peak-label' });
  }
  setTimeout(() => { map2.invalidateSize(); panoFit(); }, 60);
}
function panoFit() {
  const g = L.featureGroup(pano.route);
  map2.fitBounds(g.getBounds(), { padding: [24, 24] });
}

/* ── Tage aufbauen ── */
function buildDays() {
  const list = [...state.stats.days.entries()]
    .sort((a, b) => a[1].firstIdx - b[1].firstIdx)
    .map(([date, r]) => ({ date, km: r.km, gain: r.gain, firstIdx: r.firstIdx, riding: r.km > 1000, tagNr: null }));
  let n = 0;
  for (const d of list) if (d.riding) d.tagNr = ++n;
  state.days = list;
}
function dayOf(idx) {
  let best = state.days[0].date;
  for (const d of state.days) { if (d.firstIdx <= idx) best = d.date; else break; }
  return best;
}
const ridingDays = () => state.days.filter((d) => d.riding);
// Kurven je Tag aus dem Roh-Track (nur Datei-Modus)
function computeCurves() {
  for (let d = 0; d < state.days.length; d++) {
    state.days[d].curves = countCurves(state.pts, state.days[d].firstIdx, dayEndIdx(d));
  }
}
function computeTotals() {
  const t = { km: 0, gain: 0, kurven: 0, kehren: 0 };
  for (const d of state.days) {
    t.km += d.km; t.gain += d.gain;
    if (d.curves) { t.kurven += d.curves.kurven; t.kehren += d.curves.kehren; }
  }
  state.totals = t;
}

/* ── Rendering ── */
function renderHeader() {
  $('#res-file').textContent = state.fileName;
  const n = ridingDays().length;
  $('#res-etappen').textContent = `${n} ${n === 1 ? 'Etappe' : 'Etappen'}`;
  $('#btn-tol-label').textContent = `Toleranz ${state.settings.toleranz} m`;
}
function renderStatbar() {
  $('#stat-km').textContent = `${de(state.totals.km / 1000)} km`;
  $('#stat-gain').textContent = fmtGain(state.totals.gain);
  $('#stat-curves').innerHTML = state.totals.kurven
    ? `${de(state.totals.kurven)} <span class="sub">${de(state.totals.kehren)} Kehren</span>` : '—';
  if (!state.hits) {
    $('#stat-passes').innerHTML = '<span class="skel"></span>';
    $('#stat-highest').innerHTML = '<span class="skel"></span>';
    return;
  }
  $('#stat-passes').textContent = state.hits.length;
  const hi = $('#stat-highest');
  if (state.hits.length) {
    const best = state.hits.reduce((a, b) => ((b.ele || 0) > (a.ele || 0) ? b : a));
    hi.classList.toggle('longname', best.name.length > 14);
    hi.innerHTML = `${esc(best.name)} <span class="sub">${fmtEle(best.ele)}</span>`;
  } else {
    hi.classList.remove('longname');
    hi.textContent = '—';
  }
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function renderPanel() {
  const list = $('#tp-list');
  if (!state.hits) { // Skeleton während Overpass läuft
    list.innerHTML = Array.from({ length: 7 }, () => `
      <div class="tp-row"><span class="skel" style="width:18px;height:18px;border-radius:50%;"></span>
        <div class="mid"><span class="skel" style="width:60%;"></span><br><span class="skel" style="width:34%;height:9px;margin-top:4px;"></span></div>
        <span class="skel" style="width:52px;"></span></div>`).join('');
    return;
  }
  if (!state.hits.length) {
    list.innerHTML = '<div class="tp-note">Keine Pässe im Track gefunden — Toleranz erhöhen?</div>';
    return;
  }
  const best = state.hits.reduce((a, b) => ((b.ele || 0) > (a.ele || 0) ? b : a));
  const groups = ridingDays().length ? state.days : state.days.slice(0, 1);
  let html = '';
  const frag = document.createDocumentFragment();
  for (const d of groups) {
    const dh = state.hits.filter((h) => h.day === d.date);
    if (!dh.length) continue;
    if (state.ui.sort === 'hoehe') dh.sort((a, b) => (b.ele || 0) - (a.ele || 0));
    else dh.sort((a, b) => a.idx - b.idx);
    const gEl = document.createElement('div');
    gEl.className = 'tp-group'; gEl.dataset.date = d.date;
    const label = d.date === 'ohne-datum' ? 'Tour'
      : `Tag ${d.tagNr ?? '–'} · ${wdShort(d.date)} ${dShort(d.date)} · ${de(d.km / 1000)} km · ${de(Math.round(d.gain / 10) * 10)} Hm`;
    gEl.textContent = label;
    frag.appendChild(gEl);
    for (const h of dh) {
      const isBest = h === best;
      const row = document.createElement('div');
      row.className = 'tp-row' + (isBest ? ' best' : '');
      const t = hT(h);
      const sub = isBest ? [t ? t + ' Uhr' : '', 'höchster Pass der Tour'].filter(Boolean).join(' · ')
        : (t ? t + ' Uhr' : '');
      row.innerHTML = `
        <i class="${isBest ? 'ph-fill ph-trophy' : 'ph ph-flag-banner'}"></i>
        <div class="mid"><div class="nm">${esc(h.name)}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>
        <span class="ele">${fmtEle(h.ele)}</span>`;
      row.addEventListener('mouseenter', () => rowHover(h, true));
      row.addEventListener('mouseleave', () => rowHover(h, false));
      h.row = row;
      frag.appendChild(row);
    }
  }
  list.innerHTML = html;
  list.appendChild(frag);
}
function renderPanelError(msg) {
  $('#tp-list').innerHTML = `
    <div class="tp-note"><i class="ph ph-warning"></i><span>${esc(msg)}</span>
      <button class="btn btn-primary" id="btn-retry" type="button" style="margin-left:auto;">Erneut versuchen</button></div>`;
  $('#btn-retry').addEventListener('click', () => runMatching(true));
}

/* Trophäenwand */
function renderWand() {
  if (!state.hits) return;
  $('#wand-kicker').textContent = `${state.fileName} · ${dateRangeLabel(state.days)}`;
  $('#wand-h1').textContent = `${state.hits.length} Pässe geknackt.`;
  $('#wand-km').textContent = `${de(state.totals.km / 1000)} km`;
  $('#wand-gain').textContent = fmtGain(state.totals.gain);
  $('#wand-curves').textContent = state.totals.kurven ? de(state.totals.kurven) : '—';
  const n = ridingDays().length;
  $('#wand-days').textContent = n ? `${n} ${n === 1 ? 'Tag' : 'Tage'}` : '—';

  renderTopGrid();
  renderDayTable();
}
function renderTopGrid() {
  const grid = $('#top-grid');
  const sorted = [...state.hits];
  if (state.ui.topsort === 'hoehe') sorted.sort((a, b) => (b.ele || 0) - (a.ele || 0));
  else sorted.sort((a, b) => a.idx - b.idx);
  const bestName = state.hits.length
    ? state.hits.reduce((a, b) => ((b.ele || 0) > (a.ele || 0) ? b : a)).name : null;
  $('#top-title').textContent = state.ui.topsort === 'hoehe' ? 'Top-Pässe nach Höhe' : 'Pässe nach Etappe';
  const limit = state.ui.topExpanded ? sorted.length : 7;
  const shown = sorted.slice(0, limit);
  const rest = sorted.length - shown.length;
  grid.innerHTML = shown.map((h, i) => {
    const first = state.ui.topsort === 'hoehe' ? i === 0 : h.name === bestName;
    const d = state.days.find((x) => x.date === h.day);
    const meta = [d && d.tagNr ? `Tag ${d.tagNr}` : (h.day !== 'ohne-datum' ? dShort(h.day) : ''),
      hT(h) ? hT(h) + ' Uhr' : ''].filter(Boolean).join(' · ');
    return `<div class="card top-card${first ? ' first' : ''}">
      ${first ? '<i class="ph-fill ph-trophy troph"></i>' : ''}
      <div class="rank">#${i + 1}</div>
      <div class="nm">${esc(h.name)}</div>
      <div class="ele">${fmtEle(h.ele)}</div>
      ${meta ? `<div class="meta">${meta}</div>` : ''}
    </div>`;
  }).join('') + (rest > 0
    ? `<div class="card top-more" id="top-more" role="button" tabindex="0">+ ${rest} weitere Pässe</div>`
    : (state.ui.topExpanded && sorted.length > 7
      ? '<div class="card top-more" id="top-more" role="button" tabindex="0">Weniger anzeigen</div>' : ''));
  const more = $('#top-more');
  if (more) more.addEventListener('click', () => {
    state.ui.topExpanded = !state.ui.topExpanded;
    renderTopGrid();
  });
}
function renderDayTable() {
  const tbody = $('#day-tbody');
  const counts = new Map();
  for (const h of state.hits) counts.set(h.day, (counts.get(h.day) || 0) + 1);
  let king = null, max = 0;
  for (const d of ridingDays()) {
    const c = counts.get(d.date) || 0;
    if (c > max) { max = c; king = d.date; }
  }
  tbody.innerHTML = state.days.map((d) => {
    const c = counts.get(d.date) || 0;
    const passCell = d.date === king && max > 0
      ? `<span class="tag tag-accent">${c} · Königsetappe</span>`
      : (c || '—');
    return `<tr>
      <td>${d.tagNr ?? '—'}</td>
      <td>${d.date === 'ohne-datum' ? '—' : `${wdShort(d.date)} ${dShort(d.date)}`}</td>
      <td class="num">${de(d.km / 1000)}</td>
      <td class="num">${fmtGain(d.gain)}</td>
      <td class="num">${d.curves ? de(d.curves.kurven) : '—'}</td>
      <td class="num">${d.curves ? de(d.curves.kehren) : '—'}</td>
      <td class="num">${passCell}</td>
    </tr>`;
  }).join('');
}

/* ── Tabs ── */
function showTab(which) {
  $('#tab-cockpit').hidden = which !== 'cockpit';
  $('#tab-wand').hidden = which !== 'wand';
  $('#tab-link-cockpit').setAttribute('aria-current', which === 'cockpit' ? 'page' : 'false');
  $('#tab-link-wand').setAttribute('aria-current', which === 'wand' ? 'page' : 'false');
  if (which === 'wand' && state.hits) initPanorama();
  if (which === 'cockpit' && map1) setTimeout(() => map1.invalidateSize(), 60);
}

/* ── Auswertung ── */
async function handleFile(file) {
  if (!file) return;
  const dzErr = $('#dz-error');
  dzErr.hidden = true; $('#dropzone').classList.remove('error');
  try {
    const text = await file.text();
    state.pts = parseGpx(text);
  } catch (e) {
    $('#dropzone').classList.add('error');
    dzErr.textContent = e.message || String(e);
    dzErr.hidden = false;
    return;
  }
  state.fileName = file.name;
  state.stats = computeStats(state.pts);
  state.hits = null; state.rawPasses = null;
  state.viewer = false; state.shareUrl = null;
  state.ui.stageFilter = null; state.ui.topExpanded = false;
  buildDays();
  computeCurves();
  computeTotals();
  buildRoutes();

  $('#view-upload').hidden = true;
  $('#view-results').hidden = false;
  $('#btn-tol').hidden = false;
  showTab('cockpit');
  renderHeader(); renderStatbar(); renderPanel();
  drawTrack(); renderMapTags();
  await runMatching(false);
}
async function runMatching(refetch) {
  try {
    if (!state.rawPasses || refetch) {
      renderPanel(); // Skeleton
      state.rawPasses = await fetchPasses(bounds(state.pts), undefined, (round) => {
        const list = $('#tp-list');
        let note = list.querySelector('.tp-note');
        if (!note) {
          note = document.createElement('div');
          note.className = 'tp-note';
          list.prepend(note);
        }
        note.textContent = `OpenStreetMap-Dienst ausgelastet — neuer Versuch (${round}/3) …`;
      });
    }
    rematch();
  } catch (e) {
    renderPanelError(e.message || 'OpenStreetMap-Abfrage fehlgeschlagen.');
    $('#stat-passes').textContent = '—';
    $('#stat-highest').textContent = '—';
  }
}
function rematch() {
  state.hits = matchPasses(state.pts, state.rawPasses,
    state.settings.toleranz, state.settings.hideWater);
  for (const h of state.hits) h.day = dayOf(h.idx);
  state.shareUrl = null; // Treffer geändert → Link neu bauen
  renderHeader(); renderStatbar(); renderPanel(); drawMarkers(); renderWand();
  if (state.ui.stageFilter) applyStageFilter(state.ui.stageFilter);
  if (!$('#tab-wand').hidden) initPanorama();
}

/* ── Einstellungen (beide Instanzen synchron) ── */
function saveSettings() {
  try {
    localStorage.setItem('pj.settings', JSON.stringify(state.settings));
    localStorage.setItem('pj.sort', state.ui.sort);
  } catch (e) { /* egal */ }
}
function reflectSettings() {
  $$('input[name="tol"], input[name="tol2"]').forEach((r) => {
    r.checked = +r.value === state.settings.toleranz;
  });
  $('#sw-water').setAttribute('aria-checked', String(state.settings.hideWater));
  $('#sw-water2').setAttribute('aria-checked', String(state.settings.hideWater));
  $$('input[name="sort"]').forEach((r) => { r.checked = r.value === state.ui.sort; });
  $('#btn-tol-label').textContent = `Toleranz ${state.settings.toleranz} m`;
}
function onSettingsChanged() {
  saveSettings(); reflectSettings();
  if (state.pts && state.rawPasses) rematch();
}

/* ── Teilen (2a/2b) ── */
const shareOpts = () => ({
  route: $('#chk-route').checked,
  top3: $('#chk-top3').checked,
  days: $('#chk-days').checked,
});
let phGlyphCache = {};
function phGlyph(cls, fill) {
  const key = (fill ? 'f:' : 'r:') + cls;
  if (key in phGlyphCache) return phGlyphCache[key];
  const probe = document.createElement('i');
  probe.className = (fill ? 'ph-fill ' : 'ph ') + cls;
  probe.style.position = 'absolute'; probe.style.opacity = '0';
  document.body.appendChild(probe);
  const c = getComputedStyle(probe, '::before').content;
  probe.remove();
  const g = (c && c.length >= 3 && c !== 'none') ? c.replace(/^["']|["']$/g, '') : null;
  phGlyphCache[key] = g;
  return g;
}
async function renderShareCanvas() {
  const W = 1080, H = 1920, PADX = 70, S = 2.5;
  const cv = document.createElement('canvas');
  cv.width = W; cv.height = H;
  const ctx = cv.getContext('2d');
  const opts = shareOpts();
  try {
    await Promise.all([
      document.fonts.load('500 100px Inter'), document.fonts.load('400 30px Inter'),
      document.fonts.load('38px Phosphor'), document.fonts.load('38px "Phosphor-Fill"'),
    ]);
  } catch (e) { /* Fallback-Fonts */ }

  /* Grund + Bloom */
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, W, H);
  let g = ctx.createRadialGradient(W * .85, -200, 0, W * .85, -200, 1300);
  g.addColorStop(0, 'rgba(43,39,65,0.85)'); g.addColorStop(1, 'rgba(43,39,65,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  g = ctx.createRadialGradient(-100, H + 100, 0, -100, H + 100, 1250);
  g.addColorStop(0, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  let y = 75;
  /* Brand-Zeile */
  const mount = phGlyph('ph-mountains', true);
  ctx.textBaseline = 'middle';
  let bx = PADX;
  if (mount) {
    ctx.font = '38px "Phosphor-Fill"'; ctx.fillStyle = C.accent;
    ctx.fillText(mount, bx, y + 15); bx += 52;
  }
  ctx.font = '500 30px Inter'; ctx.fillStyle = C.n400;
  ctx.fillText('Passjäger', bx, y + 15);
  /* Tag outline rechts */
  const tourName = (state.fileName || 'Tour').replace(/\.gpx$/i, '');
  ctx.font = '27px Inter';
  const tw = Math.min(ctx.measureText(tourName).width, 420);
  const tagW = tw + 50, tagH = 52, tagX = W - PADX - tagW, tagY = y - 10;
  ctx.strokeStyle = C.accent; ctx.lineWidth = 2.5;
  roundRect(ctx, tagX, tagY, tagW, tagH, 15); ctx.stroke();
  ctx.fillStyle = C.accent; ctx.save();
  ctx.beginPath(); ctx.rect(tagX + 24, tagY, tagW - 48, tagH); ctx.clip();
  ctx.fillText(tourName, tagX + 25, tagY + tagH / 2 + 1); ctx.restore();

  /* Kicker + Headline */
  y += 15 + 65;
  const nEt = ridingDays().length;
  const kick = [dateRangeLabel(state.days), nEt ? `${nEt} Etappen` : ''].filter(Boolean).join(' · ').toUpperCase();
  ctx.strokeStyle = C.accent; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(PADX, y); ctx.lineTo(PADX + 65, y); ctx.stroke();
  ctx.font = '27px Inter'; ctx.fillStyle = C.accent300;
  ctx.save(); ctx.letterSpacing = '2px';
  ctx.fillText(kick, PADX + 90, y + 1); ctx.restore();
  y += 40;
  ctx.textBaseline = 'alphabetic';
  ctx.font = '500 100px Inter'; ctx.fillStyle = C.text;
  const nP = state.hits ? state.hits.length : 0;
  ctx.fillText(`${nP} Pässe`, PADX, y + 88);
  ctx.fillText('geknackt.', PADX, y + 88 + 108);
  y += 88 + 108 + 30;

  /* Unterer Block von unten planen */
  const bottom = H - 60;
  const statH = 110, divH = 40;
  const top3H = opts.top3 ? 3 * 55 + 10 : 0;
  const daysRows = opts.days ? Math.min(ridingDays().length, 8) : 0;
  const daysH = daysRows ? daysRows * 44 + 20 : 0;
  const mapTop = y + 25;
  const mapBottom = bottom - statH - divH - top3H - daysH - 45;

  /* Karte */
  if (opts.route && mapBottom - mapTop > 260) {
    drawShareMap(ctx, PADX, mapTop, W - 2 * PADX, mapBottom - mapTop);
  }
  let yy = mapBottom + 45;

  /* Top 3 */
  if (opts.top3 && state.hits && state.hits.length) {
    const top3 = [...state.hits].sort((a, b) => (b.ele || 0) - (a.ele || 0)).slice(0, 3);
    const troph = phGlyph('ph-trophy', true), flag = phGlyph('ph-flag-banner', false);
    ctx.textBaseline = 'middle';
    for (let i = 0; i < top3.length; i++) {
      const h = top3[i], ly = yy + i * 55 + 20;
      let ix = PADX;
      if (i === 0 && troph) {
        ctx.font = '38px "Phosphor-Fill"'; ctx.fillStyle = C.accent300;
        ctx.fillText(troph, ix, ly);
      } else if (flag) {
        ctx.font = '38px Phosphor'; ctx.fillStyle = C.n500;
        ctx.fillText(flag, ix, ly);
      }
      ix += 62;
      ctx.font = '34px Inter'; ctx.fillStyle = i === 0 ? C.text : C.n300;
      ctx.fillText(truncate(ctx, h.name, W - 2 * PADX - 260), ix, ly);
      ctx.font = '500 34px Inter'; ctx.fillStyle = i === 0 ? C.accent300 : C.n300;
      ctx.textAlign = 'right';
      ctx.fillText(fmtEle(h.ele), W - PADX, ly);
      ctx.textAlign = 'left';
    }
    yy += top3H;
  }

  /* Tagesübersicht (optional) */
  if (opts.days && daysRows) {
    ctx.textBaseline = 'middle';
    const days = ridingDays().slice(0, daysRows);
    const counts = new Map();
    for (const h of state.hits || []) counts.set(h.day, (counts.get(h.day) || 0) + 1);
    for (let i = 0; i < days.length; i++) {
      const d = days[i], ly = yy + i * 44 + 22;
      ctx.font = '27px Inter'; ctx.fillStyle = C.n400;
      ctx.fillText(`Tag ${d.tagNr} · ${wdShort(d.date)} ${dShort(d.date)}`, PADX, ly);
      ctx.textAlign = 'right'; ctx.fillStyle = C.n300;
      ctx.fillText(`${de(d.km / 1000)} km · ${counts.get(d.date) || 0} Pässe`, W - PADX, ly);
      ctx.textAlign = 'left';
    }
    yy += daysH;
  }

  /* Fading-Trennlinie */
  const dg = ctx.createLinearGradient(PADX, 0, W - PADX, 0);
  dg.addColorStop(0, 'rgba(233,233,237,0)');
  dg.addColorStop(0.11, 'rgba(233,233,237,0.16)');
  dg.addColorStop(0.89, 'rgba(233,233,237,0.16)');
  dg.addColorStop(1, 'rgba(233,233,237,0)');
  ctx.fillStyle = dg; ctx.fillRect(PADX, yy + 18, W - 2 * PADX, 2);
  yy += divH;

  /* Stat-Zeile */
  const rest = Math.max(0, nP - 3);
  const stats = [
    [`${de(state.totals.km / 1000)} km`, 'Strecke'],
    [fmtGain(state.totals.gain), 'Anstieg'],
  ];
  if (state.totals.kurven) stats.push([de(state.totals.kurven), 'Kurven']);
  stats.push(opts.top3 && rest > 0 ? [`+${rest}`, 'weitere Pässe'] : [`${nP}`, 'Pässe']);
  ctx.textBaseline = 'alphabetic';
  /* Spaltenbreiten messen, Lücke adaptiv, damit auch 4 Stats in die Breite passen */
  const widths = stats.map(([v, l]) => {
    ctx.font = '500 48px Inter';
    const vw = ctx.measureText(v).width;
    ctx.font = '26px Inter';
    return Math.max(vw, ctx.measureText(l).width);
  });
  const sumW = widths.reduce((a, b) => a + b, 0);
  const gap = Math.max(44, Math.min(100, (W - 2 * PADX - sumW) / Math.max(1, stats.length - 1)));
  let sx = PADX;
  for (let i = 0; i < stats.length; i++) {
    const [v, l] = stats[i];
    ctx.font = '500 48px Inter'; ctx.fillStyle = C.text;
    ctx.fillText(v, sx, yy + 42);
    ctx.font = '26px Inter'; ctx.fillStyle = C.n500;
    ctx.fillText(l, sx, yy + 80);
    sx += widths[i] + gap;
  }
  return cv;
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function truncate(ctx, s, maxW) {
  if (ctx.measureText(s).width <= maxW) return s;
  while (s.length > 2 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1);
  return s + '…';
}
function drawShareMap(ctx, x, y, w, h) {
  ctx.save();
  roundRect(ctx, x, y, w, h, 20); ctx.clip();
  ctx.fillStyle = C.mapbg; ctx.fillRect(x, y, w, h);
  /* Kontur-Deko */
  ctx.strokeStyle = C.contour; ctx.lineWidth = 2.5;
  for (let i = 1; i <= 4; i++) {
    const cy = y + (h * i) / 5;
    ctx.beginPath();
    ctx.moveTo(x - 20, cy + 18);
    ctx.bezierCurveTo(x + w * .3, cy - 40, x + w * .55, cy + 45, x + w + 20, cy - 20);
    ctx.stroke();
  }
  /* Projektion — Route aus den Tages-Routen (geht auch im Link-Modus ohne Roh-Track) */
  const pts = Object.values(state.routes).flat().map(([lat, lon]) => ({ lat, lon }));
  let mnLa = 90, mxLa = -90, mnLo = 180, mxLo = -180;
  for (const p of pts) {
    if (p.lat < mnLa) mnLa = p.lat; if (p.lat > mxLa) mxLa = p.lat;
    if (p.lon < mnLo) mnLo = p.lon; if (p.lon > mxLo) mxLo = p.lon;
  }
  const cosLat = Math.cos(((mnLa + mxLa) / 2) * Math.PI / 180);
  const spanX = (mxLo - mnLo) * cosLat, spanY = mxLa - mnLa;
  const pad = 70;
  const scale = Math.min((w - 2 * pad) / spanX, (h - 2 * pad) / spanY);
  const offX = x + (w - spanX * scale) / 2, offY = y + (h - spanY * scale) / 2;
  const px = (p) => offX + (p.lon - mnLo) * cosLat * scale;
  const py = (p) => offY + (mxLa - p.lat) * scale;
  /* Route mit Glow */
  const step = Math.max(1, Math.floor(pts.length / 900));
  ctx.strokeStyle = C.accent; ctx.lineWidth = 8;
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.shadowColor = 'rgba(145,132,217,0.6)'; ctx.shadowBlur = 20;
  ctx.beginPath();
  ctx.moveTo(px(pts[0]), py(pts[0]));
  for (let i = step; i < pts.length; i += step) ctx.lineTo(px(pts[i]), py(pts[i]));
  ctx.stroke();
  ctx.shadowBlur = 0;
  /* Marker */
  if (state.hits && state.hits.length) {
    const best = state.hits.reduce((a, b) => ((b.ele || 0) > (a.ele || 0) ? b : a));
    for (const hh of state.hits) {
      if (hh === best) continue;
      ctx.beginPath(); ctx.arc(px(hh), py(hh), 9, 0, Math.PI * 2);
      ctx.fillStyle = C.accent200; ctx.fill();
      ctx.strokeStyle = C.accent700; ctx.lineWidth = 5; ctx.stroke();
    }
    /* Höchster Pass: weißer Kern + Label */
    ctx.beginPath(); ctx.arc(px(best), py(best), 14, 0, Math.PI * 2);
    ctx.fillStyle = C.white; ctx.fill();
    ctx.strokeStyle = C.accent; ctx.lineWidth = 7; ctx.stroke();
    ctx.font = '600 27px Inter'; ctx.fillStyle = C.white;
    ctx.textBaseline = 'middle';
    const label = best.name;
    const lw = ctx.measureText(label).width;
    let lx = px(best) + 26, ly = py(best) - 26;
    if (lx + lw > x + w - 20) lx = px(best) - lw - 26;
    ctx.shadowColor = 'rgba(0,0,0,0.9)'; ctx.shadowBlur = 10;
    ctx.fillText(label, lx, ly);
    ctx.shadowBlur = 0;
  }
  ctx.restore();
}
let sharePreviewBusy = false;
async function updateSharePreview() {
  if (sharePreviewBusy) return;
  sharePreviewBusy = true;
  try {
    const cv = await renderShareCanvas();
    $('#share-preview-img').src = cv.toDataURL('image/png');
  } finally { sharePreviewBusy = false; }
}
function openShare() {
  const bd = $('#share-backdrop');
  bd.hidden = false;
  requestAnimationFrame(() => bd.classList.add('open'));
  /* Teilen-Button nur zeigen, wenn das Gerät Datei-Share kann */
  const dummy = new File([''], 'x.png', { type: 'image/png' });
  const canShare = !!(navigator.canShare && navigator.canShare({ files: [dummy] }));
  $('#btn-do-share').hidden = !canShare;
  $('#share-hint').hidden = !canShare;
  updateSharePreview();
}
function closeShare() {
  const bd = $('#share-backdrop');
  bd.classList.remove('open');
  setTimeout(() => { bd.hidden = true; }, 180);
}
async function doDownload() {
  const cv = await renderShareCanvas();
  const a = document.createElement('a');
  a.download = `passjaeger-${(state.fileName || 'tour').replace(/\.gpx$/i, '')}.png`;
  a.href = cv.toDataURL('image/png');
  a.click();
}
async function doShare() {
  const cv = await renderShareCanvas();
  const blob = await new Promise((res) => cv.toBlob(res, 'image/png'));
  const file = new File([blob], 'passjaeger-tour.png', { type: 'image/png' });
  try {
    await navigator.share({ files: [file], title: 'Passjäger — meine Tour' });
  } catch (e) { /* abgebrochen */ }
}

/* ── Teilen per Link — Ergebnis steckt im URL-Fragment, kein Server ── */
function b64urlFromBytes(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function bytesFromB64url(str) {
  const b = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(b.length);
  for (let i = 0; i < b.length; i++) out[i] = b.charCodeAt(i);
  return out;
}
async function compressBytes(bytes) {
  if (typeof CompressionStream === 'undefined') return null;
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function decompressBytes(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function buildShareLink() {
  // Tage, Treffer und stark vereinfachte Tages-Routen kompakt serialisieren
  const days = state.days.map((d) => [
    d.date, d.tagNr ?? 0, Math.round(d.km), Math.round(d.gain),
    d.curves ? d.curves.kurven : 0, d.curves ? d.curves.kehren : 0,
  ]);
  const dayIdx = new Map(state.days.map((d, i) => [d.date, i]));
  const hits = (state.hits || []).map((h) => [
    h.name, Math.round(h.ele || 0),
    Math.round(h.lat * 1e5) / 1e5, Math.round(h.lon * 1e5) / 1e5,
    hT(h) || '', dayIdx.get(h.day) ?? 0,
  ]);
  const routes = state.days.map((d) => {
    const path = state.routes[d.date] || [];
    let eps = 0.0015, simp = simplifyPath(path, eps);
    while (simp.length > 300 && eps < 0.02) { eps *= 1.6; simp = simplifyPath(path, eps); }
    return encodePolyline(simp, 4);
  });
  const payload = JSON.stringify({ v: 1, n: state.fileName, d: days, h: hits, r: routes });
  const raw = new TextEncoder().encode(payload);
  const packed = await compressBytes(raw);
  const body = packed ? '1' + b64urlFromBytes(packed) : '0' + b64urlFromBytes(raw);
  return `${location.origin}${location.pathname}#t=${body}`;
}
async function loadFromLink(body) {
  try {
    const bytes = bytesFromB64url(body.slice(1));
    const raw = body[0] === '1' ? await decompressBytes(bytes) : bytes;
    const obj = JSON.parse(new TextDecoder().decode(raw));
    if (obj.v !== 1) throw new Error('Unbekannte Link-Version');
    state.viewer = true;
    state.fileName = obj.n || 'geteilte Tour';
    state.pts = null; state.stats = null; state.rawPasses = null;
    state.ui.stageFilter = null; state.ui.topExpanded = false;
    state.days = obj.d.map(([date, tagNr, km, gain, kurven, kehren], i) => ({
      date, tagNr: tagNr || null, km, gain, firstIdx: i,
      riding: !!tagNr, curves: { kurven, kehren },
    }));
    state.routes = {};
    obj.r.forEach((enc, i) => { state.routes[state.days[i].date] = decodePolyline(enc, 4); });
    state.hits = obj.h.map(([name, ele, lat, lon, timeStr, di], i) => ({
      name, ele: ele || null, lat, lon, timeStr, day: (state.days[di] || state.days[0]).date, idx: i,
    }));
    computeTotals();
    state.shareUrl = location.href;

    $('#view-upload').hidden = true;
    $('#view-results').hidden = false;
    $('#btn-tol').hidden = true; // ohne Roh-Track kein Rematch
    showTab('cockpit');
    renderHeader(); renderStatbar(); renderPanel();
    drawTrack(); renderMapTags(); drawMarkers(); renderWand();
    return true;
  } catch (e) {
    console.error('Geteilter Link konnte nicht gelesen werden:', e);
    return false;
  }
}

/* ── Wiring ── */
function init() {
  reflectSettings();

  /* Upload */
  const drop = $('#dropzone'), fileInput = $('#file');
  fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
  ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.add('over');
  }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => {
    e.preventDefault(); drop.classList.remove('over');
  }));
  drop.addEventListener('drop', (e) => {
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  });

  /* Einstellungen */
  $$('input[name="tol"], input[name="tol2"]').forEach((r) => r.addEventListener('change', () => {
    state.settings.toleranz = +r.value; onSettingsChanged();
  }));
  const toggleWater = () => { state.settings.hideWater = !state.settings.hideWater; onSettingsChanged(); };
  $('#sw-water').addEventListener('click', toggleWater);
  $('#sw-water2').addEventListener('click', toggleWater);

  /* Sortierung */
  $$('input[name="sort"]').forEach((r) => r.addEventListener('change', () => {
    state.ui.sort = r.value; saveSettings(); renderPanel();
    if (state.ui.stageFilter) applyStageFilter(state.ui.stageFilter);
  }));
  $$('input[name="topsort"]').forEach((r) => r.addEventListener('change', () => {
    state.ui.topsort = r.value; state.ui.topExpanded = false; renderTopGrid();
  }));

  /* Header-Aktionen */
  $('#btn-reset').addEventListener('click', () => {
    $('#view-results').hidden = true;
    $('#view-upload').hidden = false;
    $('#file').value = '';
    state.viewer = false;
    history.replaceState(null, '', location.pathname + location.search);
    window.scrollTo({ top: 0 });
  });
  $('#btn-tol').addEventListener('click', (e) => {
    e.stopPropagation();
    const pop = $('#tol-popover');
    pop.hidden = !pop.hidden;
    if (!pop.hidden) reflectSettings();
  });
  document.addEventListener('click', (e) => {
    const pop = $('#tol-popover');
    if (!pop.hidden && !pop.contains(e.target) && e.target !== $('#btn-tol')) pop.hidden = true;
  });

  /* Tabs */
  $('#tab-link-cockpit').addEventListener('click', (e) => { e.preventDefault(); showTab('cockpit'); });
  $('#tab-link-wand').addEventListener('click', (e) => { e.preventDefault(); showTab('wand'); });

  /* Teilen */
  $('#btn-share').addEventListener('click', openShare);
  $('#share-close').addEventListener('click', closeShare);
  $('#share-backdrop').addEventListener('click', (e) => {
    if (e.target === $('#share-backdrop')) closeShare();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !$('#share-backdrop').hidden) closeShare();
  });
  ['chk-route', 'chk-top3', 'chk-days'].forEach((id) =>
    $('#' + id).addEventListener('change', updateSharePreview));
  $('#btn-download').addEventListener('click', doDownload);
  $('#btn-do-share').addEventListener('click', doShare);
  $('#btn-copy-link').addEventListener('click', async () => {
    const b = $('#btn-copy-link');
    try {
      if (!state.shareUrl) state.shareUrl = await buildShareLink();
      await navigator.clipboard.writeText(state.shareUrl);
      const old = b.innerHTML;
      b.innerHTML = '<i class="ph ph-check"></i>&nbsp;Kopiert';
      setTimeout(() => { b.innerHTML = old; }, 1600);
    } catch (e) {
      b.innerHTML = '<i class="ph ph-warning"></i>&nbsp;Kopieren fehlgeschlagen';
    }
  });

  /* Geteilter Link? Dann direkt ins Cockpit */
  const m = location.hash.match(/^#t=(.+)$/);
  if (m) loadFromLink(m[1]);
}
init();

/* Test-Hooks */
window.__pj = { state, handleFile, renderShareCanvas, applyStageFilter, showTab, buildShareLink, loadFromLink };
