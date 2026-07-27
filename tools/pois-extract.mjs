// Extrahiert benannte Pässe/Sättel aus einem osmium-export-GeoJSON.
// Nutzung: node pois-extract.mjs input.geojson > country.json
// Ausgabe: [{i, n, e, la, lo}, ...]  (i = OSM-Id für Dedup, e = ele|null)
import { readFileSync } from 'node:fs';

const file = process.argv[2];
if (!file) { console.error('Nutzung: node pois-extract.mjs input.geojson'); process.exit(2); }

const gj = JSON.parse(readFileSync(file, 'utf8'));
const out = [];
for (const f of gj.features || []) {
  if (!f.geometry || f.geometry.type !== 'Point') continue;
  const p = f.properties || {};
  const name = p.name || p['name:de'] || p['name:fr'] || p['name:it'];
  if (!name) continue;
  const [lo, la] = f.geometry.coordinates;
  let e = null;
  if (p.ele != null) {
    // ele kann Müll enthalten ("1.234 m", Fuß-Werte, Kommas)
    const v = parseFloat(String(p.ele).replace(',', '.'));
    if (isFinite(v) && v > -430 && v < 4900) e = Math.round(v);
  }
  out.push({
    i: f.id || `${la.toFixed(6)}:${lo.toFixed(6)}`,
    n: name,
    e,
    la: Math.round(la * 1e5) / 1e5,
    lo: Math.round(lo * 1e5) / 1e5,
  });
}
process.stdout.write(JSON.stringify(out));
console.error(`${file}: ${out.length} benannte POIs`);
