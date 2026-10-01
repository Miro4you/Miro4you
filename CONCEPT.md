# Konzept: 2D-Skizzen-CAD im Browser

Ziel: Ein schlankes 2D-Zeichenprogramm im Browser, mit dem man schnell technische
Skizzen erstellt, die wie echte technische Zeichnungen aussehen.
Primärgerät: **iPad mit Apple Pencil im Browser**; Maus muss ebenfalls gut funktionieren;
reine Touch-Bedienung (Finger zeichnet) hat niedrige Priorität.

---

## 1. Grundlagen

- **Unendlicher Canvas** mit Pan, Zoom und Drehen.
- Interne Einheit: **Millimeter**. Strichstärken, Maße und Schraffurabstände sind in mm definiert.
- **Alles ist Vektor** – auch Freihand- und Bleistiftstriche (Voraussetzung für Radierer,
  Trimmen, Auswahl, Schraffur, sauberen Export).
- Papier-Look, dezentes, abschaltbares Raster.

## 2. Stifte

| Typ | Stärken (mm) | Look |
|---|---|---|
| Bleistift | 0,3 · 0,5 · 0,7 · 0,9 | Graphitgrau, Papierkorn fest auf dem Papier (flimmert nicht beim Zoomen), bei starkem Zoom leicht ausgefranste Ränder |
| Tusche | 0,18 · 0,25 · 0,35 · 0,5 · 0,7 | Tiefschwarz, gestochen scharf |

- Standardfarbe: Graphit bzw. Schwarz.
- Stift kann auf **beliebige Farbe** (Farbrad) umgestellt und per Klick auf **Standard** zurückgesetzt werden.
- Option (später prüfen): Graphit-Helligkeit/Härte (z. B. hell „2H“ / mittel „HB“ / dunkel „2B“).

## 3. Linienarten (ISO 128)

| Linienart | Verwendung |
|---|---|
| Volllinie | sichtbare Kanten (breit/schmal ergibt sich aus der Stiftstärke) |
| Strichlinie | verdeckte Kanten |
| Strich-Punkt-Linie | Mittellinien, Symmetrieachsen |
| Strich-Zweipunkt-Linie | Grenzstellungen, angrenzende Teile |
| Freihandlinie | Bruchkanten |

- Strichmuster **skalieren mit der Stiftstärke**.
- Keine Zickzacklinie.

## 4. Layer

- Mehrere Ebenen (anlegen, umbenennen, sortieren, ein-/ausblenden, sperren, Deckkraft).
- Typischer Workflow: Skizzen-Layer (Bleistift, blass schaltbar) unten, Reinzeichnung (Tusche) darüber.

## 5. Zeichenwerkzeuge

### 5.1 Freihand
Freies Scribbeln mit dem gewählten Stift.

### 5.2 Linie (nach Sketchbook-Vorbild, erweitert)
- Aufsetzen und ziehen → bis zum Absetzen nur **gestrichelte Vorschau**; beim Absetzen wird die echte Linie erzeugt.
- **Live-Anzeige** von Länge und Winkel an der Linie (z. B. `42,5 mm · 30°`).
- **Endpunkt-Fang** an bestehender Geometrie:
  - Fangradius in **Bildschirm-Pixeln** → beim Reinzoomen automatisch feiner.
  - Fangpunkt wird vor dem Einrasten sichtbar markiert.
  - Fang temporär aussetzen: zweiter Finger auf dem Display (iPad) bzw. Modifier-Taste (Maus, z. B. Alt).
- **Winkelfang** in 5°-Schritten; klar sichtbarer Schalter mit drei Zuständen: **Fang an / nur Anzeige / aus**.
- Auch bei „nur Anzeige“ und „aus“ **leichtes Einrasten** (±1°) bei 0°, 45°, 90° usw.
- **Griffe an den Enden** nach dem Absetzen zum Nachkorrigieren – als **abschaltbare Einstellung** (Feature-Flag), damit man es leicht wieder entfernen kann.

### 5.3 Kreis
- **Mittelpunkt setzen, Radius aufziehen** (nicht über ein Rechteck), gestrichelte Vorschau, Live-Anzeige `R`/`Ø`.
- Danach Griffe: Mittelpunkt verschieben, Radius ändern.
- Optional: automatisches **Mittellinienkreuz**.

### 5.4 Bogen (eigenes Tool)
- **Tangentialbogen:** am Ende einer Linie ansetzen, Bogen läuft tangential weiter; Ziehen bestimmt Radius und Winkel (Live-Anzeige `R 5 · 90°`). Ermöglicht flüssig Linie → Bogen → Linie.
- **Mittelpunkt-Bogen:** Mittelpunkt, Radius, dann Winkel abfahren.
- Später: Ecke verrunden (zwei Linien antippen, Radius eingeben).

