# Handoff: Passjäger — Redesign der GPX-Pass-Auswertung

## Overview
Redesign der bestehenden Seite https://flumos.github.io/gpx-passes/ („Pass-Auswertung"): Motorradfahrer laden eine GPX-Datei hoch und bekommen ausgewertet, welche Pässe sie gefahren sind. Das Redesign umfasst die Upload-Startseite, eine Ergebnisansicht („Cockpit") mit zentraler Karte und Trophäenliste, eine Detailseite („Trophäenwand") sowie eine Teilen-Funktion, die ein Hochkant-Bild (1080×1920) für WhatsApp & Co. erzeugt.

## About the Design Files
Die Dateien in diesem Paket sind **Design-Referenzen in HTML** — Prototypen, die Aussehen und Verhalten zeigen, kein Produktionscode. Aufgabe: die Designs in der bestehenden Codebasis nachbauen. Die aktuelle Seite ist eine statische GitHub-Pages-Seite (Vanilla HTML/JS mit Leaflet/OSM und Overpass API) — das Redesign lässt sich dort direkt als neues HTML/CSS/JS umsetzen; kein Framework nötig. Die Karten in den Mocks sind Platzhalter-SVGs: im echten Produkt weiterhin Leaflet mit OSM-Tiles verwenden (dunkler Tile-Style empfohlen, z. B. CartoDB dark_matter, damit er zum Design passt).

## Fidelity
**High-fidelity.** Farben, Typografie, Abstände und Zustände sind final gemeint und sollen pixelgenau übernommen werden. Ausnahme: die Karten-Platzhalter (durch echtes Leaflet ersetzen) und die Beispieldaten (Alpentour, Passnamen, km-Werte) — die kommen zur Laufzeit aus der GPX-Auswertung.

## Design-Grundlage: Nocturne
Das Design folgt dem „Nocturne"-System: dunkler blaugrauer Grund, Inter (Gewicht 500 für Headings, nie fetter), 8px-Radien, ein einziger Akzent (#9184d9) als Linie und Glow — nie als Flächenfüllung. Buttons sind outlined (1px Akzent-Rahmen auf transparent), nicht gefüllt. `styles.css` liegt bei und enthält alle Tokens und Komponentenklassen (`.btn`, `.tag`, `.card`, `.seg`, `.table`, `.dialog`, `.field`) — am einfachsten direkt einbinden. Icons: Phosphor Icons (https://phosphoricons.com), regular + fill.

## Design Tokens (aus styles.css)
- Grund: `--color-bg` #161826, Fläche: `--color-surface` #232532, Text: `--color-text` #e9e9ed
- Akzent: `--color-accent` #9184d9; Ramp: 100 #f5f4ff · 200 #e7e5fe · 300 #d2cefd · 400 #b5abfc · 500 #968ae0 · 600 #796cbf · 700 #5d5294 · 800 #423a6a · 900 #2b2741
- Neutral-Ramp: 100 #f3f5fe · 200 #e4e7f5 · 300 #cfd3e5 · 400 #b2b6ca · 500 #9397ab · 600 #75798c · 700 #595d6c · 800 #3f424d · 900 #292b31
- Divider: `color-mix(in srgb, #e9e9ed 16%, transparent)`
- Sektion (satter Grund, nur fürs Stat-Band): `--color-section` #262a60, Glow #353b80
- Font: Inter (heading-weight 500), Zahlen immer mit `font-feature-settings: "tnum" 1`
- Radien: sm 4px · md 8px · lg 14px
- Schatten: sm `0 0 0 1px #3f424d` · md `0 0 0 1px #595d6c, 0 6px 18px rgba(0,0,0,.55)` · lg `0 0 0 1px #9397ab, 0 16px 40px rgba(0,0,0,.65)`
- Karten-Platzhalter-Grund in den Mocks: #14162a, Konturlinien #252840
- Regeln/Trennlinien laufen an den Enden über 48px auf transparent aus (linear-gradient), kurze Akzent-Striche bleiben solid
- Focus: `:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }`

## Screens / Views

