# Audit: Code-Qualität (unabhängig)

**Geprüfter Stand:** `main.ts` 2761 Zeilen, Git `facb8ba` · `manifest.json` 0.25.25
**Umfang:** `src/` (~7.300 Zeilen), `styles.css`, ohne Tests-Ausführung, ohne Build. Nur Code-Lesen.
**Auftrag:** ausschließlich belegbare echte Defekte. Keine Stilhinweise. Jeder Fund nennt Beweis (`Datei:Zeile`), Symptom, Ursache, minimale Korrektur, Risiko der Korrektur.

> Hinweis zum beweglichen Ziel: Der Hauptagent arbeitet parallel im selben Arbeitsbaum. Die Zeilennummern gelten exakt für `facb8ba`; bei laufender Bearbeitung können sie sich verschieben. Kein Quellcode wurde durch dieses Audit verändert.

**Ergebnis: 24 belegte Defekte** — 2 kritisch, 7 hoch, 9 mittel, 6 niedrig.

---

## Kritisch

### K-01 — `body.hp-pen-active` wird nie zurückgesetzt: der System-Cursor bleibt app-weit unsichtbar
- **Symptom:** Nach dem Schreiben mit dem Stift (Lenovo-Yoga/Apple Pencil) verschwindet der Mauszeiger in **ganz Obsidian** — andere Notizen, Seitenleiste, Einstellungen. Er kommt erst zurück, wenn der Nutzer den Zeichnenbereich erneut mit der Maus berührt.
- **Ursache:** Die globale Cursor-Regel `body.hp-pen-active * { cursor: none !important; }` wird von **genau einer** Stelle gesetzt und nur von genau dieser Stelle wieder gelöst — `updateReticle`, das ausschließlich über Canvas-Ereignisse läuft:
  - Setzen: `src/main.ts:851` — `this.wrapper.ownerDocument?.body?.classList?.toggle("hp-pen-active", penActive);`
  - CSS: `styles.css:610-612`
  - `pointerleave` (`src/main.ts:907`) entfernt nur `is-pen-hover`, **nicht** `hp-pen-active`.
  - `onunload()` (`src/main.ts:513-528`) entfernt nur `hp-editor-open` (`:523`) — `hp-pen-active` fehlt.
  - `setEditing(false)` (`src/main.ts:773-786`) setzt nur `hp-editor-open` (`:778`), kein `hp-pen-active`.
  Sobald nach einer Stiftnutzung **keine** weiteren Canvas-Ereignisse mehr ankommen (Editor geschlossen, Block entfernt, Notiz gewechselt, Plugin entladen), bleibt die Klasse für immer gesetzt.
- **Minimale Korrektur:** In `onunload()` (`src/main.ts:523`) und in `setEditing(false)` (`src/main.ts:778`) zusätzlich `document.body.removeClass("hp-pen-active")` aufrufen.
- **Risiko:** Niedrig. Bei mehreren gleichzeitig offenen Editoren kann der Cursor für Bruchteile bis zum nächsten Stifterereignis des anderen Editors sichtbar werden — rein kosmetisch. Kein Zustandsverlust.

### K-02 — „Entfernen“ im Editiermodus lässt `body.hp-editor-open` stehen: Obsidian kann nicht mehr scrollen
- **Symptom:** Nutzt man im Editor den Knopf **„Entfernen“**, bleibt Obsidians Hauptbereich ohne Scrollbalken/eingefroren (overflow hidden); nur Neuladen oder erneutes Öffnen hilft.
- **Ursache:** `removeSelf()` leert nur den Wrapper und ruft nie den Abbau-Pfad auf:
  - `src/main.ts:1583-1589` — Ende: `this.wrapper.empty(); this.wrapper.createDiv({cls:"hp-error", …})`. Kein `setEditing(false)`, kein `onunload()`.
  - `hp-editor-open` wurde in `setEditing(true)` gesetzt (`src/main.ts:778`) und wird nur in `onunload()` (`:523`) bzw. `setEditing(false)` (`:778`) entfernt.
  - CSS: `styles.css:27` — `body.hp-editor-open { overflow: hidden; }` (also globale Scroll-Sperre).
- **Minimale Korrektur:** In `removeSelf()` **vor** `this.wrapper.empty()` `this.setEditing(false);` aufrufen (deckt `hp-editor-open` mit ab).
- **Risiko:** Niedrig. `setEditing(false)` ruft `setExpanded(false)` und ggf. `saveNow()`; beides ist nach dem Dateilöschen harmlos (das Speichern würde auf eine gelöschte Datei schreiben — siehe Hinweis zu K-03 unten, dort bewusst nicht angefasst). Wenn das Löschen der Datei zuvor fehlgeschlagen ist, kehrt `removeSelf` schon in `:1586` zurück, bevor etwas geleert wird — der Fix greift dann gar nicht.

