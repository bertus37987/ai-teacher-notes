# Audit: OneNote-Parität für den Schüler-Alltag

Stand: 11. September 2026 · Plugin-Version `0.25.25` (`manifest.json:4`) · Git-HEAD `facb8ba` (Arbeitsbaum mit uncommitteten Änderungen)
Prüfbasis: reine Codeprüfung (`src/` 7.042 Zeilen, 30 Testsuiten), alle Angaben mit `Datei:Zeile` oder ausdrücklich „nicht vorhanden".
Kein Quellcode geändert, kein Build/Test ausgeführt.

## Die Frage

**Ersetzt dieses Obsidian-Plugin zusammen mit Obsidian ein OneNote für Schüler?**

**Nein — noch nicht.** Die Schreib-, Zeichen- und Seitenbasis ist für den Unterricht weitgehend da (Handschrift mit Druck, Radieren, Marker, Formen, Lineal, Undo, Autospeichern, PDF-Import, OneNote-Umzug). Fünf Fähigkeiten fehlen aber, ohne die ein Schüler seinen Alltag nicht abbilden kann; drei davon sind auf dem **iPad** besonders kritisch (Export/Teilen, Drucken, Durchsuchbarkeit) und zwei kosten **Daten** (Entwürfe, Zwei-Geräte-Betrieb). Mit den unten beschriebenen Minimal-Lösungen (zusammen ca. 150 Zeilen Plugin-Code, keine Datenmodell-Änderung) ist die Parität erreichbar.

---

## 1. Prüfpunkte im Einzelnen

Legende: ✅ vorhanden · 🧪 vorhanden, aber ungeprüft/unzuverlässig · ⚠️ Lücke · Klasse: **A** Blocker · **B** wichtig · **C** nice-to-have · **D** out-of-scope