### 1a — Upload-Startseite
Referenz: Option „1a" in `Pass-Auswertung Redesign.dc.html` (Breite 1180px im Mock; Seite selbst responsive, Inhalt max ~1180px zentriert).
- **Hintergrund:** `radial-gradient(900px 540px at 80% -120px, color-mix(in srgb, var(--color-accent-900) 75%, transparent), transparent 60%)` über `--color-bg` (Akzent-Bloom oben rechts).
- **Kopfzeile** (16px 40px Padding, 1px Divider unten): Phosphor `mountains` (fill, Akzent, 20px) + „Passjäger" (500/15px) + Tag-Outline „GPX-Auswertung"; rechts „🔒 Läuft komplett lokal im Browser" (13px, neutral-400, `lock-simple`-Icon in Akzent).
- **Hauptbereich:** Grid `1fr 460px`, gap 56px, Padding 56px 40px 48px.
  - Links: Kicker „TOUR HOCHLADEN" (12px, uppercase, letter-spacing .08em, Akzent, mit 36px-Akzentstrich davor) · H1 „Welche Pässe hast du geknackt?" (500, 44px/1.12, letter-spacing -0.015em) · Absatz (15px/1.65, neutral-400, max 46ch): „GPX-Track deiner Motorradtour hochladen — zurück kommt deine Trophäensammlung: jeder Pass mit Höhe, Etappe und Uhrzeit." · 3 nummerierte Schritte (22px-Kreise, 1px Rahmen accent-700, Ziffer accent-300, Text 13.5px neutral-400).
  - Rechts, Spalte mit 16px gap:
    - **Dropzone:** 1.5px gestrichelter Rahmen accent-600, Radius 14px, Grund `color-mix(accent-900 30%, transparent)`, Padding 44px 32px, zentriert: `file-arrow-up` 40px Akzent · „GPX-Datei hierher ziehen" (500/17px) · „oder" · Button primary „Datei wählen" · „.gpx · bleibt auf deinem Gerät" (12px neutral-600). Hover: Rahmen accent, Grund auf 45% Tint.
    - **Einstellungs-Card** (`.card`, Padding 18px 20px): Zeile „Toleranz / Wie nah muss der Track am Pass sein?" mit Segmented Control 150 m | **250 m** | 500 m (aktiv: Grund accent-800, Text accent-200); Divider; Zeile „Wasserscheiden ausblenden / Nur echte Pässe zählen" mit Toggle (38×22px Pille accent-700, Knopf 18px accent-200, an = rechts).
- **Fußzeile** (14px 40px, Divider oben, 11.5px neutral-600): „Pässe: OpenStreetMap via Overpass API · Höhenmeter aus dem Track, leicht geglättet · Karte © OpenStreetMap-Mitwirkende".