---

## Hoch

### H-01 — Event-Listener-Leak: `hp-color-changed` wird pro Editor gesetzt und nie entfernt
- **Symptom:** Je mehr Handschriftblöcke eine Sitzung öffnet/schließt, desto langsamer wird jede Farbänderung; über Stunden wächst der Speicher (alte Editor-DOM bleibt referenziert).
- **Ursache:** `thicknessControl` hängt einen **Document**-Listener an und es gibt im gesamten Baum keine passende Abmeldung:
  - Registrierung: `src/editor-controls.ts:112` — `document.addEventListener("hp-color-changed", repaint);`
  - `removeEventListener` existiert in dieser Datei **nicht** (einzige `removeEventListener`-Stellen im Baum: `src/abortable.ts:7`, `src/notebook-image.ts:66,84`, `src/notebook-text.ts:100`, `src/main.ts:505`).
  - `thicknessControl` wird pro Editor-Mount aufgerufen: `src/main.ts:712` und `:713` zweimal je `buildToolbar()` (`:551`), also 2 Leak-Listener pro Editor-Lebenslauf.
  - `repaint` schließt über die Vorschau-SVG des Controls (`src/editor-controls.ts:98-101,115`) — nach dem Unload ist dieser DOM-Knoten abgehängt, wird aber vom Listener dauerhaft am Leben gehalten.
  - Verstärker: `setColor` feuert das Ereignis bei **jedem** Slider-Input (Pointermove-Rate) — `src/editor-controls.ts:134` ← `:126`.
- **Minimale Korrektur:** Die Registrierung an einen Rückgabewert binden und bei Unload lösen, z. B. `const onColor = () => repaint(); document.addEventListener("hp-color-changed", onColor);` plus Rückgabe/`this.register`-Analogon. Im Editor hat der Aufrufer kein `register` — praktikabel: den Listener am `label`-Element statt am `document` führen und über einen `MutationObserver`/`isConnected`-Check selbst abmelden, oder `repaint` mit `if (!preview.isConnected) { document.removeEventListener("hp-color-changed", onColor); return; }` selbstaufräumen lassen.
- **Risiko:** Mittel. Ein falscher Aufräumpfad würde die Live-Farbvorschau des Dicken-Reglers einfrieren (rein kosmetisch). Kein Dokument- oder Einstellungszustand betroffen.

### H-02 — `pendingShapeFill` wird bei Unload und Undo nicht abgebrochen: Füllung erscheint nach Ctrl+Z von selbst
- **Symptom:** Form per Halten erzeugen und **innerhalb von 700 ms** Ctrl+Z drücken ⇒ die Füllung erscheint **nach** dem Rückgängigmachen wieder. Beim Schließen des Editors kann der 700-ms-Timer danach noch `markChanged()`/`redrawPage()` ausführen und einen Speicherlauf auslösen.
- **Ursache:** Der Timer wird nur bei `pointerDown` (`src/main.ts:984`) und beim Neuanlegen (`:1301`) abgebrochen. Es fehlt in `onunload()`, `undo()`, `redo()` und `finishPointer()`:
  - `cancelShapeFill`: `src/main.ts:1319-1323`
  - Aufrufer: nur `src/main.ts:984`, `:1301`
  - `onunload()` `src/main.ts:513-528` räumt `wordTimers` (`:526`), aber nicht `pendingShapeFill`.
  - `undo()` `src/main.ts:2395-2400`, `redo()` `:2401-2408` — kein `cancelShapeFill`.
  - Der Rückruf sucht die Seite im **aktuellen** `this.document` (`:1307-1310`); nach Undo/Redo mit denselben IDs existiert die Form wieder und wird gefüllt (`:1312`).
- **Minimale Korrektur:** `this.cancelShapeFill();` in `onunload()` (bei `:516` neben `clearPendingNormalization`), in `undo()`/`redo()` (bei `:2399`/`:2407`) und am Ende von `finishPointer()` (`:1294`) ergänzen.
- **Risiko:** Niedrig. Im Undo-Fall entfällt die Hold-Füllung — das ist die gewünschte Semantik (Undo löscht die Füllung). Kein Datenverlust.