| Prüfpunkt | Befund | Beleg | Klasse |
| --- | --- | --- | --- |
| **Handschrift-Erfassung** | ✅ Freihand mit Druck, Neigung, Zeitstempel, koaleszierten Pointer-Events, eigener Ink-Modeler-Pfad | `src/strokes.ts:19-27`, `src/strokes.ts:87-128`, `src/main.ts:1085` | — |
| Palm-Rejection / Touch | ✅ Touch zeichnet nie (nur Scrollen/„Touch-Select"), Stift wird zusätzlich über Druck und Neigung erkannt | `src/main.ts:980-983`, `src/main.ts:963`, `src/input-device.ts` (laut Skill/CHANGELOG 0.25.22) | — |
| Stift auf echter Hardware | 🧪 Kein Hardware-Nachweis; Wayland/Flatpak verliert Stift-Ereignisse (Host-Problem), Plugin hat Diagnose + `penForceMode`-Fallback | `docs/FEATURE_MATRIX.md:76`, `src/main.ts:2387-2415`, `src/main.ts:93` | **B** |
| **Text einbetten** | ✅ Textboxen mit Größe, Fett, Kursiv, Ausrichtung, Tab-Eingabe | `src/notebook-text.ts:10-119` | — |
| Rich-Text (Listen, Checklisten, Überschriften, Zitat, Code) | ⚠️ Datenmodell und Renderer können es, **es gibt aber keinen UI-Weg** — neue Textboxen sind immer `body` | `src/document.ts:65`, `src/rendering.ts:222-240`, `src/notebook-text.ts:11` | **B** |
| Teilformatierung innerhalb eines Absatzes | ⚠️ Format gilt für die ganze Box | `docs/SCHOOL_EDITOR_REVIEW.md:25` | **C** |
| **Bilder einbetten** | ✅ PNG/JPEG/WebP, mehrere, 20 MB / 40 MP Grenze, verschieb-/skalierbar, als Data-URL im Dokument | `src/main.ts:2000-2005`, `src/main.ts:2044-2056`, `src/main.ts:2008`, `src/main.ts:2046`, `src/document.ts:108` | — |
| **PDF einbetten** | ✅ Import als Seitenhintergrund (bis 40 Seiten, Abbruch/Rollback), **natives Markieren auf der PDF** mit eigenem Sidecar | `src/main.ts:2024-2042`, `src/main.ts:2029`, `src/pdf-annotation.ts:112-161`, `src/pdf-annotation.ts:266-276` | — |
| PDF-Textebene (Textsuche, Marker-Snap auf PDF-Text) | ⚠️ Kein `getTextContent`/Textlayer — `pdfjs-dist` wird nur gerendert, Text bleibt Bild | 0 Treffer für `getTextContent` in `src/`; `docs/SCHOOL_EDITOR_REVIEW.md:29` | **B** |
| **Radieren** | ⚠️ Element-Radierer: löscht ganze Striche/Formen (Radius 18 px bzw. Bounding-Box), Bilder sind geschützt; **kein pixel- oder teilgenaues Radieren** | `src/main.ts:1343-1352` | **B** |
| Scribble-to-Erase | 🧪 Überkritzeln löscht Striche/Formen/Marker, nie Text/Bilder | `src/main.ts:1198`, `docs/FEATURE_MATRIX.md:39` | — |
| **Marker** | ✅ Transparenter Marker (Deckkraft 0,28) mit eigener Farbe/Stärke, Snap auf gesetzte Textobjekte | `src/main.ts:1015-1017`, `src/notebook-marker.ts:15-41` | — |
| Marker-Snap auf Tabellen-/PDF-Text | ⚠️ Tabellen und PDF-Hintergrund bewusst ausgenommen | `src/notebook-marker.ts:21`, `docs/SCHOOL_EDITOR_REVIEW.md:29` | **C** |
| **Formen** | ✅ Automatische Erkennung (Linie, Pfeil, Ellipse/Kreis, Rechteck, Vieleck), Draw & Hold, Endpunkt-/15°-Snap, 7 Zieh-Werkzeuge, Füllung nur bewusst per Fülleimer | `src/main.ts:657-660`, `src/main.ts:1306-1339`, `docs/FEATURE_MATRIX.md:25-31` | — |
| **Lineal** | ✅ Linealkörper mit Skala, verschieben/drehen, Stift dockt an der Kante an | `src/main.ts:583-586`, `src/main.ts:924-930`, `src/main.ts:1568-1618` | — |
| Geodreieck | ⚠️ **Widerspruch:** `FEATURE_MATRIX.md:30` führt „Geodreieck & Maße" als ✅, im Editor-Code ist `geometry-tools.ts` nur noch von einem Test importiert — es gibt keine Verdrahtung, kein Dialog, kein Button mehr (0 Treffer für „Geodreieck" in `src/main.ts`) | `src/geometry-tools.ts:1-48`, einziger Importer: `tests/handwriting.test.ts:5` | **B** |
| Kalibrierte Maße (cm/mm) | ⚠️ Alle Maße sind Seitenpixel, ausdrücklich nicht physikalisch | `src/shape-measurements.ts:7`, `docs/FEATURE_MATRIX.md:30` | **C** |
| **Rückgängig** | ✅ Undo/Redo inkl. Strg/⌘+Z und Umschalt, 60 Schritte, Gesten als ein Schritt; blockiert während eines laufenden Strichs | `src/main.ts:2197-2216`, `src/main.ts:461`, `src/main.ts:2201`, `src/main.ts:2204` | — |
| **Autospeichern** | ✅ 500 ms Debounce, strikt serielle Schreibkette, Retry mit Notice, mtime-Schutz gegen Fremdüberschreiben | `src/main.ts:2218`, `src/save-queue.ts:54-73`, `src/main.ts:2226-2251` | — |
| Erholbare Entwürfe (Text-/Bilddialog) | ⚠️ **P0:** Offene Objektentwürfe werden bei Unload/Ansichtswechsel verworfen, nichts wird gepuffert | `src/main.ts:480-495` (`objectAbort.abort()`), `docs/SCHOOL_EDITOR_REVIEW.md:19` | **A** |
| Speicherstatus sichtbar | ✅ Statuszeile + Notice bei Fehler/Externänderung | `src/main.ts:2232`, `src/main.ts:2248` | — |
| **Export** | ✅ Aktive Seite PNG/JPEG/PDF, alle Seiten als mehrseitige PDF, bearbeitbares `.handwriting.json`, OneNote-HTML | `src/main.ts:1961-1982`, `src/main.ts:1983-1999`, `src/main.ts:2073-2078`, `src/main.ts:2164-2189` | — |
| **Teilen auf dem iPad** | ⚠️ **Alles läuft über `<a download>` mit Blob-URL — kein Share-Sheet, kein Web-Share im ganzen Plugin.** In WKWebView (Obsidian Mobile) ist der Download-Weg unzuverlässig bzw. unsichtbar; `isDesktopOnly:false` ist kein Nachweis | `src/main.ts:260-263` (einziger Auslieferungsweg, 5 Aufrufer), 0 Treffer für `navigator.share` in `src/`, `manifest.json:6`, `docs/HERMES_EXTENSION_HANDOFF.md:26` | **A** |
| PDF-Export-Qualität | ⚠️ Raster-PDF (JPEG pro Seite), kein durchsuchbarer Text, keine Vektoren | `src/export.ts:14-45`, `docs/FEATURE_MATRIX.md:58` | **B** |
| **Drucken** | ⚠️ **Nicht vorhanden:** kein `window.print`, kein `@media print` in `styles.css`, kein Druck-Knopf | 0 Treffer für `window.print`/`@media print`; `styles.css` hat nur 4 `@media`-Regeln (Zeilen 298, 520, 584, 607) | **A** |
| **Suche in Notizen** | ⚠️ **Nicht vorhanden.** Der Inhalt liegt in der `.handwriting.json`; Canvas-Text wird nirgends als Textdateiindex gespiegelt. Handschrift wird gar nicht verschriftet: `recognitionText` wird im ganzen `src/` nie geschrieben (nur im Datenmodell validiert und in einem Test gesetzt) | `src/main.ts:2498`, `src/document.ts:37`, `src/document.ts:324`, nur `tests/document-parse.test.ts:132`; `docs/SCHOOL_EDITOR_REVIEW.md:33`, `docs/SCHOOL_NOTES_ROADMAP.md:16` | **A** |
| **Seitenvorlagen / Linaturen** | ⚠️ Nur drei Papiere mit **festen** Rastermaßen (Karo 24 px, Linie 32 px); keine Vorlagenbibliothek, kein Linienabstand, kein benutzerdefiniertes Papier, keine Notenlinien | `src/document.ts:3`, `src/main.ts:215-225`, `src/main.ts:507-511`; 0 Treffer für „Vorlage/Template/Linatur" in `src/` | **B** |
| **Seitenverwaltung** | ✅ Übersicht mit Thumbnails, ↑/↓ umsortieren, duplizieren, löschen (min. 1 Seite), Seitenformate A4/A4-quer/A5/quadratisch/eigenes | `src/main.ts:1739-1762`, `src/main.ts:690-701` | — |
| Umbenennen / freies Umsortieren / Pinch-Zoom | ⚠️ Kein Seitentitel im Datenmodell (kein `title` auf `HandwritingPage`), Reorder nur per Knopf, Zoom nur Buttons + Strg-Rad | `src/document.ts:115-124`, `docs/FEATURE_MATRIX.md:51`, `docs/FEATURE_MATRIX.md:77`, `src/main.ts:539-543` | **C** |
| **Backup / Wiederherstellung** | ✅ Manuelles Vollbackup als JSON, Import hängt Seiten an (ein Undo-Schritt), Migrationskopie `.pre-migration-<ts>.bak`, PDF-Sidecar mit `.corrupt-<ts>.bak` und Leseschutz, Block-Löschen in den Papierkorb | `src/main.ts:2073-2102`, `src/main.ts:2449-2451`, `src/pdf-annotation.ts:379-386`, `src/main.ts:2487` | — |
| Automatisches Backup / Versionierung | ⚠️ Keine automatische Sicherung, keine Versionshistorie über die 60 Undo-Schritte hinaus | `src/main.ts:2201`, `docs/FEATURE_MATRIX.md:69` | **B** |
| **Zusammenarbeit** | ⚠️ **Keine Mehrbenutzer-Zusammenarbeit.** Es gibt nur den Agenten-Kanal (Loopback 127.0.0.1, Standard aus) mit Vorschlags-UI; kein geteiltes Notizbuch, keine Freigabe, kein Merge | `src/agent-channel.ts:63`, `src/notebook-commands.ts:63-75`, `src/main.ts:93`; 0 Treffer für „collaborat" in `src/` (nur `package.json:31` als Schlagwort), `docs/FEATURE_MATRIX.md:69` | **D** |
| Zwei Geräte an derselben Datei | ⚠️ Fremdänderung stoppt das Speichern, **es wird nicht zusammengeführt**; die blockierte Ansicht speichert nicht mehr autonom, Auflösung nur per Neu-Öffnen | `src/main.ts:2226-2234`, `docs/MIGRATION_ROLLBACK.md:58-62`, `docs/HERMES_STATUS_2026-09-08.md:104-106` | **A** |
| **Offline-Betrieb** | ✅ Keine Netzabhängigkeit im Editor: HTR läuft lokal im Worker mit gebündeltem Modell, Agent-Kanal standardmäßig aus | `src/htr-client.ts:34-74`, `src/htr-worker.ts:1-27`, `src/main.ts:93` (nur `src/htr-client.ts:42` und `src/htr-worker.ts:14` holen lokale Vault-Assets per `fetch`) | — |
| 60-Minuten-Stunde / 20-Seiten-Heft | 🧪 Nie gemessen; dokumentierte Messpflicht | `docs/FEATURE_MATRIX.md:77`, `docs/HERMES_STATUS_2026-09-08.md:45-46` | **B** |
| Handschrift-Erkennung (HTR) | 🧪 Nur Deutsch (111-Zeichen-Alphabet), kein Formelmodell; Erkennung „nicht verlässlich genug für beliebige Wörter", Vertrauensschwelle 85 % bei Live-Umwandlung; Original bleibt immer wiederherstellbar | `src/htr-worker.ts:17`, `src/htr-core.ts:4`, `src/main.ts:1846`, `src/htr-core.ts:141-152`, `docs/SCHOOL_EDITOR_REVIEW.md:23` | **B** |
| Objekte kopieren / zwischen Seiten einfügen | ⚠️ Nur „Duplizieren" innerhalb derselben Seite (+12 px, neue UUID); keine Zwischenablage, kein seitenübergreifendes Verschieben | `src/selection.ts:163-175`, `src/main.ts:1718-1727` | **C** |
| Freihand-Lasso, Gruppen, Rotation, Ebenen | ⚠️ Nur Rechteck-Auswahl und Kreis-Lasso | `docs/FEATURE_MATRIX.md:42-43`, `src/main.ts:1187-1188` | **C** |
| Audio / Mitschrift | ⛔ Bewusst nicht enthalten | `docs/FEATURE_MATRIX.md:59` | **D** |
| Kalender, Klassenverwaltung, Voice, Marketplace | ⛔ Roadmap, nicht Teil des Produkts | `docs/HACKATHON_STRATEGY.md:98` | **D** |
| Ordner, Verlinkung, Backlinks, normale Markdown-Notizen | ⛔ Bleibt ausdrücklich Obsidian | `docs/SCHOOL_NOTES_ROADMAP.md:21-23` | **D** |
| Zirkel | ⛔ Vom Nutzer entfernt, wird nicht wiedereingeführt | `docs/FEATURE_MATRIX.md:31` | **D** |
| OneNote-Migration | ✅ Import aus OneNote-HTML/MHT (Überschriften, Listen, Checkboxen, Tabellen, Bilder), Rückweg als eigenständiges HTML; Tinte kommt als Bild an — Formatgrenze, nicht Bug | `src/onenote-transfer.ts:1-12`, `src/onenote-transfer.ts:73-141`, `src/onenote-transfer.ts:260-261`, `src/main.ts:2105-2160` | — |

