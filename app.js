'use strict';

const { haversine, parseGpx, computeStats, bounds, fetchPasses, matchPasses } = window.PassLib;

const $ = (s) => document.querySelector(s);
const status = $('#status');
const results = $('#results');
let map, trackLayer, passLayer;

// ---------- helpers ----------
const fmtKm = (m) => (m / 1000).toLocaleString('de-DE', { maximumFractionDigits: 0 });
const fmtEle = (e) => (e || e === 0) ? Math.round(e).toLocaleString('de-DE') + ' m' : '?';

function setStatus(html, isErr) {
  status.innerHTML = html;
  status.className = 'status' + (isErr ? ' err' : '');
}

// ---------- rendering ----------
const DE_DATE = (iso) => {
  if (!iso || iso === 'ohne-datum') return '—';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y}`;
};
const WD = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
const weekday = (iso) => {
  if (!iso || iso === 'ohne-datum') return '';
  const dt = new Date(iso + 'T12:00:00');
  return WD[dt.getDay()];
};
// GPX-Zeit ist UTC (…Z); in Betrachter-Lokalzeit anzeigen (= reale Uhrzeit am Pass für CEST)
const hhmm = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d) ? '' : d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
};

function render(pts, stats, hits) {
  const N = pts.length;
  const totalKm = stats.cum[N - 1];
  let totalGain = 0;
  for (const [, r] of stats.days) totalGain += r.gain;

  // assign passes to days
  const dayList = [...stats.days.entries()].sort((a, b) => a[1].firstIdx - b[1].firstIdx);
  const dayOf = (idx) => {
    let best = dayList[0][0];
    for (const [date, r] of dayList) { if (r.firstIdx <= idx) best = date; else break; }
    return best;
  };
  for (const h of hits) { h.day = dayOf(h.idx); }
  for (const [, r] of stats.days) r.passes = 0;
  for (const h of hits) { const r = stats.days.get(h.day); if (r) r.passes++; }

  const highest = hits.reduce((a, b) => ((b.ele || 0) > (a.ele || 0) ? b : a), hits[0] || {});
  const fahrtage = dayList.filter(([, r]) => r.km > 1000).length; // days with real riding

  // cards
  $('#cards').innerHTML = [
    [fmtKm(totalKm), 'Kilometer'],
    [Math.round(totalGain).toLocaleString('de-DE'), 'Höhenmeter'],
    [hits.length, 'Pässe'],
    [fahrtage, 'Fahrtage'],
    [highest.name ? fmtEle(highest.ele) : '—', highest.name ? 'höchster: ' + highest.name : 'höchster Pass'],
  ].map(([n, l]) => `<div class="card"><div class="n">${n}</div><div class="l">${l}</div></div>`).join('');

  // day table
  let tn = 0;
  $('#daytable tbody').innerHTML = dayList.map(([date, r]) => {
    const riding = r.km > 1000;
    if (riding) tn++;
    return `<tr>
      <td>${riding ? tn : '—'}</td>
      <td>${weekday(date)} ${DE_DATE(date)}</td>
      <td class="num">${fmtKm(r.km)}</td>
      <td class="num">${Math.round(r.gain).toLocaleString('de-DE')}</td>
      <td class="num">${r.passes || '—'}</td>
    </tr>`;
  }).join('');

  // passes by day
  const bigThresh = 2000;
  $('#days').innerHTML = dayList.map(([date, r]) => {
    const dh = hits.filter((h) => h.day === date);
    if (!dh.length) return '';
    const items = dh.map((h) => {
      const big = (h.ele || 0) >= bigThresh;
      const t = hhmm(h.time);
      return `<li class="${big ? 'big' : ''}"><span class="pname">${h.name}</span>` +
        `<span class="right">${t ? `<span class="when">${t}</span>` : ''}` +
        `<span class="ele">${fmtEle(h.ele)}</span></span></li>`;
    }).join('');
    return `<div class="day"><h3>${weekday(date)} ${DE_DATE(date)}
      <span class="meta">${fmtKm(r.km)} km · ${dh.length} ${dh.length === 1 ? 'Pass' : 'Pässe'}</span></h3>
      <ul class="passlist">${items}</ul></div>`;
  }).join('') || '<p style="color:var(--muted)">Keine Pässe im Track gefunden.</p>';

  // top passes
  const top = [...hits].sort((a, b) => (b.ele || 0) - (a.ele || 0)).slice(0, 12);
  $('#toptable tbody').innerHTML = top.map((h, i) =>
    `<tr><td>${i + 1}</td><td>${h.name}</td><td class="num">${fmtEle(h.ele)}</td>
     <td>${weekday(h.day)} ${DE_DATE(h.day)}</td></tr>`).join('');

  // Sektion VOR dem Karten-Setup einblenden, sonst rechnet Leaflet
  // fitBounds auf einem 0-Pixel-Container und der Zoom stimmt nicht.
  results.style.display = 'block';
  drawMap(pts, hits);
  setStatus('');
  results.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function drawMap(pts, hits) {
  if (!map) {
    map = L.map('map', { scrollWheelZoom: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18, attribution: '© OpenStreetMap',
    }).addTo(map);
  }
  if (trackLayer) map.removeLayer(trackLayer);
  if (passLayer) map.removeLayer(passLayer);
  // downsample track for the polyline
  const step = Math.max(1, Math.floor(pts.length / 4000));
  const latlngs = [];
  for (let i = 0; i < pts.length; i += step) latlngs.push([pts[i].lat, pts[i].lon]);
  trackLayer = L.polyline(latlngs, { color: '#ff8a3d', weight: 3, opacity: .85 }).addTo(map);
  passLayer = L.layerGroup().addTo(map);
  for (const h of hits) {
    const big = (h.ele || 0) >= 2000;
    const t = hhmm(h.time);
    const sub = [weekday(h.day) + ' ' + DE_DATE(h.day), t ? t + ' Uhr' : '']
      .filter(Boolean).join(' · ');
    L.circleMarker([h.lat, h.lon], {
      radius: big ? 7 : 5, color: big ? '#ffd24d' : '#4dd6c1',
      weight: 2, fillColor: '#171a21', fillOpacity: .9,
    }).bindPopup(
      `<div class="pass-pop"><div class="pp-name">${h.name}</div>` +
      `<div class="pp-ele">${fmtEle(h.ele)}</div>` +
      `<div class="pp-sub">${sub}</div></div>`
    ).addTo(passLayer);
  }
  const fit = () => map.fitBounds(trackLayer.getBounds(), { padding: [20, 20] });
  fit();
  // nach dem Layout einmal Größe neu messen und erneut fitten
  setTimeout(() => { map.invalidateSize(); fit(); }, 150);
}

// ---------- flow ----------
async function handleFile(file) {
  if (!file) return;
  try {
    setStatus('<span class="spin"></span>GPX wird gelesen …');
    const text = await file.text();
    const pts = parseGpx(text);
    const stats = computeStats(pts);
    setStatus(`<span class="spin"></span>${pts.length.toLocaleString('de-DE')} Punkte gelesen — frage Pässe bei OpenStreetMap ab …`);
    const passes = await fetchPasses(bounds(pts), undefined, (round) =>
      setStatus(`<span class="spin"></span>OpenStreetMap-Dienst ausgelastet — neuer Versuch (${round}/3) …`));
    const thresh = parseInt($('#thresh').value, 10);
    const hideWater = $('#hideWater').checked;
    const hits = matchPasses(pts, passes, thresh, hideWater);
    render(pts, stats, hits);
    window._last = { pts, stats }; // for re-render on option change
  } catch (e) {
    setStatus(e.message || String(e), true);
  }
}

const drop = $('#drop'), fileInput = $('#file');
fileInput.addEventListener('change', (e) => handleFile(e.target.files[0]));
['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => {
  e.preventDefault(); drop.classList.add('over');
}));
['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, (e) => {
  e.preventDefault(); drop.classList.remove('over');
}));
drop.addEventListener('drop', (e) => {
  const f = e.dataTransfer.files[0];
  if (f) { fileInput.files = e.dataTransfer.files; handleFile(f); }
});

// re-run matching when options change (needs passes again — simplest: re-handle file)
let lastFile = null;
fileInput.addEventListener('change', (e) => { lastFile = e.target.files[0]; });
drop.addEventListener('drop', (e) => { lastFile = e.dataTransfer.files[0]; });
$('#thresh').addEventListener('change', () => lastFile && handleFile(lastFile));
$('#hideWater').addEventListener('change', () => lastFile && handleFile(lastFile));

$('#reset').addEventListener('click', () => {
  results.style.display = 'none';
  fileInput.value = ''; lastFile = null;
  window.scrollTo({ top: 0, behavior: 'smooth' });
});