### H-03 — Zwei divergierende Implementierungen von `drawInkStroke`/`drawShape`: Canvas, Miniatur und Export zeigen dasselbe Dokument unterschiedlich
- **Symptom:** Eine Form mit `lineStyle: "dashed"`, `radius` (abgerundet) oder `startArrow`, sowie Laser-Striche und `renderStyle:"sketch"`-Formen sehen **auf der Zeichenfläche anders aus als in der Seiten-Miniatur und im PNG/OneNote-Export**. Der Laser ist im Editor rot, im Export grau.
- **Ursache:** `main.ts` definiert eigene Kopien und verwendet sie im Editor-Canvas, während Miniatur/Export die Bibliothek aus `rendering.ts` nutzen:
  - Editor-eigene Kopien: `src/main.ts:123-159` (`drawInkStroke`) und `:171-201` (`drawShape`), verwendet in `drawPageElements` `src/main.ts:238-239`.
  - Bibliothek: `src/rendering.ts:5-31` (`drawInkStroke`) und `:153-183` (`drawShape`), verwendet von `drawBoardElement` (`src/rendering.ts:280-285`), das `main.ts` für Miniatur (`src/main.ts:1811`) und OneNote-Export (`src/main.ts:2374`) aufruft — und direkt von PDF (`src/pdf-annotation.ts:3,291,294`).
  - Belegte Abweichungen:
    - Laser-Schattenfarbe: `#ff1744` (`src/main.ts:130`) vs. `#404040` (`src/rendering.ts:12`).
    - `inkGeometry:"captured"` wird in `main.ts:154-155` beachtet (keine zweite Rundung), in `rendering.ts:26` bewusst ignoriert (`void stroke.inkGeometry;`) — derselbe Strich wird also einmal aus Rohpunkten, einmal geglättet gezeichnet.
    - `lineStyle` (gestrichelt/gepunktet), `radius` (roundRect) und `startArrow` fehlen in `main.ts:171-201` vollständig; `rendering.ts:159-160,167-168,174-175` unterstützt sie.
    - `renderStyle:"sketch"` wird in `main.ts`'s `drawShape` nicht geprüft (`rendering.ts:155,89-95` hat den Zweig). Ein Agent-Patch mit `dashed` (`src/notebook-commands.ts:230`) rendert im Editor solide, in Miniatur/Export gestrichelt.
- **Minimale Korrektur:** Die Kopien in `main.ts` löschen und die Funktionen aus `rendering.ts` importieren (Aufrufstellen `:238-239`), oder — falls die Editor-Variante absichtlich schneller ist — die vier fehlenden Merkmale (`inkGeometry`, `lineStyle`, `radius`, `startArrow`) in `main.ts:171-201` nachziehen und die Laser-Farbe vereinheitlichen.
- **Risiko:** Mittel–hoch. Der Import ist verhaltensrelevant: die Editor-Variante ist derzeit die „schnellere" (`captured`-Pfad) — ein einfaches Ersetzen kann die Zeichenwahrnehmung beim Stift ändern. Sicherer Zwischenschritt: nur `lineStyle`/`radius`/`startArrow` in `main.ts` ergänzen und die Laser-Farbe angleichen. Immer visuell gegen eine Bestandsseite mit gestrichelten Formen prüfen.

### H-04 — Füllwerkzeug ignoriert „Aus“ (Deckkraft 0) und füllt trotzdem mit 24 %
- **Symptom:** Nutzer stellt „Deckkraft der Füllung“ auf **Aus** (`0`), tippt mit dem Fülleimer auf eine Form — die Form wird **sichtbar gefüllt**.
- **Ursache:** Die Regler-Anzeige dokumentiert `0` als „Aus“ (`src/main.ts:702`, Format `value ? … : "Aus"`), die Fülllogik erzwingt aber einen Mindestwert:
  - `src/main.ts:1038` — `target.fillOpacity = this.plugin.settings.fillOpacity > 0 ? this.plugin.settings.fillOpacity : 0.24;`
- **Minimale Korrektur:** Bei `settings.fillOpacity <= 0` nicht füllen (früh zurückkehren und den Hinweis „Fülldeckkraft ist auf Aus gestellt“ zeigen), oder den Regler-Text an die tatsächliche Erzwingung anpassen („10 % min“).
- **Risiko:** Niedrig. Verhalten ändert sich nur für Nutzer, die bewusst „Aus“ gewählt haben — und zwar in die von der UI versprochene Richtung.

### H-05 — `AgentChannel` plant den Poll-Loop nach `stop()` erneut ein
- **Symptom:** Wird der Agent-Zugriff abgeschaltet (oder das Plugin entladen), kann trotzdem weiter alle ~0,8 s eine HTTP-Anfrage an `127.0.0.1` laufen. Auch nach dem Ausschalten erscheint der Editor-Agent wieder „beschäftigt".
- **Ursache:** `tick()` hängt den nächsten Termin erst **nach** dem `await` an und kennt keinen Abbruch-Generation:
  - `src/agent-channel.ts:46-50` — `const tick = async () => { await this.tick(); this.timer = window.setTimeout(() => void tick(), 800); };`
  - `stop()` `src/agent-channel.ts:53-58` löscht den Timer und setzt `timer=null`.
  - Läuft gerade ein `await fetch` in `this.tick()`, überschreibt der wiederbelebende `setTimeout` in `:48` die Stornierung — der Loop läuft weiter.
  - Registrierter Abbau: `src/main.ts:2564` (`() => this.agent?.stop()`) greift damit nicht zuverlässig.
