# Pass-Auswertung für GPX-Motorradtouren

Lade eine GPX-Datei hoch und bekomm zurück, welche **Pässe** du gefahren bist —
mit Höhe, Kilometern und Höhenmetern pro Tag, einer Karte und einem Top-Ranking.

Live: **https://flumos.github.io/gpx-passes/**

## Wie es funktioniert

Alles läuft clientseitig im Browser — die GPX-Datei verlässt deinen Rechner nicht:

1. **GPX parsen** → Trackpunkte (lat, lon, Höhe, Zeit).
2. **Distanz & Höhenmeter** per Haversine, Höhenmeter aus leicht geglättetem Profil.
3. **Pässe holen:** Für die Bounding-Box des Tracks werden alle in OpenStreetMap
   als `mountain_pass=yes` oder `natural=saddle` getaggten, benannten Punkte über
   die [Overpass API](https://overpass-api.de) abgefragt.
4. **Matching:** Ein Pass zählt als gefahren, wenn der Track auf einstellbarer
   Toleranz (Standard 250 m) an seinem Scheitel vorbeikommt. Gitter-Index für Tempo.
5. **Dedupe:** Doppelt getaggte Punkte desselben Passes werden zusammengelegt —
   gleichnamige, aber weit auseinanderliegende Pässe (z. B. zwei „Col de la
   Madeleine") bleiben getrennt.

## Dateien

- `index.html` — UI & Styling
- `passlib.js` — reine Logik (parsen, rechnen, Overpass, matchen), ohne DOM
- `app.js` — Datei-Handling, Rendering, Leaflet-Karte
- `test.mjs` — End-to-End-Test gegen eine echte GPX (`node test.mjs pfad.gpx`)

## Lokal starten

Statische Seite, kein Build. Einfach einen kleinen Server starten:

```sh
python3 -m http.server 8000   # dann http://localhost:8000
```

## Grenzen

- Nur Pässe, die in OpenStreetMap getaggt sind, werden gefunden.
- Höhenmeter aus GPS-Tracks liegen oft etwas über dem realen Wert.
- Overpass ist ein kostenloser Gemeinschaftsdienst; bei Überlastung retryt die
  Seite automatisch — sonst kurz später nochmal probieren.

Pass-Daten © OpenStreetMap-Mitwirkende (ODbL).
