# Passjäger — Pass-Auswertung für GPX-Motorradtouren

GPX-Datei hochladen und zurück kommt die **Trophäensammlung**: jeder gefahrene
Pass mit Höhe, Etappe und Uhrzeit — als Cockpit mit Karte, als Trophäenwand
und als teilbares Hochkant-Bild für WhatsApp & Co.

Live: **https://flumos.github.io/gpx-passes/**

## Ansichten

- **Upload** — Drag & Drop, Einstellungen (Toleranz 150/250/500 m, Wasserscheiden-Filter)
- **Cockpit** — Stat-Leiste, dunkle Leaflet-Karte (CARTO dark) mit Akzent-Route
  und Pass-Markern, Trophäen-Panel nach Tagen gruppiert (Sortierung Uhrzeit | Höhe),
  Etappen-Filter auf der Karte, Hover-Kopplung Zeile ↔ Marker
- **Trophäenwand** — Stat-Band, Top-Pässe-Karten, Tagesübersicht mit Königsetappe,
  Karten-Panorama
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
3. **Pässe holen:** Für die Bounding-Box des Tracks alle in OpenStreetMap als
   `mountain_pass=yes` / `natural=saddle` getaggten, benannten Punkte via
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
