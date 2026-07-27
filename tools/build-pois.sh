#!/usr/bin/env bash
# Baut die statischen POI-Kacheln (pois/) aus Geofabrik-Länder-Extracts.
# Land für Land: laden → filtern → PBF löschen (Spitzen-Diskbedarf ≈ größtes Land ~5 GB).
# Wiederaufnehmbar: fertige Länder (json/<land>.json) werden übersprungen.
# Nutzung: bash tools/build-pois.sh [arbeitsverzeichnis]
set -uo pipefail

REPO="$(cd "$(dirname "$0")/.." && pwd)"
WORK="${1:-/tmp/poibuild}"
mkdir -p "$WORK/json"

COUNTRIES=(
  albania andorra austria belgium bosnia-herzegovina bulgaria croatia
  czech-republic denmark estonia finland france germany great-britain greece
  hungary iceland ireland-and-northern-ireland italy kosovo latvia
  liechtenstein lithuania luxembourg macedonia monaco montenegro netherlands
  norway poland portugal romania serbia slovakia slovenia spain sweden
  switzerland
)

FAILED=()
for c in "${COUNTRIES[@]}"; do
  if [ -s "$WORK/json/$c.json" ]; then echo "== $c: schon da, übersprungen"; continue; fi
  echo "== $c: lade ..."
  if ! curl -fL --retry 3 -C - -o "$WORK/$c.pbf" \
      "https://download.geofabrik.de/europe/$c-latest.osm.pbf"; then
    echo "!! $c: Download fehlgeschlagen"; FAILED+=("$c"); rm -f "$WORK/$c.pbf"; continue
  fi
  echo "== $c: filtere ..."
  if osmium tags-filter -R "$WORK/$c.pbf" n/mountain_pass=yes n/natural=saddle \
      -o "$WORK/$c.filtered.pbf" --overwrite \
    && osmium export "$WORK/$c.filtered.pbf" --add-unique-id=type_id \
      -o "$WORK/$c.geojson" -f geojson --overwrite \
    && node "$REPO/tools/pois-extract.mjs" "$WORK/$c.geojson" > "$WORK/json/$c.json"; then
    echo "== $c: fertig"
  else
    echo "!! $c: Verarbeitung fehlgeschlagen"; FAILED+=("$c"); rm -f "$WORK/json/$c.json"
  fi
  rm -f "$WORK/$c.pbf" "$WORK/$c.filtered.pbf" "$WORK/$c.geojson"
done

echo "== Kacheln bauen ..."
node "$REPO/tools/pois-tile.mjs" "$WORK/json" "$REPO/pois"

if [ ${#FAILED[@]} -gt 0 ]; then
  echo "!! FEHLGESCHLAGENE LÄNDER: ${FAILED[*]}"
  exit 1
fi
echo "== FERTIG"
