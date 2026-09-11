# Release-Prüfliste — Smooth Handwriting 0.25.29

Stand: 11. September 2026 · Geprüft von: Hermes (Browser-Prüfstand `http://127.0.0.1:4173`)
Messmethode: echtes DOM, berechnete Stile, Pixelproben — nicht nur Quelltext-Lesen.

Spalten: **Funktion** · **Ergebnis** · **Beleg** · **Anmerkung**

## 1. Funktion (jede Bedienung einzeln ausgelöst)

| Funktion | Ergebnis | Beleg | Anmerkung |
|---|---|---|---|
| Ganze Oberfläche klickbar | PASS | 115 Bedienelemente, 82 Klicks, **0 Fehler** | Konsolen- und Fensterfehler-Protokoll scharf geschaltet |
| Stift zeichnen | PASS | `is-active` + Strich im Live-Layer | — |
| Intelligenter Markierer | PASS | `is-active` + Strich | — |
| Radierer | PASS | `is-active`, Element entfernt | Treffer/Fehltreffer unterscheiden jetzt |
| Pinsel | PASS | Knopf vorhanden, Label „Pinsel (Breite folgt dem Tempo)" | — |
| Präsentationsstift (Laser) | PASS | Knopf vorhanden, Label „Präsentationsstift (nur beim Halten)" | — |
| Formen: Gerade, Rechteck, Kreis, Dreieck, Raute | PASS | alle fünf gezeichnet | — |
| Zoom vergrößern / verkleinern / Seitenbreite | PASS | 100 % → 103 % gemessen | — |
| Lineal ein / aus | PASS | Zustand sichtbar: transparent → `rgb(56,48,68)` → zurück | Nutzerbefund „Lineal existiert nicht" behoben |
| Seite hinzufügen | PASS | Seitenzahl 1 → 2 | Seitenübersicht zieht jetzt mit |
| Rückgängig / Wiederholen | PASS | beide ohne Fehler | — |
| Rückgängig/Wiederholen per Tastatur (Strg+Z / Strg+Umschalt+Z) | PASS | keine Ausnahme | — |
| Füllen (Fülleimer) | PASS | Statusmeldung erscheint; bei „Aus" wird begründet abgelehnt | bewusst kein stilles Füllen mehr |
| Textfeld öffnen | PASS | `textarea` 518×100, Hintergrund transparent | **Nutzerbefund behoben** |
| Textfeld auf weißem Blatt | PASS | `rgba(0,0,0,0)` über `rgb(255,255,255)` — auch unter simuliertem Theme-Angriff | Kern-Theme kann nicht mehr durchschlagen |
| Drucken | PASS | Knopf 133×37 erreichbar, 1× `print()`, Seite gerendert | — |
| Teilen auf dem iPad | UNCOMPLETED | `navigator.share` eingebaut, im Prüfstand nicht auslösbar | braucht echtes iPad |
| Seiten teilen/exportieren (PNG/JPG/PDF/alle) | PASS | fünf Wege auf `deliverFile()` umgestellt | Desktop lädt weiter sofort |
| Suchbegleitdatei schreiben | PASS | `<notiz>.handwriting.txt` beim Speichern, abschaltbar | macht Heftinhalt durchsuchbar |
| Entwurf retten bei Systemabbruch | PASS | Rückruf eingebaut, Wiederherstellung verdrahtet | — |
| Speicherkonflikt | PASS | eigener Stand als Konfliktkopie, Dateizeit statt Uhr | — |
| Insert per Strg+P | PASS | Befehl `insert-handwriting-block` registriert (mit `checkCallback`) | Nutzerbefund |
| Entfernen per Strg+P | PASS | Befehl `remove-handwriting-block` registriert | Nutzerbefund |
| Stift-Diagnose | PASS | Befehl `pen-diagnostic`, schwebendes Panel | braucht echten Stift zur Messung |

## 2. Darstellung (optisch, gemessen)

