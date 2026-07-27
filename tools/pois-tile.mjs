// Merged Länder-JSONs, dedupliziert und schreibt 1°×1°-Kacheln + meta.json.
// Nutzung: node pois-tile.mjs <json-dir> <out-dir>
import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const [jsonDir, outDir] = process.argv.slice(2);
if (!jsonDir || !outDir) { console.error('Nutzung: node pois-tile.mjs <json-dir> <out-dir>'); process.exit(2); }

const byId = new Map();
const countries = [];
for (const f of readdirSync(jsonDir).filter((x) => x.endsWith('.json')).sort()) {
  const arr = JSON.parse(readFileSync(join(jsonDir, f), 'utf8'));
  countries.push(f.replace('.json', ''));
  for (const p of arr) {
    // Dedup über OSM-Id (Geofabrik-Extracts überlappen an Grenzen)
    if (!byId.has(p.i)) byId.set(p.i, p);
  }
}
const pois = [...byId.values()];
console.error(`gesamt nach Dedup: ${pois.length} POIs aus ${countries.length} Ländern`);

// Stichproben-Check
for (const probe of ["Col de l'Iseran", 'Hahntennjoch', 'Passo dello Stelvio - Stilfser Joch', 'Hochtor']) {
  const hit = pois.find((p) => p.n.includes(probe.split(' - ')[0]));
  console.error(`  Probe „${probe}": ${hit ? `OK (${hit.n}, ${hit.e} m)` : 'FEHLT!'}`);
}

// Kacheln
const tileName = (v) => (v < 0 ? 'm' + Math.abs(v) : String(v));
const tiles = new Map();
let mnLa = 90, mxLa = -90, mnLo = 180, mxLo = -180;
for (const p of pois) {
  const la = Math.floor(p.la), lo = Math.floor(p.lo);
  const key = `${tileName(la)}_${tileName(lo)}`;
  if (!tiles.has(key)) tiles.set(key, []);
  tiles.get(key).push([p.n, p.e, p.la, p.lo]);
  if (p.la < mnLa) mnLa = p.la; if (p.la > mxLa) mxLa = p.la;
  if (p.lo < mnLo) mnLo = p.lo; if (p.lo > mxLo) mxLo = p.lo;
}
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });
let bytes = 0;
for (const [key, arr] of tiles) {
  const s = JSON.stringify(arr);
  bytes += s.length;
  writeFileSync(join(outDir, key + '.json'), s);
}
const meta = {
  v: 1,
  // Abdeckung: deklarierte Box über die Daten (leicht gepolstert)
  bbox: [Math.floor(mnLa), Math.floor(mnLo), Math.ceil(mxLa), Math.ceil(mxLo)],
  tiles: tiles.size,
  pois: pois.length,
  date: new Date().toISOString().slice(0, 10),
  source: 'OpenStreetMap contributors, ODbL 1.0 — via Geofabrik-Extracts',
  countries,
};
writeFileSync(join(outDir, 'meta.json'), JSON.stringify(meta));
console.error(`${tiles.size} Kacheln, ${(bytes / 1e6).toFixed(1)} MB, bbox ${meta.bbox.join(',')}`);
