# Passjäger — Pass-Auswertung für GPX-Motorradtouren

GPX-Datei hochladen und zurück kommt die **Trophäensammlung**: jeder gefahrene
Pass mit Höhe, Etappe und Uhrzeit — als Cockpit mit Karte, als Trophäenwand
und als teilbares Hochkant-Bild für WhatsApp & Co.

Live: **https://passjaeger.app** (alt: flumos.github.io/gpx-passes → leitet weiter)

## Ansichten

- **Upload** — Drag & Drop, Einstellungen (Toleranz 150/250/500 m, Wasserscheiden-Filter)
- **Cockpit** — Stat-Leiste, dunkle Leaflet-Karte (CARTO dark) mit Akzent-Route
  und Pass-Markern, Trophäen-Panel nach Tagen gruppiert (Sortierung Uhrzeit | Höhe),
  Etappen-Filter auf der Karte, Hover-Kopplung Zeile ↔ Marker
- **Trophäenwand** — Stat-Band, Top-Pässe-Karten, Tagesübersicht mit Königsetappe,
  Karten-Panorama
- **Reisebericht** — Tagesübersicht mit automatischen Region-Vorschlägen
  (Nominatim-Reverse-Geocoding, editierbar), Etappen mit Pässen + Uhrzeiten,
  Top-Pässe; als Plain-Text oder WhatsApp-Format (mit `*fett*` und 🏆)
  kopierbar zum Weiterverschicken. Editierte Regionen wandern in den Teilen-Link.
- **Teilen** — client-seitig gerendertes 1080 × 1920-Bild (Canvas) mit Route,
  Top-3 und Stats; Web Share API mit Datei-Fallback als Download.
  Zusätzlich **Teilen per Link**: das Ergebnis (Tage, Pässe, vereinfachte Route)
  wird deflate-komprimiert ins URL-Fragment gepackt — der Link öffnet die fertige
  Auswertung direkt, ohne GPX-Upload. Das Fragment geht nie an den Server.
- **Kurvenzählung** — Kurven (≥ 45° Richtungsänderung) und Kehren (≥ 135°) aus
  der Track-Geometrie (30-m-Resampling, rauschgefiltert), pro Tag und gesamt

## Wie es funktioniert

Alles läuft clientseitig im Browser — die GPX-Datei verlässt den Rechner nicht:

1. **GPX parsen** → Trackpunkte (lat, lon, Höhe, Zeit)
2. **Distanz & Höhenmeter** per Haversine, Höhenmeter aus leicht geglättetem Profil
3. **Pässe holen:** In Europa aus **eigenen statischen POI-Kacheln** (1°×1°-Raster
   unter `pois/`, vorberechnet aus OSM — schnell, zuverlässig, offlinefähig);
   außerhalb der Abdeckung als Fallback via
   [Overpass API](https://overpass-api.de) (3 Mirrors, Retry mit Backoff)
4. **Matching:** Pass zählt, wenn der Track auf Toleranz am Scheitel vorbeikommt
   (Gitter-Index); Dedupe von Doppel-Tags, gleichnamige entfernte Pässe bleiben getrennt

## Design

„Nocturne"-System (siehe `design_handoff_passjaeger/`): dunkler blaugrauer Grund,
Inter (500 für Headings), ein Akzent #9184d9 als Linie/Glow, outlined Buttons.
`styles.css` enthält die Tokens und Komponentenklassen. Icons: Phosphor.

## Dateien

- `index.html` — alle Views (Upload, Cockpit, Trophäenwand, Teilen-Dialog)
- `styles.css` — Nocturne-Tokens und Komponenten (aus dem Design-Handoff)
- `passlib.js` — reine Logik ohne DOM (parsen, rechnen, Overpass, matchen)
- `app.js` — State, Rendering, Leaflet-Karten, Teilen-Bild (Canvas)
- `test.mjs` — Logik-Test gegen eine echte GPX (`node test.mjs pfad.gpx`)
- `design_handoff_passjaeger/` — Design-Referenz (Mocks + README)

## PWA

Passjäger ist installierbar (Android: Install-Prompt bzw. Menü; iOS: Teilen →
„Zum Home-Bildschirm", Anleitung in der App unter „···"). Installiert läuft die
App offline (Shell + zuletzt geladene Karten-Tiles), auf Android lassen sich
GPX-Dateien direkt per „Teilen mit Passjäger" öffnen. Alle Assets (Leaflet,
Phosphor, Inter) sind self-hosted — keine CDN-Abhängigkeiten. Updates meldet
die App mit einem „Aktualisieren"-Hinweis.

## Lokal starten

Statische Seite, kein Build:

```sh
python3 -m http.server 8000   # dann http://localhost:8000
```

## Grenzen

- Nur Pässe, die in OpenStreetMap getaggt sind, werden gefunden
- Höhenmeter aus GPS-Tracks liegen oft etwas über dem realen Wert
- Overpass ist ein kostenloser Gemeinschaftsdienst; bei Überlastung retryt die Seite automatisch

Pass-Daten © OpenStreetMap-Mitwirkende (ODbL) · Karten-Tiles © CARTO.

## Datengrundlage

Die Pass-Daten (`pois/`) stammen aus OpenStreetMap (© OpenStreetMap contributors,
[ODbL 1.0](https://opendatacommons.org/licenses/odbl/)) und werden mit
`tools/build-pois.sh` aus Geofabrik-Länder-Extracts gebaut (benannte
`mountain_pass=yes`- und `natural=saddle`-Knoten, Europa-weit, 1°×1°-Kacheln).
Der OSM-abgeleitete Extrakt wird auf Anfrage gern herausgegeben — er liegt
ohnehin offen in diesem Repo unter `pois/`. Zum Aktualisieren Pipeline neu
laufen lassen (resumefähig, Spitzen-Diskbedarf ≈ größtes Land ~5 GB).

## Lizenz

© 2026 Felix Blume. Der Quellcode ist zur Transparenz einsehbar — die Seite
läuft komplett im Browser, und hier kann jeder nachprüfen, dass GPX-Tracks das
Gerät nicht verlassen. Eine Lizenz zur Weiterverwendung, Vervielfältigung oder
zum Betrieb eigener Kopien wird nicht erteilt (alle Rechte vorbehalten).
Beiträge/Feedback gern über Issues.