### 1b — Ergebnisansicht „Cockpit" (Hauptansicht nach Upload)
Referenz: Option „1b" (1280px).
- **Kopfzeile:** Brand + „/" + Dateiname (13.5px neutral-300) + Tag-Accent „4 Etappen"; rechts: Ghost-Button „Toleranz 250 m" (`sliders-horizontal`), Primary-Button „Teilen" (`share-network`), Secondary „Andere Datei" (`arrow-counter-clockwise`).
- **Stat-Leiste:** 4 gleiche Spalten, durch 1px Divider getrennt, je Padding 18px 28px: Label (11px uppercase neutral-500) über Wert (500/30px, tnum). Werte: „Pässe geknackt" (Wert in accent-300) · „Strecke" · „Anstieg gesamt" · „Höchster Pass" (Name + Höhe klein in neutral-500).
- **Hauptbereich:** Grid `1fr 400px`, min-height 620px.
  - **Karte links** (Grund #14162a, 1px Divider rechts): echtes Leaflet. Route als Akzent-Polyline (3.5px, runde Kappen, Glow: `drop-shadow(0 0 8px accent@60%)`), Pass-Marker als Kreise (Füllung accent-200, 3px Ring accent-700), höchster Pass hervorgehoben (weißer Kern #f5f4ff, Akzent-Ring, Label fett mit Höhe). Overlays: oben links Filter-Tags „Alle Etappen" (aktiv, tag-accent) + „Tag 1…4" (tag-outline, klickbar → filtert Route/Marker auf die Etappe); unten rechts Zoom als `.btn btn-icon btn-secondary` (+/−); unten links Attribution (10.5px neutral-600).
  - **Trophäen-Panel rechts:** Kopf „Deine Trophäen" (500/17px) + Segmented Control **Uhrzeit** | Höhe (siehe Interaktionen). Liste gruppiert nach Tag: Gruppen-Header „Tag 2 · Mo 15.06. · 312 km · 6.480 Hm" (11px uppercase neutral-500). Pass-Zeile: Icon `flag-banner` (18px neutral-400) · Name (14px) + Uhrzeit darunter (11.5px neutral-500) · Höhe rechts (13.5px tnum neutral-300); Padding 10px, Radius 8px, Hover-Grund neutral-900. **Highlight-Zeile** (höchster Pass der Tour): `trophy`-Icon (fill, accent-300, 20px), Grund `color-mix(accent-900 55%, transparent)` + 1px Ring accent-800, Zusatztext „höchster Pass der Tour".

### 1c — Detailseite „Trophäenwand"
Referenz: Option „1c" (1280px). Erreichbar z. B. als zweiter Tab/Unterseite der Ergebnisansicht.
- **Stat-Band** (die eine erlaubte satte Fläche): `linear-gradient(135deg, var(--color-section-glow), var(--color-section) 55%)`, Padding 36px 32px. Links Kicker (Dateiname + Datum, accent-300, uppercase) über H1 „12 Pässe geknackt." (500/36px). Rechts drei Stats (500/26px + Label 11.5px in #d2cefd-Ton).
- **Top-Pässe:** Kopfzeile „Top-Pässe nach Höhe" + Segmented „Nach Höhe | Nach Etappe". Grid 4 Spalten, gap 14px. Card: Rang „#n" (500/12px Monospace, neutral-500; #1 in Akzent) · Name (500/17px) · Höhe (500/24px tnum; #1 in accent-300) · Meta „Tag · Uhrzeit" (11.5px neutral-500). #1-Card bekommt Trophy-Icon oben rechts und Akzent-Ring (`0 0 0 1px accent-700` + Ambient-Schatten). Letzte Zelle: „+ n weitere Pässe" (zentriert, neutral-500) → expandiert die Liste.
- **Tagesübersicht:** `.table`, Spalten Tag / Datum / km / Anstieg / Pässe (Zahlen rechtsbündig, tnum). Tag mit den meisten Pässen bekommt Tag-Accent „4 · Königsetappe".
- **Karten-Panorama:** volle Breite (Höhe 300px, Radius 8px, shadow-sm), Route + Marker wie in 1b.

### 2a — Teilen-Dialog
Referenz: Option „2a". Öffnet über 1b/1c als Modal (`.dialog` auf `.dialog-backdrop`, Backdrop = 45% Schwarz über bg).
- Breite 560px. Titel „Tour teilen" + Ghost-Icon-Button ✕.
- Body-Grid `168px 1fr`, gap 24px: links Live-**Vorschau** des Hochkant-Bilds (9:16, verkleinert, shadow-md); rechts Erklärtext (13.5px neutral-400): „Erstellt ein Hochkant-Bild (1080 × 1920) mit Route, Trophäen und Stats — bereit für WhatsApp, Signal oder die Familiengruppe." + Checkbox-Gruppe „Was soll drauf?": Route auf Karte ✓, Top-3-Pässe ✓, Tagesübersicht ☐ (Checkboxen 15px, Radius 4px, checked = Grund accent-700 + Häkchen accent-100).
- Aktionen: Primary „Teilen…" (`share-network`) + Secondary „Bild speichern" (`download-simple`). Darunter Hinweis (11px neutral-600): „Nutzt das Teilen-Menü deines Geräts — WhatsApp erscheint dort automatisch."

### 2b — Das Teilen-Bild (1080 × 1920)
Referenz: Option „2b" (im Mock 432×768 = halbe Größe; alle Maße unten ×2.5 für 1080×1920).
Aufbau von oben nach unten (Padding 30/28/24 im Mock):
1. Brand-Zeile: `mountains`-Icon + „Passjäger" links, Tag-Outline „Alpentour 2026" rechts.
2. Kicker mit 26px-Akzentstrich: „14.–17. JUNI · 4 ETAPPEN" (accent-300) · Headline „12 Pässe geknackt." (500, 40px/1.08 im Mock).
3. Karte mit Route (flex: 1, Radius 8px, Grund #14162a): Akzent-Route mit Glow, Marker, höchster Pass gelabelt.
4. Top-3-Liste: Zeile = Icon (trophy fill accent-300 für #1, sonst flag-banner neutral-500) · Name · Höhe rechts (tnum; #1 in accent-300).
5. Ausblendende Trennlinie (48px-Fade).
6. Stat-Zeile: „1.148 km / Strecke", „18.240 m / Anstieg", „+9 / weitere Pässe" (500/19px + 10.5px-Label).
Hintergrund wie 1a: Akzent-Bloom oben rechts + dunkler Fall-off unten links über bg.

## Interactions & Behavior
- **Upload:** Drag & Drop auf die Dropzone (Hover-/Dragover-State wie oben) oder Dateiwahl. Nach Parse → Wechsel zur Cockpit-Ansicht. Einstellungen (Toleranz, Wasserscheiden) wirken wie im Bestandscode; Änderung nach Auswertung rechnet neu (Ghost-Button „Toleranz 250 m" in 1b öffnet dieselbe Einstellungs-Card als Popover).
- **Sortier-Umschalter „Uhrzeit | Höhe"** (1b, wichtigste neue Interaktion): schaltet die Reihenfolge der Pass-Zeilen **innerhalb jeder Tagesgruppe** um — „Uhrzeit" = chronologisch (Default), „Höhe" = absteigend nach Höhe. Gruppierung nach Tag bleibt immer erhalten. Zustand in `localStorage` merken.
- **Etappen-Filter-Tags** auf der Karte: „Alle Etappen" default; Klick auf „Tag n" zoomt Karte auf die Etappe, dimmt andere Routenteile (Opacity ~0.25) und scrollt/hebt die Tagesgruppe im Panel hervor.
- **Hover:** Pass-Zeile ↔ Karten-Marker gekoppelt (Zeile hovern → Marker vergrößern/Label zeigen, und umgekehrt).
- **Teilen:** Button „Teilen" → Dialog 2a. Das Bild wird client-seitig gerendert (Canvas 1080×1920 — Karte via `leaflet-image` o. ä. oder statischer Tile-Render, Rest mit Canvas-Text nach Spez 2b). „Teilen…" nutzt `navigator.share({ files: [File] })` (Web Share API Level 2 — auf Android/iOS erscheint WhatsApp im System-Sheet); Fallback ohne `navigator.canShare`: Button-Label „Bild speichern" allein, Download als PNG. Checkboxen steuern Bildinhalt; Vorschau links live aktualisieren.
- **Transitions:** dezent — Hover-Tints 120–150ms ease; Dialog fade+scale ~160ms; keine großen Animationen.
- **Loading:** während Overpass-Abfrage Stat-Leiste und Panel mit Skeleton-Zeilen (neutral-900-Balken), Karte zeigt Track sofort.
- **Fehler:** ungültige GPX → Hinweis in der Dropzone (Text accent-300, Rahmen accent); Overpass-Timeout → Retry-Hinweis über dem Panel.

## State Management
- `settings`: { toleranz: 150|250|500 (Default 250), wasserscheidenAusblenden: bool } → localStorage
- `tour`: geparste GPX (Tage/Etappen mit km, Anstieg, Trackpunkten)
- `passes`: [{ name, hoehe, tag, uhrzeit, lat, lng, istWasserscheide }]
- `ui`: { sortierung: 'uhrzeit'|'hoehe', etappenFilter: null|tagNr, shareOptions: { route: true, top3: true, tagesuebersicht: false } }
- Abgeleitet: Totale (Pässe, km, Anstieg, höchster Pass), Königsetappe (Tag mit den meisten Pässen).

## Assets
- Phosphor Icons (regular + fill), z. B. via `@phosphor-icons/web`. Verwendet: mountains (fill), lock-simple, file-arrow-up, sliders-horizontal, share-network, arrow-counter-clockwise, trophy (fill), flag-banner, plus, minus, x, check, download-simple.
- Inter via Google Fonts (400/500).
- Keine Bilder; Karten von OSM/Leaflet (dunkler Tile-Style).

## Files
- `Pass-Auswertung Redesign.dc.html` — alle fünf Screens als HTML-Design-Referenz (Optionen 1a, 1b, 1c, 2a, 2b; Inline-Styles = maßgebliche Werte)
- `styles.css` — Nocturne-Tokens und Komponentenklassen (direkt übernehmbar)