---

## 2. Klassifizierte Lückenliste

### (A) Blocker — ohne diese ersetzt das Plugin kein OneNote

**A1 — Auf dem iPad kann man nichts teilen und nichts herausbekommen.**
Beleg: einziger Auslieferungsweg ist `<a download>` (`src/main.ts:260-263`), benutzt von allen fünf Exporten (`src/main.ts:1973`, `:1977`, `:1994`, `:2076`, `:2188`); `navigator.share` kommt im ganzen `src/` nicht vor (0 Treffer). Auf iPadOS/WKWebView ist ein Blob-Download nicht verlässlich sichtbar — der Schüler kann die Hausaufgabe also nicht abgeben.
**Kleinste Lösung im Plugin:** `downloadBlob` zu einem zentralen `deliverFile(blob, filename)` erweitern: `const file = new File([blob], filename, {type: blob.type}); if (navigator.canShare?.({files:[file]})) { await navigator.share({files:[file], title: filename}); return; }` — sonst wie bisher herunterladen. Ein Helfer, fünf Aufrufstellen, kein Datenmodell-Eingriff, Desktop-Verhalten unverändert. Zusätzlich als Teilen-Ziel „Alle Seiten als eine PDF" (existiert schon).

**A2 — Nichts ist durchsuchbar.**
Beleg: Der Inhalt liegt ausschließlich in der `.handwriting.json` (`src/main.ts:2498`); getippter Canvas-Text wird nie in eine Datei gespiegelt, die Obsidians Suche liest. Handschrift wird noch schlechter erfasst: das Feld `recognitionText` ist im Datenmodell vorgesehen (`src/document.ts:37`) und wird validiert (`src/document.ts:324`), aber im gesamten `src/` **nie geschrieben** (einziger Schreiber ist ein Test: `tests/document-parse.test.ts:132`). `docs/SCHOOL_EDITOR_REVIEW.md:33` und `docs/SCHOOL_NOTES_ROADMAP.md:16` führen das als offenen Punkt.
**Kleinste Lösung im Plugin:** Beim Speichern (Naht in `drainSave`, `src/main.ts:2235`) eine Begleitdatei `<name>.handwriting.txt` schreiben: pro Seite alle Textinhalte, Tabellen (TSV) und – falls vorhanden – `recognitionText`. Eine reine Extraktionsfunktion, ein `vault.modify/create` wie in `src/export.ts`-Umfeld bereits vorhanden. Damit greift die Obsidian-Suche sofort, ohne eigenen Index. Die Handschrift-Suche ist ein zweiter, optionaler Schritt (HTR-Text beim Speichern nachtragen) — nicht Teil der Minimal-Lösung.

