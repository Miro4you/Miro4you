# Skizzen-CAD

Technische Skizzen im Browser – schnell wie auf Papier, sauber wie CAD.
Primär für das iPad mit Apple Pencil gebaut, funktioniert auch mit Maus und Tastatur.
Das vollständige Konzept und der Phasenplan stehen in [CONCEPT.md](CONCEPT.md).

## Stand: Phase 1 – 3

- Unendlicher Canvas in Millimetern: Verschieben, Zoomen, Drehen (rastet bei 0°/45°/90° ein)
- Bleistift 0,3 · 0,5 · 0,7 · 0,9 mm und Tusche 0,18 · 0,25 · 0,35 · 0,5 · 0,7 mm
- Graphit mit Papierkorn, das fest auf dem Papier sitzt (kein Flimmern beim Zoomen); bei starkem Zoom leicht ausgefranste Ränder
- Linienarten nach ISO 128: Voll, Strich, Strich-Punkt, Strich-Zweipunkt – Strichmuster skalieren mit der Stiftstärke
- Freihand-Werkzeug mit einstellbarer Glättung („Schnur“ wie in Sketchbook)
- Heller und dunkler Modus (oder wie das System)
- Linien-Werkzeug nach Sketchbook-Vorbild: gestrichelte Vorschau bis zum Absetzen, Live-Anzeige von Länge und Winkel
- Fang an Endpunkten, Mitten und Schnittpunkten (Radius in Bildschirm-Pixeln → beim Reinzoomen feiner)
- Winkelfang in 5°-, 10°- oder 15°-Schritten mit drei Zuständen: Fang / nur Anzeige / aus – auch ohne Winkelfang rasten Linien innerhalb von 1° sanft auf 0°/45°/90° ein
- Korrekturgriffe an der zuletzt gezeichneten Linie (im Menü einschaltbar)
- Ebenen: anlegen, umbenennen, sortieren, ausblenden, sperren, blass anzeigen
- Rückgängig / Wiederholen (auch per Zwei- bzw. Drei-Finger-Tipp)
- Automatisches Speichern im Browser, Datei herunterladen und wieder öffnen
- Schwebende, verschiebbare Werkzeugleiste (dockt an Seitenrändern hochkant an)
- Als App installierbar (PWA, offlinefähig)

**Phase 2**

- Kreis: Mittelpunkt setzen, Radius aufziehen (Anzeige R und Ø), Mittellinienkreuz nach ISO, Griffe zum Verschieben und für den Radius
- Bogen: am Ende einer Linie oder eines Bogens tangential weiter (runde Ecke, 90° rastet ein), sonst Mittelpunkt → Radius → Winkel; erneutes Tippen auf das Werkzeug erzwingt den Mittelpunkt-Modus
- Fang zusätzlich an Kreismittelpunkten, Quadrantenpunkten, Bogenenden und Schnittpunkten mit Kreisen/Bögen
- Symmetrieachsen: jede Strich-Punkt-Linie wird automatisch Achse, eigenes Achsenkreuz-Werkzeug, oder Linie auswählen → „Symmetrieachse“; alles Neue wird live gespiegelt, bei zwei Achsen in alle vier Quadranten; Knopf an der Achse schaltet das Spiegeln an/aus
- Löschen: ganze Objekte (antippen oder drüberwischen), Trimmen bis zum nächsten Schnittpunkt (antippen oder quer drüberwischen), Radierer, der Linien, Kreise und Striche zerteilt
- Auswahl: antippen (mehrere nacheinander), Schlinge, Verschieben mit Fang, Drehknopf, Griffe an Linien, Kreisen und Bögen; Leiste mit Duplizieren, 90° drehen, Spiegeln, Ebene wechseln, Achse, Mittellinien, Löschen
- Stift, Linienart und Farbe wirken auch auf die Auswahl
- Farben: Standard (Graphit/Schwarz), zehn Farben oder eigene Farbe
- Trimmen erkennt auch Stoßstellen (Linie endet auf einer Linie)

