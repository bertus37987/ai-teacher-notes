# Feature-Matrix — Smooth Handwriting 0.25.0

Stand: 8. September 2026. ✅ = implementiert und automatisiert getestet · 🧪 = implementiert, wartet auf
Hardware-/Nutzerprüfung · ⛔ = bewusst nicht enthalten · 🔜 = geplant.

## Schreiben & Handschrift

| Funktion | Status | Hinweis |
| --- | --- | --- |
| Freihand mit Druck & Zeitstempel | ✅ | Koaleszierte Pointer-Ereignisse, Live-Overlay |
| Höhenkorrektur am Papier (Kariert/Liniert/Blanko, konfigurierbar) | ✅ | Verhältnis-Kappen 0.75–1.35, kein Plattdrücken |
| Einmal-pro-Wort-Korrektur | ✅ | `normalizedWordId`, Papierwechsel fasst Bestand nicht an |
| Striche begradigen (Regler) | ✅ | Ecken, Bögen, Schräglage bleiben persönlich |
| Buchstaben entzerren | ✅ | Körperbuchstaben laufen behutsam zusammen (±12 %); Auf-/Unterlängen behalten ihre Proportion |
| Kleine Oval-Lücken schließen | ✅ | Offene Bögen (c, u) bleiben offen |
| Sanftes Glätten der Linien | ✅ | Ecken-Guard, ruhige Abschnitte |
| Original-Tinte wiederherstellbar | ✅ | `rawPoints` bleiben erhalten |
| Kein Font-/OCR-Ersatz der Schrift | ⛔ | Bewusste Produktentscheidung |
| Optional OCR (lokal, mit Prüfung) | 🧪 | DE-HTR-Modell, separate Funktion |

## Formen & Zeichenmodus

| Funktion | Status | Hinweis |
| --- | --- | --- |
| Automatische Formerkennung (Linie, Pfeil, Ellipse/Kreis, Rechteck, Vieleck) | ✅ | Schalter „Formen verbessern“ |
| Draw & Hold (perfekte Form) | 🧪 | 350 ms Halten; auf echtem Stift prüfen |
| Kreis wird rund (Standard) | ✅ | Aspekt ≥ 0.88 |
| Endpunkt-Snap, 15°-Winkel-Snap | ✅ | Einzeln abschaltbar |
| Form-Werkzeuge zum Ziehen (Gerade, Pfeil, Rechteck, Oval, Kreis, Dreieck, Raute) | ✅ | |
| Maße beim Ziehen (Winkel, Länge) | ✅ | Verdrahtet: `rendering.ts:155,182` → `drawShapeMeasurements` |
| Geodreieck-Konstruktion | ❌ | Nicht verdrahtet: `geometry-tools.ts` wird nur von einem Test importiert; die Konstruieren-Sektion wurde entfernt. Bei Bedarf neu anbinden, sonst Zeile streichen. |
| Zirkel | ⛔ | Von dir entfernt, wird nicht wiedereingeführt |

## Auswahl & Bearbeitung (Phase 4)

| Funktion | Status | Hinweis |
| --- | --- | --- |
| Rahmen-Auswahl über Handschrift/Formen/Text/Bilder/Marker | ✅ | |
| Circle-to-Lasso (Schreibmodus) | 🧪 | Schwellwerte gegen echtes Schreiben prüfen |
| Scribble-to-Erase | 🧪 | Text/Bilder geschützt, Undo jederzeit |
| Verschieben / Skalieren (4 Ecken) / Duplizieren / Einfärben / Löschen | ✅ | Als ein Undo-Schritt |
| Tastatur-Auswahl (Pfeile, Entf, Esc) | ✅ | |
| Freihand-Lasso (beliebige Form) | 🔜 | Kreis deckt den Alltag |
| Ebenen/Anordnen, Gruppen, Rotation | 🔜 | |
| Anheften von Beschriftung ans Bild (Anhänge) | 🔜 | Bilder bleiben bewusst unabhängig |

## Seiten, Text, Tabellen, Medien

| Funktion | Status | Hinweis |
| --- | --- | --- |
| Mehrere Seiten, Papierwahl, + Seite | ✅ | |
| Seitenübersicht, Reorder, Duplizieren, Löschen | ✅ | Ohne Umbenennen |
| Textboxen (transparent, Format, Tab-Taste) | ✅ | Schriftgröße/fett/kursiv/Ausrichtung |
| Listen/Checklisten/Rich-Text im Detail | 🔜 | Grundformat vorhanden |
| Tabellen (Zellen-Navigation, TSV-Einfügen, Gesamtgröße) | ✅ | Kein Excel: Spaltenbreiten/Formeln offen |
| Bild-Import (PNG/JPEG/WebP, mehrere, Seite-respektierend) | ✅ | 20 MB/40 MP Grenzen |
| PDF-Import als Seitenhintergrund | ✅ | Bis 40 Seiten, Abbruch & Rollback |
| Natives PDF-Markieren (Adapter) | ✅ | Eigener Sidecar, Schutz gegen Beschädigung |
| Export: alle Seiten PDF, aktive Seite PNG/JPEG/PDF | ✅ | Raster-PDF (kein durchsuchbarer Text) |
| Audio/Mitschrift | ⛔ | Spätere, getrennte Entscheidung |

## Integration, Sicherheit, MCP

| Funktion | Status | Hinweis |
| --- | --- | --- |
| `handschrift`-Block in Markdown, Vault-Dateien | ✅ | Block referenziert die JSON |
| Serialisiertes Speichern, Retry, Extern-Änderungs-Schutz | ✅ | Zwei Ansichten: erkannt, nicht zusammengeführt |
| Schreibgeschützter Zustand bei beschädigter Datei | ✅ | Statt stiller Leerdatei |
| MCP-Grundlage (Command-Service, Companion, Proposal-UI) | ✅ | Standard **aus**; End-to-End mit echtem Agent steht aus |
| Obsidian Sync/Konflikt-Merge | ⛔ | Nicht getestet, nicht beworben |

## Geräte & Performance

| Funktion | Status | Hinweis |
| --- | --- | --- |
| Desktop (Linux, Tastatur/Maus) | ✅ | Von dir täglich genutzt |
| Lenovo Yoga Stift / iPad Pencil | 🧪 | **Noch kein Hardware-Nachweis** |
| Zoom (Buttons + Strg-Rad, 35–400 %) | ✅ | Pinch-Geste offen |
| 60-Minuten-Offline-Stunde, 20-Seiten-Heft | 🔜 | Messpflicht vor „Apple-Notes-Niveau“-Aussage |