**A3 — Man kann nicht drucken.**
Beleg: 0 Treffer für `window.print` in `src/`, 0 Treffer für `@media print` in `styles.css` (nur `max-width` 298/584/607 und `prefers-reduced-motion` 520). Für Hausaufgaben auf Papier, Arbeitsblätter und Elternabende ist das der klassische OneNote-Weg.
**Kleinste Lösung im Plugin:** Menü-Knopf „Drucken": vorhandenes `renderExportCanvas(page)` (`src/main.ts:1951`) nutzen, das PNG in ein verstecktes `<iframe>` mit `<img style="width:100%">` legen und `iframe.contentWindow.print()` aufrufen; Mehrseiten als die bestehende Raster-PDF (`src/main.ts:1983`). Kein neuer Renderer, ~25 Zeilen.

**A4 — Entwürfe gehen beim Reload verloren.**
Beleg: `onunload` bricht offene Objektdialoge hart ab (`src/main.ts:480-495`, `objectAbort.abort()`), nichts wird zwischengespeichert; `docs/SCHOOL_EDITOR_REVIEW.md:19` führt das als **P0** („Offene Objektentwürfe sind noch nicht dauerhaft gespeichert"). Betroffen sind Text- und Bilddialog (`src/notebook-text.ts:10`, `src/notebook-image.ts:17`). Ein Plugin-Reload oder ein unbedachter Ansichtswechsel kostet den bearbeiteten Absatz.
**Kleinste Lösung im Plugin:** Der Entwurf ist schon ein vollständiges, serialisierbares Objekt (`src/notebook-text.ts:11`). Im `abort`-Pfad statt Verwerfen `localStorage.setItem("hp-draft:<datei>:<elementId>", JSON.stringify(draft))`, beim Mount einmal pro Datei prüfen und einen Banner „Entwurf wiederherstellen / verwerfen" anbieten. Kein IndexedDB, kein neues Format, keine Datenmodelländerung, ~35 Zeilen.

**A5 — Zwei Geräte an derselben Datei: der zweite Stand bleibt liegen.**
Beleg: `drainSave` bricht bei Fremdänderung ab und zeigt nur eine Notice (`src/main.ts:2226-2234`); laut `docs/MIGRATION_ROLLBACK.md:58-62` gibt es **kein automatisches Zusammenführen**, und laut `docs/HERMES_STATUS_2026-09-08.md:104-106` speichert die blockierte Ansicht danach nicht mehr autonom. Für einen Schüler mit Yoga (Schule) und iPad (zu Hause) ist genau das der Alltag: „gestern in der Schule, heute zu Hause". Kein Merge, aber auch kein Verlust-Hinweis mit Rettungsweg.
**Kleinste Lösung im Plugin:** Im Konfliktzweig den In-Memory-Stand **nicht** verwerfen, sondern als eigene Datei sichern: `<name>.konflikt-<zeitstempel>.handwriting.json` über das schon vorhandene `exportNotebookBackup` (`src/notebook-transfer.ts:72`) plus Notice mit Pfad und „Notiz neu öffnen". Beide Stände bleiben erhalten, der Nutzer entscheidet. Echter Seiten-Merge (unbekannte Seiten-ID anhängen, bei gleicher ID die neuere gewinnt) ist der zweite Schritt und braucht ein `updatedAt` im Datenmodell — nicht minimal, deshalb nicht im Blocker-Paket.

### (B) Wichtig — hohe Reibung im Alltag, aber umgehbar

1. **Rich-Text ohne UI:** Überschriften, Aufzählungen, Checklisten, Zitat und Code sind modelliert (`src/document.ts:65`) und werden gezeichnet (`src/rendering.ts:222-240`), aber jede neue Textbox ist `body` (`src/notebook-text.ts:11`); es gibt keinen Umschalter. Checklisten sind für Hausaufgaben zentral. (Bestätigt durch `docs/FEATURE_MATRIX.md:53`.)
2. **Keine PDF-Textebene:** PDF-Text ist Bild, Textsuche und Marker-Snap auf Aufgabentexte fehlen (`docs/SCHOOL_EDITOR_REVIEW.md:29`; 0 Treffer für `getTextContent`).
3. **Radieren nur elementweise:** keine teilgenaue Korrektur (`src/main.ts:1343-1352`).
4. **HTR-Abdeckung:** nur Deutsch, 111 Zeichen, keine Formeln, Zuverlässigkeit für beliebige Wörter nicht belegt (`src/htr-worker.ts:17`, `docs/SCHOOL_EDITOR_REVIEW.md:23`). OneNote-Nutzer erwarten „Handschrift → Text" als Alltagsfunktion, nicht als Ausnahme.
5. **Keine Vorlagen/Linaturen-Auswahl:** nur Karo/Liniert/Blanko mit festen 24/32 px (`src/main.ts:215-225`); keine Stundenplan- oder Vokabelvorlage, kein eigener Linienabstand.
6. **Kein automatisches Backup / keine Versionierung** über 60 Undo-Schritte hinaus (`src/main.ts:2201`).
7. **Geodreieck nur noch auf dem Papier:** die Feature-Matrix behauptet ✅ (`docs/FEATURE_MATRIX.md:30`), der Editor hat keine Verdrahtung mehr (`src/geometry-tools.ts` wird nur von `tests/handwriting.test.ts:5` importiert). In Mathe ein tägliches Werkzeug.
8. **Raster-PDF-Export:** kein durchsuchbarer Text, keine Vektoren (`src/export.ts:14-45`).
9. **Kein Hardware-Nachweis für den Stift:** Yoga/iPad sind ungeprüft (`docs/FEATURE_MATRIX.md:76`). Wayland/Flatpak verliert Stift-Ereignisse; Plugin-seitig existieren Diagnose und Fallback, die Restursache ist Host-Konfiguration. Bis das geklärt ist, ist „läuft auf meinem Tablet" eine Annahme, keine Zusage.
10. **Keine 60-Minuten-Offline-Messung:** Ein Schulheft mit 20 Seiten ist nie über eine ganze Stunde gemessen (`docs/FEATURE_MATRIX.md:77`, `docs/HERMES_STATUS_2026-09-08.md:45-46`). Vor einer „Apple-Notes-Niveau"-Aussage ist das eine dokumentierte Messpflicht.

### (C) Nice-to-have — Komfort, kein Schulalltag-Blocker

- Teilformatierung innerhalb eines Absatzes (`docs/SCHOOL_EDITOR_REVIEW.md:25`)
- Freihand-Lasso, Gruppen, Rotation, Ebenen (`docs/FEATURE_MATRIX.md:42-43`)
- Seiten umbenennen, Drag-Umsortierung, Pinch-Zoom (`docs/FEATURE_MATRIX.md:51`, `:77`)
- Objekte kopieren und seitenübergreifend einfügen (`src/selection.ts:163-175`)
- Marker-Snap auf Tabellen- und PDF-Text (`src/notebook-marker.ts:21`)
- cm/mm-Anzeige statt Pixel (`src/shape-measurements.ts:7`)
- Text-Hintergrundfarbe: im Modell vorhanden, kein UI (`src/document.ts:66`, `src/rendering.ts:264`)
- Beschriftung ans Bild anheften (`docs/FEATURE_MATRIX.md:44`)
- Persönliche Schriftrekonstruktion statt Caveat (`docs/MASTER_PLAN.md:15`)

### (D) Out-of-scope — bewusst nicht im Plugin

- Mehrbenutzer-Zusammenarbeit, Klassenverwaltung, Kalender: `docs/HACKATHON_STRATEGY.md:98` (Roadmap) — 0 Treffer für „collaborat" in `src/`
- Audio/Mitschrift: `docs/FEATURE_MATRIX.md:59` (⛔)
- Zirkel: `docs/FEATURE_MATRIX.md:31` (⛔, Nutzerentscheidung)
- Ordner, Verlinkung, Backlinks, normale Markdown-Notizen, globale Suche: bleiben Obsidian (`docs/SCHOOL_NOTES_ROADMAP.md:21-23`) — das Plugin liefert nur den Inhalt (s. A2)
- Sync-Transport: Obsidian Sync/iCloud (`docs/FEATURE_MATRIX.md:69`) — Konflikt-*Verhalten* ist dagegen Plugin-Sache (A5)
- Formel-Editor/Computer-Algebra, Funktionsplots im Notizeditor: im Web-Whiteboard vorhanden (`web-src/compositions.ts`), im Plugin-Editor nicht verdrahtet; für den Ersatz nicht nötig
- Kalibrierte technische Zeichnungen (`src/shape-measurements.ts:7`, Produktentscheidung)

---

## 3. Schul-Use-Cases im Klartext

| Use Case | Heute möglich? | Was fehlt konkret |
| --- | --- | --- |
| **Mathe** | Teilweise: Rechnen auf Karo, Formen, Winkel-/Radius-Anzeige, PDF-Arbeitsblätter beschriften | Geodreieck nicht verdrahtet (`src/geometry-tools.ts`), Maße nur in px (`src/shape-measurements.ts:7`), Radieren nur elementweise (`src/main.ts:1343`), kein Formel-/HTR-Pfad (`src/htr-worker.ts:17`) |
| **Stundenplan** | Nur als gezeichnete Tabelle (max. 30 × 12 Zellen, `src/notebook-text.ts:74-75`) | Keine Vorlage, keine Farbcodierung pro Fach außer Stiftfarbe, kein wiederverwendbares Seitenmuster |
| **Vokabeln** | Nicht als Lernwerkzeug | Karteikarten/Wiederholungsmodus sind nur geplant (`docs/MASTER_PLAN.md:58-60`), kein Lernmodus, keine Sammlung außerhalb des Hefts. Umsetzbar mit Obsidian-Bordmitteln (zwei Notizen + Community-Plugins), aber nicht Teil dieses Plugins |
| **Hausaufgaben** | Schreiben und Exportieren ja — **Abgeben nein** | Kein Teilen auf dem iPad (A1), kein Drucken (A3), keine durchsuchbare Ablage (A2), Entwurfsverlust (A4); Feedback-/Rückgabe-Workflow out-of-scope (D) |
| **Unterrichtsheft über mehrere Geräte** | Eingeschränkt | Gerätekonflikt ohne Merge (A5); Hardware-/Offline-Nachweis fehlt (`docs/FEATURE_MATRIX.md:76-77`) |

---

## 4. Was zuerst passieren muss (kleinste Reihenfolge)

1. **A4** und **A5** — Datenverlust zuerst, weil sie still auftreten (je ~20–35 Zeilen).
2. **A1** — ein Helfer, alle Exporte profitieren; entscheidet über die iPad-Tauglichkeit.
3. **A2** — Textbegleitdatei beim Speichern; macht Obsidian-Suche nutzbar, ohne neuen Index.
4. **A3** — Drucken über die vorhandene Raster-Pipeline.
5. Danach die wichtigsten **B**-Punkte: Rich-Text-Umschalter (Checklisten!), Geodreieck-Verdrahtung, Vorlagen, automatisches Backup.

Erst danach ist die Eingangsfrage mit „ja" beantwortbar. Alles Vorhandene (Handschrift, Marker, Formen, Lineal, Undo, Autospeichern, PDF-Import, OneNote-Umzug) bleibt dabei unangetastet.

---

## 5. Grenzen dieses Audits

- Reine Codeprüfung. **Kein** echter Yoga-/iPad-Stift-, kein Obsidian-Mobile- und kein Druckertest.
- Der Arbeitsbaum enthielt uncommittete Änderungen (u. a. `src/main.ts`), der Bericht beschreibt den Stand der gelesenen Dateien.
- Die Aussage „Blob-Download ist in WKWebView unzuverlässig" stützt sich auf die dokumentierte Release-Review-Notiz zum iPad-Export (Projekt-Skill `smooth-handwriting`, Abschnitt Pen-Präzision/Release-Review) und darauf, dass im Repo kein alternativer Auslieferungsweg existiert. Sie ist **nicht** durch einen iPad-Test in diesem Repo belegt.
- Widerspruch, der im Repo bestehen bleibt: `docs/FEATURE_MATRIX.md:30` führt das Geodreieck als ✅, der Editor-Code enthält keine Verdrahtung mehr (Beleg in Abschnitt 1).