**Phase 3**

- Schraffur: in eine geschlossene Fläche tippen; Lücken bis 0,5 / 1,5 / 3 / 6 mm werden überbrückt, Inseln (z. B. Bohrungen) bleiben frei; Muster 45°, −45°, Kreuz, Doppellinie (Stahl), voll/gestrichelt (Kunststoff), Punkte; Abstand 1–5 mm. Antippen einer vorhandenen Schraffur übernimmt Muster und Abstand
- Bemaßung nach DIN 406: geschlossene Pfeile, Maßzahl über der Maßlinie, von unten oder rechts lesbar
  - Punkt zu Punkt ziehen, dann Maßlinie platzieren (waagerecht, senkrecht oder parallel – je nachdem, wohin man zieht)
  - Linie antippen und Maßlinie platzieren · Kreis antippen → Ø · Bogen antippen → R · zwei Linien antippen → Winkel (der Zeiger wählt den Quadranten)
  - Maßtext über die Auswahlleiste ändern (leer = gemessener Wert); Schraffur wird hinter Maßzahlen ausgespart
- ISO-GPS: Bezugsdreieck mit Buchstabenrahmen (A, B, … automatisch fortlaufend) und Toleranzrahmen mit allen 14 Symbolen nach ISO 1101, Toleranzwert, Ø und bis zu drei Bezügen
- Export (Menü → Exportieren, ⇧⌘E): PDF und SVG als Vektor im Maßstab 1:1, PNG und JPEG mit Bleistift-Struktur in 150/300/600 dpi, alles oder nur die Auswahl, PNG/SVG auch transparent

## Bedienung

| Eingabe | Aktion |
| --- | --- |
| Apple Pencil / linke Maustaste | Zeichnen |
| Ein Finger | Ansicht verschieben |
| Zwei Finger | Verschieben, Zoomen, Drehen |
| Zwei- / Drei-Finger-Tipp | Rückgängig / Wiederholen |
| Finger halten beim Zeichnen, oder Alt | Fang kurz aussetzen |
| Mausrad | Zoomen |
| Leertaste + Ziehen, mittlere/rechte Maustaste | Verschieben |
| V · F · L · C · B | Auswahl · Freihand · Linie · Kreis · Bogen |
| K | Achsenkreuz |
| X · T · E | Objekt löschen · Trimmen · Radierer |
| H · D · P | Schraffur · Bemaßung · GPS-Symbol |
| Entf · ⌘D · ⌘A · Pfeile | Auswahl löschen · duplizieren · alles wählen · verschieben |
| 1–4 / 5–9 | Bleistift- / Tuschestärken |
| ⇧1–⇧5 | Linienart |
| S / A / G | Fang / Winkelmodus / Raster |
| 0 / R | Alles zeigen / Ansicht gerade |
| ⌘Z / ⇧⌘Z | Rückgängig / Wiederholen |
| ⌘S / ⌘O / ⇧⌘E | Herunterladen / Öffnen / Exportieren |

## Entwicklung

```bash
npm install
npm run dev        # Entwicklungsserver (auch im LAN erreichbar, z. B. vom iPad)
npm test           # Unit-Tests
npm run build      # Typecheck + Produktions-Build nach dist/
npm run preview    # Build lokal ansehen
```

Technik: TypeScript, Vite, Canvas 2D, keine UI-Frameworks. Aufbau:

- `src/core` – Geometrie (Kurven, Schnittpunkte, Trimmen), Transformationen, Dokument mit Undo/Redo, Kamera, Fang, Stifte/Linienarten
- `src/render` – Szene (Papier, Raster, Objekte), Graphit-Textur, Overlay (Vorschau, Maße, Fangmarken)
- `src/tools` – Werkzeuge (Auswahl, Freihand, Linie, Kreis, Bogen, Löschen, Trimmen, Radierer) und gemeinsame Griffe
- `src/input` – Pencil/Maus/Touch-Steuerung, Gesten, Tastatur
- `src/ui` – Werkzeugleiste, Ebenen, Menü