### 5.5 Rechteck
Niedrige Priorität.

## 6. Symmetrie / Spiegeln
- Eine Strich-Punkt-Linie kann als **Symmetrieachse** markiert werden.
- Neues wird live an allen **aktiven** Achsen gespiegelt – auch über zwei Achsen (vier Quadranten).
- Neben jeder Achse ein kleines Symbol: **Spiegeln an/aus** per Antippen.
- Die Achse bleibt eine echte Mittellinie in der Zeichnung, bis sie gelöscht wird.

## 7. Schraffur (Fülltool)
- In eine geschlossene Fläche tippen → Fläche wird schraffiert.
- Muster: 45°, −45°, Kreuzschraffur sowie übliche Materialschraffuren (Metall, Kunststoff, Holz, Beton, …).
- Einstellbar: Muster, Winkel, Abstand (mm).
- Flächenerkennung über alle sichtbaren Layer mit **Lückentoleranz** (kleine Spalte werden automatisch geschlossen) – muss rein.

## 8. Löschen (drei Werkzeuge)
1. **Objekt löschen** – ganzen Strich per Antippen.
2. **Trimmen** – Segment bis zum nächsten Schnittpunkt entfernen.
3. **Radierer** – frei radieren (zerschneidet die Vektoren).

## 9. Auswahl & Bearbeiten
- Antippen, **Lasso**, Mehrfachauswahl.
- Auf Auswahl: löschen, verschieben, duplizieren, drehen, spiegeln, Stift/Linienart/Farbe/Layer ändern.

## 10. Bemaßung
- **DIN-Stil**: geschlossene Pfeile, Maßzahl über der Maßlinie.
- Maßarten: Länge, Durchmesser Ø, Radius R, Winkel.

## 11. ISO-GPS-Symbole
- Bezugsdreieck mit Buchstabe (Bezug A, B, …).
- Toleranzrahmen für Form- und Lagetoleranzen (Symbol, Toleranzwert, Bezüge).
- Einfach platzierbar und an Geometrie ansetzbar.
- **Keine** Oberflächenzeichen.

## 12. Text
Textwerkzeug für Beschriftungen (Normschrift-Optik) – niedrige Priorität.

## 13. Blattformate
A4 bis A0 (inkl. A3, A2, A1) als Rahmen mit Schriftfeld auf dem Canvas platzierbar – niedrige Priorität.

## 14. Speichern & Export
- Automatisch **lokal im Browser** speichern; eigenes Dateiformat zum **Herunterladen und wieder Öffnen**.
- Export: **SVG, PNG, PDF, JPEG**.
- Später: Online-Speicherverwaltung.

## 15. Bedienung
- **Apple Pencil zeichnet, Finger zeichnen nie** (Handballenerkennung).
- **Zwei Finger:** verschieben, zoomen, drehen; Drehung rastet bei 0°/45°/90° ein, dazwischen frei; Button „Ansicht gerade stellen“.
- **Maus:** Mausrad = Zoom, Leertaste + Ziehen oder mittlere Maustaste = Verschieben, Tastenkürzel für alle Tools.
- Rückgängig / Wiederholen.
- Als **PWA** installierbar (Vollbild auf dem iPad, offlinefähig).

## 16. Design
- Super modern, schlicht, elegant.
- **Schwebende, frei verschiebbare Werkzeugleiste** (Position wird gemerkt, einklappbar).
- Stifte als visuelle Chips, die Stärke und Linienart zeigen.

## 17. Technik
- TypeScript, Vite, Canvas-Rendering mit eigener Vektor-Datenstruktur, kein schweres UI-Framework.
- Fokus auf flüssige Performance auf dem iPad.

---

## Phasenplan

1. ✅ **Fundament:** Canvas (Pan/Zoom/Drehen), Stifte, Linienarten, Freihand, Linie mit Live-Maß, Endpunkt- und Winkelfang, Layer, Undo/Redo, lokales Speichern, schwebende Werkzeugleiste.
2. ✅ **Konstruktion:** Kreis, Bogen, Symmetrie/Spiegeln, drei Löschwerkzeuge, Auswahl/Lasso, Farben.
3. ✅ **Technische Zeichnung:** Schraffur mit Lückentoleranz, Bemaßung, ISO-GPS-Symbole, Export (SVG/PNG/PDF/JPEG), Datei herunterladen/öffnen.
4. ✅ **Extras:** Blattformate mit Schriftfeld, Rechteck, Text, Ecken verrunden, Graphit-Härten, Online-Speicher.
