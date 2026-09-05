# Smooth Handwriting 0.16.0 — Preview, keine finale Freigabe

Aktuelles Update: [0.16.1 behebt gequetschte Schrift](HANDWRITING_FIX_0.16.1.md). Aktuelles Paket: `plugin-dist/smooth-handwriting-0.16.1-preview.zip`. Die nachfolgenden Abnahmegrenzen bleiben bestehen.

## Installation in einem Test-Vault

1. Eigenen neuen Test-Vault verwenden. Bestehende `smooth-handwriting`-Installation vorher sichern; kein automatisches Überschreiben persönlicher Vaults.
2. `plugin-dist/smooth-handwriting-0.16.0-preview.zip` entpacken. Den gesamten Ordner `smooth-handwriting` nach `<Test-Vault>/.obsidian/plugins/` kopieren, einschließlich `assets/`.
3. In Obsidian die Erweiterung aktivieren. Befehl „Karierten Handschriftblock einfügen“ ausführen.
4. Mit „Buchstaben schützen“ schreiben. „Lesbar machen“ öffnet die lokale ML-Vorschau. Zeilen prüfen/korrigieren und explizit anhaken; Übernahme ersetzt sie durch editierbare Textobjekte in Caveat.
5. „Original wiederherstellen“ stellt die gespeicherten Striche wieder her, auch nach einem Neustart. Undo bleibt zusätzlich verfügbar.

Derzeit bewusst keine unbeaufsichtigte automatische Textersetzung: Ein Modell kann aus unleserlicher Schrift falsche Wörter machen. Persönliche Schrift wird nicht nachtrainiert. Nur deutsche Textzeilen; Mathematik, Zeichnungen und Tabellen müssen abgewählt werden. Lange Zeilen oberhalb der Modellbreite werden nicht verzerrt, sondern mit einem Hinweis abgelehnt. Manuelle Transkription bleibt bei Fehlern möglich.

## Konstruktionen

Geodreieck und Zirkel öffnen eine Vorschau derselben Seite. Ursprung per Ziehen oder X/Y ändern. Winkel, Kantenrichtung, Länge bzw. Radius und Bogen einstellen. Erst „Kante zeichnen“ bzw. „Kreis/Bogen einfügen“ schreibt ein normales editierbares Formenobjekt. Skalen sind Seitenpixel, keine Bildschirm-Millimeter. Ein voller Kreis wird exakt als Kreis gespeichert; Bögen als Polygonzug mit maximal 0,2 px Sehnenabweichung. Das Hilfsinstrument wird nicht exportiert.

## Seiten

A4 hoch/quer, A5 und quadratisch. Kleinere Formate werden abgelehnt, wenn sie Inhalt abschneiden würden. Bestehende Seiten ohne Format-Metadaten behalten die bisherige A4-Migration. Individuelle frei eingegebene Maße und Millimeterskalen sind noch offen.

## Belegter Testumfang am 5. September 2026

- Typecheck, alle sechs automatisierten Testsuiten, Web-Build und Plugin-Paket erfolgreich; Node 22 und Node 24 geprüft. Ursprüngliche Performancegrenzen unverändert.
- Unit-Tests: CTC-Alphabet/Blank/Duplikate, Zeilengruppierung mit abgesetztem Punkt, Original-Restore nach Serialisierung, veraltete Vorschläge, Kreisradien, Winkel und Bogen, Format nach Reload.
- In-App-Browser: Original-Editor mit einem ausdrücklich gekennzeichneten Obsidian-Testadapter; reale lokale ONNX-Inferenz aus sieben Pointer-Strichen erkennt „Hallo“.
- Browser: Transkript zu „Hallo Welt“ korrigiert, bestätigt, gespeichert, neu geladen und alle sieben Originalstriche wiederhergestellt. 30°-Gerade (200 px) und 120°-Kreisbogen (Radius 100 px) eingefügt; Quadratformat und zweite Seite gespeichert und neu geladen.
- Erkannter Kompatibilitätsfehler mit ONNX Runtime 1.20.1 behoben durch die vom Modellprojekt verwendete Version 1.27.0. Fehlerpfad bewahrte sieben Originalstriche.

## Noch erforderliche Freigabe

- Echter Obsidian-Laufzeittest, insbesondere lokale app://-Worker-/WASM-/Font-URLs, Vault-Schreiben und Neustart. Obsidian ist als Flatpak installiert; ein persönlicher Vault wurde nicht verändert.
- Reale schwierige Handschriftproben des Nutzers (kurze deutsche Wörter/Sätze, brüchige Linien, Umlaute, mehrere Zeilen) mit bestätigtem Solltext. Kein Genauigkeitsversprechen aus einer einzelnen „Hallo“-Probe.
- Stift-/Touch-Tests auf dem Zielgerät, lange Notizen, mobile Dialoge und mehrseitiger Export im echten Host.
- Aktuell gelten die neuen Werkzeuge für Handschriftblöcke; der getrennte PDF-Annotationsadapter wurde nicht um diese Funktionen erweitert.

Erst nach diesen Prüfungen Phase A abschließen. Anschließend gemeinsame Basis für die Web-App und Supabase/Vercel-Integration verwenden.
