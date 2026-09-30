# Skizzen-CAD

Technische Skizzen im Browser – schnell wie auf Papier, sauber wie CAD.
Primär für das iPad mit Apple Pencil gebaut, funktioniert auch mit Maus und Tastatur.
Das vollständige Konzept und der Phasenplan stehen in [CONCEPT.md](CONCEPT.md).

## Stand: Phase 1

- Unendlicher Canvas in Millimetern: Verschieben, Zoomen, Drehen (rastet bei 0°/45°/90° ein)
- Bleistift 0,3 · 0,5 · 0,7 · 0,9 mm (Graphit mit Papierkorn) und Tusche 0,18 · 0,25 · 0,35 · 0,5 · 0,7 mm
- Linienarten nach ISO 128: Voll, Strich, Strich-Punkt, Strich-Zweipunkt, Freihand – Strichmuster skalieren mit der Stiftstärke
- Freihand-Werkzeug
- Linien-Werkzeug nach Sketchbook-Vorbild: gestrichelte Vorschau bis zum Absetzen, Live-Anzeige von Länge und Winkel
- Fang an Endpunkten, Mitten und Schnittpunkten (Radius in Bildschirm-Pixeln → beim Reinzoomen feiner)
- Winkelfang in 5°-Schritten mit drei Zuständen: Fang / nur Anzeige / aus
- Griffe an den Enden der zuletzt gezeichneten Linie zum Nachkorrigieren (im Menü abschaltbar)
- Ebenen: anlegen, umbenennen, sortieren, ausblenden, sperren, blass anzeigen
- Rückgängig / Wiederholen (auch per Zwei- bzw. Drei-Finger-Tipp)
- Automatisches Speichern im Browser, Datei herunterladen und wieder öffnen
- Schwebende, verschiebbare Werkzeugleiste (dockt an Seitenrändern hochkant an)
- Als App installierbar (PWA, offlinefähig)

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
| F / L | Freihand / Linie |
| 1–4 / 5–9 | Bleistift- / Tuschestärken |
| ⇧1–⇧5 | Linienart |
| S / A / G | Fang / Winkelmodus / Raster |
| 0 / R | Alles zeigen / Ansicht gerade |
| ⌘Z / ⇧⌘Z | Rückgängig / Wiederholen |
| ⌘S / ⌘O | Herunterladen / Öffnen |

## Entwicklung

```bash
npm install
npm run dev        # Entwicklungsserver (auch im LAN erreichbar, z. B. vom iPad)
npm test           # Unit-Tests
npm run build      # Typecheck + Produktions-Build nach dist/
npm run preview    # Build lokal ansehen
```

Technik: TypeScript, Vite, Canvas 2D, keine UI-Frameworks. Aufbau:

- `src/core` – Geometrie, Dokument mit Undo/Redo, Kamera, Fang, Stifte/Linienarten
- `src/render` – Szene (Papier, Raster, Objekte), Graphit-Textur, Overlay (Vorschau, Maße, Fangmarken)
- `src/tools` – Werkzeuge (Freihand, Linie)
- `src/input` – Pencil/Maus/Touch-Steuerung, Gesten, Tastatur
- `src/ui` – Werkzeugleiste, Ebenen, Menü