- **Minimale Korrektur:** Generationszähler einführen: `private generation = 0;` — `refresh()`/`stop()` erhöhen ihn; `tick` merkt sich `const gen = this.generation;` und hängt in `:48` nur an, wenn `gen === this.generation`.
- **Risiko:** Niedrig. Betrifft ausschließlich den ohnehin standardmäßig deaktivierten Agenten-Kanal; die UI-Rückmeldung bleibt unverändert.

### H-06 — PDF-Annotationen füllen jede erkannte Form automatisch
- **Symptom:** Beim Schreiben auf ein PDF mit dem Stift wird jede als Form erkannte Kontur **sofort gefüllt** (Standard-Deckkraft 24 %) — genau die „durchsichtig gefüllt"-Wahrnehmung, die im Editor am 11.9.2026 bewusst abgeschaltet wurde.
- **Ursache:** Der PDF-Pfad setzt beim Absetzen Füllfarbe **und** Füll-Deckkraft aus den Einstellungen, ohne Halte-Gate und ohne Füllwerkzeug:
  - `src/pdf-annotation.ts:250` — `… closed: …, fillColor: this.settings().fillColor, fillOpacity: this.settings().fillOpacity };`
  - Es gibt im PDF-Modus nur `pen | eraser | laser | off` (`src/pdf-annotation.ts:10`), kein Füllwerkzeug.
  - Kontrast zum Editor-Vertrag: `src/main.ts:1365-1367` (Füllung `undefined`/`0`, Kommentar „gefüllt wird ausschließlich bewusst mit dem Füll-Werkzeug").
- **Minimale Korrektur:** In `src/pdf-annotation.ts:250` `fillColor: undefined, fillOpacity: 0` setzen und die Füllung nur explizit anbieten.
- **Risiko:** Mittel. Der PDF-Modus hat kein Füllwerkzeug — nach dem Fix lassen sich PDF-Formen gar nicht mehr füllen, sofern kein Bedienweg ergänzt wird. Das ist eine Produktentscheidung, nicht nur ein Einzeiler.

### H-07 — Hold-Füllung widerspricht dem im Code dokumentierten Vertrag „nur das Füllwerkzeug füllt"
- **Symptom:** Eine gehaltene Form bleibt laut Beschreibung reine Kontur; tatsächlich wird sie 700 ms nach dem Absetzen **automatisch gefüllt**, sobald die eingestellte Deckkraft > 0 ist.
- **Ursache:** `convertAutomaticShape` erzeugt die Form bewusst ohne Füllung, plant aber direkt danach eine automatische Füllung ein:
  - `src/main.ts:1365-1367` — Kommentar: „gefüllt wird ausschließlich bewusst mit dem Füll-Werkzeug"; Objekt mit `fillColor: undefined, fillOpacity: 0`.
  - `src/main.ts:1363` — `const delayFill = force && kind !== "line" && kind !== "arrow";`
  - `src/main.ts:1368` — `if (delayFill) this.scheduleShapeFill(page.id, stroke.id);`
  - `src/main.ts:1312` — der Timer setzt `element.fillOpacity = this.plugin.settings.fillOpacity;` (Default `0.24`, `src/main.ts:95`).
- **Minimale Korrektur:** `src/main.ts:1368` entfernen (oder `scheduleShapeFill` nur starten, wenn ein eigener Füll-Schalter aktiv ist). Damit gilt der Kommentar wieder.
- **Risiko:** Mittel. Entfernt eine ausdrücklich gewünschte Funktion vom 10.9.2026 („delay für das fill"). Ohne Produktentscheidung nicht einfach streichen; wenn sie bleibt, muss der Kommentar `src/main.ts:1365-1366` korrigiert werden, damit Vertrag und Code nicht widersprechen.

---

## Mittel

### M-01 — `touchScroll`-Eintrag leckt, wenn während einer Berührung neu gebaut wird
- **Symptom:** Nach einem Rebuild während einer laufenden Touch-Geste zeichnet dieser Finger nicht mehr, sondern **scrollt nur noch** (bzw. die Seite springt), bis Obsidian neu geladen wird.
- **Ursache:** Der Eintrag wird in `pointerDown` gesetzt und **ausschließlich** in `pointerUp` entfernt; bei einem Rebuild werden Canvas und Listener ersetzt, ein `pointerup` erreicht den alten Canvas nicht mehr:
  - Setzen: `src/main.ts:459` (Feld), `:1014` (`this.touchScroll.set(event.pointerId, event.clientY)`)
  - Entfernen: nur `src/main.ts:1171-1173`
  - `rebuildPages()` `src/main.ts:880-929` leert `pagesEl` (`:887`) und legt neue Canvases an, ohne `touchScroll` zu leeren; `onunload()` (`:513-528`) ebenfalls nicht.
  - Wirkung des verwaisten Eintrags: `src/main.ts:1072-1077` (jede Bewegung dieses `pointerId` wird als Scroll behandelt).
- **Minimale Korrektur:** In `rebuildPages()` (bei `:887`) und in `onunload()` `this.touchScroll.clear()` ergänzen.
- **Risiko:** Niedrig. Auf dem Desktop ohne Touch praktisch wirkungslos.

### M-02 — Vorschau-Frame (`previewFrame`/`pendingPreview`) wird nie abgebrochen
- **Symptom:** Beim Schließen/Entladen während eines Verschiebe-/Skalierungsvorgangs kann danach noch ein Frame auf abgehängte Canvas gezeichnet werden (kurzes Nachflackern, unnötige Zeichenlast).
- **Ursache:** Der Handle wird gespeichert, aber es gibt kein `cancelAnimationFrame` dafür — nur für `laserFrame` (`src/main.ts:518`, `:1187`, `:1287`):
  - `src/main.ts:1498` (`private previewFrame = 0`), `:1502-1512` (`queuePreview`), `:1513` (`pendingPreview`)
  - `onunload()` (`:513-528`) und `finishPointer()` (`:1276-1296`) räumen ihn nicht auf.
- **Minimale Korrektur:** In `onunload()` und in `finishPointer()` `if (this.previewFrame) { cancelAnimationFrame(this.previewFrame); this.previewFrame = 0; } this.pendingPreview = null;` ergänzen.
- **Risiko:** Niedrig. `requestAnimationFrame` ist im Test-Harness ggf. ein `setTimeout`-Shim (`src/main.ts:1505-1507`) — der Handle ist numerisch, `cancelAnimationFrame` greift dort nicht, was aber nur den Test betrifft.

### M-03 — „Einfärben“ färbt Marker in der Stiftfarbe; die Marker-Schutzbedingung ist unerreichbar
- **Symptom:** Nutzer wählt einen **Markerstrich** aus und drückt „Einfärben" — der Marker wird in der **Stiftfarbe** eingefärbt statt in der Markerfarbe.
- **Ursache:** Erst wird die Stiftfarbe zugewiesen, dann vergleicht die Bedingung genau diesen gerade zugewiesenen Wert mit der Markerfarbe:
- **Beleg:** `src/main.ts:1719-1722` — `element.color = this.plugin.settings.penColor;` und danach `if (element.type === "highlight" && element.color === this.plugin.settings.markerColor) element.color = this.plugin.settings.markerColor;`. Die Bedingung kann nur wahr sein, wenn Stift- und Markerfarbe zufällig gleich sind; der Zweig ist damit praktisch tot.
- **Minimale Korrektur:** Für Highlights direkt `this.plugin.settings.markerColor` setzen (statt des Nachvergleichs).
- **Risiko:** Niedrig. Betrifft nur die explizite „Einfärben"-Aktion.

### M-04 — Radierer ohne Treffer sammelt leere Undo-Schritte
- **Symptom:** Nach mehreren Radierer-Tipps ins Leere muss man **mehrfach** Ctrl+Z drücken, bevor sich sichtbar etwas ändert.
- **Ursache:** `pointerDown` legt bedingungslos einen Snapshot an (das Argument steuert nur `invalidate`, nicht das Anlegen), während `eraseAt` bei fehlendem Treffer nichts ändert und den Snapshot nicht zurücknimmt:
  - Bedingungsloses Anlegen: `src/main.ts:1029` — `this.remember(((this.tool === "pen" || this.tool === "brush") && this.handwritingMode) || this.tool === "highlight");`
  - Radierer ohne `markChanged` bei Nichttreffer: `src/main.ts:1376-1384` (nur bei Längenänderung, `:1383`)
  - Rücknahme existiert nur für den Füll-Fehlgriff (`src/main.ts:1042`) und für Abbruch (`:1182`).
- **Minimale Korrektur:** In `pointerUp` für `tool === "eraser"` (und für Form-Gesten ohne Treffer) den zuletzt angelegten Snapshot verwerfen, wenn keine Änderung erfolgte — oder `remember()` erst nach dem ersten Treffer aufrufen.
- **Risiko:** Niedrig. Bei falscher Zählung könnte ein berechtigter Undo-Schritt zu viel entfernt werden; daher an die tatsächliche Elementzahl-Änderung koppeln.

### M-05 — `liveConvertMinConfidence` ist ein Setting ohne jeden Schreibpfad (und ohne UI)
- **Symptom:** Der angezeigte Schwellwert „Vertrauen < 85 %" lässt sich **nirgends** einstellen; wer Live-Umwandlung nutzt und 85 % zu streng findet, hat keinen Weg.
- **Ursache:** Der Schlüssel wird gelesen und nur vom Default initialisiert — kein Regler, kein Schalter, kein sonstiger Schreiber:
  - Deklaration/Default: `src/main.ts:74-75`, `:98`
  - Lesen: `src/main.ts:1879`
  - Der Panel-Text ist zusätzlich hart kodiert: `src/main.ts:678` („Vertrauen < 85 %") — er läuft aus dem Tritt, sobald der Default geändert wird.
- **Minimale Korrektur:** Entweder einen Regler im Einstellungs-Tab ergänzen (analog `src/main.ts:2729` „Fülldeckkraft") und den Panel-Text aus dem Wert formatieren, oder Schlüssel und Text entfernen.
- **Risiko:** Niedrig.

### M-06 — Der geteilte HTR-Recognizer wird nie freigegeben; `disposeSharedRecognizer` ist toter Code
- **Symptom:** Nach mehrfachem Aktivieren/Deaktivieren des Plugins bleiben alte Inferenz-Worker aktiv (Speicher/CPU); sie werden nie beendet.
- **Ursache:** Die Aufräumfunktion existiert, hat aber keinen Aufrufer, und `onload` registriert keine Freigabe:
  - Definition ohne Aufrufer: `src/main.ts:2622` (`disposeSharedRecognizer`) — `grep` über `src/` und `tests/` findet nur diese Definitionszeile.
  - Erzeugung im Editiermodus: `src/main.ts:2616-2620` (`sharedRecognizerInstance`, `sharedRecognizer()`)
  - `onload` registriert Freigaben nur für PDF-Manager (`src/main.ts:2560`) und Agent (`:2564`) — nicht für den Recognizer.
  - Der Worker selbst hält einen laufenden Worker + WASM: `src/htr-client.ts:34-54,70-74`.
- **Minimale Korrektur:** In `onload` `this.register(() => this.disposeSharedRecognizer());` ergänzen.
- **Risiko:** Niedrig. Ein zu früher Dispose würde die Live-Umwandlung neu initialisieren (einmalige Modellladezeit), kein Funktionsverlust.

### M-07 — Seitenübersicht (Page-Strip) bleibt nach Seite-Hinzufügen/Format/Import veraltet
- **Symptom:** Ist die Seitenübersicht geöffnet und man fügt eine Seite hinzu oder ändert das Format, zeigt sie weiterhin die alten Seiten(nummern), bis man sie schließt und neu öffnet.
- **Ursache:** Mehrere Pfade bauen die Seiten neu, aber nicht die Leiste:
  - `addPage()` `src/main.ts:1997-2002` — `rebuildPages()` (`:2000`), kein `rebuildPageStrip()`.
  - Formatwechsel `src/main.ts:733` ebenso.
  - Importe: `src/main.ts:2252` (Datei), `:2286` (Backup), `:2342` (OneNote) — jeweils nur `rebuildPages()`.
  - Korrekt machen es `movePage`/`duplicatePage`/`deletePage` (`src/main.ts:1748,1759,1769`) sowie `undo`/`redo` (`:2399`, `:2407`).
  - Definition: `src/main.ts:1772`.
- **Minimale Korrektur:** In den betroffenen Pfaden `this.rebuildPageStrip();` ergänzen (oder `rebuildPages()` die Leiste mitziehen lassen).
- **Risiko:** Niedrig. Reine Anzeige, `rebuildPageStrip` erzeugt Miniaturen — bei sehr vielen Seiten ist das ein zusätzlicher Zeichenaufwand.

### M-08 — Stift-Diagnose: Intervall leckt beim erneuten Aufruf des Befehls
- **Symptom:** Ruft man „Stift-Diagnose" mehrfach auf, laufen mehrere 250-ms-Timer parallel im Hintergrund (CPU), die in entferntes DOM schreiben.
- **Ursache:** Ein schon vorhandenes Panel wird entfernt, **ohne** sein Intervall zu löschen; gelöscht wird nur im Schließen-Handler:
  - Entfernen ohne Aufräumen: `src/main.ts:2595` — `document.querySelector(".hp-pen-diagnostic")?.remove();`
  - Neues Intervall: `src/main.ts:2609` — `const timer = window.setInterval(zeichnen, 250);`
  - Einzige Löschung: `src/main.ts:2610` (nur `zu.onclick`).
- **Minimale Korrektur:** Das Intervall am Panel-Element hinterlegen und beim Entfernen eines vorhandenen Panels zuerst `clearInterval` aufrufen (oder das Panel in ein aufräumendes Objekt kapseln).
- **Risiko:** Niedrig. Nur Diagnosewerkzeug.

### M-09 — Konflikt-Erkennung vergleicht Datei-`mtime` mit `Date.now()` statt mit der tatsächlichen Schreibzeit
- **Symptom:** Nach einer externen Änderung kann das Speichern dauerhaft als „extern geändert" gelten und jede Änderung nur noch als Konfliktkopie abgelegt werden, obwohl niemand mehr schreibt.
- **Ursache:** Die Merkzeit ist die lokale Uhr, die Prüfgröße ist die Datei-`mtime` (asynchron vom Vault aktualisiert, andere Quelle):
  - Prüfung: `src/main.ts:2418-2419` — `const mtime = this.file.stat?.mtime ?? 0; if (mtime > this.lastWriteTimeMs)`
  - Setzen: `src/main.ts:2433` — `this.lastWriteTimeMs = Date.now();`
  - Initialisierung aus der Datei: `src/main.ts:450` (`this.file.stat?.mtime ?? 0`) — inkonsistent zur zweiten Schreibweise.
- **Minimale Korrektur:** Nach erfolgreichem Schreiben `this.lastWriteTimeMs = this.file.stat?.mtime ?? Date.now();` verwenden.
- **Risiko:** Niedrig–mittel. Wird die `mtime` im Vault verzögert gespiegelt, kann die Prüfung jetzt früher anschlagen; deshalb an einer echten Außänderung einmal gegentesten.

---

## Niedrig

### N-01 — Build-Marke und Manifest driftet auseinander
- **Symptom:** Die Stift-Diagnose zeigt eine andere Version als die Plugin-Verwaltung; die „eindeutige Prüfbarkeit" (Kommentar `src/main.ts:85-86`) ist damit aufgehoben.
- **Belege:** `src/main.ts:87` — `BUILD_TAG = "sh-build-0.25.22"` vs. `manifest.json:4` — `"version": "0.25.25"`.
- **Korrektur:** Build-Marke aus der Manifest-Version bzw. dem Build setzen.
- **Risiko:** Keins.

### N-02 — An die Bridge gemeldete Plugin-Version ist hart kodiert (und veraltet)
- **Symptom:** Die Companion-Bridge sieht „0.23.0", während 0.25.25 installiert ist — jede Kompatibilitätsprüfung dort arbeitet mit falschen Daten.
- **Beleg:** `src/agent-channel.ts:81` — `pluginVersion: "0.23.0"`.
- **Korrektur:** Version aus `this.plugin.manifest.version` lesen.
- **Risiko:** Keins.

### N-03 — Toter Code ohne Produktionsaufrufer
- **Beleg:** `src/document.ts:471` (`parseDocument` — nur Tests, z. B. `tests/handwriting.test.ts:26`), `src/document.ts:518` (`boundsForElements` — kein Aufrufer), `src/rendering.ts:287-289` (`imageCache`/`cachedImage` — kein Aufrufer; `main.ts` hat eine eigene Kopie, siehe N-04), `src/geometry-tools.ts` (nur `tests/handwriting.test.ts`; `drawSetSquare` `:33` ohne jeden Aufrufer), `src/save-queue.ts:73` (`idle()` nur `tests/save-queue.test.ts`).
- **Symptom:** Kein direktes. Erschwert aber die Frage „welche der zwei Implementierungen ist die maßgebliche" (siehe H-03).
- **Korrektur:** Entfernen oder mit Kommentar als Test-API markieren.
- **Risiko:** Keins, wenn nicht exportiert genutzt.

### N-04 — Zwei identische, unbeschränkte Bild-Caches
- **Symptom:** Viele importierte Bilder erhöhen den Speicher dauerhaft; kein Bild wird je verworfen.
- **Belege:** `src/main.ts:204-212` (Editor-Kopie) und `src/rendering.ts:287-293` (zweite, ungenutzte Kopie). Kein `delete`/`clear` in beiden.
- **Korrektur:** Eine Cache-Implementierung entfernen; bei Bedarf LRU-Grenze einführen.
- **Risiko:** Niedrig. Eine Cache-Grenze kann ein erneutes Laden bewirken (kurzes Flackern im PDF/Export).

### N-05 — `appliedAgentRequests` wächst unbegrenzt
- **Symptom:** In langen Sitzungen mit aktivem Agenten wächst das Set (nur IDs; praktisch gering).
- **Belege:** `src/main.ts:367` (Anlage), `:381` (jeder Batch), kein Entfernen; Lebensdauer = Editor.
- **Korrektur:** LRU/Deckel (z. B. die letzten 512) oder Eintrag nach Bestätigung entfernen.
- **Risiko:** Niedrig — ein zu früh entferntes Id würde einen MCP-Retry erneut anwenden (Duplikat). Deckel deshalb großzügig.

### N-06 — Ein Zeitlimit verwirft alle wartenden Erkennungszeilen, nicht nur die langsame
- **Symptom:** Bei „Handschrift lesbar machen" bricht eine einzige langsame Zeile die Erkennung aller noch wartenden Zeilen ab („Erkennung abgebrochen").
- **Belege:** `src/htr-client.ts:62` (Timer ruft `this.dispose(...)`), `:70-74` (`dispose` beendet den Worker und weist **alle** `pending` zurück).
- **Korrektur:** Im Timeout nur den eigenen Eintrag zurückweisen (`this.pending.delete(id)` + `entry.reject`) statt global zu verwerfen.
- **Risiko:** Niedrig–mittel. Der Worker bleibt dann für die Folgeversuche erhalten; soll er bei einem echten Hänger neu starten, ist das globale Verwerfen gewollt — dann den Abbruch im UI klar benennen.

---

## Geprüft und unauffällig (damit die Fragen belegt beantwortet sind)

1. **Listener-Leaks bei `rebuildPages`/`unload`** — nur der `hp-color-changed`-Fall ist echt (H-01). Die Canvas-Listener (`src/main.ts:902-920`) sitzen auf Knoten, die `pagesEl.empty()` (`:887`) zerstört; `disconnectObservers()` (`:883`) trennt alle `ResizeObserver` vor dem Neuaufbau; der Tastatur-Handler wird ordentlich abgemeldet (`:504-505`). `PdfAnnotationManager` verwendet `app.workspace.on` und meldet alle Refs über `offref` ab (`src/pdf-annotation.ts:57-58`, `:62-66`).
2. **Autospeichern / Undo / HTR / Rebuild** — `SaveQueue`/`SaveTracker` sind korrekt: koaleszierend, Revision-geprüft, `dirty` wird nur bei unveränderter Revision gelöscht (`src/save-queue.ts:37-50`, `:59-70`). Der Erkennungspfad prüft `epoch`/`pointerPageId`/`importing` vor jedem Schreiben (`src/main.ts:1862`, `:1876-1886`). Kein belegbarer Race im Speicherpfad außer M-09.
3. **Nie zurückgesetzter Zustand** — gefunden: `hp-pen-active` (K-01), `hp-editor-open` nach `removeSelf` (K-02), `pendingShapeFill` (H-02), `touchScroll` (M-01), `previewFrame`/`pendingPreview` (M-02), `appliedAgentRequests` (N-05). `pointerPageId`, `activePointerId`, `currentElementId`, `resizeSnapshot`, `dragSnapshot`, `marqueeStart` werden am Ende jeder Geste über `finishPointer` zurückgesetzt (`src/main.ts:1276-1296`) und sind abgedeckt.
4. **Settings-Schlüssel** — alle in der Oberfläche vorhandenen Schlüssel werden gelesen und geschrieben; der einzige leseweise verwaiste Schlüssel ist `liveConvertMinConfidence` (M-05). Element-Metadaten `renderStyle`/`semanticRole`/`sourceRefs`/`agentAttached` haben in `src/` keinen Schreiber (nur Tests) — der Sketch-Renderpfad (`src/rendering.ts:89-95`, `:257`) ist im Produktionsbetrieb damit unerreichbar; für Formen wird er zusätzlich in `main.ts` gar nicht geprüft (siehe H-03).
5. **Füll-Logik vollständig?** — Nein. Vier Pfade setzen automatisch eine Deckkraft > 0: Füllwerkzeug mit erzwungenem 24 % bei „Aus" (`src/main.ts:1038`, H-04), Hold-Füllung (`src/main.ts:1312,1368`, H-07), PDF-Pfad für jede erkannte Form (`src/pdf-annotation.ts:250`, H-06), Agent-`create_shape` mit `fillColor` (`src/notebook-commands.ts:229` — bewusst agent-deklariert). Der Editor-Pfad `convertAutomaticShape` selbst erzeugt korrekt `fillOpacity: 0` (`src/main.ts:1367`).
6. **Kann `body.hp-pen-active` hängen bleiben?** — Ja (K-01). Es ist nicht an den Editor-Lebenszyklus gekoppelt und wird ausschließlich über Canvas-Ereignisse gelöst.