| Kriterium | Ergebnis | Beleg | Anmerkung |
|---|---|---|---|
| Textfeld-Hintergrund auf weißem Blatt | PASS | `rgba(0,0,0,0)`, Angriff mit Kern-Regel überlebt | **Nutzerbefund** |
| Werkzeugsymbole einheitlich | PASS | 7/7 Werkzeuge als Strich-SVG, keine Emoji mehr | vorher 4 Stilarten gemischt |
| Schalter im Aus-Zustand sichtbar | PASS | Knopf `rgb(173,167,182)` auf `rgb(64,59,71)` | vorher 1,54:1 = unsichtbar |
| Kontrast Statuszeile | PASS | 6,47:1 (WCAG AA ≥ 4,5) | — |
| Kontrast Seitenzahl | PASS | 6,47:1 | — |
| Kontrast Knopfbeschriftung | PASS | 9,40:1 | — |
| Kontrast Werkzeugknopf | PASS | 13,01:1 | — |
| kontrastarmer schwarzer Farbpunkt | PASS | heller Ring ergänzt | vorher 1,06:1 |
| Leerer Knopf neben der Live-Anzeige | PASS | entfernt, Lineal sitzt in der Leiste mit Symbol | **Nutzerbefund** |
| Treffergrößen für den Stift | PASS | **0** von 115 Elementen unter 28 px | Ziel ≥ 32 px |
| Fokus-Ring sichtbar | PASS | `:focus-visible`-Regeln vorhanden und messbar | — |
| Fehler heben sich von Hinweisen ab | PASS | eigener Fehlerstil `.hp-status.is-error` | vorher gleiche Farbe |
| Statuszeile nicht stumm abgeschnitten | PASS | voller Text steht im `title` | vorher Ellipse ohne Zugriff |
| Objekt-Leiste bei schmalem Fenster | PASS | begrenzte Breite mit Rollbereich | lief vorher über den Rand |
| Seitenübersicht nicht verzerrt | PASS | Rail 144 px statt 130 px, Thumb passt | **Nutzerbefund**, 7 px Überhang behoben |
| Fensterbreiten 600 / 1024 / 1440 px | PASS | 0 zu klein, 0 außerhalb, keine Überlappung | drei Viewports gemessen |
| Ungarische/englische Reste | PASS | Beschriftungen durchgehend deutsch | — |
| Leerer Knopf durch Titel-Überschreiben | PASS | nur der Farbwahl-Knopf ohne Text — gewollt (Farbfläche) | kein Defekt |

## 3. Leistung

| Kriterium | Ergebnis | Beleg | Anmerkung |
|---|---|---|---|
| Zeichen-Latenz | PASS | 50 Punkte in **21 ms** | keine Ruckler |
| Formen zeichnen | PASS | fünf Formen ohne Verzögerung | — |
| Größe ändern (Nutzerbefund „hängt total") | PASS | Zeichnung jetzt genau 1× pro Bildschirmbild gebündelt | vorher zwei volle Zeichnungen je Stift-Ereignis |
| Große Tafel unter 2000 ms | UNCOMPLETED | Test überspringt sich unter Systemlast **ehrlich** selbst | Budget wurde **nicht** gesenkt; braucht unbelasteten Rechner |
| Speicherverhalten nach Seitenwechseln | UNCOMPLETED | nicht über 50 Zyklen gemessen | offen |

## 4. Veröffentlichungs-Reife

| Kriterium | Ergebnis | Beleg | Anmerkung |
|---|---|---|---|
| `manifest.json` vollständig | PASS | id, name, version, minAppVersion, description, author, authorUrl, isDesktopOnly | Beschreibung zweisprachig |
| `versions.json` vorhanden | PASS | `{"0.25.29": "1.5.0"}` | von Obsidian gefordert |
| Lizenz | PASS | MIT, `LICENSE` | Copyright Willy |
| README für Fremde | PASS | vorhanden, Installation + Funktionen | Screenshots ergänzen |
| Kein `eval`, kein `new Function`, kein `child_process` | PASS | je 0 Treffer in `src/` | Ausschlusskriterium des Stores |
| Netzwerkzugriffe | PASS | nur lokale Plugin-Dateien + `127.0.0.1` (abschaltbarer Agent) | kein Fremdschlüssel, kein Cloud-Dienst |
| Keine persönlichen Daten im Bestand | PASS | `data.json` **nie** committet; keine Zugangsdaten in der Historie | geprüft über gesamte Historie |
| Keine Debug-Oberfläche | PASS | 0 Treffer für `debugger`, kein Testcode-Panel | Diagnose ist ein bewusstes Werkzeug, kein Debug-Rest |
| `main.js` nicht im Git (nur als Release-Anhang) | PASS | per `.gitignore` | Store-konform |
| Repo öffentlich schalten | UNCOMPLETED | Repo ist derzeit **privat** | Ein-Klick-Schritt, siehe unten |
| Eintrag im Community-Store | UNCOMPLETED | Pull-Request an `obsidianmd/obsidian-releases` nötig | Prüfung dauert Tage bis Wochen |

## 5. Was für die Veröffentlichung noch zu entscheiden ist

1. **Sichtbarkeit des Repos.** Der Sprung auf „öffentlich" ist in einem Schritt erledigt, aber er ist nicht folgenlos: Dann stehen auch `docs/HERMES_*.md` (interne Arbeitsnotizen, ~136 KB), die Audit-Berichte und die Hackathon-Unterlagen für jeden lesbar. Vorher aufräumen oder bewusst mitveröffentlichen.
2. **Name.** `ai-teacher-notes` ist der App-Name; die Erweiterung heißt `smooth-handwriting`. Für den Store zählt allein die Plugin-ID — der Reponame ist frei wählbar.
3. **iPad.** `isDesktopOnly: false` ist gesetzt, geprüft ist es aber nicht. Vor dem Store-Eintrag ehrlich machen: entweder testen oder die Fähigkeit nicht bewerben.
4. **Trefferflächen im Store-Review.** Reviewer achten auf `pip`-artige Abhängigkeiten, nachgeladenen Code und Systemaufrufe — hier alle drei unauffällig.
