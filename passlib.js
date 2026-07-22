'use strict';
// Pure GPX/pass logic — no DOM rendering. Used by app.js and the test harness.
// Exposes a global `PassLib` (browser) and module.exports (node/jsdom).
(function (root) {

  const OVERPASS = [
    'https://overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
    'https://overpass.private.coffee/api/interpreter',
  ];
  const WATER_RE = /wasserscheide|spartiacque|watershed|ligne de partage|drainage divide/i;

  function haversine(a1, o1, a2, o2) {
    const R = 6371000, rad = Math.PI / 180;
    const dLa = (a2 - a1) * rad, dLo = (o2 - o1) * rad;
    const la1 = a1 * rad, la2 = a2 * rad;
    const h = Math.sin(dLa / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLo / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
  }

  function parseGpx(text, DOMParserImpl) {
    const DP = DOMParserImpl || (typeof DOMParser !== 'undefined' ? DOMParser : null);
    if (!DP) throw new Error('DOMParser nicht verfügbar.');
    const doc = new DP().parseFromString(text, 'application/xml');
    if (doc.querySelector('parsererror')) throw new Error('Datei ist kein gültiges XML/GPX.');
    const nodes = doc.getElementsByTagName('trkpt');
    const pts = [];
    for (let k = 0; k < nodes.length; k++) {
      const n = nodes[k];
      const lat = parseFloat(n.getAttribute('lat'));
      const lon = parseFloat(n.getAttribute('lon'));
      if (isNaN(lat) || isNaN(lon)) continue;
      const eleEl = n.getElementsByTagName('ele')[0];
      const timeEl = n.getElementsByTagName('time')[0];
      const ele = eleEl ? parseFloat(eleEl.textContent) : null;
      const time = timeEl ? timeEl.textContent.trim() : null;
      pts.push({ lat, lon, ele, time });
    }
    if (pts.length < 2) throw new Error('Keine Trackpunkte gefunden. Enthält die GPX einen <trk>?');
    return pts;
  }

  function computeStats(pts) {
    const N = pts.length;
    const cum = new Float64Array(N);
    for (let i = 1; i < N; i++) {
      cum[i] = cum[i - 1] + haversine(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
    }
    const W = 8, sm = new Float64Array(N);
    for (let i = 0; i < N; i++) {
      let s = 0, c = 0;
      for (let j = Math.max(0, i - W); j <= Math.min(N - 1, i + W); j++) {
        if (pts[j].ele != null) { s += pts[j].ele; c++; }
      }
      sm[i] = c ? s / c : (pts[i].ele || 0);
    }
    const dayKey = (i) => pts[i].time ? pts[i].time.slice(0, 10) : 'ohne-datum';
    const days = new Map();
    for (let i = 1; i < N; i++) {
      const d = dayKey(i);
      if (!days.has(d)) days.set(d, { km: 0, gain: 0, firstIdx: i - 1, passes: 0 });
      const rec = days.get(d);
      rec.km += cum[i] - cum[i - 1];
      const dz = sm[i] - sm[i - 1];
      if (dz > 0) rec.gain += dz;
    }
    if (!days.size) days.set(dayKey(0), { km: cum[N - 1], gain: 0, firstIdx: 0, passes: 0 });
    return { cum, sm, days };
  }

  function bounds(pts) {
    let mnLa = 90, mxLa = -90, mnLo = 180, mxLo = -180;
    for (const p of pts) {
      if (p.lat < mnLa) mnLa = p.lat; if (p.lat > mxLa) mxLa = p.lat;
      if (p.lon < mnLo) mnLo = p.lon; if (p.lon > mxLo) mxLo = p.lon;
    }
    const pad = 0.05;
    return [mnLa - pad, mnLo - pad, mxLa + pad, mxLo + pad];
  }

  async function fetchPasses(bb, fetchImpl, onRetry) {
    const F = fetchImpl || fetch;
    const q = `[out:json][timeout:120];
(
  node["mountain_pass"="yes"](${bb[0]},${bb[1]},${bb[2]},${bb[3]});
  node["natural"="saddle"](${bb[0]},${bb[1]},${bb[2]},${bb[3]});
);
out body;`;
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    let lastErr, busy = false;
    // up to 3 rounds across the mirrors, backing off on 429/504 (server busy)
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < OVERPASS.length; i++) {
        try {
          const res = await F(OVERPASS[i], {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: 'data=' + encodeURIComponent(q),
          });
          if (res.status === 429 || res.status === 504) { busy = true; throw new Error('HTTP ' + res.status); }
          if (!res.ok) throw new Error('HTTP ' + res.status);
          const j = await res.json();
          return j.elements.map((el) => {
            const t = el.tags || {};
            const name = t.name || t['name:de'] || t['name:fr'] || t['name:it'];
            return name ? { lat: el.lat, lon: el.lon, name, ele: t.ele ? parseFloat(t.ele) : null } : null;
          }).filter(Boolean);
        } catch (e) { lastErr = e; }
      }
      if (onRetry) onRetry(round + 1);
      await sleep(2500 * (round + 1)); // 2.5s, 5s between rounds
    }
    if (busy) throw new Error('Der OpenStreetMap-Passdienst ist gerade überlastet. Bitte in einer Minute erneut versuchen.');
    throw new Error('OpenStreetMap-Server nicht erreichbar (' + (lastErr && lastErr.message) + ').');
  }

  // shared significant name token, ignoring generic pass words & short bits
  const STOP = new Set(['col', 'de', 'la', 'le', 'du', 'des', 'di', 'del', 'della', 'dello',
    'pass', 'passo', 'joch', 'giogo', 'the', 'und', 'am', "d'", 'als', 'san', 'st', 'saint',
    'colle', 'sella', 'forcella', 'jufen', 'furkel']);
  function tokens(name) {
    return name.toLowerCase().replace(/[-–—/'']/g, ' ').split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP.has(w));
  }
  function sharesToken(a, b) {
    const ta = tokens(a), tb = new Set(tokens(b));
    return ta.some((w) => tb.has(w));
  }

  function matchPasses(pts, passes, thresh, hideWater) {
    const CELL = 0.02;
    const grid = new Map();
    const key = (la, lo) => Math.round(la / CELL) + ':' + Math.round(lo / CELL);
    for (let i = 0; i < pts.length; i++) {
      const k = key(pts[i].lat, pts[i].lon);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push(i);
    }
    const hits = [];
    for (const p of passes) {
      if (hideWater && WATER_RE.test(p.name)) continue;
      const cLa = Math.round(p.lat / CELL), cLo = Math.round(p.lon / CELL);
      let bestD = Infinity, bestI = -1;
      for (let dLa = -1; dLa <= 1; dLa++) {
        for (let dLo = -1; dLo <= 1; dLo++) {
          const arr = grid.get((cLa + dLa) + ':' + (cLo + dLo));
          if (!arr) continue;
          for (const i of arr) {
            const d = haversine(p.lat, p.lon, pts[i].lat, pts[i].lon);
            if (d < bestD) { bestD = d; bestI = i; }
          }
        }
      }
      if (bestI >= 0 && bestD <= thresh) {
        hits.push(Object.assign({}, p, { dist: Math.round(bestD), idx: bestI, time: pts[bestI].time }));
      }
    }
    hits.sort((a, b) => a.idx - b.idx);
    // Dedupe only genuine double-tags of the SAME physical pass: spatially very
    // close AND sharing a name token. This keeps distinct passes that share a
    // name but sit far apart (e.g. two "Col de la Madeleine" ~60 km apart).
    const dedup = [];
    for (const h of hits) {
      const near = dedup.find((d) =>
        haversine(d.lat, d.lon, h.lat, h.lon) < 800 &&
        (d.name === h.name || sharesToken(d.name, h.name)));
      if (near) { if ((h.ele || 0) > (near.ele || 0)) { near.ele = h.ele; near.name = h.name; } continue; }
      dedup.push(h);
    }
    return dedup;
  }

  const api = { haversine, parseGpx, computeStats, bounds, fetchPasses, matchPasses, WATER_RE };
  root.PassLib = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;

})(typeof window !== 'undefined' ? window : globalThis);
