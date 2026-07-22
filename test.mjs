// End-to-end logic test against the real GPX + live Overpass.
// Run: node test.mjs "/path/to/tour.gpx"
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const PassLib = require('./passlib.js');

const gpxPath = process.argv[2] || '/Users/felix/Downloads/2026-07-xx Gesamttour.gpx';
const text = readFileSync(gpxPath, 'utf8');

// lightweight trkpt extraction (test-only; browser uses DOMParser)
function parsePts(xml) {
  const pts = [];
  const re = /<trkpt[^>]*lat="([^"]+)"[^>]*lon="([^"]+)"[^>]*>([\s\S]*?)<\/trkpt>/g;
  let m;
  while ((m = re.exec(xml))) {
    const lat = parseFloat(m[1]), lon = parseFloat(m[2]);
    const inner = m[3];
    const ele = /<ele>([^<]+)<\/ele>/.exec(inner);
    const time = /<time>([^<]+)<\/time>/.exec(inner);
    pts.push({ lat, lon, ele: ele ? parseFloat(ele[1]) : null, time: time ? time[1].trim() : null });
  }
  return pts;
}

let fail = 0;
const check = (cond, msg) => { console.log((cond ? 'PASS ' : 'FAIL ') + msg); if (!cond) fail++; };

const pts = parsePts(text);
check(pts.length > 70000, `parsed ${pts.length} trackpoints`);

const stats = PassLib.computeStats(pts);
const totalKm = stats.cum[pts.length - 1] / 1000;
check(totalKm > 2800 && totalKm < 2950, `total distance ${totalKm.toFixed(1)} km (expect ~2872)`);
let gain = 0; for (const [, r] of stats.days) gain += r.gain;
check(gain > 40000 && gain < 50000, `total gain ${Math.round(gain)} hm (expect ~44800)`);
check(stats.days.size >= 6, `${stats.days.size} distinct days`);

const bb = PassLib.bounds(pts);
console.log('bbox', bb.map(x => x.toFixed(2)).join(', '));
console.log('querying Overpass …');
const passes = await PassLib.fetchPasses(bb);
check(passes.length > 100, `Overpass returned ${passes.length} named passes`);

const hits = PassLib.matchPasses(pts, passes, 250, true);
check(hits.length >= 30, `matched ${hits.length} passes on the track`);

const names = hits.map(h => h.name);
const expect = ['Hahntennjoch', "Col de l'Iseran", 'Col du Galibier', "Col d'Izoard", 'Simplonpass', 'Mont Ventoux'];
for (const e of expect) {
  check(names.some(n => n.includes(e)), `found expected pass: ${e}`);
}
const highest = hits.reduce((a, b) => (b.ele || 0) > (a.ele || 0) ? b : a);
check(highest.name.includes("Iseran") && highest.ele > 2700, `highest = ${highest.name} ${highest.ele}m`);

// no watershed leaked through
check(!hits.some(h => PassLib.WATER_RE.test(h.name)), 'watersheds filtered out');

console.log(`\nmatched passes (${hits.length}):`);
for (const h of hits) console.log(`  ${String(h.ele ?? '?').padStart(5)}m  ${h.name}  (±${h.dist}m)`);

console.log(fail ? `\n${fail} CHECK(S) FAILED` : '\nALL CHECKS PASSED');
process.exit(fail ? 1 : 0);
